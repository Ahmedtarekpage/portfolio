// Session records (with optional meeting-minutes PDF, stored in Postgres).
//   POST   /api/sessions       -> { client_id, session_date, hours, topic?, pdf_base64?, pdf_name? }
//   PATCH  /api/sessions?id=N  -> { session_date?, hours?, topic?, pdf_base64?, pdf_name? } (PDF replaces the old one)
//   DELETE /api/sessions?id=N
import { db } from "./_lib/db.js";
import { withErrors, json, requireAuth } from "./_lib/util.js";

const MAX_PDF_BYTES = 3 * 1024 * 1024; // keep well under Vercel's 4.5MB request limit

/** Returns { hex, name } or an error string. */
function parsePdf(b) {
  const buf = Buffer.from(String(b.pdf_base64), "base64");
  if (!buf.length) return "Could not read the PDF upload";
  if (buf.length > MAX_PDF_BYTES) return "PDF is too large (max 3 MB)";
  if (buf.subarray(0, 5).toString() !== "%PDF-") return "File is not a PDF";
  return { hex: "\\x" + buf.toString("hex"), name: String(b.pdf_name || "minutes.pdf").slice(0, 200) };
}

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
      const pdf = parsePdf(b);
      if (typeof pdf === "string") return json(res, 400, { error: pdf });
      pdfHex = pdf.hex;
      pdfName = pdf.name;
    }

    const [session] = await sql`INSERT INTO client_sessions (client_id, session_date, hours, topic, pdf_name, pdf)
      VALUES (${clientId}, ${date}::date, ${hours}, ${b.topic || null}, ${pdfName}, ${pdfHex}::bytea)
      RETURNING id, client_id, session_date, hours, topic, pdf_name, (pdf IS NOT NULL) AS has_pdf`;
    return json(res, 201, { session });
  }

  if (req.method === "PATCH") {
    const id = Number(req.query.id);
    if (!id) return json(res, 400, { error: "id is required" });
    const b = req.body || {};
    const hours = Number(b.hours);
    if (!hours || hours <= 0) return json(res, 400, { error: "hours must be a positive number" });
    const date = String(b.session_date || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json(res, 400, { error: "session_date must be YYYY-MM-DD" });

    const [session] = await sql`UPDATE client_sessions
      SET session_date = ${date}::date, hours = ${hours}, topic = ${b.topic || null}
      WHERE id = ${id}
      RETURNING id, client_id, session_date, hours, topic, pdf_name, (pdf IS NOT NULL) AS has_pdf`;
    if (!session) return json(res, 404, { error: "Session not found" });

    if (b.pdf_base64) {
      const pdf = parsePdf(b);
      if (typeof pdf === "string") return json(res, 400, { error: pdf });
      await sql`UPDATE client_sessions SET pdf = ${pdf.hex}::bytea, pdf_name = ${pdf.name} WHERE id = ${id}`;
      session.pdf_name = pdf.name;
      session.has_pdf = true;
    }
    return json(res, 200, { session });
  }

  if (req.method === "DELETE") {
    const id = Number(req.query.id);
    if (!id) return json(res, 400, { error: "id is required" });
    await sql`DELETE FROM client_sessions WHERE id = ${id}`;
    return json(res, 200, { ok: true });
  }

  return json(res, 405, { error: "Method not allowed" });
});
