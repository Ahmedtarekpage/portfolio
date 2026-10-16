// Session files: meeting minutes or the slides that were shown — PDF,
// PowerPoint, Keynote, OpenDocument or Word (owner, 2026-10-16: "file upload
// could be pdf, presentation, with icon").
//
// Vercel caps a request and a response at 4.5 MB, and slides are often bigger,
// so a file travels in pieces both ways. Up: the browser sends 2.5 MB pieces to
// /api/sessions?resource=upload, and saving the session joins them inside the
// database (string_agg), so the whole file never passes through a function.
// Down: a small file is sent whole; a big one is read in 3 MB parts
// (?part=k, with ?info=1 to learn how many) and put back together in the
// browser. The file is stored in client_sessions.pdf whatever its kind (the
// column predates slides); file_type and file_size say what it is.

import { json } from "./util.js";

export const MAX_FILE_BYTES = 20 * 1024 * 1024;
const CHUNK_BYTES = 2.5 * 1024 * 1024;
const PART_BYTES = 3 * 1024 * 1024;
const WHOLE_BYTES = 4 * 1024 * 1024; // sent in one response up to here

const PDF = (h) => h.subarray(0, 5).toString() === "%PDF-";
const ZIP = (h) => h[0] === 0x50 && h[1] === 0x4b && h[2] === 0x03 && h[3] === 0x04;
const OLE = (h) => h.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));

// what each extension must look like inside, and the type it is served as
const KINDS = {
  pdf: { check: PDF, type: "application/pdf" },
  pptx: { check: ZIP, type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" },
  ppsx: { check: ZIP, type: "application/vnd.openxmlformats-officedocument.presentationml.slideshow" },
  ppt: { check: OLE, type: "application/vnd.ms-powerpoint" },
  key: { check: ZIP, type: "application/vnd.apple.keynote" },
  odp: { check: ZIP, type: "application/vnd.oasis.opendocument.presentation" },
  docx: { check: ZIP, type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
  doc: { check: OLE, type: "application/msword" },
};
export const FILE_EXTENSIONS = Object.keys(KINDS);

const cleanName = (name) => String(name || "file").replace(/[\\/\r\n"]+/g, "_").slice(0, 200);
const extOf = (name) => (/\.([a-z0-9]+)$/i.exec(String(name || "")) || [])[1]?.toLowerCase() || "";

/** Which kind a file is, from its name and its first bytes. Returns { type } or an error string. */
export function kindOf(name, head) {
  const kind = KINDS[extOf(name)];
  if (!kind) return "Upload a PDF, PowerPoint, Keynote or Word file";
  if (!kind.check(head)) return "That file is not what its name says (." + extOf(name) + ")";
  return { type: kind.type };
}

/** One small file sent whole in the request (the old way, still accepted). */
export function parseInline(base64, name) {
  const buf = Buffer.from(String(base64), "base64");
  if (!buf.length) return "Could not read the file";
  if (buf.length > CHUNK_BYTES * 1.25) return "Send a file this big in pieces";
  const kind = kindOf(name, buf);
  if (typeof kind === "string") return kind;
  return { hex: "\\x" + buf.toString("hex"), name: cleanName(name), type: kind.type, size: buf.length };
}

/** POST /api/sessions?resource=upload { upload_id, index, data_base64 } — one piece. */
export async function handleUpload(req, res, sql) {
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });
  const b = req.body || {};
  const id = String(b.upload_id || "");
  const index = Number(b.index);
  if (!/^[\w-]{16,64}$/.test(id)) return json(res, 400, { error: "upload_id is missing" });
  if (!Number.isInteger(index) || index < 0 || index * CHUNK_BYTES >= MAX_FILE_BYTES) return json(res, 400, { error: "That piece is out of range" });
  const buf = Buffer.from(String(b.data_base64 || ""), "base64");
  if (!buf.length || buf.length > CHUNK_BYTES) return json(res, 400, { error: "A piece must be at most 2.5 MB" });
  // pieces nobody came back for
  await sql`DELETE FROM upload_chunks WHERE created_at < now() - interval '1 day'`;
  await sql`INSERT INTO upload_chunks (upload_id, idx, data) VALUES (${id}, ${index}, ${"\\x" + buf.toString("hex")}::bytea)
    ON CONFLICT (upload_id, idx) DO UPDATE SET data = EXCLUDED.data, created_at = now()`;
  return json(res, 200, { ok: true });
}

/** Check a finished upload. Returns { name, type, size } or an error string. */
export async function checkUpload(sql, id, name) {
  if (!/^[\w-]{16,64}$/.test(String(id || ""))) return "The upload was not found";
  const [stat] = await sql`SELECT count(*)::int AS n, max(idx) AS last, coalesce(sum(length(data)), 0)::bigint AS size
    FROM upload_chunks WHERE upload_id = ${id}`;
  if (!stat.n) return "The upload was not found — try again";
  if (stat.n !== Number(stat.last) + 1) return "Part of the file is missing — try again";
  if (Number(stat.size) > MAX_FILE_BYTES) return "The file is too large (max 20 MB)";
  const [first] = await sql`SELECT substring(data from 1 for 8) AS head FROM upload_chunks WHERE upload_id = ${id} AND idx = 0`;
  const head = toBuf(first.head);
  const kind = kindOf(name, head);
  if (typeof kind === "string") return kind;
  return { name: cleanName(name), type: kind.type, size: Number(stat.size) };
}

/** Put a checked upload onto a session, then drop the pieces. */
export async function attachUpload(sql, sessionId, id, file) {
  await sql`UPDATE client_sessions SET
      pdf = (SELECT string_agg(data, ''::bytea ORDER BY idx) FROM upload_chunks WHERE upload_id = ${id}),
      pdf_name = ${file.name}, file_type = ${file.type}, file_size = ${file.size}
    WHERE id = ${sessionId}`;
  await sql`DELETE FROM upload_chunks WHERE upload_id = ${id}`;
}

export async function dropUpload(sql, id) {
  if (/^[\w-]{16,64}$/.test(String(id || ""))) await sql`DELETE FROM upload_chunks WHERE upload_id = ${id}`;
}

// neon may return bytea as a Buffer or as a '\x…' hex string
export const toBuf = (v) => (Buffer.isBuffer(v) ? v : Buffer.from(String(v).replace(/^\\x/, ""), "hex"));

/** Serve a session's file: whole, its size and parts (?info=1), or one part (?part=k).
 *  `where` is the session id, plus the client id when a share link asks. */
export async function serveSessionFile(sql, res, query, sessionId, clientId) {
  const [meta] = await sql`SELECT pdf_name, file_type, coalesce(file_size, octet_length(pdf)) AS size
    FROM client_sessions WHERE id = ${sessionId} AND pdf IS NOT NULL
      AND (${clientId ?? null}::int IS NULL OR client_id = ${clientId ?? null}::int)`;
  if (!meta) return json(res, 404, { error: "No file for this session" });
  const size = Number(meta.size);
  const type = meta.file_type || "application/pdf";
  const name = meta.pdf_name || "minutes.pdf";
  res.setHeader("Cache-Control", "private, no-store");

  if (query.info) return json(res, 200, { name, type, size, parts: Math.ceil(size / PART_BYTES), part_bytes: PART_BYTES });

  if (query.part !== undefined) {
    const k = Number(query.part);
    if (!Number.isInteger(k) || k < 0 || k * PART_BYTES >= size) return json(res, 400, { error: "No such part" });
    const [row] = await sql`SELECT substring(pdf from ${k * PART_BYTES + 1} for ${PART_BYTES}) AS bytes FROM client_sessions WHERE id = ${sessionId}`;
    res.setHeader("Content-Type", "application/octet-stream");
    return res.status(200).send(toBuf(row.bytes));
  }

  if (size > WHOLE_BYTES) return json(res, 413, { error: "This file is sent in parts", parts: Math.ceil(size / PART_BYTES) });
  const [row] = await sql`SELECT pdf FROM client_sessions WHERE id = ${sessionId}`;
  res.setHeader("Content-Type", type);
  // a PDF opens in the tab; slides and documents download
  const how = type === "application/pdf" ? "inline" : "attachment";
  res.setHeader("Content-Disposition", `${how}; filename="${String(name).replace(/[^\w.\- ]+/g, "_")}"`);
  return res.status(200).send(toBuf(row.pdf));
}
