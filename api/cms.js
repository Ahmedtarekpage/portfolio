// Site CMS — content overrides and the media library behind them.
//
// Content:
//   GET    /api/cms                       -> { content: { key: {kind, value} } }   PUBLIC
//   GET    /api/cms?index=1               -> { items: [...] } full rows            (authed)
//   PUT    /api/cms                       -> { items: [...] }; empty value reverts (authed)
//   DELETE /api/cms?key=K | ?all=1                                                 (authed)
// Media (?resource=media):
//   GET    /api/cms?resource=media&id=N   -> the file, immutable-cached            PUBLIC
//   GET    /api/cms?resource=media        -> { media: [...] } metadata             (authed)
//   POST   /api/cms?resource=media        -> { name, dataUrl } -> { media }        (authed)
//   DELETE /api/cms?resource=media&id=N                                            (authed)
//
// Content and media share one function on purpose: the Hobby plan allows
// twelve Serverless Functions per deployment and the project was already at
// the line. Splitting them back out will fail the deploy.
import { db } from "./_lib/db.js";
import { withErrors, json, requireAuth } from "./_lib/util.js";

const KINDS = new Set(["text", "rich", "html", "src", "href"]);
const MAX_VALUE = 200_000;

// Vercel caps a serverless request body at ~4.5 MB, and base64 inflates by a
// third, so the largest file that can actually arrive is around 3 MB.
const MAX_BYTES = 3 * 1024 * 1024;
const ALLOWED = /^(image\/(png|jpeg|jpg|webp|gif|svg\+xml|avif)|video\/(mp4|webm))$/;

async function handleMedia(req, res, sql) {

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
    return json(res, 201, { media: { ...row, url: `/api/cms?resource=media&id=${row.id}` } });
  }

  if (req.method === "DELETE") {
    const id = Number(req.query.id);
    if (!id) return json(res, 400, { error: "id is required" });
    await sql`DELETE FROM site_media WHERE id = ${id}`;
    return json(res, 200, { ok: true });
  }

  return json(res, 405, { error: "Method not allowed" });
}

export default withErrors(async (req, res) => {
  const sql = await db();
  if (req.query.resource === "media") return handleMedia(req, res, sql);

  if (req.method === "GET" && !req.query.index) {
    const rows = await sql`SELECT key, kind, value FROM site_content`;
    const content = {};
    for (const r of rows) content[r.key] = { kind: r.kind, value: r.value };
    // Short cache: edits should show up quickly, but repeat visitors in one
    // session shouldn't refetch on every page.
    res.setHeader("Cache-Control", "public, max-age=0, s-maxage=30, stale-while-revalidate=300");
    return json(res, 200, { content });
  }

  if (!requireAuth(req, res)) return;

  if (req.method === "GET") {
    const items = await sql`SELECT key, kind, value, page, section, label, updated_at
      FROM site_content ORDER BY page, section, key`;
    return json(res, 200, { items });
  }

  if (req.method === "PUT") {
    const body = req.body || {};
    const items = Array.isArray(body.items) ? body.items : [];
    if (!items.length) return json(res, 400, { error: "items is required" });

    let saved = 0;
    let reverted = 0;
    for (const it of items) {
      const key = String(it.key || "").trim();
      if (!key || key.length > 512) continue;
      const kind = KINDS.has(it.kind) ? it.kind : "text";
      const value = it.value == null ? "" : String(it.value);
      if (value.length > MAX_VALUE) return json(res, 400, { error: `Value for ${key} is too large` });

      // An empty value is "put it back the way the page ships it", not "blank it out".
      if (!value.trim()) {
        await sql`DELETE FROM site_content WHERE key = ${key}`;
        reverted++;
        continue;
      }
      await sql`INSERT INTO site_content (key, kind, value, page, section, label, updated_at)
        VALUES (${key}, ${kind}, ${value}, ${it.page || null}, ${it.section || null}, ${it.label || null}, now())
        ON CONFLICT (key) DO UPDATE SET
          kind = EXCLUDED.kind, value = EXCLUDED.value,
          page = COALESCE(EXCLUDED.page, site_content.page),
          section = COALESCE(EXCLUDED.section, site_content.section),
          label = COALESCE(EXCLUDED.label, site_content.label),
          updated_at = now()`;
      saved++;
    }
    return json(res, 200, { ok: true, saved, reverted });
  }

  if (req.method === "DELETE") {
    if (req.query.all) {
      await sql`DELETE FROM site_content`;
      return json(res, 200, { ok: true });
    }
    const key = String(req.query.key || "");
    if (!key) return json(res, 400, { error: "key is required" });
    await sql`DELETE FROM site_content WHERE key = ${key}`;
    return json(res, 200, { ok: true });
  }

  return json(res, 405, { error: "Method not allowed" });
});
