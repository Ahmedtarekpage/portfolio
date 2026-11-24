// Google Calendar for the Time page (owner, 2026-11-24): "add today and tomorrow to Google Calendar
// automatically, in real time when I add, edit or delete", and "any meeting or interview I accepted
// from my email should be in my calendar / my day".
//
// Routed through api/ideas.js (?gcal=...) because api/ is at the 12-function limit.
//
// Two permissions, nothing more:
//   calendar.app.created     — create ONE calendar ("My day") and manage only that calendar: today's and
//                              tomorrow's plan is written there and kept in step with every change.
//   calendar.events.readonly — read the owner's own calendars, so accepted meetings and interviews
//                              (Gmail puts invitations in the calendar by itself) show in Today/Tomorrow.
//
// Needs two environment variables set in Vercel by the owner (never in this repo):
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET  — an OAuth "Web application" client whose redirect URI is
//   https://ahmedtarek.tech/gcal/callback (vercel.json rewrites it to ?gcal=callback).
//
//   GET  ?gcal=status                 -> { configured, connected, calendar }
//   GET  ?gcal=connect                -> 302 to Google's consent screen
//   GET  ?gcal=callback&code&state    -> stores the refresh token, creates "My day", 302 back to /time
//   POST ?gcal=sync  { tz, days: [{ date, events: [{ key, title, from, to, desc }] }] }
//                                     -> creates / updates / deletes that day's events in "My day"
//   GET  ?gcal=events&from&to&tz      -> the owner's accepted events (not "My day") between two dates
//   POST ?gcal=disconnect             -> revokes the token, forgets everything
import crypto from "node:crypto";
import { json, sign, verifyToken } from "./util.js";

const SCOPES = "https://www.googleapis.com/auth/calendar.app.created https://www.googleapis.com/auth/calendar.events.readonly";
const API = "https://www.googleapis.com/calendar/v3";
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));
const isHm = (s) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(s || ""));
const zoneOk = (tz) => { try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return !!tz; } catch { return false; } };

async function tables(sql) {
  await sql`CREATE TABLE IF NOT EXISTS gcal_auth (
    id INTEGER PRIMARY KEY DEFAULT 1,
    refresh_token TEXT NOT NULL,
    calendar_id TEXT,
    connected_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS gcal_map (
    day DATE NOT NULL,
    key TEXT NOT NULL,
    event_id TEXT NOT NULL,
    hash TEXT NOT NULL,
    PRIMARY KEY (day, key)
  )`;
}

function redirectUri(req) {
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "ahmedtarek.tech");
  const proto = /^localhost|^127\./.test(host) ? "http" : "https";
  return `${proto}://${host}/gcal/callback`;
}

async function token(sql) {
  const [row] = await sql`SELECT * FROM gcal_auth WHERE id = 1`;
  if (!row) return null;
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: row.refresh_token, grant_type: "refresh_token",
    }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.access_token) {
    // access was removed on Google's side: forget it, so the page offers to connect again
    if (d.error === "invalid_grant") await sql`DELETE FROM gcal_auth WHERE id = 1`;
    return null;
  }
  return { access: d.access_token, calendar: row.calendar_id };
}

async function gfetch(access, path, opts = {}) {
  const r = await fetch(API + path, {
    ...opts,
    headers: { Authorization: "Bearer " + access, "Content-Type": "application/json", ...(opts.headers || {}) },
  });
  const text = await r.text();
  let body = null; try { body = text ? JSON.parse(text) : null; } catch { body = null; }
  return { ok: r.ok, status: r.status, body };
}

// "My day": made on connect; made again if the owner deleted it in Google
async function ensureCalendar(sql, access, current, tz) {
  if (current) {
    const g = await gfetch(access, "/calendars/" + encodeURIComponent(current));
    if (g.ok) return current;
  }
  const c = await gfetch(access, "/calendars", { method: "POST", body: JSON.stringify({ summary: "My day", description: "Today and tomorrow from ahmedtarek.tech/time", timeZone: zoneOk(tz) ? tz : "Asia/Dubai" }) });
  if (!c.ok) throw new Error("Could not create the My day calendar");
  await sql`UPDATE gcal_auth SET calendar_id = ${c.body.id} WHERE id = 1`;
  await sql`DELETE FROM gcal_map`;
  return c.body.id;
}

function addDay(date, n) {
  const d = new Date(date + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export async function gcal(req, res, sql) {
  const q = req.query, act = String(q.gcal);
  const configured = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  await tables(sql);

  if (act === "status") {
    const [row] = await sql`SELECT calendar_id, connected_at FROM gcal_auth WHERE id = 1`;
    return json(res, 200, { configured, connected: !!row, calendar: row ? row.calendar_id : null });
  }
  if (!configured) return json(res, 409, { error: "Google Calendar is not set up yet (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)" });

  if (act === "connect") {
    const tz = zoneOk(q.tz) ? String(q.tz) : "Asia/Dubai";
    const state = sign({ t: "gcal", tz, exp: Date.now() + 10 * 60 * 1000 });
    const url = "https://accounts.google.com/o/oauth2/v2/auth?" + new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID, redirect_uri: redirectUri(req), response_type: "code",
      scope: SCOPES, access_type: "offline", prompt: "consent", include_granted_scopes: "true", state,
    });
    res.statusCode = 302; res.setHeader("Location", url); return res.end();
  }

  if (act === "callback") {
    const st = verifyToken(String(q.state || ""));
    const back = (why) => { res.statusCode = 302; res.setHeader("Location", "/time?gcal=" + why); return res.end(); };
    if (!st || st.t !== "gcal") return back("expired");
    if (q.error || !q.code) return back("cancelled");
    const r = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: String(q.code), client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri(req), grant_type: "authorization_code",
      }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.refresh_token) return back("failed");
    await sql`INSERT INTO gcal_auth (id, refresh_token) VALUES (1, ${d.refresh_token})
      ON CONFLICT (id) DO UPDATE SET refresh_token = EXCLUDED.refresh_token, connected_at = now()`;
    const [row] = await sql`SELECT calendar_id FROM gcal_auth WHERE id = 1`;
    await ensureCalendar(sql, d.access_token, row && row.calendar_id, st.tz);
    return back("ok");
  }

  if (act === "disconnect" && req.method === "POST") {
    const [row] = await sql`SELECT refresh_token FROM gcal_auth WHERE id = 1`;
    if (row) await fetch("https://oauth2.googleapis.com/revoke?token=" + encodeURIComponent(row.refresh_token), { method: "POST" }).catch(() => {});
    await sql`DELETE FROM gcal_auth`; await sql`DELETE FROM gcal_map`;
    return json(res, 200, { ok: true });
  }

  const tk = await token(sql);
  if (!tk) return json(res, 409, { error: "Not connected to Google Calendar" });

  if (act === "sync" && req.method === "POST") {
    const b = req.body || {}, tz = zoneOk(b.tz) ? String(b.tz) : "Asia/Dubai";
    const days = Array.isArray(b.days) ? b.days.filter((d) => d && isDate(d.date)).slice(0, 3) : [];
    const cal = await ensureCalendar(sql, tk.access, tk.calendar, tz);
    const path = "/calendars/" + encodeURIComponent(cal) + "/events";
    let made = 0, changed = 0, removed = 0;
    for (const day of days) {
      const want = (Array.isArray(day.events) ? day.events : []).filter((e) => e && e.key && isHm(e.from) && isHm(e.to)).slice(0, 80);
      const have = await sql`SELECT key, event_id, hash FROM gcal_map WHERE day = ${day.date}::date`;
      const byKey = Object.fromEntries(have.map((h) => [h.key, h]));
      const keep = new Set();
      for (const e of want) {
        const key = String(e.key).slice(0, 60); keep.add(key);
        const end = e.to > e.from ? day.date : addDay(day.date, 1);
        const body = {
          summary: String(e.title || "").slice(0, 200),
          description: String(e.desc || "").slice(0, 900),
          start: { dateTime: `${day.date}T${e.from}:00`, timeZone: tz },
          end: { dateTime: `${end}T${e.to}:00`, timeZone: tz },
          reminders: { useDefault: false, overrides: [] },
          extendedProperties: { private: { myday: key } },
        };
        const hash = crypto.createHash("sha1").update(JSON.stringify(body)).digest("hex");
        const old = byKey[key];
        if (old && old.hash === hash) continue;
        if (old) {
          const p = await gfetch(tk.access, path + "/" + encodeURIComponent(old.event_id), { method: "PATCH", body: JSON.stringify(body) });
          if (p.ok) { changed++; await sql`UPDATE gcal_map SET hash = ${hash} WHERE day = ${day.date}::date AND key = ${key}`; continue; }
          // deleted in Google: make it again below
          await sql`DELETE FROM gcal_map WHERE day = ${day.date}::date AND key = ${key}`;
        }
        const c = await gfetch(tk.access, path, { method: "POST", body: JSON.stringify(body) });
        if (c.ok) {
          made++;
          await sql`INSERT INTO gcal_map (day, key, event_id, hash) VALUES (${day.date}::date, ${key}, ${c.body.id}, ${hash})
            ON CONFLICT (day, key) DO UPDATE SET event_id = EXCLUDED.event_id, hash = EXCLUDED.hash`;
        }
      }
      for (const h of have) {
        if (keep.has(h.key)) continue;
        await gfetch(tk.access, path + "/" + encodeURIComponent(h.event_id), { method: "DELETE" });
        await sql`DELETE FROM gcal_map WHERE day = ${day.date}::date AND key = ${h.key}`;
        removed++;
      }
    }
    // older days are left in Google as they were; only their bookkeeping is dropped
    await sql`DELETE FROM gcal_map WHERE day < CURRENT_DATE - 3`;
    return json(res, 200, { ok: true, made, changed, removed });
  }

  if (act === "events") {
    const from = isDate(q.from) ? q.from : new Date().toISOString().slice(0, 10);
    const to = isDate(q.to) ? q.to : addDay(from, 1);
    const list = await gfetch(tk.access, "/users/me/calendarList?minAccessRole=reader");
    const cals = (list.ok && list.body && list.body.items ? list.body.items : [])
      .filter((c) => c.id !== tk.calendar && c.selected !== false && !/#holiday@|#contacts@|#weeknum@/.test(c.id))
      .slice(0, 10);
    const timeMin = new Date(from + "T00:00:00Z"); timeMin.setUTCDate(timeMin.getUTCDate() - 1);
    const timeMax = new Date(addDay(to, 1) + "T23:59:59Z");
    const out = [];
    for (const c of cals) {
      const g = await gfetch(tk.access, "/calendars/" + encodeURIComponent(c.id) + "/events?" + new URLSearchParams({
        timeMin: timeMin.toISOString(), timeMax: timeMax.toISOString(), singleEvents: "true", orderBy: "startTime", maxResults: "100",
      }));
      if (!g.ok || !g.body) continue;
      for (const e of g.body.items || []) {
        if (e.status === "cancelled" || !e.start) continue;
        const me = (e.attendees || []).find((a) => a.self);
        if (me && me.responseStatus === "declined") continue;
        if (e.extendedProperties && e.extendedProperties.private && e.extendedProperties.private.myday) continue;
        out.push({
          id: e.id, title: e.summary || "(no title)", start: e.start.dateTime || e.start.date, end: (e.end && (e.end.dateTime || e.end.date)) || null,
          allDay: !e.start.dateTime, link: e.hangoutLink || (e.conferenceData && e.conferenceData.entryPoints && e.conferenceData.entryPoints[0] && e.conferenceData.entryPoints[0].uri) || null,
          accepted: !me || me.responseStatus === "accepted", calendar: c.summary || "",
        });
      }
    }
    return json(res, 200, { events: out });
  }

  return json(res, 400, { error: "Unknown gcal action" });
}
