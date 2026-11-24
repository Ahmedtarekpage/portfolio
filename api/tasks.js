// Daily to-do tasks, optionally tagged with a quarterly category.
//   GET    /api/tasks?date=YYYY-MM-DD        -> tasks for that day (incl. category name), in position order
//   GET    /api/tasks?stats=1&from=&to=      -> [{date, total, done}] for the % history strip
//   GET    /api/tasks?totals=1               -> { totalDone, totalTasks } all-time — for gamification stats
//   POST   /api/tasks?duplicate=1            -> { from_date, to_date }: copy a day's tasks (title/category/planned hours only) onto another date
//   POST   /api/tasks                        -> { task_date, title, category_id?, planned_hours?, icon?, estimated? }
//   PATCH  /api/tasks?estimate=1          -> { from, to, estimated? }: mark (or unmark) a stretch of days as written in afterwards
//   PATCH  /api/tasks?reorder=1             -> { ids: [id, ...] }: persist new drag order for those tasks
//   PATCH  /api/tasks?id=N                   -> { title?, category_id?, planned_hours?, done?, half?, actual_hours?, completed_at?, icon?,
//                                                time_from?, time_to? ("HH:MM"), time_note?, auto_key? }
//   DELETE /api/tasks?date=YYYY-MM-DD        -> delete every task on that day
//   DELETE /api/tasks?ids=1,2,3              -> delete a hand-picked set in one go -> { count }
//   DELETE /api/tasks?id=N
//   GET    /api/tasks?plan=page              -> the plan page (HTML), which /plan rewrites onto
//   GET    /api/tasks?plan=state             -> { state } the plan's saved numbers and ticks
//   PUT    /api/tasks?plan=state             -> save them
import { db } from "./_lib/db.js";
import { handleRoutines, syncDay, rememberSkips, rangeData } from "./_lib/routines.js";
import { withErrors, json, requireAuth } from "./_lib/util.js";
import { handlePlan } from "./_lib/plan.js";

// "HH:MM" (24h) or null; undefined when not sent; false when invalid
function hhmm(v) {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(v));
  return m ? m[0] : false;
}
// ":hand" = its time was changed by hand, so the page stops moving it
const AUTO_KEYS = /^(prayer:(fajr|dhuhr|asr|maghrib|isha)|azkar:(morning|evening)|routine:\d+|meeting:\d+|prep:\d+|life:(sleep|nap|gym|breakfast)|week:[a-z0-9]{2,20})(:hand)?$/;
const cleanLink = (v) => (v && /^https?:\/\/\S+$/i.test(String(v)) ? String(v).slice(0, 500) : null);

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
  if (req.query.plan) return handlePlan(req, res, sql);
  if (req.query.routines) return handleRoutines(req, res, sql);

  // a calendar's worth (week / month): tasks, repeating rules, skipped days, meetings in the viewer's zone
  if (req.method === "GET" && req.query.range) {
    const from = String(req.query.from || "").slice(0, 10), to = String(req.query.to || "").slice(0, 10);
    if (!isDate(from) || !isDate(to) || from > to) return json(res, 400, { error: "from/to must be YYYY-MM-DD" });
    if ((new Date(to) - new Date(from)) / 86400000 > 62) return json(res, 400, { error: "At most 62 days at a time" });
    return json(res, 200, await rangeData(sql, from, to, String(req.query.tz || "")));
  }

  if (req.method === "GET" && req.query.totals) {
    const [row] = await sql`SELECT (COUNT(*) FILTER (WHERE done) + COUNT(*) FILTER (WHERE half) * 0.5)::float8 AS "totalDone",
        COUNT(*)::int AS "totalTasks"
      FROM tasks`;
    return json(res, 200, row);
  }

  if (req.method === "GET" && req.query.stats) {
    const from = String(req.query.from || "").slice(0, 10);
    const to = String(req.query.to || "").slice(0, 10);
    if (!isDate(from) || !isDate(to)) return json(res, 400, { error: "from/to must be YYYY-MM-DD" });
    const rows = await sql`SELECT task_date::text AS date, COUNT(*)::int AS total,
        (COUNT(*) FILTER (WHERE done) + COUNT(*) FILTER (WHERE half) * 0.5)::float8 AS done,
        bool_and(estimated) AS estimated
      FROM tasks WHERE task_date BETWEEN ${from}::date AND ${to}::date
      GROUP BY task_date ORDER BY task_date`;
    return json(res, 200, { stats: rows });
  }

  if (req.method === "GET") {
    const date = String(req.query.date || "").slice(0, 10);
    if (!isDate(date)) return json(res, 400, { error: "date must be YYYY-MM-DD" });
    // today or later: the repeating rules and the meetings put their tasks on the day first
    if (req.query.sync) await syncDay(sql, date, String(req.query.tz || ""));
    const skips = (await sql`SELECT auto_key FROM task_skips WHERE task_date = ${date}::date`).map((r) => r.auto_key);
    const tasks = await sql`SELECT t.*, c.name AS category_name
      FROM tasks t LEFT JOIN quarter_categories c ON c.id = t.category_id
      WHERE t.task_date = ${date}::date ORDER BY t.position, t.created_at`;
    return json(res, 200, { tasks, skips });
  }

  if (req.method === "POST" && req.query.duplicate) {
    const b = req.body || {};
    if (!isDate(b.from_date) || !isDate(b.to_date)) return json(res, 400, { error: "from_date/to_date must be YYYY-MM-DD" });
    const source = await sql`SELECT title, category_id, planned_hours, icon, time_from, time_to, auto_key FROM tasks
      WHERE task_date = ${b.from_date}::date ORDER BY position, created_at`;
    if (!source.length) return json(res, 200, { count: 0 });
    const [{ next }] = await sql`SELECT COALESCE(MAX(position), -1) + 1 AS next FROM tasks WHERE task_date = ${b.to_date}::date`;
    let pos = Number(next);
    for (const t of source) {
      await sql`INSERT INTO tasks (task_date, title, category_id, planned_hours, icon, position, time_from, time_to, auto_key)
        VALUES (${b.to_date}::date, ${t.title}, ${t.category_id}, ${t.planned_hours}, ${t.icon}, ${pos},
          ${t.auto_key ? null : t.time_from}, ${t.auto_key ? null : t.time_to}, ${t.auto_key})`;
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
    const from = hhmm(b.time_from) ?? null, to = hhmm(b.time_to) ?? null;
    if (from === false || to === false) return json(res, 400, { error: "time_from/time_to must be HH:MM" });
    const note = b.time_note ? String(b.time_note).slice(0, 120) : null;
    const autoKey = b.auto_key && AUTO_KEYS.test(String(b.auto_key)) ? String(b.auto_key) : null;
    const link = cleanLink(b.link);
    // one automatic row per prayer per day: a second add of the same one is the first one
    if (autoKey) {
      const [had] = await sql`SELECT * FROM tasks WHERE task_date = ${b.task_date}::date AND auto_key = ${autoKey} LIMIT 1`;
      if (had) return json(res, 200, { task: had });
    }

    const [task] = await sql`INSERT INTO tasks (task_date, title, category_id, planned_hours, icon, estimated, position, time_from, time_to, time_note, auto_key, link)
      VALUES (${b.task_date}::date, ${String(b.title).trim()}, ${categoryId}, ${plannedHours}, ${icon}, ${b.estimated === true},
        (SELECT COALESCE(MAX(position), -1) + 1 FROM tasks WHERE task_date = ${b.task_date}::date),
        ${from}, ${to}, ${note}, ${autoKey}, ${link})
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
    const rows = await sql`DELETE FROM tasks WHERE id = ANY(${ids}) RETURNING id, auto_key, task_date::text AS task_date`;
    await rememberSkips(sql, rows);
    return json(res, 200, { ok: true, count: rows.length });
  }

  if (req.method === "DELETE" && req.query.date) {
    const date = String(req.query.date).slice(0, 10);
    if (!isDate(date)) return json(res, 400, { error: "date must be YYYY-MM-DD" });
    await rememberSkips(sql, await sql`DELETE FROM tasks WHERE task_date = ${date}::date RETURNING auto_key, task_date::text AS task_date`);
    return json(res, 200, { ok: true });
  }

  const id = Number(req.query.id);
  if (!id) return json(res, 400, { error: "id is required" });

  if (req.method === "PATCH") {
    const b = req.body || {};
    const [existing] = await sql`SELECT * FROM tasks WHERE id = ${id}`;
    if (!existing) return json(res, 404, { error: "Task not found" });

    let done = b.done != null ? !!b.done : existing.done;
    let half = b.half != null ? !!b.half : existing.half;
    // a task is done, half done or neither — whichever was just set wins
    if (b.done != null && done) half = false;
    if (b.half != null && half) done = false;
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
    // (a half counts there too, at half weight)
    if ((done && !existing.done) || (half && !existing.half)) completedAt = new Date().toISOString();
    if (!done && !half) completedAt = null;
    // set by hand from the row's clock, for when it was really done earlier
    if (b.completed_at && (done || half)) {
      const at = new Date(b.completed_at);
      if (Number.isNaN(at.getTime())) return json(res, 400, { error: "completed_at must be a date-time" });
      completedAt = at.toISOString();
    }

    const from = hhmm(b.time_from), to = hhmm(b.time_to);
    if (from === false || to === false) return json(res, 400, { error: "time_from/time_to must be HH:MM" });
    const timeFrom = from === undefined ? existing.time_from : from;
    const timeTo = to === undefined ? existing.time_to : to;
    const timeNote = b.time_note !== undefined ? (b.time_note ? String(b.time_note).slice(0, 120) : null) : existing.time_note;
    const autoKey = b.auto_key !== undefined
      ? (b.auto_key && AUTO_KEYS.test(String(b.auto_key)) ? String(b.auto_key) : null)
      : existing.auto_key;

    // dragged to another day in the week view
    if (b.task_date !== undefined && !isDate(b.task_date)) return json(res, 400, { error: "task_date must be YYYY-MM-DD" });
    const taskDate = b.task_date !== undefined ? b.task_date : null;
    const [task] = await sql`UPDATE tasks SET
        task_date = COALESCE(${taskDate}::date, task_date),
        title = COALESCE(${b.title ?? null}, title),
        time_from = ${timeFrom},
        time_to = ${timeTo},
        time_note = ${timeNote},
        auto_key = ${autoKey},
        link = ${b.link !== undefined ? cleanLink(b.link) : existing.link},
        category_id = ${categoryId},
        planned_hours = ${plannedHours},
        actual_hours = ${actualHours},
        icon = ${icon},
        done = ${done},
        half = ${half},
        completed_at = ${completedAt}
      WHERE id = ${id} RETURNING *`;
    return json(res, 200, { task });
  }

  if (req.method === "DELETE") {
    await rememberSkips(sql, await sql`DELETE FROM tasks WHERE id = ${id} RETURNING auto_key, task_date::text AS task_date`);
    return json(res, 200, { ok: true });
  }

  return json(res, 405, { error: "Method not allowed" });
});
