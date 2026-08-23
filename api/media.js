// Uploaded images and short clips for the CMS.
//   GET    /api/media?id=N   -> the file itself, immutable-cached   PUBLIC
//   GET    /api/media        -> { media: [...] } metadata only      (authed)
//   POST   /api/media        -> { name, dataUrl } -> { media }      (authed)
//   DELETE /api/media?id=N                                          (authed)
import { db } from "./_lib/db.js";
import { withErrors, json, requireAuth } from "./_lib/util.js";

// Vercel caps a serverless request body at ~4.5 MB, and base64 inflates by a
// third, so the largest file that can actually arrive is around 3 MB.
const MAX_BYTES = 3 * 1024 * 1024;
const ALLOWED = /^(image\/(png|jpeg|jpg|webp|gif|svg\+xml|avif)|video\/(mp4|webm))$/;

export default withErrors(async (req, res) => {
  const sql = await db();

  // Public read: this is how the live site loads anything you upload.
  if (req.method === "GET" && req.query.id) {
    const id = Number(req.query.id);
    if (!id) return json(res, 400, { error: "id is required" });
    const [row] = await sql`SELECT mime, data FROM site_media WHERE id = ${id}`;
    if (!row) return json(res, 404, { error: "Not found" });
    const buf = Buffer.isBuffer(row.data) ? row.data : Buffer.from(row.data);
    res.setHeader("Content-Type", row.mime);
    res.setHeader("Content-Length", String(buf.length));
    // Rows are never rewritten in place — a replacement gets a new id — so the
    // bytes behind an id really are immutable.
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    return res.status(200).end(buf);
  }

  if (!requireAuth(req, res)) return;

  if (req.method === "GET") {
    const media = await sql`SELECT id, name, mime, bytes, created_at
      FROM site_media ORDER BY created_at DESC`;
    return json(res, 200, { media });
  }

  if (req.method === "POST") {
    const b = req.body || {};
    const name = String(b.name || "upload").slice(0, 200);
    const dataUrl = String(b.dataUrl || "");
    const m = /^data:([^;,]+);base64,(.+)$/s.exec(dataUrl);
    if (!m) return json(res, 400, { error: "dataUrl must be a base64 data: URL" });
    const mime = m[1].toLowerCase();
    if (!ALLOWED.test(mime)) return json(res, 400, { error: `Unsupported file type: ${mime}` });
    const buf = Buffer.from(m[2], "base64");
    if (!buf.length) return json(res, 400, { error: "Empty file" });
    if (buf.length > MAX_BYTES) {
      return json(res, 413, {
        error: `That file is ${(buf.length / 1048576).toFixed(1)} MB. The limit is 3 MB — ` +
               `compress it, or host video elsewhere and paste the URL instead.`,
      });
    }
    const [row] = await sql`INSERT INTO site_media (name, mime, bytes, data)
      VALUES (${name}, ${mime}, ${buf.length}, ${buf})
      RETURNING id, name, mime, bytes, created_at`;
    return json(res, 201, { media: { ...row, url: `/api/media?id=${row.id}` } });
  }

  if (req.method === "DELETE") {
    const id = Number(req.query.id);
    if (!id) return json(res, 400, { error: "id is required" });
    await sql`DELETE FROM site_media WHERE id = ${id}`;
    return json(res, 200, { ok: true });
  }

  return json(res, 405, { error: "Method not allowed" });
});
