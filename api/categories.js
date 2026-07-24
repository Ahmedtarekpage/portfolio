// Persistent life-area categories (Religion, Health, Cashflow, ...). These
// live forever — goals against them are scoped per 42-day cycle (see
// api/cycle-goals.js and api/goals.js), not per category.
//   GET    /api/categories        -> [{id, name}], alphabetical
//   POST   /api/categories        -> { name }
//   PATCH  /api/categories?id=N   -> { name }
//   DELETE /api/categories?id=N   -> cascades cycle_targets/goals; tasks keep their row, category_id -> NULL
import { db } from "./_lib/db.js";
import { withErrors, json, requireAuth } from "./_lib/util.js";

export default withErrors(async (req, res) => {
  if (!requireAuth(req, res)) return;
  const sql = await db();

  if (req.method === "GET") {
    const categories = await sql`SELECT * FROM categories ORDER BY name`;
    return json(res, 200, { categories });
  }

  if (req.method === "POST") {
    const b = req.body || {};
    const name = String(b.name || "").trim();
    if (!name) return json(res, 400, { error: "Name is required" });
    const [category] = await sql`INSERT INTO categories (name) VALUES (${name}) RETURNING *`;
    return json(res, 201, { category });
  }

  const id = Number(req.query.id);
  if (!id) return json(res, 400, { error: "id is required" });

  if (req.method === "PATCH") {
    const b = req.body || {};
    const name = String(b.name || "").trim();
    if (!name) return json(res, 400, { error: "Name is required" });
    const [category] = await sql`UPDATE categories SET name = ${name} WHERE id = ${id} RETURNING *`;
    if (!category) return json(res, 404, { error: "Category not found" });
    return json(res, 200, { category });
  }

  if (req.method === "DELETE") {
    await sql`DELETE FROM categories WHERE id = ${id}`;
    return json(res, 200, { ok: true });
  }

  return json(res, 405, { error: "Method not allowed" });
});
