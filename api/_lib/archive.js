// Archive (owner, 2026-11-24: "archive … 3D folders … I can upload, CRUD, every file that comes to me").
// Folders and the files in them, kept in the database. Files of any kind up to 25 MB travel in
// 2.5 MB pieces through upload_chunks (the same way session files do, see files.js), are joined in
// the database, and come back whole (small) or in 3 MB parts (big).
//
//   GET    ?archive=list                       -> { folders, files }   (no file bytes)
//   POST   ?archive=folder        { name, color }
//   PATCH  ?archive=folder&id=N   { name?, color? }
//   PATCH  ?archive=reorder       { ids: [folder ids in order] }
//   DELETE ?archive=folder&id=N   (and its files)
//   POST   ?archive=upload        { upload_id, index, data_base64 }   one piece
//   POST   ?archive=file          { upload_id, folder_id, name, type }  the pieces become a file
//   PATCH  ?archive=file&id=N     { name?, folder_id? }   rename / move
//   DELETE ?archive=file&id=N
//   GET    ?archive=get&id=N [&info=1 | &part=k | &dl=1]
//
// Routed through api/ideas.js (api/ is at Vercel's 12-function limit).
import { json } from "./util.js";
import { handleUpload, dropUpload, toBuf } from "./files.js";

const MAX_BYTES = 25 * 1024 * 1024;
const PART_BYTES = 3 * 1024 * 1024;
const WHOLE_BYTES = 4 * 1024 * 1024;
// shown in the tab; anything else downloads (and never html/svg, which could run script)
const INLINE = /^(image\/(png|jpe?g|gif|webp|heic|avif)|application\/pdf|audio\/[\w.+-]+|video\/(mp4|webm|quicktime)|text\/plain)$/i;

let ready = false;
async function ensure(sql) {
  if (ready) return;
  await sql`CREATE TABLE IF NOT EXISTS archive_folders (
    id SERIAL PRIMARY KEY, name TEXT NOT NULL, color TEXT, position INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
  await sql`CREATE TABLE IF NOT EXISTS archive_files (
    id SERIAL PRIMARY KEY, folder_id INT NOT NULL REFERENCES archive_folders(id) ON DELETE CASCADE,
    name TEXT NOT NULL, type TEXT, size BIGINT, data BYTEA,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
  await sql`CREATE INDEX IF NOT EXISTS archive_files_folder ON archive_files (folder_id)`;
  ready = true;
}

const cleanName = (n, fb) => String(n || fb || "").replace(/[\\/\r\n"]+/g, "_").trim().slice(0, 200) || fb;
const cleanColor = (c) => (/^#[0-9a-f]{6}$/i.test(String(c || "")) ? c : null);
const cleanType = (t) => (/^[\w.+-]+\/[\w.+-]+$/.test(String(t || "")) ? String(t).toLowerCase() : "application/octet-stream");
const intId = (v) => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; };

export async function archive(req, res, sql) {
  await ensure(sql);
  const q = req.query, b = req.body || {}, m = req.method, what = q.archive;

  if (what === "list" && m === "GET") {
    const folders = await sql`SELECT f.id, f.name, f.color, f.position, f.created_at,
        count(a.id)::int AS count, coalesce(sum(a.size), 0)::bigint AS size
      FROM archive_folders f LEFT JOIN archive_files a ON a.folder_id = f.id
      GROUP BY f.id ORDER BY f.position, f.id`;
    const files = await sql`SELECT id, folder_id, name, type, size, created_at FROM archive_files ORDER BY created_at DESC`;
    return json(res, 200, { folders, files });
  }

  if (what === "folder") {
    if (m === "POST") {
      const [{ p }] = await sql`SELECT coalesce(max(position), -1) + 1 AS p FROM archive_folders`;
      const [f] = await sql`INSERT INTO archive_folders (name, color, position) VALUES (${cleanName(b.name, "Folder")}, ${cleanColor(b.color)}, ${p}) RETURNING *`;
      return json(res, 201, { folder: f });
    }
    const id = intId(q.id); if (!id) return json(res, 400, { error: "id is missing" });
    if (m === "PATCH") {
      const [f] = await sql`UPDATE archive_folders SET
          name = coalesce(${b.name != null ? cleanName(b.name, "Folder") : null}, name),
          color = coalesce(${cleanColor(b.color)}, color)
        WHERE id = ${id} RETURNING *`;
      return f ? json(res, 200, { folder: f }) : json(res, 404, { error: "Folder not found" });
    }
    if (m === "DELETE") { await sql`DELETE FROM archive_folders WHERE id = ${id}`; return json(res, 200, { ok: true }); }
  }

  if (what === "reorder" && m === "PATCH") {
    const ids = Array.isArray(b.ids) ? b.ids.map(intId).filter(Boolean).slice(0, 500) : [];
    for (let i = 0; i < ids.length; i++) await sql`UPDATE archive_folders SET position = ${i} WHERE id = ${ids[i]}`;
    return json(res, 200, { ok: true });
  }

  if (what === "upload") return handleUpload(req, res, sql);

  if (what === "file") {
    if (m === "POST") {
      const up = String(b.upload_id || ""), folder = intId(b.folder_id);
      if (!/^[\w-]{16,64}$/.test(up)) return json(res, 400, { error: "upload_id is missing" });
      if (!folder) return json(res, 400, { error: "Choose a folder" });
      const [stat] = await sql`SELECT count(*)::int AS n, max(idx) AS last, coalesce(sum(length(data)), 0)::bigint AS size FROM upload_chunks WHERE upload_id = ${up}`;
      if (!stat.n || stat.n !== Number(stat.last) + 1) { await dropUpload(sql, up); return json(res, 400, { error: "Part of the file is missing — try again" }); }
      if (Number(stat.size) > MAX_BYTES) { await dropUpload(sql, up); return json(res, 413, { error: "The file is too large (max 25 MB)" }); }
      const [f] = await sql`INSERT INTO archive_files (folder_id, name, type, size, data)
        VALUES (${folder}, ${cleanName(b.name, "file")}, ${cleanType(b.type)}, ${Number(stat.size)},
          (SELECT string_agg(data, ''::bytea ORDER BY idx) FROM upload_chunks WHERE upload_id = ${up}))
        RETURNING id, folder_id, name, type, size, created_at`;
      await dropUpload(sql, up);
      return json(res, 201, { file: f });
    }
    const id = intId(q.id); if (!id) return json(res, 400, { error: "id is missing" });
    if (m === "PATCH") {
      const [f] = await sql`UPDATE archive_files SET
          name = coalesce(${b.name != null ? cleanName(b.name, "file") : null}, name),
          folder_id = coalesce(${intId(b.folder_id)}, folder_id)
        WHERE id = ${id} RETURNING id, folder_id, name, type, size, created_at`;
      return f ? json(res, 200, { file: f }) : json(res, 404, { error: "File not found" });
    }
    if (m === "DELETE") { await sql`DELETE FROM archive_files WHERE id = ${id}`; return json(res, 200, { ok: true }); }
  }

  if (what === "get" && m === "GET") {
    const id = intId(q.id); if (!id) return json(res, 400, { error: "id is missing" });
    const [meta] = await sql`SELECT name, type, size FROM archive_files WHERE id = ${id}`;
    if (!meta) return json(res, 404, { error: "File not found" });
    const size = Number(meta.size), type = cleanType(meta.type);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (q.info) return json(res, 200, { name: meta.name, type, size, parts: Math.ceil(size / PART_BYTES), part_bytes: PART_BYTES });
    if (q.part !== undefined) {
      const k = Number(q.part);
      if (!Number.isInteger(k) || k < 0 || k * PART_BYTES >= size) return json(res, 400, { error: "No such part" });
      const [row] = await sql`SELECT substring(data from ${k * PART_BYTES + 1} for ${PART_BYTES}) AS bytes FROM archive_files WHERE id = ${id}`;
      res.setHeader("Content-Type", "application/octet-stream");
      return res.status(200).send(toBuf(row.bytes));
    }
    if (size > WHOLE_BYTES) return json(res, 413, { error: "This file is sent in parts", parts: Math.ceil(size / PART_BYTES) });
    const [row] = await sql`SELECT data FROM archive_files WHERE id = ${id}`;
    const inline = !q.dl && INLINE.test(type);
    res.setHeader("Content-Type", inline ? type : "application/octet-stream");
    res.setHeader("Content-Disposition", `${inline ? "inline" : "attachment"}; filename="${String(meta.name).replace(/[^\w.\- ]+/g, "_")}"; filename*=UTF-8''${encodeURIComponent(meta.name)}`);
    return res.status(200).send(toBuf(row.data));
  }

  return json(res, 400, { error: "Unknown archive request" });
}
