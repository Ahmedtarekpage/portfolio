// Session records (with optional meeting-minutes PDF, stored in Postgres).
//   POST   /api/sessions       -> { client_id, session_date, hours, topic?, pdf_base64?, pdf_name? }
//   PATCH  /api/sessions?id=N  -> { session_date?, hours?, topic?, pdf_base64?, pdf_name? } (PDF replaces the old one)
//   DELETE /api/sessions?id=N
//
// Scheduled meetings and the admin's settings live here too — the Hobby plan's
// twelve functions are all taken, so they are a resource of this one:
//   GET    /api/sessions?resource=meetings               -> everything still to come, all clients
//   GET    /api/sessions?resource=meetings&client_id=N   -> one client's meetings, newest first
//   POST   /api/sessions?resource=meetings               -> { client_id, local: "YYYY-MM-DDTHH:MM", timezone, duration_min, link?, topic? }
//                                                           + repeat: { days: [0-6], interval: 1|2, until: "credit"|"count"|"date", count?, until_date? }
//                                                           + preview: true to see what a repeat rule would make without making it
//   PATCH  /api/sessions?resource=meetings&id=N          -> the same fields; a new time re-arms the reminders
//   PATCH  /api/sessions?resource=meetings&client_id=N&scope=upcoming -> { link } on every meeting of theirs still to come
//   DELETE /api/sessions?resource=meetings&id=N          -> &scope=following takes the rest of its series with it
//   GET    /api/sessions?resource=settings               -> { timezone, default_link, notify_email, ... }
//   PUT    /api/sessions?resource=settings               -> any of those
import { db } from "./_lib/db.js";
import { withErrors, json, requireAuth } from "./_lib/util.js";
import { handleMeetings, handleSettings } from "./_lib/meetings.js";
import { handleUpload, checkUpload, attachUpload, dropUpload, parseInline } from "./_lib/files.js";


/** The file sent with a save: pieces already uploaded (file_upload_id), or a
 *  small one inline (pdf_base64, the old way). Returns null, { upload } / { inline }, or an error string. */
async function readFile(sql, b) {
  if (b.file_upload_id) {
    const file = await checkUpload(sql, b.file_upload_id, b.file_name || b.pdf_name);
    // a refused file's pieces go at once, not after a day
    if (typeof file === "string") { await dropUpload(sql, b.file_upload_id); return file; }
    return { upload: b.file_upload_id, file };
  }
  if (b.pdf_base64) {
    const file = parseInline(b.pdf_base64, b.pdf_name || "minutes.pdf");
    return typeof file === "string" ? file : { inline: file };
  }
  return null;
}

async function saveFile(sql, sessionId, f) {
  if (f.upload) return attachUpload(sql, sessionId, f.upload, f.file);
  await sql`UPDATE client_sessions SET pdf = ${f.inline.hex}::bytea, pdf_name = ${f.inline.name},
    file_type = ${f.inline.type}, file_size = ${f.inline.size} WHERE id = ${sessionId}`;
}

async function one(sql, id) {
  const [s] = await sql`SELECT id, client_id, session_date, hours, topic, pdf_name, file_type,
      coalesce(file_size, octet_length(pdf)) AS file_size, (pdf IS NOT NULL) AS has_pdf
    FROM client_sessions WHERE id = ${id}`;
  return s;
}

export default withErrors(async (req, res) => {
  if (!requireAuth(req, res)) return;
  const sql = await db();

  if (req.query.resource === "meetings") return handleMeetings(req, res, sql);
  if (req.query.resource === "settings") return handleSettings(req, res, sql);
  if (req.query.resource === "upload") return handleUpload(req, res, sql);

  if (req.method === "POST") {
    const b = req.body || {};
    const clientId = Number(b.client_id);
    const hours = Number(b.hours);
    if (!clientId) return json(res, 400, { error: "client_id is required" });
    if (!hours || hours <= 0) return json(res, 400, { error: "hours must be a positive number" });
    const date = String(b.session_date || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json(res, 400, { error: "session_date must be YYYY-MM-DD" });

    const file = await readFile(sql, b);
    if (typeof file === "string") return json(res, 400, { error: file });

    const [made] = await sql`INSERT INTO client_sessions (client_id, session_date, hours, topic)
      VALUES (${clientId}, ${date}::date, ${hours}, ${b.topic ? String(b.topic).slice(0, 1000) : null})
      RETURNING id`;
    if (file) await saveFile(sql, made.id, file);
    return json(res, 201, { session: await one(sql, made.id) });
  }

  if (req.method === "PATCH") {
    const id = Number(req.query.id);
    if (!id) return json(res, 400, { error: "id is required" });
    const b = req.body || {};
    const hours = Number(b.hours);
    if (!hours || hours <= 0) return json(res, 400, { error: "hours must be a positive number" });
    const date = String(b.session_date || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json(res, 400, { error: "session_date must be YYYY-MM-DD" });
    // check the new file first, so a bad one leaves the session as it was
    const file = await readFile(sql, b);
    if (typeof file === "string") return json(res, 400, { error: file });

    const [found] = await sql`UPDATE client_sessions
      SET session_date = ${date}::date, hours = ${hours}, topic = ${b.topic ? String(b.topic).slice(0, 1000) : null}
      WHERE id = ${id} RETURNING id`;
    if (!found) return json(res, 404, { error: "Session not found" });
    if (file) await saveFile(sql, id, file);
    // remove_file: true takes the file off
    else if (b.remove_file) await sql`UPDATE client_sessions SET pdf = NULL, pdf_name = NULL, file_type = NULL, file_size = NULL WHERE id = ${id}`;
    return json(res, 200, { session: await one(sql, id) });
  }

  if (req.method === "DELETE") {
    const id = Number(req.query.id);
    if (!id) return json(res, 400, { error: "id is required" });
    await sql`DELETE FROM client_sessions WHERE id = ${id}`;
    return json(res, 200, { ok: true });
  }

  return json(res, 405, { error: "Method not allowed" });
});
