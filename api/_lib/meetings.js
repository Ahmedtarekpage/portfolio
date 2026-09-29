// Scheduled meetings: the time-zone arithmetic, the admin's settings, the CRUD
// behind /api/sessions?resource=meetings, and the reminder emails.
//
// A meeting is stored as an instant (starts_at) plus the zone it was arranged
// in. Every screen converts the instant to whoever is looking: the admin sees
// their own zone, the client's share page uses the browser's, and the client's
// emails — where there is no browser to ask — use the zone it was arranged in.
import { json } from "./util.js";
import { mailConfig, renderEmail, renderText, sendBatch } from "./mail.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/* Reminder emails are built but switched off. They go out only when
   MEETING_REMINDERS=on is set in the project's environment — until then no
   meeting sends anything to anyone, and the admin says nothing about email. */
export function remindersOn() {
  return String(process.env.MEETING_REMINDERS || "").toLowerCase() === "on";
}
const DAY_MS = 86400000;

/* ---------------- time zones ---------------- */

export function isZone(tz) {
  if (!tz || typeof tz !== "string" || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function parts(date, tz) {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const p = {};
  for (const x of f.formatToParts(date)) p[x.type] = Number(x.value);
  return p;
}

/** How far ahead of UTC the zone is at that instant, in ms. */
function offsetMs(date, tz) {
  const p = parts(date, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/**
 * "2026-10-01T18:00" on the wall in `tz` -> the instant that is. The offset is
 * looked up twice because the first guess can land on the far side of a
 * daylight-saving change from the answer.
 */
export function zonedToUtc(local, tz) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(local || ""));
  if (!m) return null;
  const wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  if (Number.isNaN(wall)) return null;
  let utc = wall - offsetMs(new Date(wall), tz);
  utc = wall - offsetMs(new Date(utc), tz);
  return new Date(utc);
}

/** Whole calendar days from `now` to `date`, as the zone's own calendar counts them. */
export function dayDiff(date, now, tz) {
  const a = parts(date, tz);
  const b = parts(now, tz);
  return Math.round((Date.UTC(a.year, a.month - 1, a.day) - Date.UTC(b.year, b.month - 1, b.day)) / DAY_MS);
}

const fmt = (date, tz, opts) => new Intl.DateTimeFormat("en-GB", { timeZone: tz, ...opts }).format(date);

function zoneName(tz, date) {
  const city = tz.split("/").pop().replace(/_/g, " ");
  const off = new Intl.DateTimeFormat("en-GB", { timeZone: tz, timeZoneName: "shortOffset" })
    .formatToParts(date).find((x) => x.type === "timeZoneName");
  return `${city} time (${off ? off.value : "UTC"})`;
}

/** "Thursday 1 October 2026 · 6:00 PM – 7:00 PM" and the zone it is said in. */
function when(meeting, tz) {
  const start = new Date(meeting.starts_at);
  const end = new Date(start.getTime() + meeting.duration_min * 60000);
  const day = fmt(start, tz, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const t = (d) => new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true }).format(d);
  return { line: `${day} · ${t(start)} – ${t(end)}`, time: t(start), zone: zoneName(tz, start) };
}

export function platform(link) {
  const l = String(link || "").toLowerCase();
  if (/(^|\/\/|\.)zoom\.(us|com)\b/.test(l)) return "Zoom";
  if (/\/\/meet\.google\.com\b/.test(l)) return "Google Meet";
  if (/teams\.(microsoft|live)\.com\b/.test(l)) return "Microsoft Teams";
  return null;
}

/* ---------------- settings ---------------- */

const SETTING_KEYS = ["timezone", "detected_timezone", "default_link", "notify_email"];

export async function getSettings(sql) {
  const rows = await sql`SELECT key, value FROM app_settings`;
  const s = { timezone: "auto", detected_timezone: null, default_link: "", notify_email: "" };
  for (const r of rows) if (SETTING_KEYS.includes(r.key)) s[r.key] = r.value;
  const mail = mailConfig();
  return {
    ...s,
    // the address reminders about your own meetings go to
    notify_email_effective: s.notify_email || mail.replyTo,
    mail_configured: mail.configured,
    reminders_enabled: remindersOn(),
  };
}

/** The zone the admin's own emails are written in. */
function adminZone(settings) {
  if (settings.timezone !== "auto" && isZone(settings.timezone)) return settings.timezone;
  if (isZone(settings.detected_timezone)) return settings.detected_timezone;
  return "Asia/Dubai";
}

function cleanLink(v) {
  const s = String(v || "").trim();
  if (!s) return "";
  if (s.length > 600 || !/^https?:\/\/[^\s<>"']+$/i.test(s)) return null;
  return s;
}

export async function handleSettings(req, res, sql) {
  if (req.method === "GET") return json(res, 200, { settings: await getSettings(sql) });

  if (req.method === "PUT" || req.method === "PATCH" || req.method === "POST") {
    const b = req.body || {};
    const next = {};
    if (b.timezone !== undefined) {
      if (b.timezone !== "auto" && !isZone(b.timezone)) return json(res, 400, { error: "That time zone is not one I know." });
      next.timezone = b.timezone;
    }
    if (b.detected_timezone !== undefined) {
      if (!isZone(b.detected_timezone)) return json(res, 400, { error: "That time zone is not one I know." });
      next.detected_timezone = b.detected_timezone;
    }
    if (b.default_link !== undefined) {
      const link = cleanLink(b.default_link);
      if (link === null) return json(res, 400, { error: "The meeting link has to start with https://" });
      next.default_link = link;
    }
    if (b.notify_email !== undefined) {
      const email = String(b.notify_email || "").trim().toLowerCase();
      if (email && !EMAIL_RE.test(email)) return json(res, 400, { error: "That does not look like an email address." });
      next.notify_email = email;
    }
    for (const [key, value] of Object.entries(next)) {
      await sql`INSERT INTO app_settings (key, value) VALUES (${key}, ${value})
        ON CONFLICT (key) DO UPDATE SET value = ${value}`;
    }
    return json(res, 200, { settings: await getSettings(sql) });
  }

  return json(res, 405, { error: "Method not allowed" });
}

/* ---------------- meetings ---------------- */

/** One shape everywhere, whether the driver handed back a Date or a string. */
const iso = (v) => (v ? new Date(v).toISOString() : null);

export function shape(m, { admin = false } = {}) {
  const out = {
    id: m.id,
    client_id: m.client_id,
    starts_at: iso(m.starts_at),
    duration_min: Number(m.duration_min),
    timezone: m.timezone,
    link: m.link || null,
    platform: platform(m.link),
    topic: m.topic || null,
  };
  if (admin) {
    out.remind_day_at = iso(m.remind_day_at);
    out.remind_2h_at = iso(m.remind_2h_at);
    if (m.client_name !== undefined) {
      out.client_name = m.client_name;
      out.client_photo = m.client_photo || null;
      out.client_gender = m.client_gender || null;
    }
  }
  return out;
}

export async function clientMeetings(sql, clientId, opts) {
  const rows = await sql`SELECT * FROM meetings WHERE client_id = ${clientId} ORDER BY starts_at DESC`;
  return rows.map((m) => shape(m, opts));
}

/** Everything still to come (and anything running now), soonest first, across all clients. */
export async function upcomingMeetings(sql) {
  const rows = await sql`SELECT m.*, c.name AS client_name, c.photo AS client_photo, c.gender AS client_gender
    FROM meetings m JOIN clients c ON c.id = m.client_id
    WHERE m.starts_at + (m.duration_min * interval '1 minute') > now()
    ORDER BY m.starts_at ASC LIMIT 50`;
  return rows.map((m) => shape(m, { admin: true }));
}

/** Reads and checks a create/update body. Returns { error } or the clean fields. */
function readMeeting(b) {
  const tz = String(b.timezone || "");
  if (!isZone(tz)) return { error: "Pick a time zone for the meeting." };
  const start = zonedToUtc(b.local, tz);
  if (!start) return { error: "Pick a date and a time for the meeting." };
  const duration = Math.round(Number(b.duration_min) || 60);
  if (duration < 5 || duration > 12 * 60) return { error: "Duration has to be between 5 minutes and 12 hours." };
  const link = cleanLink(b.link);
  if (link === null) return { error: "The meeting link has to start with https://" };
  return {
    startsAt: start.toISOString(),
    tz,
    duration,
    link: link || null,
    topic: String(b.topic || "").trim().slice(0, 300) || null,
  };
}

export async function handleMeetings(req, res, sql) {
  if (req.method === "GET") {
    const clientId = Number(req.query.client_id);
    if (clientId) return json(res, 200, { meetings: await clientMeetings(sql, clientId, { admin: true }) });
    return json(res, 200, { meetings: await upcomingMeetings(sql) });
  }

  if (req.method === "POST") {
    const b = req.body || {};
    const clientId = Number(b.client_id);
    if (!clientId) return json(res, 400, { error: "client_id is required" });
    const m = readMeeting(b);
    if (m.error) return json(res, 400, { error: m.error });
    const [client] = await sql`SELECT id FROM clients WHERE id = ${clientId}`;
    if (!client) return json(res, 404, { error: "Client not found" });
    const [row] = await sql`INSERT INTO meetings (client_id, starts_at, duration_min, timezone, link, topic)
      VALUES (${clientId}, ${m.startsAt}::timestamptz, ${m.duration}, ${m.tz}, ${m.link}, ${m.topic})
      RETURNING *`;
    await sql`UPDATE clients SET timezone = ${m.tz} WHERE id = ${clientId}`;
    return json(res, 201, { meeting: shape(row, { admin: true }) });
  }

  const id = Number(req.query.id);
  if (!id) return json(res, 400, { error: "id is required" });

  if (req.method === "PATCH") {
    const m = readMeeting(req.body || {});
    if (m.error) return json(res, 400, { error: m.error });
    // A meeting moved to a new time is owed its reminders again; one that only
    // had its link or topic changed is not.
    const [row] = await sql`UPDATE meetings SET
        remind_day_at = CASE WHEN starts_at = ${m.startsAt}::timestamptz THEN remind_day_at ELSE NULL END,
        remind_2h_at = CASE WHEN starts_at = ${m.startsAt}::timestamptz THEN remind_2h_at ELSE NULL END,
        starts_at = ${m.startsAt}::timestamptz,
        duration_min = ${m.duration},
        timezone = ${m.tz},
        link = ${m.link},
        topic = ${m.topic}
      WHERE id = ${id} RETURNING *`;
    if (!row) return json(res, 404, { error: "Meeting not found" });
    await sql`UPDATE clients SET timezone = ${m.tz} WHERE id = ${row.client_id}`;
    return json(res, 200, { meeting: shape(row, { admin: true }) });
  }

  if (req.method === "DELETE") {
    await sql`DELETE FROM meetings WHERE id = ${id}`;
    return json(res, 200, { ok: true });
  }

  return json(res, 405, { error: "Method not allowed" });
}

/* ---------------- reminders ---------------- */

function firstName(name) {
  return String(name || "").trim().split(/\s+/)[0] || "there";
}

/** "today" / "tomorrow" / "on Thursday", as the reader's own calendar has it. */
function dayWord(start, now, tz) {
  const d = dayDiff(start, now, tz);
  if (d === 0) return "today";
  if (d === 1) return "tomorrow";
  return "on " + fmt(start, tz, { weekday: "long" });
}

function soonWord(start, now) {
  const mins = Math.max(1, Math.round((start - now) / 60000));
  if (mins >= 105) return "in 2 hours";
  if (mins >= 75) return "in an hour and a half";
  if (mins >= 50) return "in an hour";
  return `in ${mins} minutes`;
}

function buildEmails(m, kind, settings, base, now) {
  const cfg = mailConfig();
  const start = new Date(m.starts_at);
  const app = platform(m.link);
  const joinLabel = app ? `Join on ${app}` : "Join the meeting";
  const shareUrl = m.share_token ? `${base}/c/${m.share_token}` : null;
  const out = [];

  const message = (to, fields) => ({
    from: cfg.from,
    to: [to],
    reply_to: cfg.replyTo,
    subject: fields.subject,
    html: renderEmail({ ...fields, siteUrl: base, kicker: "Session reminder" }),
    text: renderText(fields),
  });

  if (m.client_email && EMAIL_RE.test(m.client_email)) {
    const tz = isZone(m.timezone) ? m.timezone : "UTC";
    const w = when(m, tz);
    const rel = kind === "2h" ? soonWord(start, now) : dayWord(start, now, tz);
    const heading = kind === "2h" ? `Your session starts ${rel}` : `Your session is ${rel}`;
    const body = [
      `Hi ${firstName(m.client_name)},`,
      `This is a reminder of your session with Ahmed Tarek.`,
      `**${w.line}**\n${w.zone}`,
      m.topic ? `**Topic:** ${m.topic}` : null,
      m.link
        ? `We will meet on ${app || "the link below"}. The button below opens the meeting.`
        : `The meeting link will be sent to you separately.`,
      shareUrl ? `Your hours and upcoming sessions: [open your page](${shareUrl})` : null,
    ].filter(Boolean).join("\n\n");
    out.push({
      who: "client",
      message: message(m.client_email, {
        subject: `${heading} — ${w.time}, ${w.zone}`,
        heading,
        body,
        preheader: `${w.line}, ${w.zone}`,
        ctaLabel: m.link ? joinLabel : (shareUrl ? "Open your page" : null),
        ctaUrl: m.link || shareUrl,
        footerNote: "You are getting this because a session with Ahmed Tarek is booked for you. Reply to this email to reschedule.",
      }),
    });
  }

  const adminTo = settings.notify_email_effective;
  if (adminTo && EMAIL_RE.test(adminTo)) {
    const tz = adminZone(settings);
    const w = when(m, tz);
    const theirs = isZone(m.timezone) && m.timezone !== tz ? when(m, m.timezone) : null;
    const rel = kind === "2h" ? soonWord(start, now) : dayWord(start, now, tz);
    const heading = `Session with ${m.client_name} ${rel}`;
    const body = [
      `**${w.line}**\n${w.zone}`,
      theirs ? `For ${firstName(m.client_name)} that is ${theirs.line}, ${theirs.zone}.` : null,
      m.topic ? `**Topic:** ${m.topic}` : null,
      m.client_email
        ? `${firstName(m.client_name)} has been sent the same reminder at ${m.client_email}.`
        : `${firstName(m.client_name)} has no email address on file, so only you got this reminder.`,
      !m.link ? `There is no meeting link on this one yet.` : null,
    ].filter(Boolean).join("\n\n");
    out.push({
      who: "admin",
      message: message(adminTo, {
        subject: `${heading} — ${w.time}`,
        heading,
        body,
        preheader: `${w.line}, ${w.zone}`,
        ctaLabel: m.link ? joinLabel : "Open the client",
        ctaUrl: m.link || `${base}/admin`,
        footerNote: "Sent by your own admin at ahmedtarek.tech, for a meeting you scheduled.",
      }),
    });
  }
  return out;
}

/**
 * Sends whatever reminders have come due. Safe to call as often as anyone
 * likes: a reminder is claimed in the database before it is sent, so it goes
 * out once however many times this runs. A claim is handed back if the send
 * fails, which leaves it for the next run to try again.
 */
export async function runReminders(sql, base) {
  if (!remindersOn()) return { sent: 0, configured: false };
  if (!mailConfig().configured) return { sent: 0, configured: false };
  const settings = await getSettings(sql);
  const now = new Date();
  let sent = 0;
  let failed = 0;

  // Inside two hours the day-ahead reminder is claimed along with it — a
  // meeting booked for this afternoon should not also say it is "today".
  const soon = await sql`UPDATE meetings SET remind_2h_at = now(), remind_day_at = COALESCE(remind_day_at, now())
    WHERE remind_2h_at IS NULL AND starts_at > now() AND starts_at <= now() + interval '2 hours'
    RETURNING id`;
  const ahead = await sql`UPDATE meetings SET remind_day_at = now()
    WHERE remind_day_at IS NULL AND starts_at > now() + interval '2 hours' AND starts_at <= now() + interval '24 hours'
    RETURNING id`;

  const claimed = [...soon.map((r) => ({ id: r.id, kind: "2h" })), ...ahead.map((r) => ({ id: r.id, kind: "day" }))];
  for (const c of claimed) {
    const [m] = await sql`SELECT m.*, c.name AS client_name, c.email AS client_email, c.share_token
      FROM meetings m JOIN clients c ON c.id = m.client_id WHERE m.id = ${c.id}`;
    if (!m) continue;
    const emails = buildEmails(m, c.kind, settings, base, now);
    let ok = emails.length > 0;
    for (const e of emails) {
      const r = await sendBatch([e.message]);
      if (r.sent) sent += 1;
      else {
        failed += 1;
        console.error(`meeting ${m.id} ${c.kind} reminder to ${e.who} failed: ${r.error}`);
        // the client's copy is the one that matters; the admin's is a courtesy
        if (e.who === "client" || emails.length === 1) ok = false;
      }
    }
    if (!ok && emails.length) {
      if (c.kind === "2h") await sql`UPDATE meetings SET remind_2h_at = NULL WHERE id = ${m.id}`;
      else await sql`UPDATE meetings SET remind_day_at = NULL WHERE id = ${m.id}`;
    }
  }
  return { sent, failed, configured: true };
}
