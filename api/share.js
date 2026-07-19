// PUBLIC read-only client view, gated by an unguessable share token (no login).
//   GET /api/share?token=T          -> client name + hours data (no admin notes/contact info)
//   GET /api/share?token=T&pdf=N    -> download that client's session-minutes PDF
import { db } from "./_lib/db.js";
import { withErrors, json } from "./_lib/util.js";
import { computeClient } from "./_lib/hours.js";

const toBuf = (v) => (Buffer.isBuffer(v) ? v : Buffer.from(String(v).replace(/^\\x/, ""), "hex"));

export default withErrors(async (req, res) => {
  if (req.method !== "GET") return json(res, 405, { error: "Method not allowed" });
  const token = String(req.query.token || "");
  if (token.length < 16) return json(res, 404, { error: "Invalid link" });

  const sql = await db();
  const [client] = await sql`SELECT id, name, gender FROM clients WHERE share_token = ${token}`;
  if (!client) return json(res, 404, { error: "This link is not valid anymore" });

  const pdfId = Number(req.query.pdf);
  if (pdfId) {
    const [row] = await sql`SELECT pdf, pdf_name FROM client_sessions
      WHERE id = ${pdfId} AND client_id = ${client.id}`;
    if (!row || !row.pdf) return json(res, 404, { error: "No PDF for this session" });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${String(row.pdf_name || "minutes.pdf").replace(/[^\w.\- ]+/g, "_")}"`);
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).send(toBuf(row.pdf));
  }

  const packages = await sql`SELECT id, hours, amount_paid, currency, purchased_at, expires_at
    FROM hour_packages WHERE client_id = ${client.id} ORDER BY purchased_at DESC, id DESC`;
  const sessions = await sql`SELECT id, session_date, hours, topic, pdf_name, (pdf IS NOT NULL) AS has_pdf
    FROM client_sessions WHERE client_id = ${client.id} ORDER BY session_date DESC, id DESC`;

  const { timeline, totals } = computeClient(packages, sessions);
  res.setHeader("Cache-Control", "private, no-store");
  return json(res, 200, { name: client.name, gender: client.gender, packages, sessions, timeline, totals });
});
