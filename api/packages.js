// Hour packages (purchases).
//   POST   /api/packages       -> { client_id, hours, amount_paid?, currency?, purchased_at, months? | expires_at?, note?,
//                                   proof_base64?, proof_name?, proof_type? }   (payment screenshot / PDF, max 3 MB)
//                                 expiry defaults to purchase date + 1 month
//   DELETE /api/packages?id=N
import { db } from "./_lib/db.js";
import { withErrors, json, requireAuth } from "./_lib/util.js";

const MAX_PROOF_BYTES = 3 * 1024 * 1024;
const MAGIC = [
  { type: "image/png", check: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { type: "image/jpeg", check: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { type: "image/webp", check: (b) => b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WEBP" },
  { type: "application/pdf", check: (b) => b.subarray(0, 5).toString() === "%PDF-" },
];

/** Returns { hex, name, type } or an error string. */
function parseProof(b) {
  const buf = Buffer.from(String(b.proof_base64), "base64");
  if (!buf.length) return "Could not read the attached file";
  if (buf.length > MAX_PROOF_BYTES) return "Attachment is too large (max 3 MB)";
  const kind = MAGIC.find((m) => m.check(buf));
  if (!kind) return "Attachment must be a PNG, JPEG, WebP image or a PDF";
  return { hex: "\\x" + buf.toString("hex"), name: String(b.proof_name || "payment-proof").slice(0, 200), type: kind.type };
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
    const purchased = String(b.purchased_at || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(purchased)) return json(res, 400, { error: "purchased_at must be YYYY-MM-DD" });
    const months = Math.max(1, Math.min(24, Number(b.months) || 1));
    const explicitExpiry = /^\d{4}-\d{2}-\d{2}$/.test(String(b.expires_at || "")) ? b.expires_at : null;

    let proof = null;
    if (b.proof_base64) {
      proof = parseProof(b);
      if (typeof proof === "string") return json(res, 400, { error: proof });
    }

    const [pkg] = await sql`INSERT INTO hour_packages
        (client_id, hours, amount_paid, currency, purchased_at, expires_at, note, proof, proof_name, proof_type)
      VALUES (${clientId}, ${hours}, ${b.amount_paid ? Number(b.amount_paid) : null}, ${b.currency || null},
              ${purchased}::date,
              COALESCE(${explicitExpiry}::date, (${purchased}::date + make_interval(months => ${months}))::date),
              ${b.note || null},
              ${proof ? proof.hex : null}::bytea, ${proof ? proof.name : null}, ${proof ? proof.type : null})
      RETURNING id, client_id, hours, amount_paid, currency, purchased_at, expires_at, note, (proof IS NOT NULL) AS has_proof`;
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
