// PUBLIC read-only client view, gated by an unguessable share token (no login).
//   GET /api/share?token=T          -> client name + hours data (no admin notes/contact info)
//   GET /api/share?token=T&pdf=N    -> download that client's session-minutes PDF
//   GET|POST /api/share?cron=reminders -> send whatever meeting reminders have come due
//
// The reminder run is here because it has to be callable without a login (a
// scheduler has no passkey) and this is the one function that already is. It
// takes no input and says nothing about anyone: each reminder is claimed in
// the database before it is sent, so calling it a thousand times sends the
// same emails as calling it once.
import { db } from "./_lib/db.js";
import { withErrors, json } from "./_lib/util.js";
import { computeClient } from "./_lib/hours.js";
import { runReminders, remindersOn, shape } from "./_lib/meetings.js";

const toBuf = (v) => (Buffer.isBuffer(v) ? v : Buffer.from(String(v).replace(/^\\x/, ""), "hex"));

export default withErrors(async (req, res) => {
  if (req.query.cron === "reminders" && (req.method === "GET" || req.method === "POST")) {
    // Off unless MEETING_REMINDERS=on: with it off this does not so much as
    // open the database.
    if (!remindersOn()) return json(res, 200, { ok: true, sent: 0 });
    // The links in the emails are never built from the request: anyone can
    // call this, and a forged Host header must not end up in a client's inbox.
    const r = await runReminders(await db(), process.env.SITE_URL || "https://ahmedtarek.tech");
    res.setHeader("Cache-Control", "no-store");
    return json(res, 200, { ok: true, sent: r.sent });
  }

  if (req.method !== "GET") return json(res, 405, { error: "Method not allowed" });
  const token = String(req.query.token || "");
  if (token.length < 16) return json(res, 404, { error: "Invalid link" });

  const sql = await db();
  const [client] = await sql`SELECT id, name, gender, photo FROM clients WHERE share_token = ${token}`;
  if (!client) return json(res, 404, { error: "This link is not valid anymore" });

  const pdfId = Number(req.query.pdf);
  if (pdfId) {
    const [row] = await sql`SELECT pdf, pdf_name FROM client_sessions
      WHERE id = ${pdfId} AND client_id = ${client.id}`;
    if (!row || !row.pdf) return json(res, 404, { error: "No PDF for this session" });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${String(row.pdf_name || "minutes.pdf").replace(/[^\w.\- ]+/g, "_")}"`);
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).send(toBuf(row.pdf));
  }

  // NOTE: no amount_paid / currency here — payment amounts are admin-only
  // and must never be exposed through the public share link.
  const packages = await sql`SELECT id, hours, purchased_at, expires_at
    FROM hour_packages WHERE client_id = ${client.id} ORDER BY purchased_at DESC, id DESC`;
  const sessions = await sql`SELECT id, session_date, hours, topic, pdf_name, (pdf IS NOT NULL) AS has_pdf
    FROM client_sessions WHERE client_id = ${client.id} ORDER BY session_date DESC, id DESC`;

  // what is coming, and the last week of what has been — enough for the page
  // to say "yesterday" without turning into an archive
  const meetingRows = await sql`SELECT * FROM meetings
    WHERE client_id = ${client.id} AND starts_at > now() - interval '7 days'
    ORDER BY starts_at ASC`;
  const meetings = meetingRows.map((m) => shape(m));

  const { timeline, totals } = computeClient(packages, sessions);
  res.setHeader("Cache-Control", "private, no-store");
  return json(res, 200, { name: client.name, gender: client.gender, photo: client.photo, packages, sessions, timeline, totals, meetings });
});
