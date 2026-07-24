// Pure calendar math for the Year > Virtual-Year > Cycle > Quarter system.
//
// Every real calendar year splits into 4 virtual years (Y1-Y4) of 90 days
// each, starting from Jan 1 with no manual date entry: Cycle A (42 days,
// containing Q1+Q2) + Cycle B (42 days, containing Q3+Q4) + a 6-day break.
// 4*90 = 360, so the last ~5-6 days of the real year fall outside any cycle
// ("year-end-buffer"). Everything here is a pure function of a date — the
// schedule needs no database row.

const DAY_MS = 86400000;
const CYCLE_DAYS = 42;
const BREAK_DAYS = 6;
const QUARTER_DAYS = 21;
const VY_DAYS = CYCLE_DAYS * 2 + BREAK_DAYS; // 90

function toDate(iso) {
  return new Date(`${String(iso).slice(0, 10)}T00:00:00Z`);
}

function addDays(d, n) {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + n);
  return out;
}

function iso(d) {
  return d.toISOString().slice(0, 10);
}

function daysBetween(a, b) {
  return Math.round((b - a) / DAY_MS);
}

/** Full breakdown of the system's schedule for a given date. */
export function cycleInfo(dateISO) {
  const date = toDate(dateISO);
  const realYear = date.getUTCFullYear();
  const yearStart = toDate(`${realYear}-01-01`);
  const dayOfYear = daysBetween(yearStart, date); // 0-indexed

  const virtualYear = Math.floor(dayOfYear / VY_DAYS) + 1;
  if (virtualYear > 4) {
    return {
      realYear, virtualYear: null, phase: "year-end-buffer",
      cycleLetter: null, cycleKey: null, cycleStart: null, cycleEnd: null,
      quarterNumber: null, quarterStart: null, quarterEnd: null, dayOfYear,
    };
  }

  const vyStart = addDays(yearStart, (virtualYear - 1) * VY_DAYS);
  const offset = dayOfYear - (virtualYear - 1) * VY_DAYS; // 0-89

  let phase, cycleLetter, cycleOffset, cycleStart;
  if (offset < CYCLE_DAYS) {
    phase = "cycle"; cycleLetter = "A"; cycleOffset = offset;
    cycleStart = vyStart;
  } else if (offset < CYCLE_DAYS * 2) {
    phase = "cycle"; cycleLetter = "B"; cycleOffset = offset - CYCLE_DAYS;
    cycleStart = addDays(vyStart, CYCLE_DAYS);
  } else {
    phase = "break"; cycleLetter = null; cycleOffset = offset - CYCLE_DAYS * 2;
    cycleStart = addDays(vyStart, CYCLE_DAYS * 2);
  }

  const cycleKey = phase === "cycle" ? `${realYear}-VY${virtualYear}-${cycleLetter}` : null;
  const cycleEnd = phase === "cycle"
    ? addDays(cycleStart, CYCLE_DAYS - 1)
    : addDays(cycleStart, BREAK_DAYS - 1);

  let quarterNumber = null, quarterStart = null, quarterEnd = null;
  if (phase === "cycle") {
    const secondHalf = cycleOffset >= QUARTER_DAYS ? 1 : 0;
    quarterNumber = (cycleLetter === "A" ? 1 : 3) + secondHalf;
    quarterStart = addDays(cycleStart, secondHalf * QUARTER_DAYS);
    quarterEnd = addDays(quarterStart, QUARTER_DAYS - 1);
  }

  return {
    realYear, virtualYear, phase, cycleLetter, cycleKey,
    cycleStart: iso(cycleStart), cycleEnd: iso(cycleEnd),
    quarterNumber, quarterStart: quarterStart && iso(quarterStart), quarterEnd: quarterEnd && iso(quarterEnd),
    dayOfYear,
  };
}

/** Parse a cycleKey like "2026-VY3-A" back into its start/end dates. */
export function cycleBounds(cycleKey) {
  const m = /^(\d{4})-VY([1-4])-([AB])$/.exec(String(cycleKey || ""));
  if (!m) return null;
  const realYear = Number(m[1]);
  const virtualYear = Number(m[2]);
  const cycleLetter = m[3];
  const yearStart = toDate(`${realYear}-01-01`);
  const vyStart = addDays(yearStart, (virtualYear - 1) * VY_DAYS);
  const cycleStart = cycleLetter === "A" ? vyStart : addDays(vyStart, CYCLE_DAYS);
  const cycleEnd = addDays(cycleStart, CYCLE_DAYS - 1);
  return { realYear, virtualYear, cycleLetter, start: iso(cycleStart), end: iso(cycleEnd) };
}

/** The two 21-day quarters contained in a cycle, e.g. Cycle A -> [Q1, Q2]. */
export function cycleQuarters(cycleKey) {
  const bounds = cycleBounds(cycleKey);
  if (!bounds) return [];
  const q1Number = bounds.cycleLetter === "A" ? 1 : 3;
  const start = toDate(bounds.start);
  return [0, 1].map((half) => {
    const qStart = addDays(start, half * QUARTER_DAYS);
    const qEnd = addDays(qStart, QUARTER_DAYS - 1);
    return { number: q1Number + half, start: iso(qStart), end: iso(qEnd) };
  });
}

export function isEditable(cycleKey, dateISO) {
  const bounds = cycleBounds(cycleKey);
  if (!bounds) return false;
  return bounds.end >= String(dateISO || "").slice(0, 10);
}

function label(info) {
  if (info.phase === "year-end-buffer") return "Year-end buffer";
  if (info.phase === "break") return `Y${info.virtualYear} Break`;
  return `Y${info.virtualYear} Cycle ${info.cycleLetter}`;
}

/** Cycles around today for the picker: a few past, the current, a couple future. */
export function listCycles(dateISO, { past = 3, future = 2 } = {}) {
  const today = String(dateISO || "").slice(0, 10);
  const info = cycleInfo(today);

  // walk backwards/forwards from today's cycle (or, if in a break/buffer, from
  // the nearest surrounding cycles) by stepping the anchor date across cycle
  // boundaries — simplest robust way given cycles aren't evenly spaced with breaks.
  const anchorDate = info.phase === "cycle" ? toDate(info.cycleStart) : toDate(today);
  const seen = new Map();
  let probe = addDays(anchorDate, -(past + 2) * (CYCLE_DAYS + 1));
  const limit = addDays(anchorDate, (future + 2) * (CYCLE_DAYS + 1));
  while (probe <= limit) {
    const pInfo = cycleInfo(iso(probe));
    if (pInfo.cycleKey && !seen.has(pInfo.cycleKey)) {
      seen.set(pInfo.cycleKey, {
        cycleKey: pInfo.cycleKey,
        label: label(pInfo),
        start: pInfo.cycleStart,
        end: pInfo.cycleEnd,
        editable: pInfo.cycleEnd >= today,
        current: today >= pInfo.cycleStart && today <= pInfo.cycleEnd,
      });
    }
    probe = addDays(probe, 1);
  }

  const all = Array.from(seen.values()).sort((a, b) => (a.start < b.start ? -1 : 1));
  const currentIdx = all.findIndex((c) => c.current);
  const centerIdx = currentIdx >= 0 ? currentIdx : all.findIndex((c) => c.start > today);
  const from = Math.max(0, (centerIdx >= 0 ? centerIdx : 0) - past);
  const to = Math.min(all.length, (centerIdx >= 0 ? centerIdx : all.length - 1) + future + 1);
  return all.slice(from, to);
}
