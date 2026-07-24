// Concrete numeric milestones within a category, scoped to one 42-day cycle,
// e.g. "Job applications: 320/500" during cycle 2026-VY3-A. Separate from the
// category's weekly-hour effort tracking (api/_lib/quarter.js) — a goal's
// progress is just current/target, set manually. Only current/future cycles
// (per api/_lib/cycle.js) can be created or edited.
//   GET    /api/goals?category_id=N&cycle_key=K   -> goals for that category+cycle
//   POST   /api/goals                             -> { category_id, cycle_key, title, target, unit? }
//   PATCH  /api/goals?id=N                        -> { title?, target?, current?, unit? }
//   DELETE /api/goals?id=N
import { db } from "./_lib/db.js";
import { withErrors, json, requireAuth } from "./_lib/util.js";
import { isEditable } from "./_lib/cycle.js";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default withErrors(async (req, res) => {
  if (!requireAuth(req, res)) return;
  const sql = await db();

  if (req.method === "GET") {
    const categoryId = Number(req.query.category_id);
    const cycleKey = String(req.query.cycle_key || "");
    if (!categoryId) return json(res, 400, { error: "category_id is required" });
    if (!cycleKey) return json(res, 400, { error: "cycle_key is required" });
    const goals = await sql`SELECT * FROM goals WHERE category_id = ${categoryId} AND cycle_key = ${cycleKey} ORDER BY created_at`;
    return json(res, 200, { goals });
  }

  if (req.method === "POST") {
    const b = req.body || {};
    const categoryId = Number(b.category_id);
    const cycleKey = String(b.cycle_key || "");
    if (!categoryId) return json(res, 400, { error: "category_id is required" });
    if (!cycleKey) return json(res, 400, { error: "cycle_key is required" });
    if (!isEditable(cycleKey, todayISO())) return json(res, 400, { error: "This cycle is in the past and can't be edited" });
    if (!b.title || !String(b.title).trim()) return json(res, 400, { error: "Title is required" });
    const target = Number(b.target);
    if (!target || target <= 0) return json(res, 400, { error: "target must be a positive number" });

    const [goal] = await sql`INSERT INTO goals (category_id, cycle_key, title, target, unit)
      VALUES (${categoryId}, ${cycleKey}, ${String(b.title).trim()}, ${target}, ${b.unit ? String(b.unit).trim() : null})
      RETURNING *`;
    return json(res, 201, { goal });
  }

  const id = Number(req.query.id);
  if (!id) return json(res, 400, { error: "id is required" });

  if (req.method === "PATCH") {
    const b = req.body || {};
    const [existing] = await sql`SELECT * FROM goals WHERE id = ${id}`;
    if (!existing) return json(res, 404, { error: "Goal not found" });
    if (!isEditable(existing.cycle_key, todayISO())) return json(res, 400, { error: "This cycle is in the past and can't be edited" });
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
    const [existing] = await sql`SELECT cycle_key FROM goals WHERE id = ${id}`;
    if (existing && !isEditable(existing.cycle_key, todayISO())) {
      return json(res, 400, { error: "This cycle is in the past and can't be edited" });
    }
    await sql`DELETE FROM goals WHERE id = ${id}`;
    return json(res, 200, { ok: true });
  }

  return json(res, 405, { error: "Method not allowed" });
});
