// Quarterly category progress engine.
//
// A quarter runs from start_date to end_date; each category has a weekly-hour
// target, so its total target for the quarter is weekly_hours * (number of
// weeks in the range). Tasks tagged with a category count toward it once
// marked done, using their actual_hours. categoryProgress() replays a
// category's done tasks in date order to build the cumulative-hours timeline
// used for the progress chart, plus today's expected-vs-actual pace.

const DAY_MS = 86400000;

function toDate(d) {
  return new Date(`${String(d).slice(0, 10)}T00:00:00Z`);
}

function iso(d) {
  return d.toISOString().slice(0, 10);
}

function daysBetween(a, b) {
  return Math.round((b - a) / DAY_MS);
}

/** tasks: rows already filtered to this category, each { task_date, done, actual_hours } */
export function categoryProgress(category, tasks, quarterStart, quarterEnd, now = new Date()) {
  const start = toDate(quarterStart);
  const end = toDate(quarterEnd);
  const today = toDate(now);

  const weeks = (daysBetween(start, end) + 1) / 7;
  const target = Number(category.weekly_hours) * weeks;

  const done = tasks
    .filter((t) => t.done && Number(t.actual_hours) > 0)
    .map((t) => ({ date: toDate(t.task_date), hours: Number(t.actual_hours) }))
    .sort((a, b) => a.date - b.date);

  let running = 0;
  const timeline = done.map((t) => {
    running += t.hours;
    return { date: iso(t.date), cumulative: running };
  });
  const actual = running;

  const elapsedWeeks = Math.min(Math.max(daysBetween(start, today) + 1, 0), daysBetween(start, end) + 1) / 7;
  const expectedToDate = Number(category.weekly_hours) * Math.max(elapsedWeeks, 0);

  let pace = "on-track";
  if (today < start) pace = "not-started";
  else if (actual + 1e-9 < expectedToDate - Number(category.weekly_hours) * 0.5) pace = "behind";
  else if (actual > expectedToDate + Number(category.weekly_hours) * 0.5) pace = "ahead";

  return {
    target,
    actual,
    remaining: Math.max(target - actual, 0),
    expectedToDate,
    pace,
    timeline,
  };
}
