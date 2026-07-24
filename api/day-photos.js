// One optional uploaded thumbnail per day, for the Days gallery tab.
// The client resizes/compresses the image to a small JPEG data: URL before
// ever sending it here, so this just stores/serves that string as-is.
//   GET    /api/day-photos?from=&to=   -> [{ task_date, photo_data }] in that range
//   POST   /api/day-photos             -> { date, photo_data } upsert for that day
//   DELETE /api/day-photos?date=YYYY-MM-DD
import { db } from "./_lib/db.js";
import { withErrors, json, requireAuth } from "./_lib/util.js";

const MAX_PHOTO_CHARS = 2_000_000; // ~1.5MB decoded — generous for a resized thumbnail

function isDate(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));
}

export default withErrors(async (req, res) => {
  if (!requireAuth(req, res)) return;
  const sql = await db();

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
    if (b.photo_data.length > MAX_PHOTO_CHARS) return json(res, 400, { error: "Image is too large" });

    const [photo] = await sql`INSERT INTO day_photos (task_date, photo_data)
      VALUES (${b.date}::date, ${b.photo_data})
      ON CONFLICT (task_date) DO UPDATE SET photo_data = ${b.photo_data}
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
