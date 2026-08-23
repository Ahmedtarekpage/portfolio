// Site CMS content overrides.
//   GET    /api/content            -> { content: { key: {kind, value} } }   PUBLIC (the site reads this)
//   GET    /api/content?index=1    -> { items: [...] } full rows for the dashboard   (authed)
//   PUT    /api/content            -> { items: [{key, kind, value, page, section, label}] }  (authed)
//                                     an empty value deletes the row, reverting to source
//   DELETE /api/content?key=K      -> revert one key   (authed)
//   DELETE /api/content?all=1      -> revert everything (authed)
import { db } from "./_lib/db.js";
import { withErrors, json, requireAuth } from "./_lib/util.js";

const KINDS = new Set(["text", "html", "src", "href"]);
const MAX_VALUE = 200_000;

export default withErrors(async (req, res) => {
  const sql = await db();

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
