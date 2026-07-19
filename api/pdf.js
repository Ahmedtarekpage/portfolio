// Stream a session's meeting-minutes PDF.
//   GET /api/pdf?id=N
import { db } from "./_lib/db.js";
import { withErrors, json, requireAuth } from "./_lib/util.js";

export default withErrors(async (req, res) => {
  if (!requireAuth(req, res)) return;
  if (req.method !== "GET") return json(res, 405, { error: "Method not allowed" });
  const id = Number(req.query.id);
  if (!id) return json(res, 400, { error: "id is required" });

  const sql = await db();
  const [row] = await sql`SELECT pdf, pdf_name FROM client_sessions WHERE id = ${id}`;
  if (!row || !row.pdf) return json(res, 404, { error: "No PDF for this session" });

  // neon may return bytea as a Buffer or as a '\x…' hex string
  const buf = Buffer.isBuffer(row.pdf)
    ? row.pdf
    : Buffer.from(String(row.pdf).replace(/^\\x/, ""), "hex");

  const name = (row.pdf_name || "minutes.pdf").replace(/[^\w.\- ]+/g, "_");
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${name}"`);
  res.setHeader("Cache-Control", "private, no-store");
  res.status(200).send(buf);
});
