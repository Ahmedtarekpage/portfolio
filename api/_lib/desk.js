// Product desk — the private bug/request inbox at /desk.
//
// Like the finance planner, the page keeps its whole state as one JSON
// document, so the server only hands it back, takes a new one, and refuses to
// let one open tab overwrite a newer save from another device.
//
// It lives behind api/ideas.js because api/ is at the 12-function limit (see
// README, "Things that have bitten us").
//
//   GET /api/ideas?desk=data  -> the document (raw JSON body), X-Rev header;
//                                404 + {} before the first save
//   PUT /api/ideas?desk=data  -> save; needs If-Match: <rev>, else 409 + the
//                                current document so the tab can adopt it
//
// The table is created here, lazily, the same way finance does it.
import { createHash, timingSafeEqual } from "node:crypto";
import { json } from "./util.js";

// Tickets can carry screenshots, shrunk in the browser. The ceiling stays under
// the 4.5 MB a single request to a function may carry.
const MAX_BYTES = 4_000_000;

let _ready = null;
function ensure(sql) {
  if (!_ready) {
    _ready = (async () => {
      await sql`CREATE TABLE IF NOT EXISTS desk_state (
        id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
        data JSONB NOT NULL,
        rev BIGINT NOT NULL DEFAULT 1,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`;
    })().catch((err) => { _ready = null; throw err; });
  }
  return _ready;
}

function sendDoc(res, status, row) {
  res.setHeader("X-Rev", String(row.rev));
  res.setHeader("Cache-Control", "private, no-store");
  return res.status(status).json(row.data);
}

/** Handles every ?desk=… request. The caller has already checked auth. */
// Addresses the function will not fetch: this machine and private networks.
// The address comes from the owner's own saved document, but a function that
// fetches whatever it is handed is still not something to leave unguarded.
function fetchable(raw) {
  let u;
  try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== "https:") return null;
  const h = u.hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || h.includes(":")) return null;
  if (/^(127|10|0)\.|^192\.168\.|^169\.254\.|^172\.(1[6-9]|2\d|3[01])\./.test(h)) return null;
  return u;
}

//   GET /api/ideas?desk=pull&id=<product id> -> { users, paying } read from the
//       address saved on that product, with its key if it has one
const OWN_ADDRESS = {
  gobachaloria: "https://gobachaloria.com/api/desk/stats",
  ashrhly: "https://ashrhly.com/api/desk/stats",
  techmakerz: "https://techmakerz.com/api/desk/stats",
  elhsab: "https://elhsab.com/api/desk/stats",
};

async function pull(req, res, sql) {
  if (req.method !== "GET") return json(res, 405, { error: "Method not allowed" });
  const [row] = await sql`SELECT data FROM desk_state WHERE id = 1`;
  const id = String(req.query.id);
  const product = (row && Array.isArray(row.data.products) ? row.data.products.find((p) => p.id === id) : null) || {};
  // The owner's own products are known here by id, so they can be read before
  // the desk has ever been saved (the first visit asks for numbers at once,
  // and used to get a 400 because there was no document to look the address
  // up in), and whatever the saved product says about its address.
  const url = fetchable(product.statsUrl || OWN_ADDRESS[id] || "");
  if (!url) return json(res, 400, { error: "no usable address on that product" });
  // A key saved on the product wins. Otherwise the owner's own products share
  // one secret, kept in this project's environment so it never sits in the
  // saved document or reaches the page; it is only ever sent to those hosts.
  const OWN = Object.values(OWN_ADDRESS).map((a) => new URL(a).hostname);
  const own = OWN.some((h) => url.hostname === h || url.hostname === `www.${h}`);
  const key = product.statsKey || (own ? process.env.DESK_STATS_SECRET : "") || "";
  let body;
  try {
    const r = await fetch(url, {
      headers: { Accept: "application/json", ...(key ? { Authorization: `Bearer ${key}` } : {}) },
      redirect: "error", signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return json(res, 502, { error: `the product answered ${r.status}` });
    const text = await r.text();
    if (text.length > 20_000) return json(res, 502, { error: "answer too large" });
    body = JSON.parse(text);
  } catch {
    return json(res, 502, { error: "could not read the product's numbers" });
  }
  // Only the two figures leave here, whatever else the product sent.
  const num = (v) => (Number.isFinite(Number(v)) && v !== null && v !== "" ? Number(v) : null);
  res.setHeader("Cache-Control", "private, no-store");
  return json(res, 200, { users: num(body && body.users), paying: num(body && body.paying) });
}

// Reads one address and returns the two figures, or null when it cannot.
async function readStats(url, key) {
  try {
    const r = await fetch(url, {
      headers: { Accept: "application/json", ...(key ? { Authorization: `Bearer ${key}` } : {}) },
      redirect: "error", signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return null;
    const text = await r.text();
    if (text.length > 20_000) return null;
    const body = JSON.parse(text);
    const num = (v) => (Number.isFinite(Number(v)) && v !== null && v !== "" ? Number(v) : null);
    const users = num(body && body.users), paying = num(body && body.paying);
    return users === null && paying === null ? null : { users, paying };
  } catch { return null; }
}

function sameSecret(got, want) {
  const a = createHash("sha256").update(String(got)).digest();
  const b = createHash("sha256").update(String(want)).digest();
  return timingSafeEqual(a, b);
}

/**
 * The weekly capture, run by Vercel Cron every Thursday (see vercel.json):
 * reads every connected product and writes that week's figures into the saved
 * desk, so the graph gains a point whether or not the desk was opened.
 *
 *   GET /api/ideas?desk=cron     Authorization: Bearer <CRON_SECRET>
 *
 * It is called before the session check, so the secret is its only guard:
 * with none configured it refuses everything.
 */
export async function deskCron(req, res, sql) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return json(res, 503, { error: "not configured" });
  if (!sameSecret(req.headers.authorization || "", `Bearer ${secret}`)) return json(res, 401, { error: "unauthorised" });
  await ensure(sql);

  // Weeks are named by their Thursday, on the owner's clock (Dubai, UTC+4), as the page does.
  const d = new Date(Date.now() + 4 * 3600 * 1000);
  while (d.getUTCDay() !== 4) d.setUTCDate(d.getUTCDate() + 1);
  const week = d.toISOString().slice(0, 10);

  const [row] = await sql`SELECT data, rev FROM desk_state WHERE id = 1`;
  const data = row ? row.data : {};
  const saved = Array.isArray(data.products) ? data.products : [];
  const ids = new Set([...Object.keys(OWN_ADDRESS), ...saved.filter((p) => p && p.statsUrl).map((p) => p.id)]);
  const OWN = Object.values(OWN_ADDRESS).map((x) => new URL(x).hostname);

  const taken = {};
  for (const id of ids) {
    const product = saved.find((p) => p.id === id) || {};
    const url = fetchable(product.statsUrl || OWN_ADDRESS[id] || "");
    if (!url) continue;
    const own = OWN.includes(url.hostname) || OWN.includes(url.hostname.replace(/^www\./, ""));
    const st = await readStats(url, product.statsKey || (own ? process.env.DESK_STATS_SECRET : "") || "");
    if (!st) continue;
    taken[id] = { ...st, at: Date.now() };
  }
  const got = Object.keys(taken);
  if (!got.length) return json(res, 502, { error: "no product could be read", week });

  data.stats = data.stats || {}; data.stats[week] = { ...(data.stats[week] || {}), ...taken };
  data.numbers = data.numbers || {}; data.numbers[week] = data.numbers[week] || {};
  for (const id of got) {
    const product = saved.find((p) => p.id === id) || {};
    const v = product.statsUse === "users" ? taken[id].users : taken[id].paying;
    if (v !== null) data.numbers[week][id] = v;
  }
  data.captured = { week, at: Date.now(), ids: got };

  const text = JSON.stringify(data);
  if (text.length > MAX_BYTES) return json(res, 413, { error: "bad size" });
  if (!row) {
    await sql`INSERT INTO desk_state (id, data, rev) VALUES (1, ${text}::jsonb, 1) ON CONFLICT (id) DO NOTHING`;
  } else {
    // If a tab saved in between, leave its version alone: next week's run, or opening the desk, fills the gap.
    const [done] = await sql`UPDATE desk_state SET data = ${text}::jsonb, rev = rev + 1, updated_at = now()
      WHERE id = 1 AND rev = ${row.rev} RETURNING rev`;
    if (!done) return json(res, 409, { error: "the desk was saved meanwhile; nothing written", week });
  }
  return json(res, 200, { ok: true, week, taken });
}

//   GET /api/ideas?desk=users&id=<product>&filter=all|paying|free&page=n&q=…
//       -> that product's users, read from it live and passed through. Needs
//          the owner's session like the rest; nothing is stored here.
async function users(req, res, sql) {
  if (req.method !== "GET") return json(res, 405, { error: "Method not allowed" });
  const id = String(req.query.id);
  const [row] = await sql`SELECT data FROM desk_state WHERE id = 1`;
  const product = (row && Array.isArray(row.data.products) ? row.data.products.find((p) => p.id === id) : null) || {};
  const url = fetchable(product.statsUrl || OWN_ADDRESS[id] || "");
  // the list lives beside the numbers: …/desk/stats -> …/desk/users
  if (!url || !/\/stats\/?$/.test(url.pathname)) return json(res, 400, { error: "this product has no users list" });
  url.pathname = url.pathname.replace(/\/stats\/?$/, "/users");
  url.search = "";
  const filter = ["all", "paying", "free"].includes(String(req.query.filter)) ? String(req.query.filter) : "all";
  url.searchParams.set("filter", filter);
  url.searchParams.set("page", String(Math.min(10000, Math.max(1, parseInt(req.query.page, 10) || 1))));
  url.searchParams.set("limit", "50");
  const q = String(req.query.q || "").trim().slice(0, 60);
  if (q.length >= 2) url.searchParams.set("q", q);
  const OWN = Object.values(OWN_ADDRESS).map((x) => new URL(x).hostname);
  const own = OWN.includes(url.hostname) || OWN.includes(url.hostname.replace(/^www\./, ""));
  const key = product.statsKey || (own ? process.env.DESK_STATS_SECRET : "") || "";
  let body;
  try {
    const r = await fetch(url, {
      headers: { Accept: "application/json", ...(key ? { Authorization: `Bearer ${key}` } : {}) },
      redirect: "error", signal: AbortSignal.timeout(12000),
    });
    if (!r.ok) return json(res, 502, { error: `the product answered ${r.status}` });
    const text = await r.text();
    if (text.length > 600_000) return json(res, 502, { error: "answer too large" });
    body = JSON.parse(text);
  } catch {
    return json(res, 502, { error: "could not read the product's users" });
  }
  // Only the agreed fields go on to the page, trimmed, whatever else was sent.
  const str = (v, n) => (v === null || v === undefined || v === "" ? null : String(v).slice(0, n));
  const list = (Array.isArray(body && body.users) ? body.users : []).slice(0, 100).map((u) => ({
    id: str(u.id, 80), name: str(u.name, 120), avatar: /^https:\/\//.test(String(u.avatar || "")) ? String(u.avatar).slice(0, 500) : null,
    email: str(u.email, 160), phone: str(u.phone, 40), joined: str(u.joined, 40), lastSeen: str(u.lastSeen, 40),
    paying: u.paying === true, plan: str(u.plan, 60), until: str(u.until, 40),
    extra: (Array.isArray(u.extra) ? u.extra : []).slice(0, 4).filter((e) => Array.isArray(e)).map((e) => [String(e[0] ?? "").slice(0, 30), String(e[1] ?? "").slice(0, 60)]),
  }));
  const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const c = (body && body.counts) || {};
  res.setHeader("Cache-Control", "private, no-store");
  return json(res, 200, { total: n(body.total), page: n(body.page) || 1, pages: n(body.pages) || 1, counts: { all: n(c.all), paying: n(c.paying), free: n(c.free) }, users: list });
}

export async function desk(req, res, sql) {
  await ensure(sql);
  if (String(req.query.desk) === "pull") return pull(req, res, sql);
  if (String(req.query.desk) === "users") return users(req, res, sql);
  if (String(req.query.desk) !== "data") return json(res, 400, { error: "unknown desk resource" });

  if (req.method === "GET") {
    const [row] = await sql`SELECT data, rev FROM desk_state WHERE id = 1`;
    if (!row) return json(res, 404, {});
    return sendDoc(res, 200, row);
  }

  if (req.method === "PUT") {
    const data = req.body;
    if (!data || typeof data !== "object" || Array.isArray(data)) return json(res, 400, { error: "bad json" });
    const text = JSON.stringify(data);
    if (text.length > MAX_BYTES) return json(res, 413, { error: "bad size" });
    const want = String(req.headers["if-match"] || "");

    const [cur] = await sql`SELECT data, rev FROM desk_state WHERE id = 1`;
    if (!cur) {
      // First save. ON CONFLICT covers two tabs racing to create the row.
      const [made] = await sql`INSERT INTO desk_state (id, data, rev) VALUES (1, ${text}::jsonb, 1)
        ON CONFLICT (id) DO NOTHING RETURNING rev`;
      if (made) { res.setHeader("X-Rev", String(made.rev)); return json(res, 200, { ok: true }); }
      const [now] = await sql`SELECT data, rev FROM desk_state WHERE id = 1`;
      return sendDoc(res, 409, now);
    }
    if (want !== String(cur.rev)) return sendDoc(res, 409, cur);

    // The rev in the WHERE is what makes this safe against a save that landed
    // between the SELECT above and here.
    const [saved] = await sql`UPDATE desk_state SET data = ${text}::jsonb, rev = rev + 1, updated_at = now()
      WHERE id = 1 AND rev = ${cur.rev} RETURNING rev`;
    if (!saved) {
      const [now] = await sql`SELECT data, rev FROM desk_state WHERE id = 1`;
      return sendDoc(res, 409, now);
    }
    res.setHeader("X-Rev", String(saved.rev));
    return json(res, 200, { ok: true });
  }

  return json(res, 405, { error: "Method not allowed" });
}
