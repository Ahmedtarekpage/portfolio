// Concrete numeric milestones within a quarterly category, e.g. "Job applications: 320/500".
// Separate from the category's weekly-hour effort tracking (api/_lib/quarter.js) —
// a goal's progress is just current/target, set manually.
//   GET    /api/goals?category_id=N   -> goals for that category
//   GET    /api/goals?all=1          -> { totalGoals, completedGoals } across every category ever — for gamification stats
//   POST   /api/goals                 -> { category_id, title, target, unit? }
//   PATCH  /api/goals?id=N            -> { title?, target?, current?, unit?, hidden? }
//   PATCH  /api/goals?reorder=1       -> { ids: [id, ...] }: persist new drag order
//   PATCH  /api/goals?unhide_all=1    -> { category_ids: [id, ...] }: clear hidden on every goal in these categories
//   GET    /api/goals?by_quarter=1   -> { goals: [{id, current, target, quarter_id}] } every goal, for per-quarter goal %
//   GET    /api/goals?history=1&quarter_id=N -> { log: [{goal_id, day, current, target}] } day-by-day values
//   DELETE /api/goals?id=N
// POST and PATCH accept an optional log_date (YYYY-MM-DD, the client's local
// day) so a change made after midnight in Dubai isn't filed under yesterday UTC.
import { db } from "./_lib/db.js";
import { withErrors, json, requireAuth } from "./_lib/util.js";

function isDate(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));
}

// record a goal's value for a day; later changes the same day overwrite it
async function logGoal(sql, goal, logDate) {
  const day = isDate(logDate) ? logDate : null;
  await sql`INSERT INTO goal_log (goal_id, day, current, target)
    VALUES (${goal.id}, COALESCE(${day}::date, CURRENT_DATE), ${goal.current}, ${goal.target})
    ON CONFLICT (goal_id, day) DO UPDATE SET current = EXCLUDED.current, target = EXCLUDED.target`;
}

export default withErrors(async (req, res) => {
  if (!requireAuth(req, res)) return;
  const sql = await db();

  if (req.method === "GET" && req.query.all) {
    const [row] = await sql`SELECT COUNT(*)::int AS "totalGoals",
        COUNT(*) FILTER (WHERE current >= target)::int AS "completedGoals"
      FROM goals`;
    return json(res, 200, row);
  }

  if (req.method === "GET" && req.query.by_quarter) {
    const goals = await sql`SELECT g.id, g.current, g.target, c.quarter_id
      FROM goals g JOIN quarter_categories c ON c.id = g.category_id`;
    return json(res, 200, { goals });
  }

  if (req.method === "GET" && req.query.history) {
    const quarterId = Number(req.query.quarter_id);
    if (!quarterId) return json(res, 400, { error: "quarter_id is required" });
    const log = await sql`SELECT l.goal_id, l.day::text AS day, l.current, l.target
      FROM goal_log l
      JOIN goals g ON g.id = l.goal_id
      JOIN quarter_categories c ON c.id = g.category_id
      WHERE c.quarter_id = ${quarterId}
      ORDER BY l.day, l.goal_id`;
    return json(res, 200, { log });
  }

  if (req.method === "GET") {
    const categoryId = Number(req.query.category_id);
    if (!categoryId) return json(res, 400, { error: "category_id is required" });
    const goals = await sql`SELECT * FROM goals WHERE category_id = ${categoryId} ORDER BY position, created_at`;
    return json(res, 200, { goals });
  }

  if (req.method === "POST") {
    const b = req.body || {};
    const categoryId = Number(b.category_id);
    if (!categoryId) return json(res, 400, { error: "category_id is required" });
    if (!b.title || !String(b.title).trim()) return json(res, 400, { error: "Title is required" });
    const target = Number(b.target);
    if (!target || target <= 0) return json(res, 400, { error: "target must be a positive number" });

    const [goal] = await sql`INSERT INTO goals (category_id, title, target, unit, position)
      VALUES (${categoryId}, ${String(b.title).trim()}, ${target}, ${b.unit ? String(b.unit).trim() : null},
        (SELECT COALESCE(MAX(position), -1) + 1 FROM goals))
      RETURNING *`;
    await logGoal(sql, goal, b.log_date);
    return json(res, 201, { goal });
  }

  if (req.method === "PATCH" && req.query.reorder) {
    const b = req.body || {};
    const ids = Array.isArray(b.ids) ? b.ids.map(Number).filter((n) => n > 0) : [];
    if (!ids.length) return json(res, 400, { error: "ids is required" });
    for (let i = 0; i < ids.length; i++) {
      await sql`UPDATE goals SET position = ${i} WHERE id = ${ids[i]}`;
    }
    return json(res, 200, { ok: true });
  }

  if (req.method === "PATCH" && req.query.unhide_all) {
    const b = req.body || {};
    const categoryIds = Array.isArray(b.category_ids) ? b.category_ids.map(Number).filter((n) => n > 0) : [];
    if (!categoryIds.length) return json(res, 400, { error: "category_ids is required" });
    await sql`UPDATE goals SET hidden = false WHERE category_id = ANY(${categoryIds})`;
    return json(res, 200, { ok: true });
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
    const hidden = b.hidden !== undefined ? !!b.hidden : existing.hidden;

    const [goal] = await sql`UPDATE goals SET
        title = COALESCE(${b.title ?? null}, title),
        target = ${target},
        current = ${current},
        unit = ${unit},
        hidden = ${hidden}
      WHERE id = ${id} RETURNING *`;
    // only a change in progress is history; renaming or hiding a goal isn't
    if (Number(goal.current) !== Number(existing.current) || Number(goal.target) !== Number(existing.target)) {
      await logGoal(sql, goal, b.log_date);
    }
    return json(res, 200, { goal });
  }

  if (req.method === "DELETE") {
    await sql`DELETE FROM goals WHERE id = ${id}`;
    return json(res, 200, { ok: true });
  }

  return json(res, 405, { error: "Method not allowed" });
});
