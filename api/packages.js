// Hour packages (purchases).
//   POST   /api/packages       -> { client_id, hours, amount_paid?, currency?, purchased_at, months? | expires_at?, note? }
//                                 expiry defaults to purchase date + 1 month
//   DELETE /api/packages?id=N
import { db } from "./_lib/db.js";
import { withErrors, json, requireAuth } from "./_lib/util.js";

export default withErrors(async (req, res) => {
  if (!requireAuth(req, res)) return;
  const sql = await db();

  if (req.method === "POST") {
    const b = req.body || {};
    const clientId = Number(b.client_id);
    const hours = Number(b.hours);
    if (!clientId) return json(res, 400, { error: "client_id is required" });
    if (!hours || hours <= 0) return json(res, 400, { error: "hours must be a positive number" });
    const purchased = String(b.purchased_at || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(purchased)) return json(res, 400, { error: "purchased_at must be YYYY-MM-DD" });
    const months = Math.max(1, Math.min(24, Number(b.months) || 1));
    const explicitExpiry = /^\d{4}-\d{2}-\d{2}$/.test(String(b.expires_at || "")) ? b.expires_at : null;

    const [pkg] = await sql`INSERT INTO hour_packages (client_id, hours, amount_paid, currency, purchased_at, expires_at, note)
      VALUES (${clientId}, ${hours}, ${b.amount_paid ? Number(b.amount_paid) : null}, ${b.currency || null},
              ${purchased}::date,
              COALESCE(${explicitExpiry}::date, (${purchased}::date + make_interval(months => ${months}))::date),
              ${b.note || null})
      RETURNING *`;
    return json(res, 201, { package: pkg });
  }

  if (req.method === "DELETE") {
    const id = Number(req.query.id);
    if (!id) return json(res, 400, { error: "id is required" });
    await sql`DELETE FROM hour_packages WHERE id = ${id}`;
    return json(res, 200, { ok: true });
  }

  return json(res, 405, { error: "Method not allowed" });
});
