// One-off: give goals a past in goal_log.
//
// goal_log only began recording when the daily goals line shipped, so every goal
// that already had progress got a single reading on that day and nothing before
// it. The dates that progress really happened on were never stored anywhere, so
// they can't be recovered — this spreads each goal's progress across random days
// between when the goal was created and its first real reading instead, so the
// Days graph has a line through the past rather than starting mid-quarter.
//
// Every row written here is estimated = true. The chart draws that stretch
// dashed and the tooltip says "estimated", so it is never mistaken for recorded
// history, and `DELETE FROM goal_log WHERE estimated` removes all of it.
//
// Runs once, claimed through app_flags, so concurrent cold starts can't both
// write it and a later deploy never re-randomises a past already drawn.

const FLAG = "goal_history_backfill_v1";
const DAY = 86400000;
const MAX_STEPS = 30; // a 500-unit goal becomes 30 rises, not 500 one-unit ones

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
 * The estimated rows for one goal: a reading of 0 on the first day of the
 * window, then `endValue` reached in random steps on random days, never going
 * down, finishing at exactly `endValue` no later than the last day.
 * `rand` is injectable so the spread can be tested deterministically.
 */
export function estimateSteps(days, endValue, rand = Math.random) {
  if (!days.length) return [];
  const rows = new Map([[days[0], 0]]); // known from the start, at nothing yet
  const total = Number(endValue) || 0;
  if (total <= 0) return [...rows].map(([day, current]) => ({ day, current }));

  // A 1/1 goal is one moment; 28 litres can be 28 separate days. Never more
  // steps than days to put them on.
  const units = Number.isInteger(total) ? total : Math.ceil(total);
  const steps = Math.max(1, Math.min(units, days.length, MAX_STEPS));

  // distinct random days, in order
  const pool = days.map((_, i) => i);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const picked = pool.slice(0, steps).sort((a, b) => a - b);

  // whole-unit goals rise by whole units; the last step lands on endValue exactly
  picked.forEach((idx, k) => {
    const share = (k + 1) / steps;
    const v = Number.isInteger(total) ? Math.round(total * share) : round2(total * share);
    rows.set(days[idx], k === steps - 1 ? total : v);
  });
  return [...rows].map(([day, current]) => ({ day, current }));
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
      SELECT g.id, g.created_at::date::text AS created,
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
      for (const r of estimateSteps(daysFrom(from, to), first.current)) {
        ids.push(g.id); dayCol.push(r.day); currents.push(r.current); targets.push(first.target);
      }
    }
    if (ids.length) {
      // one statement for the lot — a row per request would be hundreds of round trips
      await sql`
        INSERT INTO goal_log (goal_id, day, current, target, estimated)
        SELECT t.goal_id, t.day, t.current, t.target, true
        FROM UNNEST(${ids}::int[], ${dayCol}::date[], ${currents}::numeric[], ${targets}::numeric[])
          AS t(goal_id, day, current, target)
        ON CONFLICT (goal_id, day) DO NOTHING`;
    }
  } catch (e) {
    // hand the flag back so the next cold start tries again, rather than
    // failing every request or leaving a half-written past marked as done
    await sql`DELETE FROM app_flags WHERE key = ${FLAG}`;
    console.error("goal history backfill failed", e);
  }
}
