// One-off: give goals a past in goal_log.
//
// goal_log only began recording when the daily goals line shipped, so every goal
// that already had progress got a single reading on that day and nothing before
// it. The dates that progress really happened on were never stored anywhere, so
// they can't be recovered — this estimates them instead, so the Days graph has a
// line through the past rather than starting mid-quarter.
//
// The estimate follows the shape of the work actually done. A goal advances in
// proportion to the tasks finished each day: quickly through productive days,
// not at all through days with nothing ticked off. Tasks in the goal's own
// category pull harder than the rest, since "Cashflow" goals move on days of
// Cashflow work. Only when there is no task data at all in a goal's window does
// it fall back to an even spread — with no signal, there is no shape to follow.
// It is deterministic: the same tasks give the same past on every run.
//
// Every row written here is estimated = true. The chart draws that stretch
// dashed and the tooltip says "estimated", so it is never mistaken for recorded
// history, and `DELETE FROM goal_log WHERE estimated` removes all of it.
//
// Runs once per version, claimed through app_flags, so concurrent cold starts
// can't both write it. v2 replaces v1's random spread with this one.

const FLAG = "goal_history_backfill_v2";
const DAY = 86400000;
const OWN_CATEGORY_WEIGHT = 3; // a task in the goal's category counts 1 + 3 = 4x

function addDays(iso, n) {
  return new Date(Date.parse(iso + "T00:00:00Z") + n * DAY).toISOString().slice(0, 10);
}

function daysFrom(from, to) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * The estimated rows for one goal. Its value on each day is endValue scaled by
 * the share of the window's effort done by then, so it only rises, rises in step
 * with the work, and lands on endValue exactly once the effort is spent. Whole-
 * unit goals stay whole — a 1/1 milestone flips on the day half the window's
 * work is behind it. Only days where the value changes are written; the reader
 * carries each value forward.
 *
 * weights: { "YYYY-MM-DD": effort } — missing or zero means no work that day.
 */
export function estimateFromEffort(days, endValue, weights) {
  if (!days.length) return [];
  const total = Number(endValue) || 0;
  const isInt = Number.isInteger(total);
  let W = days.reduce((a, d) => a + (weights[d] || 0), 0);
  const hasSignal = W > 0;
  if (!hasSignal) W = days.length; // nothing to follow: even spread
  const weightOf = (d) => (hasSignal ? weights[d] || 0 : 1);

  const rows = [];
  let cum = 0, last = null;
  days.forEach((d, i) => {
    cum += weightOf(d);
    let v = cum >= W || i === days.length - 1 ? total : (total * cum) / W;
    v = isInt ? Math.round(v) : round2(v);
    if (i === 0 || v !== last) { rows.push({ day: d, current: v }); last = v; }
  });
  return rows;
}

export async function backfillGoalHistory(sql) {
  await sql`CREATE TABLE IF NOT EXISTS app_flags (
    key TEXT PRIMARY KEY,
    done_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  const claimed = await sql`INSERT INTO app_flags (key) VALUES (${FLAG}) ON CONFLICT DO NOTHING RETURNING key`;
  if (!claimed.length) return;

  try {
    const goals = await sql`
      SELECT g.id, g.category_id, g.created_at::date::text AS created,
             q.start_date::text AS q_start, q.end_date::text AS q_end
      FROM goals g
      JOIN quarter_categories c ON c.id = g.category_id
      JOIN quarters q ON q.id = c.quarter_id`;
    // each goal's first real reading: where the estimate has to arrive by
    const firsts = await sql`
      SELECT DISTINCT ON (goal_id) goal_id, day::text AS day, current, target
      FROM goal_log WHERE NOT estimated
      ORDER BY goal_id, day`;
    const firstBy = new Map(firsts.map((r) => [r.goal_id, r]));

    // tasks finished per day, overall and per category
    const done = await sql`
      SELECT task_date::text AS day, category_id, COUNT(*)::int AS n
      FROM tasks WHERE done
      GROUP BY task_date, category_id`;
    const allByDay = {}, catByDay = {};
    for (const r of done) {
      allByDay[r.day] = (allByDay[r.day] || 0) + r.n;
      if (r.category_id != null) {
        const m = (catByDay[r.category_id] = catByDay[r.category_id] || {});
        m[r.day] = (m[r.day] || 0) + r.n;
      }
    }

    const ids = [], dayCol = [], currents = [], targets = [];
    for (const g of goals) {
      const first = firstBy.get(g.id);
      if (!first) continue;
      // from whichever came later, the quarter or the goal, to the day before
      // the first real reading — and never past the quarter's own end
      const from = g.created > g.q_start ? g.created : g.q_start;
      const lastBefore = addDays(first.day, -1);
      const to = lastBefore < g.q_end ? lastBefore : g.q_end;
      if (to < from) continue; // created on or after logging began: its history is real

      const days = daysFrom(from, to);
      const own = catByDay[g.category_id] || {};
      const weights = {};
      for (const d of days) weights[d] = (allByDay[d] || 0) + OWN_CATEGORY_WEIGHT * (own[d] || 0);

      for (const r of estimateFromEffort(days, first.current, weights)) {
        ids.push(g.id); dayCol.push(r.day); currents.push(r.current); targets.push(first.target);
      }
    }

    // Out with any earlier estimate, in with this one, as one transaction: the
    // graph never sees a past that is half v1's random spread and half this.
    // One INSERT over UNNEST rather than a request per row.
    await sql.transaction([
      sql`DELETE FROM goal_log WHERE estimated`,
      sql`
        INSERT INTO goal_log (goal_id, day, current, target, estimated)
        SELECT t.goal_id, t.day, t.current, t.target, true
        FROM UNNEST(${ids}::int[], ${dayCol}::date[], ${currents}::numeric[], ${targets}::numeric[])
          AS t(goal_id, day, current, target)
        ON CONFLICT (goal_id, day) DO NOTHING`,
    ]);
  } catch (e) {
    // hand the flag back so the next cold start tries again, rather than
    // failing every request or leaving a half-written past marked as done
    await sql`DELETE FROM app_flags WHERE key = ${FLAG}`;
    console.error("goal history backfill failed", e);
  }
}
