// Clients collection.
//   GET    /api/clients          -> all clients with balance summaries, plus every meeting still to come
//   GET    /api/clients?id=N     -> one client: profile + packages + sessions + timeline + meetings
//   POST   /api/clients          -> create { name, phone, email, nationality, transaction_type, notes, photo? }
//   PATCH  /api/clients?id=N     -> update any of the above fields; photo: "" removes the photo
//   DELETE /api/clients?id=N     -> delete client (cascades to packages/sessions)
//   POST   /api/clients?id=N&share=create -> mint (or return existing) read-only share token
//   POST   /api/clients?id=N&share=revoke -> disable the share link
import crypto from "node:crypto";
import { db } from "./_lib/db.js";
import { withErrors, json, requireAuth } from "./_lib/util.js";
import { computeClient } from "./_lib/hours.js";
import { clientMeetings, upcomingMeetings, getSettings } from "./_lib/meetings.js";

const MAX_PHOTO_CHARS = 400_000; // ~300KB decoded — the browser sends a 320px square, far below this

// undefined = not sent (leave as is), null = remove, string = the new photo, false = rejected
function readPhoto(b) {
  if (b.photo === undefined) return undefined;
  if (b.photo === null || b.photo === "") return null;
  if (typeof b.photo !== "string" || b.photo.length > MAX_PHOTO_CHARS) return false;
  return /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(b.photo) ? b.photo : false;
}

export default withErrors(async (req, res) => {
  if (!requireAuth(req, res)) return;
  const sql = await db();

  // One client in full. This used to be its own function, but the Hobby plan
  // allows twelve per deployment and the content dashboard needed a slot.
  if (req.method === "GET" && req.query.id) {
    const id = Number(req.query.id);
    if (!id) return json(res, 400, { error: "id is required" });
    const [client] = await sql`SELECT * FROM clients WHERE id = ${id}`;
    if (!client) return json(res, 404, { error: "Client not found" });
    const packages = await sql`SELECT id, client_id, hours, amount_paid, currency, purchased_at, expires_at, note,
        (proof IS NOT NULL) AS has_proof
      FROM hour_packages WHERE client_id = ${id} ORDER BY purchased_at DESC, id DESC`;
    const sessions = await sql`SELECT id, client_id, session_date, hours, topic, pdf_name, (pdf IS NOT NULL) AS has_pdf
      FROM client_sessions WHERE client_id = ${id} ORDER BY session_date DESC, id DESC`;
    const { timeline, totals } = computeClient(packages, sessions);
    const meetings = await clientMeetings(sql, id, { admin: true });
    const settings = await getSettings(sql);
    return json(res, 200, { client, packages, sessions, timeline, totals, meetings, settings });
  }

  if (req.method === "GET") {
    const clients = await sql`SELECT * FROM clients ORDER BY created_at DESC`;
    const packages = await sql`SELECT id, client_id, hours, purchased_at, expires_at FROM hour_packages`;
    const sessions = await sql`SELECT id, client_id, session_date, hours, topic FROM client_sessions`;
    const byClient = (rows) => {
      const map = new Map();
      for (const r of rows) {
        if (!map.has(r.client_id)) map.set(r.client_id, []);
        map.get(r.client_id).push(r);
      }
      return map;
    };
    const pkgMap = byClient(packages);
    const sesMap = byClient(sessions);
    const list = clients.map((c) => {
      const { totals } = computeClient(pkgMap.get(c.id) || [], sesMap.get(c.id) || []);
      return { ...c, totals };
    });
    const meetings = await upcomingMeetings(sql);
    const settings = await getSettings(sql);
    return json(res, 200, { clients: list, meetings, settings });
  }

  if (req.method === "POST" && req.query.share) {
    const id = Number(req.query.id);
    if (!id) return json(res, 400, { error: "id is required" });
    if (req.query.share === "revoke") {
      await sql`UPDATE clients SET share_token = NULL WHERE id = ${id}`;
      return json(res, 200, { ok: true });
    }
    const [client] = await sql`SELECT share_token FROM clients WHERE id = ${id}`;
    if (!client) return json(res, 404, { error: "Client not found" });
    let token = client.share_token;
    if (!token) {
      token = crypto.randomBytes(16).toString("base64url");
      await sql`UPDATE clients SET share_token = ${token} WHERE id = ${id}`;
    }
    return json(res, 200, { token });
  }

  if (req.method === "POST") {
    const b = req.body || {};
    if (!b.name || !String(b.name).trim()) return json(res, 400, { error: "Name is required" });
    const gender = ["male", "female"].includes(b.gender) ? b.gender : null;
    const photo = readPhoto(b);
    if (photo === false) return json(res, 400, { error: "Photo must be a JPEG, PNG or WebP image" });
    const [client] = await sql`INSERT INTO clients (name, phone, email, nationality, transaction_type, notes, gender, photo)
      VALUES (${String(b.name).trim()}, ${b.phone || null}, ${b.email || null},
              ${b.nationality || null}, ${b.transaction_type || null}, ${b.notes || null}, ${gender}, ${photo || null})
      RETURNING *`;
    return json(res, 201, { client });
  }

  const id = Number(req.query.id);
  if (!id) return json(res, 400, { error: "id is required" });

  if (req.method === "PATCH") {
    const b = req.body || {};
    const photo = readPhoto(b);
    if (photo === false) return json(res, 400, { error: "Photo must be a JPEG, PNG or WebP image" });
    const [client] = await sql`UPDATE clients SET
        photo = CASE WHEN ${photo !== undefined}::boolean THEN ${photo ?? null}::text ELSE photo END,
        name = COALESCE(${b.name ?? null}, name),
        phone = COALESCE(${b.phone ?? null}, phone),
        email = COALESCE(${b.email ?? null}, email),
        nationality = COALESCE(${b.nationality ?? null}, nationality),
        transaction_type = COALESCE(${b.transaction_type ?? null}, transaction_type),
        notes = COALESCE(${b.notes ?? null}, notes),
        gender = COALESCE(${["male", "female"].includes(b.gender) ? b.gender : null}, gender)
      WHERE id = ${id} RETURNING *`;
    if (!client) return json(res, 404, { error: "Client not found" });
    return json(res, 200, { client });
  }

  if (req.method === "DELETE") {
    await sql`DELETE FROM clients WHERE id = ${id}`;
    return json(res, 200, { ok: true });
  }

  return json(res, 405, { error: "Method not allowed" });
});
