// Quarterly goals: a date range + per-category weekly-hour targets.
//   GET    /api/quarters          -> [{id, name, start_date, end_date}], newest first
//   GET    /api/quarters?id=N     -> quarter + categories (each with computed progress)
//   POST   /api/quarters          -> { name, start_date, end_date, anti_perfectionist?, categories: [{name, weekly_hours}, ...] }
//   PATCH  /api/quarters?id=N     -> { name?, start_date?, end_date?, anti_perfectionist?, categories?: [{id?, name, weekly_hours}, ...] }
//   DELETE /api/quarters?id=N     -> delete quarter (cascades categories; tasks keep their row, category_id -> NULL)
import { db } from "./_lib/db.js";
import { withErrors, json, requireAuth } from "./_lib/util.js";
import { categoryProgress } from "./_lib/quarter.js";

function isDate(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));
}

async function saveCategories(sql, quarterId, categories) {
  const wanted = (categories || []).filter((c) => c && String(c.name || "").trim() && Number(c.weekly_hours) > 0);
  const existing = await sql`SELECT id FROM quarter_categories WHERE quarter_id = ${quarterId}`;
  const existingIds = new Set(existing.map((r) => r.id));
  const keepIds = new Set();

  for (const c of wanted) {
    if (c.id && existingIds.has(Number(c.id))) {
      keepIds.add(Number(c.id));
      await sql`UPDATE quarter_categories SET name = ${String(c.name).trim()}, weekly_hours = ${Number(c.weekly_hours)}
        WHERE id = ${Number(c.id)}`;
    } else {
      const [row] = await sql`INSERT INTO quarter_categories (quarter_id, name, weekly_hours)
        VALUES (${quarterId}, ${String(c.name).trim()}, ${Number(c.weekly_hours)}) RETURNING id`;
      keepIds.add(row.id);
    }
  }
  for (const id of existingIds) {
    if (!keepIds.has(id)) await sql`DELETE FROM quarter_categories WHERE id = ${id}`;
  }
}

export default withErrors(async (req, res) => {
  if (!requireAuth(req, res)) return;
  const sql = await db();

  if (req.method === "GET" && !req.query.id) {
    const quarters = await sql`SELECT * FROM quarters ORDER BY start_date DESC`;
    return json(res, 200, { quarters });
  }

  if (req.method === "GET") {
    const id = Number(req.query.id);
    if (!id) return json(res, 400, { error: "id is required" });
    const [quarter] = await sql`SELECT * FROM quarters WHERE id = ${id}`;
    if (!quarter) return json(res, 404, { error: "Quarter not found" });

    const categories = await sql`SELECT * FROM quarter_categories WHERE quarter_id = ${id} ORDER BY created_at`;
    const tasks = categories.length
      ? await sql`SELECT category_id, task_date, done, actual_hours FROM tasks
          WHERE category_id = ANY(${categories.map((c) => c.id)})`
      : [];
    const byCategory = new Map();
    for (const t of tasks) {
      if (!byCategory.has(t.category_id)) byCategory.set(t.category_id, []);
      byCategory.get(t.category_id).push(t);
    }
    const withProgress = categories.map((c) => ({
      ...c,
      progress: categoryProgress(c, byCategory.get(c.id) || [], quarter.start_date, quarter.end_date, quarter.anti_perfectionist),
    }));
    return json(res, 200, { quarter, categories: withProgress });
  }

  if (req.method === "POST") {
    const b = req.body || {};
    if (!b.name || !String(b.name).trim()) return json(res, 400, { error: "Name is required" });
    if (!isDate(b.start_date) || !isDate(b.end_date)) return json(res, 400, { error: "start_date/end_date must be YYYY-MM-DD" });
    if (b.end_date < b.start_date) return json(res, 400, { error: "end_date must be on or after start_date" });

    const [quarter] = await sql`INSERT INTO quarters (name, start_date, end_date, anti_perfectionist)
      VALUES (${String(b.name).trim()}, ${b.start_date}::date, ${b.end_date}::date, ${!!b.anti_perfectionist}) RETURNING *`;
    await saveCategories(sql, quarter.id, b.categories);
    return json(res, 201, { quarter });
  }

  const id = Number(req.query.id);
  if (!id) return json(res, 400, { error: "id is required" });

  if (req.method === "PATCH") {
    const b = req.body || {};
    if (b.start_date && !isDate(b.start_date)) return json(res, 400, { error: "start_date must be YYYY-MM-DD" });
    if (b.end_date && !isDate(b.end_date)) return json(res, 400, { error: "end_date must be YYYY-MM-DD" });

    const [quarter] = await sql`UPDATE quarters SET
        name = COALESCE(${b.name ?? null}, name),
        start_date = COALESCE(${b.start_date ?? null}::date, start_date),
        end_date = COALESCE(${b.end_date ?? null}::date, end_date),
        anti_perfectionist = COALESCE(${b.anti_perfectionist ?? null}, anti_perfectionist)
      WHERE id = ${id} RETURNING *`;
    if (!quarter) return json(res, 404, { error: "Quarter not found" });
    if (quarter.end_date < quarter.start_date) return json(res, 400, { error: "end_date must be on or after start_date" });

    if (b.categories) await saveCategories(sql, id, b.categories);
    return json(res, 200, { quarter });
  }

  if (req.method === "DELETE") {
    await sql`DELETE FROM quarters WHERE id = ${id}`;
    return json(res, 200, { ok: true });
  }

  return json(res, 405, { error: "Method not allowed" });
});
