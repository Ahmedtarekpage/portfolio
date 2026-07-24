// Auto-computed Year > Virtual-Year > Cycle > Quarter schedule (see
// api/_lib/cycle.js) — replaces the old manually-dated "quarters". Categories
// are permanent (api/categories.js); this endpoint assembles, for one 42-day
// cycle, each category's optional weekly-hour target + numeric goals +
// computed progress. Only the current/future cycle is editable.
//   GET   /api/cycle-goals?list=1          -> cycles for the picker (a few past, current, upcoming)
//   GET   /api/cycle-goals                 -> detail for the current (or next upcoming, if mid-break) cycle
//   GET   /api/cycle-goals?cycle_key=K     -> detail for that specific cycle
//   PATCH /api/cycle-goals                 -> { cycle_key, category_id, weekly_hours } upsert a cycle's hour target
import { db } from "./_lib/db.js";
import { withErrors, json, requireAuth } from "./_lib/util.js";
import { categoryProgress } from "./_lib/quarter.js";
import { cycleInfo, cycleBounds, cycleQuarters, listCycles, isEditable } from "./_lib/cycle.js";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function defaultCycleKey(today) {
  const info = cycleInfo(today);
  if (info.cycleKey) return info.cycleKey;
  const upcoming = listCycles(today, { past: 0, future: 3 }).find((c) => c.start > today);
  return upcoming ? upcoming.cycleKey : null;
}

export default withErrors(async (req, res) => {
  if (!requireAuth(req, res)) return;
  const sql = await db();
  const today = todayISO();

  if (req.method === "GET" && req.query.list) {
    return json(res, 200, { today: cycleInfo(today), cycles: listCycles(today) });
  }

  if (req.method === "GET") {
    const cycleKey = req.query.cycle_key ? String(req.query.cycle_key) : defaultCycleKey(today);
    if (!cycleKey) return json(res, 200, { today: cycleInfo(today), cycleKey: null, categories: [] });
    const bounds = cycleBounds(cycleKey);
    if (!bounds) return json(res, 400, { error: "Invalid cycle_key" });

    const categories = await sql`SELECT * FROM categories ORDER BY name`;
    const categoryIds = categories.map((c) => c.id);

    const targets = categoryIds.length
      ? await sql`SELECT * FROM cycle_targets WHERE category_id = ANY(${categoryIds}) AND cycle_key = ${cycleKey}`
      : [];
    const targetByCategory = new Map(targets.map((t) => [t.category_id, t]));

    const goals = categoryIds.length
      ? await sql`SELECT * FROM goals WHERE category_id = ANY(${categoryIds}) AND cycle_key = ${cycleKey} ORDER BY created_at`
      : [];
    const goalsByCategory = new Map();
    for (const g of goals) {
      if (!goalsByCategory.has(g.category_id)) goalsByCategory.set(g.category_id, []);
      goalsByCategory.get(g.category_id).push(g);
    }

    // tasks logged specifically within this cycle's date range — categories are
    // permanent and reused across many cycles, so this must be date-bounded or
    // every cycle would double-count all of a category's all-time logged hours
    const tasks = categoryIds.length
      ? await sql`SELECT category_id, task_date, done, actual_hours FROM tasks
          WHERE category_id = ANY(${categoryIds}) AND task_date BETWEEN ${bounds.start}::date AND ${bounds.end}::date`
      : [];
    const tasksByCategory = new Map();
    for (const t of tasks) {
      if (!tasksByCategory.has(t.category_id)) tasksByCategory.set(t.category_id, []);
      tasksByCategory.get(t.category_id).push(t);
    }

    const withProgress = categories.map((c) => {
      const target = targetByCategory.get(c.id);
      const weeklyHours = target && target.weekly_hours != null ? Number(target.weekly_hours) : null;
      const hasHours = weeklyHours != null && weeklyHours > 0;
      return {
        id: c.id,
        name: c.name,
        weekly_hours: weeklyHours,
        progress: hasHours
          ? categoryProgress({ weekly_hours: weeklyHours }, tasksByCategory.get(c.id) || [], bounds.start, bounds.end, false)
          : null,
        goals: goalsByCategory.get(c.id) || [],
      };
    });

    return json(res, 200, {
      today: cycleInfo(today),
      cycleKey,
      start: bounds.start,
      end: bounds.end,
      editable: isEditable(cycleKey, today),
      quarters: cycleQuarters(cycleKey),
      categories: withProgress,
    });
  }

  if (req.method === "PATCH") {
    const b = req.body || {};
    const cycleKey = String(b.cycle_key || "");
    const categoryId = Number(b.category_id);
    if (!cycleBounds(cycleKey)) return json(res, 400, { error: "Invalid cycle_key" });
    if (!categoryId) return json(res, 400, { error: "category_id is required" });
    if (!isEditable(cycleKey, today)) return json(res, 400, { error: "This cycle is in the past and can't be edited" });

    const weeklyHours = b.weekly_hours != null && b.weekly_hours !== "" && Number(b.weekly_hours) > 0
      ? Number(b.weekly_hours) : null;
    const [target] = await sql`INSERT INTO cycle_targets (category_id, cycle_key, weekly_hours)
      VALUES (${categoryId}, ${cycleKey}, ${weeklyHours})
      ON CONFLICT (category_id, cycle_key) DO UPDATE SET weekly_hours = ${weeklyHours}
      RETURNING *`;
    return json(res, 200, { target });
  }

  return json(res, 405, { error: "Method not allowed" });
});
