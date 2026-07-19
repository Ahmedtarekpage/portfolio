// Single client detail: profile + packages + sessions + balance timeline.
//   GET /api/client?id=N
import { db } from "./_lib/db.js";
import { withErrors, json, requireAuth } from "./_lib/util.js";
import { computeClient } from "./_lib/hours.js";

export default withErrors(async (req, res) => {
  if (!requireAuth(req, res)) return;
  if (req.method !== "GET") return json(res, 405, { error: "Method not allowed" });
  const id = Number(req.query.id);
  if (!id) return json(res, 400, { error: "id is required" });

  const sql = await db();
  const [client] = await sql`SELECT * FROM clients WHERE id = ${id}`;
  if (!client) return json(res, 404, { error: "Client not found" });

  const packages = await sql`SELECT id, client_id, hours, amount_paid, currency, purchased_at, expires_at, note,
      (proof IS NOT NULL) AS has_proof
    FROM hour_packages WHERE client_id = ${id} ORDER BY purchased_at DESC, id DESC`;
  const sessions = await sql`SELECT id, client_id, session_date, hours, topic, pdf_name, (pdf IS NOT NULL) AS has_pdf
    FROM client_sessions WHERE client_id = ${id} ORDER BY session_date DESC, id DESC`;

  const { timeline, totals } = computeClient(packages, sessions);
  return json(res, 200, { client, packages, sessions, timeline, totals });
});
