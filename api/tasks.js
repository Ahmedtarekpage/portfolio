// Daily to-do tasks, optionally tagged with a quarterly category.
//   GET    /api/tasks?date=YYYY-MM-DD      -> tasks for that day (incl. category name)
//   GET    /api/tasks?stats=1&from=&to=    -> [{date, total, done}] for the % history strip
//   POST   /api/tasks                      -> { task_date, title, category_id?, planned_hours? }
//   PATCH  /api/tasks?id=N                 -> { title?, category_id?, planned_hours?, done?, actual_hours? }
//   DELETE /api/tasks?id=N
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
    const rows = await sql`SELECT task_date::text AS date, COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE done)::int AS done
      FROM tasks WHERE task_date BETWEEN ${from}::date AND ${to}::date
      GROUP BY task_date ORDER BY task_date`;
    return json(res, 200, { stats: rows });
  }

  if (req.method === "GET") {
    const date = String(req.query.date || "").slice(0, 10);
    if (!isDate(date)) return json(res, 400, { error: "date must be YYYY-MM-DD" });
    const tasks = await sql`SELECT t.*, c.name AS category_name
      FROM tasks t LEFT JOIN quarter_categories c ON c.id = t.category_id
      WHERE t.task_date = ${date}::date ORDER BY t.created_at`;
    return json(res, 200, { tasks });
  }

  if (req.method === "POST") {
    const b = req.body || {};
    if (!b.title || !String(b.title).trim()) return json(res, 400, { error: "Title is required" });
    if (!isDate(b.task_date)) return json(res, 400, { error: "task_date must be YYYY-MM-DD" });
    const categoryId = b.category_id ? Number(b.category_id) : null;
    const plannedHours = b.planned_hours != null && b.planned_hours !== "" ? Number(b.planned_hours) : null;

    const [task] = await sql`INSERT INTO tasks (task_date, title, category_id, planned_hours)
      VALUES (${b.task_date}::date, ${String(b.title).trim()}, ${categoryId}, ${plannedHours})
      RETURNING *`;
    return json(res, 201, { task });
  }

  const id = Number(req.query.id);
  if (!id) return json(res, 400, { error: "id is required" });

  if (req.method === "PATCH") {
    const b = req.body || {};
    const [existing] = await sql`SELECT * FROM tasks WHERE id = ${id}`;
    if (!existing) return json(res, 404, { error: "Task not found" });

    const done = b.done != null ? !!b.done : existing.done;
    const categoryId = b.category_id !== undefined ? (b.category_id ? Number(b.category_id) : null) : existing.category_id;
    const plannedHours = b.planned_hours !== undefined
      ? (b.planned_hours != null && b.planned_hours !== "" ? Number(b.planned_hours) : null)
      : existing.planned_hours;
    let actualHours = b.actual_hours !== undefined
      ? (b.actual_hours != null && b.actual_hours !== "" ? Number(b.actual_hours) : null)
      : existing.actual_hours;
    if (done && actualHours == null) actualHours = plannedHours;
    if (!done) actualHours = null;

    const [task] = await sql`UPDATE tasks SET
        title = COALESCE(${b.title ?? null}, title),
        category_id = ${categoryId},
        planned_hours = ${plannedHours},
        actual_hours = ${actualHours},
        done = ${done}
      WHERE id = ${id} RETURNING *`;
    return json(res, 200, { task });
  }

  if (req.method === "DELETE") {
    await sql`DELETE FROM tasks WHERE id = ${id}`;
    return json(res, 200, { ok: true });
  }

  return json(res, 405, { error: "Method not allowed" });
});
