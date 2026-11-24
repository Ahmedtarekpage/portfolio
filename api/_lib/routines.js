// Repeating events and meetings on the day (owner, 2026-11-21: "recurring events like
// Google Calendar — prayer every day, azkar, sleeping, things on specific days every week;
// all meetings from the clients' schedule added to the day with their time, in my time zone").
//
// The model:
//   routines        — a rule: title, icon, category, optional from–to, the weekdays it repeats on
//                     (0 = Sun … 6 = Sat; all seven = every day), from a start date to an optional end.
//   tasks.auto_key  — "routine:<id>" / "meeting:<id>": the day's task a rule or a meeting made.
//   task_skips      — (date, auto_key): the person deleted that one on that day, so it isn't made again.
//
// A day is "synced" when it is opened (today or later, the page asks): each rule that falls on it
// makes its task once, a meeting that falls on it (in the viewer's time zone) makes or moves its task,
// and a meeting that moved away or was cancelled takes its unfinished task with it.
// Tasks already done are never changed. A task whose time was changed by hand (":hand") keeps it.
import { json } from "./util.js";

const PREP_MIN = 15;
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));
const hhmm = (v) => (v == null || v === "" ? null : /^([01]\d|2[0-3]):([0-5]\d)$/.test(String(v)) ? String(v) : false);
export function isZone(tz) {
  if (!tz || typeof tz !== "string" || tz.length > 64) return false;
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; } catch { return false; }
}
// "Africa/Cairo" -> "Cairo"
const city = (tz) => String(tz || "").split("/").pop().replace(/_/g, " ");
const fmt12 = (d, tz) => new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(d);
const hmIn = (d, tz) => new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
const dayIn = (d, tz) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

export async function ensureRoutineTables(sql) {
  await sql`CREATE TABLE IF NOT EXISTS routines (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    icon TEXT,
    category_id INTEGER REFERENCES quarter_categories(id) ON DELETE SET NULL,
    time_from TEXT,
    time_to TEXT,
    days INTEGER[] NOT NULL,
    start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    end_date DATE,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS task_skips (
    task_date DATE NOT NULL,
    auto_key TEXT NOT NULL,
    PRIMARY KEY (task_date, auto_key)
  )`;
  await sql`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS link TEXT`;
  await sql`CREATE INDEX IF NOT EXISTS tasks_auto_idx ON tasks (task_date, auto_key)`;
}

function readRoutine(b, existing) {
  const out = {};
  const title = b.title !== undefined ? String(b.title || "").trim().slice(0, 200) : existing?.title;
  if (!title) return { error: "Give it a name" };
  out.title = title;
  out.icon = b.icon !== undefined ? (b.icon ? String(b.icon).slice(0, 8) : null) : existing?.icon ?? null;
  out.category_id = b.category_id !== undefined ? (b.category_id ? Number(b.category_id) : null) : existing?.category_id ?? null;
  const from = b.time_from !== undefined ? hhmm(b.time_from) : existing?.time_from ?? null;
  const to = b.time_to !== undefined ? hhmm(b.time_to) : existing?.time_to ?? null;
  if (from === false || to === false) return { error: "Times must be HH:MM" };
  out.time_from = from; out.time_to = from ? to : null; // an end needs a start; an end before the start means overnight (sleep)
  const days = b.days !== undefined ? b.days : existing?.days;
  if (!Array.isArray(days) || !days.length) return { error: "Pick at least one day" };
  const clean = [...new Set(days.map(Number))].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6).sort();
  if (!clean.length) return { error: "Days must be 0 (Sun) to 6 (Sat)" };
  out.days = clean;
  out.start_date = b.start_date !== undefined ? (isDate(b.start_date) ? b.start_date : null) : existing?.start_date ?? null;
  out.end_date = b.end_date !== undefined ? (isDate(b.end_date) ? b.end_date : null) : existing?.end_date ?? null;
  out.active = b.active !== undefined ? b.active !== false : existing?.active ?? true;
  return out;
}

//   GET    /api/tasks?routines=1            -> { routines }
//   POST   /api/tasks?routines=1            -> { title, icon?, category_id?, time_from?, time_to?, days[], start_date?, end_date? }
//   PATCH  /api/tasks?routines=1&id=N       -> any of those, or { active }
//   DELETE /api/tasks?routines=1&id=N&from=YYYY-MM-DD  -> the rule, and its unfinished tasks from that day on
export async function handleRoutines(req, res, sql) {
  const id = Number(req.query.id);
  if (req.method === "GET") {
    const routines = await sql`SELECT *, start_date::text AS start_date, end_date::text AS end_date FROM routines ORDER BY time_from NULLS LAST, id`;
    return json(res, 200, { routines });
  }
  if (req.method === "POST") {
    const r = readRoutine(req.body || {});
    if (r.error) return json(res, 400, { error: r.error });
    const [row] = await sql`INSERT INTO routines (title, icon, category_id, time_from, time_to, days, start_date, end_date, active)
      VALUES (${r.title}, ${r.icon}, ${r.category_id}, ${r.time_from}, ${r.time_to}, ${r.days}::int[], COALESCE(${r.start_date}::date, CURRENT_DATE), ${r.end_date}::date, ${r.active})
      RETURNING *, start_date::text AS start_date, end_date::text AS end_date`;
    return json(res, 201, { routine: row });
  }
  if (!id) return json(res, 400, { error: "id is required" });
  const [existing] = await sql`SELECT *, start_date::text AS start_date, end_date::text AS end_date FROM routines WHERE id = ${id}`;
  if (!existing) return json(res, 404, { error: "Not found" });
  const from = isDate(req.query.from) ? String(req.query.from) : null;
  if (req.method === "PATCH") {
    const r = readRoutine(req.body || {}, existing);
    if (r.error) return json(res, 400, { error: r.error });
    const [row] = await sql`UPDATE routines SET title = ${r.title}, icon = ${r.icon}, category_id = ${r.category_id},
        time_from = ${r.time_from}, time_to = ${r.time_to}, days = ${r.days}::int[],
        start_date = COALESCE(${r.start_date}::date, start_date), end_date = ${r.end_date}::date, active = ${r.active}
      WHERE id = ${id} RETURNING *, start_date::text AS start_date, end_date::text AS end_date`;
    // the change reaches the days still to come: their unfinished copies are remade on the next open
    if (from) await sql`DELETE FROM tasks WHERE auto_key = ${"routine:" + id} AND task_date >= ${from}::date AND NOT done AND NOT half`;
    return json(res, 200, { routine: row });
  }
  if (req.method === "DELETE") {
    if (from) await sql`DELETE FROM tasks WHERE auto_key = ${"routine:" + id} AND task_date >= ${from}::date AND NOT done AND NOT half`;
    await sql`DELETE FROM routines WHERE id = ${id}`;
    return json(res, 200, { ok: true });
  }
  return json(res, 405, { error: "Method not allowed" });
}

// the weekday of a "YYYY-MM-DD" (0 = Sun)
const dow = (date) => new Date(date + "T12:00:00Z").getUTCDay();

/** Make the day's tasks from the rules and the meetings. Returns how many rows changed. */
export async function syncDay(sql, date, tz) {
  let changed = 0;
  const skips = new Set((await sql`SELECT auto_key FROM task_skips WHERE task_date = ${date}::date`).map((r) => r.auto_key));
  const have = await sql`SELECT id, auto_key, done, half, time_from, time_to, time_note, title, link FROM tasks WHERE task_date = ${date}::date AND auto_key IS NOT NULL`;
  const byKey = new Map(have.map((t) => [String(t.auto_key).replace(/:hand$/, ""), t]));

  // 1) the rules
  const rules = await sql`SELECT * FROM routines WHERE active AND start_date <= ${date}::date
    AND (end_date IS NULL OR end_date >= ${date}::date) AND ${dow(date)} = ANY(days)`;
  for (const r of rules) {
    const key = "routine:" + r.id;
    if (skips.has(key)) continue;
    const t = byKey.get(key);
    if (!t) {
      await sql`INSERT INTO tasks (task_date, title, icon, category_id, time_from, time_to, auto_key, position)
        VALUES (${date}::date, ${r.title}, ${r.icon}, ${r.category_id}, ${r.time_from}, ${r.time_to}, ${key},
          (SELECT COALESCE(MAX(position), -1) + 1 FROM tasks WHERE task_date = ${date}::date))`;
      changed++;
    }
  }

  // 2) the meetings that fall on this day where the viewer is
  if (isZone(tz)) {
    const ms = await sql`SELECT m.id, m.starts_at, m.duration_min, m.timezone, m.link, m.topic, c.name AS client_name
      FROM meetings m JOIN clients c ON c.id = m.client_id
      WHERE m.starts_at >= (${date}::date - 1)::timestamp AT TIME ZONE 'UTC' AND m.starts_at < (${date}::date + 2)::timestamp AT TIME ZONE 'UTC'`;
    const here = new Set();
    for (const m of ms) {
      const start = new Date(m.starts_at);
      if (dayIn(start, tz) !== date) continue;
      const key = "meeting:" + m.id;
      here.add(key);
      if (skips.has(key)) continue;
      const end = new Date(start.getTime() + (m.duration_min || 60) * 60000);
      const from = hmIn(start, tz), to = dayIn(end, tz) === date ? hmIn(end, tz) : "23:59";
      // the time it was arranged in, beside yours, when the two differ
      const theirs = m.timezone && m.timezone !== tz ? city(m.timezone) + " " + fmt12(start, m.timezone) : "";
      const note = [theirs, (m.duration_min || 60) + " min"].filter(Boolean).join(" · ").slice(0, 120);
      const title = ("Meeting: " + m.client_name + (m.topic ? " — " + m.topic : "")).slice(0, 300);
      // 15 minutes to get ready before it (owner, 2026-11-21)
      const pk = "prep:" + m.id, pf = new Date(start.getTime() - PREP_MIN * 60000);
      here.add(pk);
      if (!skips.has(pk) && dayIn(pf, tz) === date) {
        const pt = byKey.get(pk), pFrom = hmIn(pf, tz), pTitle = ("Prep: " + m.client_name).slice(0, 300);
        if (!pt) {
          await sql`INSERT INTO tasks (task_date, title, icon, time_from, time_to, time_note, auto_key, position)
            VALUES (${date}::date, ${pTitle}, ${"📝"}, ${pFrom}, ${from}, ${"before the meeting"}, ${pk},
              (SELECT COALESCE(MAX(position), -1) + 1 FROM tasks WHERE task_date = ${date}::date))`;
          changed++;
        } else if (!pt.done && !pt.half && !/:hand$/.test(pt.auto_key) && (pt.time_from !== pFrom || pt.time_to !== from || pt.title !== pTitle)) {
          await sql`UPDATE tasks SET time_from = ${pFrom}, time_to = ${from}, title = ${pTitle} WHERE id = ${pt.id}`;
          changed++;
        }
      }
      const t = byKey.get(key);
      if (!t) {
        await sql`INSERT INTO tasks (task_date, title, icon, time_from, time_to, time_note, link, auto_key, position)
          VALUES (${date}::date, ${title}, ${"🗣️"}, ${from}, ${to}, ${note}, ${m.link || null}, ${key},
            (SELECT COALESCE(MAX(position), -1) + 1 FROM tasks WHERE task_date = ${date}::date))`;
        changed++;
      } else if (!t.done && !t.half && !/:hand$/.test(t.auto_key) &&
        (t.time_from !== from || t.time_to !== to || t.time_note !== note || t.title !== title || (t.link || null) !== (m.link || null))) {
        await sql`UPDATE tasks SET time_from = ${from}, time_to = ${to}, time_note = ${note}, title = ${title}, link = ${m.link || null} WHERE id = ${t.id}`;
        changed++;
      }
    }
    // moved to another day, or cancelled: its unfinished task goes too
    for (const t of have) {
      const k = String(t.auto_key).replace(/:hand$/, "");
      if ((k.startsWith("meeting:") || k.startsWith("prep:")) && !here.has(k) && !t.done && !t.half) {
        await sql`DELETE FROM tasks WHERE id = ${t.id}`;
        changed++;
      }
    }
  }
  return changed;
}

/** A deleted automatic task stays deleted on that day. */
export async function rememberSkips(sql, rows) {
  for (const r of rows) {
    if (!r.auto_key) continue;
    const key = String(r.auto_key).replace(/:hand$/, "");
    await sql`INSERT INTO task_skips (task_date, auto_key) VALUES (${r.task_date}::date, ${key}) ON CONFLICT DO NOTHING`;
  }
}

/** Everything a calendar needs between two days: the tasks, the rules, the skips, the meetings. */
export async function rangeData(sql, from, to, tz) {
  const tasks = await sql`SELECT t.*, t.task_date::text AS task_date, c.name AS category_name FROM tasks t
    LEFT JOIN quarter_categories c ON c.id = t.category_id
    WHERE t.task_date BETWEEN ${from}::date AND ${to}::date ORDER BY t.task_date, t.time_from NULLS LAST, t.position`;
  const routines = await sql`SELECT *, start_date::text AS start_date, end_date::text AS end_date FROM routines WHERE active`;
  const skips = await sql`SELECT task_date::text AS date, auto_key FROM task_skips WHERE task_date BETWEEN ${from}::date AND ${to}::date`;
  let meetings = [];
  if (isZone(tz)) {
    const ms = await sql`SELECT m.id, m.starts_at, m.duration_min, m.timezone, m.link, m.topic, c.name AS client_name
      FROM meetings m JOIN clients c ON c.id = m.client_id
      WHERE m.starts_at >= (${from}::date - 1)::timestamp AT TIME ZONE 'UTC' AND m.starts_at < (${to}::date + 2)::timestamp AT TIME ZONE 'UTC'
      ORDER BY m.starts_at`;
    meetings = ms.map((m) => {
      const s = new Date(m.starts_at), e = new Date(s.getTime() + (m.duration_min || 60) * 60000), d = dayIn(s, tz);
      const pf = new Date(s.getTime() - PREP_MIN * 60000);
      return { id: m.id, date: d, from: hmIn(s, tz), prep: dayIn(pf, tz) === d ? hmIn(pf, tz) : null, client: m.client_name, to: dayIn(e, tz) === d ? hmIn(e, tz) : "23:59", title: "Meeting: " + m.client_name + (m.topic ? " — " + m.topic : ""),
        note: m.timezone && m.timezone !== tz ? city(m.timezone) + " " + fmt12(s, m.timezone) : "", link: m.link || null };
    }).filter((m) => m.date >= from && m.date <= to);
  }
  return { tasks, routines, skips, meetings };
}

export { isDate };
