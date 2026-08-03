// CBT-style thought records (thought -> feeling -> reframe), not tied to a
// specific day — added whenever an idea/thought comes up.
//   GET    /api/thoughts              -> { thoughts: [...] } newest first, most recent 200
//   POST   /api/thoughts              -> { thought, feeling?, reframe? }
//   PATCH  /api/thoughts?id=N         -> { thought?, feeling?, reframe? }
//   DELETE /api/thoughts?id=N
import { db } from "./_lib/db.js";
import { withErrors, json, requireAuth } from "./_lib/util.js";

export default withErrors(async (req, res) => {
  if (!requireAuth(req, res)) return;
  const sql = await db();

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
});
