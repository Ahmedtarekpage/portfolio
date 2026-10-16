// Daily to-do tasks, optionally tagged with a quarterly category.
//   GET    /api/tasks?date=YYYY-MM-DD        -> tasks for that day (incl. category name), in position order
//   GET    /api/tasks?stats=1&from=&to=      -> [{date, total, done}] for the % history strip
//   GET    /api/tasks?totals=1               -> { totalDone, totalTasks } all-time — for gamification stats
//   POST   /api/tasks?duplicate=1            -> { from_date, to_date }: copy a day's tasks (title/category/planned hours only) onto another date
//   POST   /api/tasks                        -> { task_date, title, category_id?, planned_hours?, icon?, estimated? }
//   PATCH  /api/tasks?estimate=1          -> { from, to, estimated? }: mark (or unmark) a stretch of days as written in afterwards
//   PATCH  /api/tasks?reorder=1             -> { ids: [id, ...] }: persist new drag order for those tasks
//   PATCH  /api/tasks?id=N                   -> { title?, category_id?, planned_hours?, done?, actual_hours?, icon? }
//   DELETE /api/tasks?date=YYYY-MM-DD        -> delete every task on that day
//   DELETE /api/tasks?ids=1,2,3              -> delete a hand-picked set in one go -> { count }
//   DELETE /api/tasks?id=N
import { db } from "./_lib/db.js";
import { withErrors, json, requireAuth } from "./_lib/util.js";

function isDate(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));
}

// The ten focus blocks of a day. They live here rather than in their own
// function because Vercel's Hobby plan allows twelve, and twelve are in use.
//   GET    /api/tasks?pomodoros=1&date=  -> { date, slots: [{slot, mode, minutes}], history: [{date, done}] }
//   POST   /api/tasks?pomodoros=1        -> { date, slot, mode?, minutes? } tick one
//   DELETE /api/tasks?pomodoros=1&date=&slot=N -> untick it
async function pomodoros(req, res, sql) {
  const q = req.query, b = req.body || {};
  // the Cairo day, so the list turns over at midnight in Cairo wherever he is
  const cairoDay = async () => (await sql`SELECT (now() AT TIME ZONE 'Africa/Cairo')::date::text AS d`)[0].d;
  const day = isDate(q.date) ? String(q.date) : isDate(b.date) ? String(b.date) : await cairoDay();

  // for the achievements: everything ever, in one row
  if (req.method === "GET" && q.totals) {
    const [row] = await sql`SELECT COALESCE(SUM(n), 0)::int AS blocks,
        COALESCE(MAX(n), 0)::int AS "bestDay",
        COUNT(*) FILTER (WHERE n >= 10)::int AS "fullDays"
      FROM (SELECT day, COUNT(*)::int AS n FROM pomodoros GROUP BY day) d`;
    return json(res, 200, row);
  }

  if (req.method === "GET") {
    const slots = await sql`SELECT slot, mode, minutes, done_at FROM pomodoros WHERE day = ${day}::date ORDER BY slot`;
    const history = await sql`SELECT day::text AS date, COUNT(*)::int AS done FROM pomodoros
      WHERE day BETWEEN ${day}::date - 13 AND ${day}::date GROUP BY day ORDER BY day`;
    return json(res, 200, { date: day, slots, history });
  }

  if (req.method === "POST") {
    const slot = Number(b.slot);
    if (!Number.isInteger(slot) || slot < 1 || slot > 50) return json(res, 400, { error: "slot is out of range" });
    const minutes = b.minutes != null && b.minutes !== "" ? Math.round(Number(b.minutes)) : null;
    const [row] = await sql`INSERT INTO pomodoros (day, slot, mode, minutes)
      VALUES (${day}::date, ${slot}, ${String(b.mode || "").slice(0, 60)}, ${minutes})
      ON CONFLICT (day, slot) DO UPDATE SET mode = EXCLUDED.mode, minutes = COALESCE(EXCLUDED.minutes, pomodoros.minutes)
      RETURNING slot, mode, minutes, done_at`;
    return json(res, 201, { date: day, slot: row });
  }

  if (req.method === "DELETE") {
    const slot = Number(q.slot);
    if (!Number.isInteger(slot)) return json(res, 400, { error: "slot is required" });
    await sql`DELETE FROM pomodoros WHERE day = ${day}::date AND slot = ${slot}`;
    return json(res, 200, { ok: true });
  }

  return json(res, 405, { error: "Method not allowed" });
}

export default withErrors(async (req, res) => {
  if (!requireAuth(req, res)) return;
  const sql = await db();

  if (req.query.pomodoros) return pomodoros(req, res, sql);

  if (req.method === "GET" && req.query.totals) {
    const [row] = await sql`SELECT COUNT(*) FILTER (WHERE done)::int AS "totalDone",
        COUNT(*)::int AS "totalTasks"
      FROM tasks`;
    return json(res, 200, row);
  }

  if (req.method === "GET" && req.query.stats) {
    const from = String(req.query.from || "").slice(0, 10);
    const to = String(req.query.to || "").slice(0, 10);
    if (!isDate(from) || !isDate(to)) return json(res, 400, { error: "from/to must be YYYY-MM-DD" });
    const rows = await sql`SELECT task_date::text AS date, COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE done)::int AS done,
        bool_and(estimated) AS estimated
      FROM tasks WHERE task_date BETWEEN ${from}::date AND ${to}::date
      GROUP BY task_date ORDER BY task_date`;
    return json(res, 200, { stats: rows });
  }

  if (req.method === "GET") {
    const date = String(req.query.date || "").slice(0, 10);
    if (!isDate(date)) return json(res, 400, { error: "date must be YYYY-MM-DD" });
    const tasks = await sql`SELECT t.*, c.name AS category_name
      FROM tasks t LEFT JOIN quarter_categories c ON c.id = t.category_id
      WHERE t.task_date = ${date}::date ORDER BY t.position, t.created_at`;
    return json(res, 200, { tasks });
  }

  if (req.method === "POST" && req.query.duplicate) {
    const b = req.body || {};
    if (!isDate(b.from_date) || !isDate(b.to_date)) return json(res, 400, { error: "from_date/to_date must be YYYY-MM-DD" });
    const source = await sql`SELECT title, category_id, planned_hours, icon FROM tasks
      WHERE task_date = ${b.from_date}::date ORDER BY position, created_at`;
    if (!source.length) return json(res, 200, { count: 0 });
    const [{ next }] = await sql`SELECT COALESCE(MAX(position), -1) + 1 AS next FROM tasks WHERE task_date = ${b.to_date}::date`;
    let pos = Number(next);
    for (const t of source) {
      await sql`INSERT INTO tasks (task_date, title, category_id, planned_hours, icon, position)
        VALUES (${b.to_date}::date, ${t.title}, ${t.category_id}, ${t.planned_hours}, ${t.icon}, ${pos})`;
      pos++;
    }
    return json(res, 201, { count: source.length });
  }

  if (req.method === "POST") {
    const b = req.body || {};
    if (!b.title || !String(b.title).trim()) return json(res, 400, { error: "Title is required" });
    if (!isDate(b.task_date)) return json(res, 400, { error: "task_date must be YYYY-MM-DD" });
    const categoryId = b.category_id ? Number(b.category_id) : null;
    const plannedHours = b.planned_hours != null && b.planned_hours !== "" ? Number(b.planned_hours) : null;
    const icon = b.icon ? String(b.icon).slice(0, 8) : null;

    const [task] = await sql`INSERT INTO tasks (task_date, title, category_id, planned_hours, icon, estimated, position)
      VALUES (${b.task_date}::date, ${String(b.title).trim()}, ${categoryId}, ${plannedHours}, ${icon}, ${b.estimated === true},
        (SELECT COALESCE(MAX(position), -1) + 1 FROM tasks WHERE task_date = ${b.task_date}::date))
      RETURNING *`;
    return json(res, 201, { task });
  }

  // Days filled in before the "estimated" mark existed (owner, 2026-10-16:
  // "I have filled days from 25th Sep to 17 Oct, add this to them"), and the
  // way back out if a stretch was marked by mistake.
  if (req.method === "PATCH" && req.query.estimate) {
    const b = req.body || {};
    const from = String(b.from || "").slice(0, 10);
    const to = String(b.to || "").slice(0, 10);
    if (!isDate(from) || !isDate(to)) return json(res, 400, { error: "from/to must be YYYY-MM-DD" });
    if (from > to) return json(res, 400, { error: "The first day must come before the last" });
    const estimated = b.estimated !== false;
    const rows = await sql`UPDATE tasks SET estimated = ${estimated}
      WHERE task_date BETWEEN ${from}::date AND ${to}::date AND estimated IS DISTINCT FROM ${estimated}
      RETURNING task_date::text AS date`;
    const days = new Set(rows.map((r) => r.date)).size;
    return json(res, 200, { ok: true, tasks: rows.length, days });
  }

  if (req.method === "PATCH" && req.query.reorder) {
    const b = req.body || {};
    const ids = Array.isArray(b.ids) ? b.ids.map(Number).filter((n) => n > 0) : [];
    if (!ids.length) return json(res, 400, { error: "ids is required" });
    for (let i = 0; i < ids.length; i++) {
      await sql`UPDATE tasks SET position = ${i} WHERE id = ${ids[i]}`;
    }
    return json(res, 200, { ok: true });
  }

  if (req.method === "DELETE" && req.query.ids) {
    // one statement, so a selection is deleted whole or not at all — deleting
    // them one request at a time could stop halfway and leave half a selection
    const ids = String(req.query.ids).split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0);
    if (!ids.length) return json(res, 400, { error: "ids must be a comma-separated list of task ids" });
    const rows = await sql`DELETE FROM tasks WHERE id = ANY(${ids}) RETURNING id`;
    return json(res, 200, { ok: true, count: rows.length });
  }

  if (req.method === "DELETE" && req.query.date) {
    const date = String(req.query.date).slice(0, 10);
    if (!isDate(date)) return json(res, 400, { error: "date must be YYYY-MM-DD" });
    await sql`DELETE FROM tasks WHERE task_date = ${date}::date`;
    return json(res, 200, { ok: true });
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
    const icon = b.icon !== undefined ? (b.icon ? String(b.icon).slice(0, 8) : null) : existing.icon;
    let actualHours = b.actual_hours !== undefined
      ? (b.actual_hours != null && b.actual_hours !== "" ? Number(b.actual_hours) : null)
      : existing.actual_hours;
    if (done && actualHours == null) actualHours = plannedHours;
    if (!done) actualHours = null;
    // stamp the moment a task is marked done (for the "completed by hour" chart);
    // clear it if unmarked so re-completing it later gets a fresh timestamp
    let completedAt = existing.completed_at;
    if (done && !existing.done) completedAt = new Date().toISOString();
    if (!done) completedAt = null;

    const [task] = await sql`UPDATE tasks SET
        title = COALESCE(${b.title ?? null}, title),
        category_id = ${categoryId},
        planned_hours = ${plannedHours},
        actual_hours = ${actualHours},
        icon = ${icon},
        done = ${done},
        completed_at = ${completedAt}
      WHERE id = ${id} RETURNING *`;
    return json(res, 200, { task });
  }

  if (req.method === "DELETE") {
    await sql`DELETE FROM tasks WHERE id = ${id}`;
    return json(res, 200, { ok: true });
  }

  return json(res, 405, { error: "Method not allowed" });
});
