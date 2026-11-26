// Calendars by their private iCal address (owner, 2026-11-26: "anything I add to my calendar, like a
// Preply lesson, has to show on the site"). Google's OAuth keys were never set up, so instead each
// calendar's "Secret address in iCal format" is saved once and read here. Nothing is written back.
//
//   GET    ?gcal=feeds              -> { feeds: [{ id, name, host }] }   (the address itself never comes back)
//   POST   ?gcal=feeds { name, url } -> adds one
//   DELETE ?gcal=feeds&id=N
//   GET    ?gcal=ics&from&to        -> { events: [{ id, title, start, end, allDay, link, calendar }], seen }

const HOSTS = /^(calendar\.google\.com|outlook\.office365\.com|outlook\.live\.com|p\d+-caldav\.icloud\.com)$/;

export async function feedTables(sql) {
  await sql`CREATE TABLE IF NOT EXISTS cal_feeds (
    id SERIAL PRIMARY KEY, name TEXT NOT NULL, url TEXT NOT NULL, added_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
}

export function okUrl(u) {
  try {
    const x = new URL(String(u || "").trim().replace(/^webcal:/i, "https:"));
    return x.protocol === "https:" && HOSTS.test(x.hostname) ? x.toString() : null;
  } catch { return null; }
}

// "2026-11-28T21:00" in a zone -> the real instant
function zoned(y, mo, d, h, mi, s, tz) {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  if (!tz) return new Date(guess);
  const off = (t) => {
    try {
      const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
        .formatToParts(new Date(t)).filter((x) => x.type !== "literal").map((x) => [x.type, +x.value]));
      return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - t;
    } catch { return 0; }
  };
  let t = guess - off(guess); t = guess - off(t);
  return new Date(t);
}

function when(prop) {
  if (!prop) return null;
  const v = prop.value, tz = prop.params.TZID;
  let m = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
  if (m) return { date: `${m[1]}-${m[2]}-${m[3]}`, allDay: true, t: Date.UTC(+m[1], m[2] - 1, +m[3]) };
  m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(v);
  if (!m) return null;
  const d = m[7] ? new Date(Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6])) : zoned(+m[1], +m[2], +m[3], +m[4], +m[5], +m[6], tz);
  return { allDay: false, t: d.getTime() };
}

function unescape(s) { return String(s || "").replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1"); }

export function parseIcs(text) {
  const lines = String(text).replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "").split(/\r?\n/);
  const out = []; let ev = null;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") { ev = { ex: [] }; continue; }
    if (line === "END:VEVENT") { if (ev) out.push(ev); ev = null; continue; }
    if (!ev) continue;
    const i = line.indexOf(":"); if (i < 0) continue;
    const head = line.slice(0, i).split(";"), name = head[0].toUpperCase(), value = line.slice(i + 1);
    const params = {}; head.slice(1).forEach((p) => { const k = p.indexOf("="); if (k > 0) params[p.slice(0, k).toUpperCase()] = p.slice(k + 1).replace(/^"|"$/g, ""); });
    if (name === "EXDATE") value.split(",").forEach((v) => { const w = when({ value: v, params }); if (w) ev.ex.push(w.t); });
    else ev[name] = { value, params };
  }
  return out;
}

const DAYS = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

// every start of one event between t0 and t1 (DAILY / WEEKLY / MONTHLY repeats; others: first only)
function starts(ev, s, t0, t1) {
  const rr = ev.RRULE && Object.fromEntries(ev.RRULE.value.split(";").map((p) => p.split("=")));
  if (!rr) return s.t < t1 ? [s.t] : [];
  const step = Math.max(1, +rr.INTERVAL || 1), count = +rr.COUNT || 0;
  const until = rr.UNTIL ? (when({ value: rr.UNTIL, params: {} }) || {}).t || Infinity : Infinity;
  const byday = rr.BYDAY ? rr.BYDAY.split(",").map((d) => DAYS[d.slice(-2)]).filter((d) => d != null) : null;
  const out = []; let n = 0;
  for (let k = 0; k < 2000; k++) {
    let cands = [];
    const base = new Date(s.t);
    if (rr.FREQ === "DAILY") { const d = new Date(base); d.setUTCDate(d.getUTCDate() + k * step); cands = [d.getTime()]; }
    else if (rr.FREQ === "WEEKLY") {
      const wk = new Date(base); wk.setUTCDate(wk.getUTCDate() + k * 7 * step - wk.getUTCDay());
      (byday || [base.getUTCDay()]).slice().sort().forEach((dw) => { const d = new Date(wk); d.setUTCDate(d.getUTCDate() + dw); if (d.getTime() >= s.t) cands.push(d.getTime()); });
    } else if (rr.FREQ === "MONTHLY") { const d = new Date(base); d.setUTCMonth(d.getUTCMonth() + k * step); cands = [d.getTime()]; }
    else return s.t < t1 ? [s.t] : [];
    for (const t of cands) {
      if (t > until || (count && n >= count) || t >= t1) return out;
      n++;
      if (!ev.ex.includes(t)) out.push(t);
    }
  }
  return out;
}

export function expand(events, from, to, calendar) {
  const t0 = Date.parse(from + "T00:00:00Z") - 864e5, t1 = Date.parse(to + "T23:59:59Z") + 864e5, out = [];
  for (const ev of events) {
    if (ev["RECURRENCE-ID"]) continue; // moved single copies of a repeat: rare, skipped for now
    if (ev.STATUS && /CANCELLED/i.test(ev.STATUS.value)) continue;
    const s = when(ev.DTSTART); if (!s) continue;
    const e = when(ev.DTEND), dur = e ? Math.max(0, e.t - s.t) : (s.allDay ? 864e5 : 3600e3);
    const title = unescape(ev.SUMMARY && ev.SUMMARY.value) || "(no title)";
    const loc = unescape(ev.LOCATION && ev.LOCATION.value), desc = unescape(ev.DESCRIPTION && ev.DESCRIPTION.value);
    const link = /^https:\/\//.test(loc) ? loc : ((desc.match(/https:\/\/\S+/) || [])[0] || null);
    for (const t of starts(ev, s, t0, t1)) {
      if (t + dur < t0) continue;
      out.push({
        id: (ev.UID ? ev.UID.value : title) + "@" + t, title,
        start: s.allDay ? new Date(t).toISOString().slice(0, 10) : new Date(t).toISOString(),
        end: s.allDay ? new Date(t + dur).toISOString().slice(0, 10) : new Date(t + dur).toISOString(),
        allDay: s.allDay, link, calendar,
      });
    }
  }
  return out;
}
