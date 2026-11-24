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
//   POST /api/ideas?finance=advise -> the big-goal AI council (see advisor.js)
//   POST /api/ideas?finance=chat   -> free chat questions answered with the data (advisor.js)
//
// The table is created here, lazily, instead of in db.js's migrate(): that
// keeps this feature self-contained and out of the way of the shared schema.
import { json } from "./util.js";
import { advise, chat, intent, agent } from "./advisor.js";

const MAX_BYTES = 5_000_000;
const BACKUP_EVERY_MS = 10 * 60 * 1000; // at most one rolling backup per 10 min
const BACKUPS_KEPT = 40;

let _ready = null;

const XI = "https://api.elevenlabs.io/v1";
const SHARK_VOICE = "wxweiHvoC2r2jFM7mS8b"; // Haytham (Egyptian), same as GoBachaloria's narrator
/** POST ?finance=tts { text } -> audio/mpeg (one sentence or a few; max 600 chars) */
async function tts(req, res) {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return json(res, 503, { error: "no voice key" });
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });
  const text = String(req.body?.text || "").slice(0, 600).trim();
  if (!text) return json(res, 400, { error: "no text" });
  const r = await fetch(`${XI}/text-to-speech/${SHARK_VOICE}?output_format=mp3_44100_64`, {
    method: "POST", headers: { "xi-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({ text, model_id: "eleven_v4_turbo" }),
  });
  if (!r.ok) { console.error("tts", r.status, (await r.text()).slice(0, 200)); return json(res, 502, { error: "voice unavailable" }); }
  res.statusCode = 200; res.setHeader("Content-Type", "audio/mpeg"); res.setHeader("Cache-Control", "private, no-store");
  res.end(Buffer.from(await r.arrayBuffer()));
}
/** POST ?finance=stt { audio: base64, mime } -> { text } */
async function stt(req, res) {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return json(res, 503, { error: "no voice key" });
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });
  const b64 = String(req.body?.audio || ""), mime = String(req.body?.mime || "audio/webm").slice(0, 60);
  if (!b64 || b64.length > 4_000_000) return json(res, 400, { error: "bad audio" });
  const fd = new FormData();
  fd.append("model_id", "scribe_v1");
  // كلامه عربي مصري وفيه كلمات إنجليزي: نثبّت العربي، وإلا Scribe ساعات بيخمّن إنجليزي ويكتب كله إنجليزي
  if (req.body?.lang !== "en") fd.append("language_code", "ara");
  fd.append("tag_audio_events", "false");
  fd.append("file", new Blob([Buffer.from(b64, "base64")], { type: mime }), "voice." + (mime.includes("mp4") ? "mp4" : mime.includes("ogg") ? "ogg" : "webm"));
  const r = await fetch(`${XI}/speech-to-text`, { method: "POST", headers: { "xi-api-key": key }, body: fd });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { console.error("stt", r.status, JSON.stringify(d).slice(0, 200)); return json(res, 502, { error: "stt unavailable" }); }
  res.setHeader("Cache-Control", "private, no-store");
  return json(res, 200, { text: String(d.text || "").trim() });
}

/** the saved chat as plain lines, newest last, cut to ~40k characters (the AI's memory) */
async function chatMemory(sql) {
  try {
    await ensure(sql);
    const rows = await sql`SELECT who, text, at FROM finance_chat ORDER BY id DESC LIMIT 400`;
    const out = []; let n = 0;
    for (const r of rows) { const line = `[${new Date(r.at).toISOString().slice(0, 10)}] ${r.who === "owner" ? "Owner" : "Shark"}: ${r.text}`; n += line.length; if (n > 40_000) break; out.push(line); }
    return out.reverse().join("\n");
  } catch (e) { console.error("chat memory", e.message); return ""; }
}
// 🧠 Shark doesn't re-read everything each time (owner, 2026-11-20): the server keeps a saved snapshot of his
// data + the chat up to a point. Each question sends Claude that same snapshot (prompt-cached for an hour, so
// it is cheap and fast) plus ONLY what changed since it and the new chat lines. Rebased when the changes grow.
const stable = v => Array.isArray(v) ? v.map(stable) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, stable(v[k])])) : v;
function diff(a, b, path = "", out = []) {
  if (JSON.stringify(a) === JSON.stringify(b)) return out;
  if (Array.isArray(a) && Array.isArray(b) && (a.some((x) => x && typeof x === "object") || b.some((x) => x && typeof x === "object"))) {
    const A = new Set(a.map((x) => JSON.stringify(x))), Bs = new Set(b.map((x) => JSON.stringify(x)));
    for (const x of b) { const j = JSON.stringify(x); if (!A.has(j)) out.push(`+ ${path}[]: ${j}`); }
    for (const x of a) { const j = JSON.stringify(x); if (!Bs.has(j)) out.push(`- ${path}[]: ${j}`); }
    return out;
  }
  if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b)) {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) diff(a[k], b[k], path ? `${path}.${k}` : k, out);
    return out;
  }
  out.push(`~ ${path}: ${JSON.stringify(a)} → ${JSON.stringify(b)}`);
  return out;
}
const memLine = (r) => `[${new Date(r.at).toISOString().slice(0, 10)}] ${r.who === "owner" ? "Owner" : "Shark"}: ${r.text}`;
async function agentContext(sql, raw) {
  await ensure(sql);
  await sql`CREATE TABLE IF NOT EXISTS finance_agent_ctx (id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1), data JSONB NOT NULL, memory TEXT NOT NULL, upto INTEGER NOT NULL, at TIMESTAMPTZ NOT NULL DEFAULT now())`;
  const data = stable({ ...(raw || {}) }); delete data.recentChat; // the chat comes from memory
  const [row] = await sql`SELECT data, memory, upto, at FROM finance_agent_ctx WHERE id = 1`;
  const fresh = row ? await sql`SELECT id, who, text, at FROM finance_chat WHERE id > ${row.upto} ORDER BY id ASC LIMIT 400` : [];
  const freshText = fresh.map(memLine).join("\n");
  const changes = row ? diff(row.data, data) : [];
  const changesText = changes.join("\n");
  const old = row && Date.now() - new Date(row.at).getTime() > 3 * 864e5;
  if (!row || old || changesText.length > 6000 || freshText.length > 15000) {
    // rebase: a new saved snapshot (data now + the last ~40k chars of chat)
    const rows = await sql`SELECT id, who, text, at FROM finance_chat ORDER BY id DESC LIMIT 400`;
    const lines = []; let n = 0;
    for (const r of rows) { const l = memLine(r); n += l.length; if (n > 40_000) break; lines.push(l); }
    const memory = lines.reverse().join("\n"), upto = rows[0]?.id || 0;
    await sql`INSERT INTO finance_agent_ctx (id, data, memory, upto, at) VALUES (1, ${JSON.stringify(data)}, ${memory}, ${upto}, now())
      ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, memory = EXCLUDED.memory, upto = EXCLUDED.upto, at = now()`;
    return { snapshot: JSON.stringify(data), savedAt: new Date().toISOString(), memory, changes: "", newChat: "" };
  }
  return { snapshot: JSON.stringify(row.data), savedAt: new Date(row.at).toISOString(), memory: row.memory, changes: changesText, newChat: freshText };
}
function ensure(sql) {
  if (!_ready) {
    _ready = (async () => {
      await sql`CREATE TABLE IF NOT EXISTS finance_state (
        id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
        data JSONB NOT NULL,
        rev BIGINT NOT NULL DEFAULT 1,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`;
      // the chat with Shark, kept so the AI remembers what was discussed (owner, 2026-11-20)
      await sql`CREATE TABLE IF NOT EXISTS finance_chat (
        id SERIAL PRIMARY KEY,
        who TEXT NOT NULL,
        text TEXT NOT NULL,
        at TIMESTAMPTZ NOT NULL DEFAULT now()
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

// One-time additions to the owner's saved document, applied on the next load.
// They live here, not in the page, because finance/*.js is served to anyone and
// must not carry personal numbers (see the note on seed() in finance/app.js).
// Each one runs once: its key is recorded in data.applied and never runs again.
const rid = () => Math.random().toString(36).slice(2, 9);
const ONE_TIME = {
  // 2026-11-19, owner's list: Egypt essentials (EGP). "Living" depends on where he is:
  // 4,000 while he is in the UAE, 8,000 while in Egypt (see whereOn/essFor in rules.js).
  "egp-essentials-2026-11-19": (d) => {
    const items = [
      ["🏠", "Rent", 6500], ["💡", "Bills", 1500], ["🌐", "Internet", 500], ["🛡️", "Alamin", 800],
      ["📱", "Mobile", 500], ["🛠️", "Apartment Maintenance fees", 250], ["🎬", "Entertainment", 2000], ["🛒", "Living", 8000],
    ];
    d.essentials = Array.isArray(d.essentials) ? d.essentials : [];
    for (const [icon, name, amount] of items) {
      const same = d.essentials.find((e) => (e.cur || "AED") === "EGP" && String(e.name).trim().toLowerCase() === name.toLowerCase());
      const where = name === "Living" ? { AED: 4000, EGP: 8000 } : undefined;
      if (same) { same.amount = amount; if (where) same.where = where; continue; } // already pasted in the chat: just make sure it's right
      d.essentials.push({ id: rid(), icon, name, amount, cur: "EGP", ...(where ? { where } : {}) });
    }
  },
  // 2026-11-19, owner: Entertainment (EGP) depends on where he AND his wife are:
  // both in Egypt 2,000 · he in the UAE and she in Egypt 500 · both in the UAE 0 (see amtAt in rules.js).
  "egp-entertainment-wife-2026-11-19": (d) => {
    const e = (d.essentials || []).find((x) => (x.cur || "AED") === "EGP" && /^entertainment$/i.test(String(x.name).trim()));
    if (!e) return;
    e.whereMode = "both";
    e.where = { ...(e.where || {}), "EGP+EGP": 2000, "AED+EGP": 500, "AED+AED": 0, EGP: 2000, AED: 500 };
  },
  // 2026-11-19, owner: Egypt rent is prepaid up to December 2026 (counts 0 in those cycles, see
  // prepaid() in rules.js), and "he is in Egypt while his wife is in the UAE" never happens.
  "egp-rent-prepaid-nosit-2026-11-19": (d) => {
    const rent = (d.essentials || []).find((x) => (x.cur || "AED") === "EGP" && /^rent$/i.test(String(x.name).trim()));
    if (rent) rent.paidTo = "2026-12";
    d.noSit = [...new Set([...(Array.isArray(d.noSit) ? d.noSit : []), "EGP+AED"])];
    for (const e of d.essentials || []) if (e.whereMode === "both" && e.where) delete e.where["EGP+AED"];
  },
};
function applyOnce(data) {
  const done = new Set(Array.isArray(data.applied) ? data.applied : []);
  let changed = false;
  for (const [key, fn] of Object.entries(ONE_TIME)) {
    if (done.has(key)) continue;
    fn(data); done.add(key); changed = true;
  }
  if (changed) data.applied = [...done];
  return changed;
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

  // saved chat = the AI's memory. POST { items:[{who,text}] } appends; the AI endpoints read it
  if (what === "chatlog") {
    await ensure(sql);
    if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });
    const items = (Array.isArray(req.body?.items) ? req.body.items : []).slice(0, 50)
      .map((x) => ({ who: x.who === "owner" ? "owner" : "shark", text: String(x.text || "").slice(0, 3000).trim() })).filter((x) => x.text);
    for (const x of items) await sql`INSERT INTO finance_chat (who, text) VALUES (${x.who}, ${x.text})`;
    await sql`DELETE FROM finance_chat WHERE id NOT IN (SELECT id FROM finance_chat ORDER BY id DESC LIMIT 3000)`;
    return json(res, 200, { ok: true, saved: items.length });
  }
  // 🔊 صوت قرش (ElevenLabs، صوت هيثم المصري) و🎙️ الكلام بصوتك (ElevenLabs Scribe). المفتاح على السيرفر بس.
  // 🎛 The owner's switches live in the saved document (data.use). With one off, the paid service
  // behind it is not called at all here either, whatever an open or stale page asks for.
  if (["tts", "stt", "advise", "chat", "agent", "intent"].includes(what)) {
    await ensure(sql);
    const [sw] = await sql`SELECT data->'use' AS use FROM finance_state WHERE id = 1`;
    const use = (sw && sw.use) || {};
    const voice = what === "tts" || what === "stt";
    if (voice ? use.voice === false : use.ai === false) return json(res, 403, { error: voice ? "voice is switched off" : "AI is switched off", off: true });
  }
  if (what === "tts") return tts(req, res);
  if (what === "stt") return stt(req, res);
  const memory = ["advise", "chat"].includes(what) ? await chatMemory(sql) : "";
  // the big-goal council (AI); see advisor.js
  if (what === "advise") return advise(req, res, memory);
  // free questions typed in the chat, answered with the owner's data (see advisor.js)
  if (what === "chat") return chat(req, res, memory);
  // 🦈 the agent with tools (Claude); see advisor.js
  if (what === "agent") return agent(req, res, req.method === "POST" && req.body?.start ? await agentContext(sql, req.body.data).catch((e) => { console.error("agent ctx", e.message); return null; }) : null);
  // what he typed in the middle of a chat step: pick / reply / switch task (see advisor.js)
  if (what === "intent") return intent(req, res);

  if (what !== "data") return json(res, 400, { error: "unknown finance resource" });
  await ensure(sql);

  if (req.method === "GET") {
    const [row] = await sql`SELECT data, rev FROM finance_state WHERE id = 1`;
    if (!row) return json(res, 404, {});
    const data = row.data;
    if (applyOnce(data)) {
      // saved with the usual rev guard, so a tab saving at the same moment is not overwritten
      const [saved] = await sql`UPDATE finance_state SET data = ${JSON.stringify(data)}::jsonb, rev = rev + 1, updated_at = now()
        WHERE id = 1 AND rev = ${row.rev} RETURNING rev`;
      if (saved) return sendDoc(res, 200, { data, rev: saved.rev });
      const [now] = await sql`SELECT data, rev FROM finance_state WHERE id = 1`;
      return sendDoc(res, 200, now);
    }
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
