// One optional uploaded photo per day, for the Days gallery tab.
// The client resizes/compresses the image into TWO sizes before ever
// sending it here: a small thumbnail (photo_data, used by the bulk grid
// fetch below so that stays fast) and a larger copy (photo_full, fetched
// one at a time for the full-size lightbox). This endpoint just stores
// and serves those strings as-is.
//   GET    /api/day-photos?from=&to=        -> [{ task_date, photo_data }] in that range (thumbnails only)
//   GET    /api/day-photos?date=&full=1     -> { photo_data, photo_full } for one day (falls back to photo_data if no full copy was ever saved)
//   POST   /api/day-photos                  -> { date, photo_data, photo_full? } upsert for that day
//   DELETE /api/day-photos?date=YYYY-MM-DD
import { db } from "./_lib/db.js";
import { withErrors, json, requireAuth } from "./_lib/util.js";

const MAX_THUMB_CHARS = 500_000; // ~375KB decoded — plenty for a small grid tile
const MAX_FULL_CHARS = 3_000_000; // ~2.2MB decoded — fetched one at a time, not in bulk

function isDate(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));
}

export default withErrors(async (req, res) => {
  if (!requireAuth(req, res)) return;
  const sql = await db();

  if (req.method === "GET" && req.query.date) {
    const date = String(req.query.date).slice(0, 10);
    if (!isDate(date)) return json(res, 400, { error: "date must be YYYY-MM-DD" });
    const [photo] = await sql`SELECT photo_data, photo_full FROM day_photos WHERE task_date = ${date}::date`;
    if (!photo) return json(res, 200, { photo_data: null, photo_full: null });
    return json(res, 200, { photo_data: photo.photo_data, photo_full: photo.photo_full || photo.photo_data });
  }

  if (req.method === "GET") {
    const from = String(req.query.from || "").slice(0, 10);
    const to = String(req.query.to || "").slice(0, 10);
    if (!isDate(from) || !isDate(to)) return json(res, 400, { error: "from/to must be YYYY-MM-DD" });
    const photos = await sql`SELECT task_date::text AS task_date, photo_data FROM day_photos
      WHERE task_date BETWEEN ${from}::date AND ${to}::date`;
    return json(res, 200, { photos });
  }

  if (req.method === "POST") {
    const b = req.body || {};
    if (!isDate(b.date)) return json(res, 400, { error: "date must be YYYY-MM-DD" });
    if (!b.photo_data || typeof b.photo_data !== "string" || !b.photo_data.startsWith("data:image/")) {
      return json(res, 400, { error: "photo_data must be an image data: URL" });
    }
    if (b.photo_data.length > MAX_THUMB_CHARS) return json(res, 400, { error: "Thumbnail is too large" });
    const photoFull = b.photo_full && typeof b.photo_full === "string" && b.photo_full.startsWith("data:image/")
      ? b.photo_full
      : null;
    if (photoFull && photoFull.length > MAX_FULL_CHARS) return json(res, 400, { error: "Image is too large" });

    const [photo] = await sql`INSERT INTO day_photos (task_date, photo_data, photo_full)
      VALUES (${b.date}::date, ${b.photo_data}, ${photoFull})
      ON CONFLICT (task_date) DO UPDATE SET photo_data = ${b.photo_data}, photo_full = ${photoFull}
      RETURNING task_date::text AS task_date, photo_data`;
    return json(res, 200, { photo });
  }

  if (req.method === "DELETE") {
    const date = String(req.query.date || "").slice(0, 10);
    if (!isDate(date)) return json(res, 400, { error: "date must be YYYY-MM-DD" });
    await sql`DELETE FROM day_photos WHERE task_date = ${date}::date`;
    return json(res, 200, { ok: true });
  }

  return json(res, 405, { error: "Method not allowed" });
});
