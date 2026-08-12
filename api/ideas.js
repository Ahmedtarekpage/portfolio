// Ideas tab: a freeform, drag-to-reorder list of ideas (not tied to a day).
//   GET    /api/ideas               -> { ideas: [...] } in position order
//   POST   /api/ideas               -> { text }
//   PATCH  /api/ideas?reorder=1     -> { ids: [id, ...] }: persist new drag order
//   PATCH  /api/ideas?id=N          -> { text }
//   DELETE /api/ideas?id=N
import { db } from "./_lib/db.js";
import { withErrors, json, requireAuth } from "./_lib/util.js";

export default withErrors(async (req, res) => {
  if (!requireAuth(req, res)) return;
  const sql = await db();

  if (req.method === "GET") {
    const ideas = await sql`SELECT * FROM ideas ORDER BY position, created_at`;
    return json(res, 200, { ideas });
  }

  if (req.method === "POST") {
    const b = req.body || {};
    if (!b.text || !String(b.text).trim()) return json(res, 400, { error: "text is required" });
    const [idea] = await sql`INSERT INTO ideas (text, position)
      VALUES (${String(b.text).trim()}, (SELECT COALESCE(MAX(position), -1) + 1 FROM ideas))
      RETURNING *`;
    return json(res, 201, { idea });
  }

  if (req.method === "PATCH" && req.query.reorder) {
    const b = req.body || {};
    const ids = Array.isArray(b.ids) ? b.ids.map(Number).filter((n) => n > 0) : [];
    if (!ids.length) return json(res, 400, { error: "ids is required" });
    for (let i = 0; i < ids.length; i++) {
      await sql`UPDATE ideas SET position = ${i} WHERE id = ${ids[i]}`;
    }
    return json(res, 200, { ok: true });
  }

  const id = Number(req.query.id);
  if (!id) return json(res, 400, { error: "id is required" });

  if (req.method === "PATCH") {
    const b = req.body || {};
    if (!b.text || !String(b.text).trim()) return json(res, 400, { error: "text is required" });
    const [idea] = await sql`UPDATE ideas SET text = ${String(b.text).trim()} WHERE id = ${id} RETURNING *`;
    if (!idea) return json(res, 404, { error: "Idea not found" });
    return json(res, 200, { idea });
  }

  if (req.method === "DELETE") {
    await sql`DELETE FROM ideas WHERE id = ${id}`;
    return json(res, 200, { ok: true });
  }

  return json(res, 405, { error: "Method not allowed" });
});
