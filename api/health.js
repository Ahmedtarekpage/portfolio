// Health tab: daily mood check-ins + CBT-style thought records. Combined into
// one file (not two) to stay under Vercel Hobby's 12-serverless-function cap.
//   GET    /api/health?type=mood&date=YYYY-MM-DD    -> { mood } for that day, or { mood: null }
//   GET    /api/health?type=mood&stats=1&from=&to=  -> { moods: [{date, emoji, reason}] } for the trend graph
//   POST   /api/health?type=mood                    -> { mood_date, emoji, reason? }: create or overwrite that day's entry
//   DELETE /api/health?type=mood&date=YYYY-MM-DD
//   GET    /api/health?type=thought                 -> { thoughts: [...] } newest first, most recent 200
//   POST   /api/health?type=thought                 -> { thought, feeling?, reframe? }
//   PATCH  /api/health?type=thought&id=N            -> { thought?, feeling?, reframe? }
//   DELETE /api/health?type=thought&id=N
import { db } from "./_lib/db.js";
import { withErrors, json, requireAuth } from "./_lib/util.js";

function isDate(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));
}

async function handleMood(req, res, sql) {
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
}

async function handleThought(req, res, sql) {
  if (req.method === "GET") {
    const thoughts = await sql`SELECT * FROM thoughts ORDER BY created_at DESC LIMIT 200`;
    return json(res, 200, { thoughts });
  }

  if (req.method === "POST") {
    const b = req.body || {};
    if (!b.thought || !String(b.thought).trim()) return json(res, 400, { error: "thought is required" });
    const [thought] = await sql`INSERT INTO thoughts (thought, feeling, reframe)
      VALUES (${String(b.thought).trim()}, ${b.feeling ? String(b.feeling).trim() : null}, ${b.reframe ? String(b.reframe).trim() : null})
      RETURNING *`;
    return json(res, 201, { thought });
  }

  const id = Number(req.query.id);
  if (!id) return json(res, 400, { error: "id is required" });

  if (req.method === "PATCH") {
    const b = req.body || {};
    const [existing] = await sql`SELECT * FROM thoughts WHERE id = ${id}`;
    if (!existing) return json(res, 404, { error: "Thought not found" });
    const thoughtText = b.thought !== undefined && String(b.thought).trim() ? String(b.thought).trim() : existing.thought;
    const feeling = b.feeling !== undefined ? (b.feeling ? String(b.feeling).trim() : null) : existing.feeling;
    const reframe = b.reframe !== undefined ? (b.reframe ? String(b.reframe).trim() : null) : existing.reframe;

    const [thought] = await sql`UPDATE thoughts SET
        thought = ${thoughtText},
        feeling = ${feeling},
        reframe = ${reframe}
      WHERE id = ${id} RETURNING *`;
    return json(res, 200, { thought });
  }

  if (req.method === "DELETE") {
    await sql`DELETE FROM thoughts WHERE id = ${id}`;
    return json(res, 200, { ok: true });
  }

  return json(res, 405, { error: "Method not allowed" });
}

export default withErrors(async (req, res) => {
  if (!requireAuth(req, res)) return;
  const sql = await db();
  if (req.query.type === "mood") return handleMood(req, res, sql);
  if (req.query.type === "thought") return handleThought(req, res, sql);
  return json(res, 400, { error: "type must be 'mood' or 'thought'" });
});
