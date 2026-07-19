// Session records (with optional meeting-minutes PDF, stored in Postgres).
//   POST   /api/sessions       -> { client_id, session_date, hours, topic?, pdf_base64?, pdf_name? }
//   DELETE /api/sessions?id=N
import { db } from "./_lib/db.js";
import { withErrors, json, requireAuth } from "./_lib/util.js";

const MAX_PDF_BYTES = 3 * 1024 * 1024; // keep well under Vercel's 4.5MB request limit

export default withErrors(async (req, res) => {
  if (!requireAuth(req, res)) return;
  const sql = await db();

  if (req.method === "POST") {
    const b = req.body || {};
    const clientId = Number(b.client_id);
    const hours = Number(b.hours);
    if (!clientId) return json(res, 400, { error: "client_id is required" });
    if (!hours || hours <= 0) return json(res, 400, { error: "hours must be a positive number" });
    const date = String(b.session_date || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json(res, 400, { error: "session_date must be YYYY-MM-DD" });

    let pdfHex = null;
    let pdfName = null;
    if (b.pdf_base64) {
      const buf = Buffer.from(String(b.pdf_base64), "base64");
      if (!buf.length) return json(res, 400, { error: "Could not read the PDF upload" });
      if (buf.length > MAX_PDF_BYTES) return json(res, 400, { error: "PDF is too large (max 3 MB)" });
      if (buf.subarray(0, 5).toString() !== "%PDF-") return json(res, 400, { error: "File is not a PDF" });
      pdfHex = "\\x" + buf.toString("hex");
      pdfName = String(b.pdf_name || "minutes.pdf").slice(0, 200);
    }

    const [session] = await sql`INSERT INTO client_sessions (client_id, session_date, hours, topic, pdf_name, pdf)
      VALUES (${clientId}, ${date}::date, ${hours}, ${b.topic || null}, ${pdfName}, ${pdfHex}::bytea)
      RETURNING id, client_id, session_date, hours, topic, pdf_name, (pdf IS NOT NULL) AS has_pdf`;
    return json(res, 201, { session });
  }

  if (req.method === "DELETE") {
    const id = Number(req.query.id);
    if (!id) return json(res, 400, { error: "id is required" });
    await sql`DELETE FROM client_sessions WHERE id = ${id}`;
    return json(res, 200, { ok: true });
  }

  return json(res, 405, { error: "Method not allowed" });
});
