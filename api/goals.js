// Concrete numeric milestones within a quarterly category, e.g. "Job applications: 320/500".
// Separate from the category's weekly-hour effort tracking (api/_lib/quarter.js) —
// a goal's progress is just current/target, set manually.
//   GET    /api/goals?category_id=N   -> goals for that category
//   POST   /api/goals                 -> { category_id, title, target, unit? }
//   PATCH  /api/goals?id=N            -> { title?, target?, current?, unit? }
//   DELETE /api/goals?id=N
import { db } from "./_lib/db.js";
import { withErrors, json, requireAuth } from "./_lib/util.js";

export default withErrors(async (req, res) => {
  if (!requireAuth(req, res)) return;
  const sql = await db();

  if (req.method === "GET") {
    const categoryId = Number(req.query.category_id);
    if (!categoryId) return json(res, 400, { error: "category_id is required" });
    const goals = await sql`SELECT * FROM goals WHERE category_id = ${categoryId} ORDER BY created_at`;
    return json(res, 200, { goals });
  }

  if (req.method === "POST") {
    const b = req.body || {};
    const categoryId = Number(b.category_id);
    if (!categoryId) return json(res, 400, { error: "category_id is required" });
    if (!b.title || !String(b.title).trim()) return json(res, 400, { error: "Title is required" });
    const target = Number(b.target);
    if (!target || target <= 0) return json(res, 400, { error: "target must be a positive number" });

    const [goal] = await sql`INSERT INTO goals (category_id, title, target, unit)
      VALUES (${categoryId}, ${String(b.title).trim()}, ${target}, ${b.unit ? String(b.unit).trim() : null})
      RETURNING *`;
    return json(res, 201, { goal });
  }

  const id = Number(req.query.id);
  if (!id) return json(res, 400, { error: "id is required" });

  if (req.method === "PATCH") {
    const b = req.body || {};
    const [existing] = await sql`SELECT * FROM goals WHERE id = ${id}`;
    if (!existing) return json(res, 404, { error: "Goal not found" });
    const target = b.target !== undefined && b.target !== "" ? Number(b.target) : existing.target;
    if (!target || target <= 0) return json(res, 400, { error: "target must be a positive number" });
    const current = b.current !== undefined && b.current !== "" ? Number(b.current) : existing.current;
    const unit = b.unit !== undefined ? (b.unit ? String(b.unit).trim() : null) : existing.unit;

    const [goal] = await sql`UPDATE goals SET
        title = COALESCE(${b.title ?? null}, title),
        target = ${target},
        current = ${current},
        unit = ${unit}
      WHERE id = ${id} RETURNING *`;
    return json(res, 200, { goal });
  }

  if (req.method === "DELETE") {
    await sql`DELETE FROM goals WHERE id = ${id}`;
    return json(res, 200, { ok: true });
  }

  return json(res, 405, { error: "Method not allowed" });
});
