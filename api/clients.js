// Clients collection.
//   GET    /api/clients          -> all clients with balance summaries
//   POST   /api/clients          -> create { name, phone, email, nationality, transaction_type, notes }
//   PATCH  /api/clients?id=N     -> update any of the above fields
//   DELETE /api/clients?id=N     -> delete client (cascades to packages/sessions)
//   POST   /api/clients?id=N&share=create -> mint (or return existing) read-only share token
//   POST   /api/clients?id=N&share=revoke -> disable the share link
import crypto from "node:crypto";
import { db } from "./_lib/db.js";
import { withErrors, json, requireAuth } from "./_lib/util.js";
import { computeClient } from "./_lib/hours.js";

export default withErrors(async (req, res) => {
  if (!requireAuth(req, res)) return;
  const sql = await db();

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
    return json(res, 200, { clients: list });
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
    const [client] = await sql`INSERT INTO clients (name, phone, email, nationality, transaction_type, notes, gender)
      VALUES (${String(b.name).trim()}, ${b.phone || null}, ${b.email || null},
              ${b.nationality || null}, ${b.transaction_type || null}, ${b.notes || null}, ${gender})
      RETURNING *`;
    return json(res, 201, { client });
  }

  const id = Number(req.query.id);
  if (!id) return json(res, 400, { error: "id is required" });

  if (req.method === "PATCH") {
    const b = req.body || {};
    const [client] = await sql`UPDATE clients SET
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
