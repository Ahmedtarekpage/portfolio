// One daily mood check-in — doctor-recommended daily emoji + reason tracking.
//   GET    /api/moods?date=YYYY-MM-DD        -> { mood } for that day, or { mood: null }
//   GET    /api/moods?stats=1&from=&to=      -> { moods: [{date, emoji, reason}] } for the trend graph
//   POST   /api/moods                        -> { mood_date, emoji, reason? }: create or overwrite that day's entry
//   DELETE /api/moods?date=YYYY-MM-DD
import { db } from "./_lib/db.js";
import { withErrors, json, requireAuth } from "./_lib/util.js";

function isDate(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));
}

export default withErrors(async (req, res) => {
  if (!requireAuth(req, res)) return;
  const sql = await db();

  if (req.method === "GET" && req.query.stats) {
    const from = String(req.query.from || "").slice(0, 10);
    const to = String(req.query.to || "").slice(0, 10);
    if (!isDate(from) || !isDate(to)) return json(res, 400, { error: "from/to must be YYYY-MM-DD" });
    const moods = await sql`SELECT mood_date::text AS date, emoji, reason FROM moods
      WHERE mood_date BETWEEN ${from}::date AND ${to}::date ORDER BY mood_date`;
    return json(res, 200, { moods });
  }

  if (req.method === "GET") {
    const date = String(req.query.date || "").slice(0, 10);
    if (!isDate(date)) return json(res, 400, { error: "date must be YYYY-MM-DD" });
    const [mood] = await sql`SELECT mood_date::text AS date, emoji, reason FROM moods WHERE mood_date = ${date}::date`;
    return json(res, 200, { mood: mood || null });
  }

  if (req.method === "POST") {
    const b = req.body || {};
    const date = String(b.mood_date || "").slice(0, 10);
    if (!isDate(date)) return json(res, 400, { error: "mood_date must be YYYY-MM-DD" });
    if (!b.emoji || !String(b.emoji).trim()) return json(res, 400, { error: "emoji is required" });
    const [mood] = await sql`INSERT INTO moods (mood_date, emoji, reason)
      VALUES (${date}::date, ${String(b.emoji).trim()}, ${b.reason ? String(b.reason).trim() : null})
      ON CONFLICT (mood_date) DO UPDATE SET emoji = EXCLUDED.emoji, reason = EXCLUDED.reason
      RETURNING mood_date::text AS date, emoji, reason`;
    return json(res, 200, { mood });
  }

  if (req.method === "DELETE") {
    const date = String(req.query.date || "").slice(0, 10);
    if (!isDate(date)) return json(res, 400, { error: "date must be YYYY-MM-DD" });
    await sql`DELETE FROM moods WHERE mood_date = ${date}::date`;
    return json(res, 200, { ok: true });
  }

  return json(res, 405, { error: "Method not allowed" });
});
