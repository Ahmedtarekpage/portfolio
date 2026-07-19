// Stream stored attachments.
//   GET /api/pdf?id=N      -> a session's meeting-minutes PDF
//   GET /api/pdf?proof=N   -> a purchase's payment proof (image or PDF)
import { db } from "./_lib/db.js";
import { withErrors, json, requireAuth } from "./_lib/util.js";

// neon may return bytea as a Buffer or as a '\x…' hex string
const toBuf = (v) => (Buffer.isBuffer(v) ? v : Buffer.from(String(v).replace(/^\\x/, ""), "hex"));

function send(res, data, type, name) {
  res.setHeader("Content-Type", type);
  res.setHeader("Content-Disposition", `inline; filename="${String(name).replace(/[^\w.\- ]+/g, "_")}"`);
  res.setHeader("Cache-Control", "private, no-store");
  res.status(200).send(toBuf(data));
}

export default withErrors(async (req, res) => {
  if (!requireAuth(req, res)) return;
  if (req.method !== "GET") return json(res, 405, { error: "Method not allowed" });
  const sql = await db();

  const proofId = Number(req.query.proof);
  if (proofId) {
    const [row] = await sql`SELECT proof, proof_name, proof_type FROM hour_packages WHERE id = ${proofId}`;
    if (!row || !row.proof) return json(res, 404, { error: "No payment proof for this purchase" });
    return send(res, row.proof, row.proof_type || "application/octet-stream", row.proof_name || "payment-proof");
  }

  const id = Number(req.query.id);
  if (!id) return json(res, 400, { error: "id is required" });
  const [row] = await sql`SELECT pdf, pdf_name FROM client_sessions WHERE id = ${id}`;
  if (!row || !row.pdf) return json(res, 404, { error: "No PDF for this session" });
  return send(res, row.pdf, "application/pdf", row.pdf_name || "minutes.pdf");
});
