// Finance ("Floosy") — the private money planner at /finance.
//
// The page is a self-contained app that keeps its whole state as one JSON
// document, so the server's job is small: hand the document back, take a new
// one, and refuse to let one open tab overwrite a newer save from another.
//
// It lives here, behind api/ideas.js, rather than in a function of its own
// because the Hobby plan publishes 12 functions and api/ is at exactly 12 (see
// README, "Things that have bitten us").
//
//   GET /api/ideas?finance=data  -> the document (raw JSON body), X-Rev header
//   PUT /api/ideas?finance=data  -> save; needs If-Match: <rev>, else 409 + the
//                                   current document so the tab can adopt it
//   GET /api/ideas?finance=fx    -> live USD rates (EGP, AED, EUR, SAR), cached
//
// The table is created here, lazily, instead of in db.js's migrate(): that
// keeps this feature self-contained and out of the way of the shared schema.
import { json } from "./util.js";

const MAX_BYTES = 5_000_000;
const BACKUP_EVERY_MS = 10 * 60 * 1000; // at most one rolling backup per 10 min
const BACKUPS_KEPT = 40;

let _ready = null;
function ensure(sql) {
  if (!_ready) {
    _ready = (async () => {
      await sql`CREATE TABLE IF NOT EXISTS finance_state (
        id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
        data JSONB NOT NULL,
        rev BIGINT NOT NULL DEFAULT 1,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`;
      await sql`CREATE TABLE IF NOT EXISTS finance_backups (
        id SERIAL PRIMARY KEY,
        data JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
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

// Live market rates, quoted as "units per 1 USD". Cached per lambda instance
// for a minute so a page that polls does not lean on the source.
const FX_SYMBOLS = { egp: "EGP=X", aed: "AED=X", eurusd: "EURUSD=X", sar: "SAR=X" };
const _fx = { at: 0, data: null };

async function quote(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1m&range=1d`;
  const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`quote ${symbol}: ${r.status}`);
  const meta = (await r.json()).chart.result[0].meta;
  return [Number(meta.regularMarketPrice), Number(meta.regularMarketTime)];
}

async function liveFx() {
  if (_fx.data && Date.now() - _fx.at < 60_000) return _fx.data;
  const out = {};
  let newest = 0;
  await Promise.all(Object.entries(FX_SYMBOLS).map(async ([key, symbol]) => {
    try {
      const [price, time] = await quote(symbol);
      if (price > 0) { out[key] = price; newest = Math.max(newest, time); }
    } catch { /* one missing quote is fine; EGP and AED are the ones that matter */ }
  }));
  if (out.egp && out.aed) {
    out.time = newest;
    _fx.at = Date.now();
    _fx.data = out;
    return out;
  }
  return _fx.data; // stale beats nothing
}

/** Handles every ?finance=… request. The caller has already checked auth. */
export async function finance(req, res, sql) {
  const what = String(req.query.finance);

  if (what === "fx") {
    if (req.method !== "GET") return json(res, 405, { error: "Method not allowed" });
    const data = await liveFx();
    if (!data) return json(res, 502, { error: "no live rates" });
    res.setHeader("Cache-Control", "private, max-age=60");
    return json(res, 200, data);
  }

  if (what !== "data") return json(res, 400, { error: "unknown finance resource" });
  await ensure(sql);

  if (req.method === "GET") {
    const [row] = await sql`SELECT data, rev FROM finance_state WHERE id = 1`;
    if (!row) return json(res, 404, {});
    return sendDoc(res, 200, row);
  }

  if (req.method === "PUT") {
    const data = req.body;
    if (!data || typeof data !== "object" || Array.isArray(data)) return json(res, 400, { error: "bad json" });
    const text = JSON.stringify(data);
    if (text.length > MAX_BYTES) return json(res, 413, { error: "bad size" });
    const want = String(req.headers["if-match"] || "");

    const [cur] = await sql`SELECT data, rev FROM finance_state WHERE id = 1`;
    if (!cur) {
      // First save. ON CONFLICT covers two tabs racing to create the row.
      const [made] = await sql`INSERT INTO finance_state (id, data, rev) VALUES (1, ${text}::jsonb, 1)
        ON CONFLICT (id) DO NOTHING RETURNING rev`;
      if (made) { res.setHeader("X-Rev", String(made.rev)); return json(res, 200, { ok: true }); }
      const [now] = await sql`SELECT data, rev FROM finance_state WHERE id = 1`;
      return sendDoc(res, 409, now);
    }
    if (want !== String(cur.rev)) return sendDoc(res, 409, cur);

    // Keep the version being replaced, at most once per 10 minutes.
    const [last] = await sql`SELECT created_at FROM finance_backups ORDER BY id DESC LIMIT 1`;
    if (!last || Date.now() - new Date(last.created_at).getTime() > BACKUP_EVERY_MS) {
      await sql`INSERT INTO finance_backups (data) SELECT data FROM finance_state WHERE id = 1`;
      await sql`DELETE FROM finance_backups WHERE id NOT IN (SELECT id FROM finance_backups ORDER BY id DESC LIMIT ${BACKUPS_KEPT})`;
    }

    // The rev in the WHERE is what makes this safe: if another tab saved
    // between the SELECT above and here, no row matches and we report 409.
    const [saved] = await sql`UPDATE finance_state SET data = ${text}::jsonb, rev = rev + 1, updated_at = now()
      WHERE id = 1 AND rev = ${cur.rev} RETURNING rev`;
    if (!saved) {
      const [now] = await sql`SELECT data, rev FROM finance_state WHERE id = 1`;
      return sendDoc(res, 409, now);
    }
    res.setHeader("X-Rev", String(saved.rev));
    return json(res, 200, { ok: true });
  }

  return json(res, 405, { error: "Method not allowed" });
}
