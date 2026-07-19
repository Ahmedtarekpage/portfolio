// Hours-balance engine.
//
// A client buys packages of hours; each package expires on its expires_at date
// (last usable day). Sessions consume hours from the package that expires
// soonest (FIFO by expiry). Whatever is left in a package after its expiry
// date is lost ("expired hours").
//
// computeClient() replays every purchase / session / expiry in date order and
// returns the running balance timeline (used for the graph) plus totals.
// Future events (upcoming expiries) are included in the timeline so the graph
// can project them, but totals reflect the state as of today.

const KIND_ORDER = { purchase: 0, session: 1, expiry: 2 };

/** 'YYYY-MM-DD' (or Date) -> UTC-midnight Date */
function toDate(d) {
  if (d instanceof Date) return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  return new Date(`${String(d).slice(0, 10)}T00:00:00Z`);
}

function iso(d) {
  return d.toISOString().slice(0, 10);
}

export function computeClient(packages, sessions, now = new Date()) {
  const today = toDate(now);

  const pkgs = packages.map((p) => ({
    id: p.id,
    hours: Number(p.hours),
    remaining: Number(p.hours),
    purchased: toDate(p.purchased_at),
    expires: toDate(p.expires_at),
  }));

  const events = [];
  for (const p of pkgs) {
    events.push({ t: p.purchased, kind: "purchase", pkg: p });
    events.push({ t: p.expires, kind: "expiry", pkg: p });
  }
  for (const s of sessions) {
    events.push({ t: toDate(s.session_date), kind: "session", hours: Number(s.hours), topic: s.topic, id: s.id });
  }
  events.sort((a, b) => a.t - b.t || KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);

  let balance = 0;
  let snapshot = null; // state as of today, captured before the first future event
  const asOfToday = { used: 0, expired: 0, overdraft: 0 };
  const timeline = [];

  const takeSnapshot = () => {
    if (!snapshot) {
      snapshot = {
        balance,
        remaining: pkgs.map((p) => ({ id: p.id, remaining: p.remaining, expires: p.expires })),
      };
    }
  };

  for (const ev of events) {
    const future = ev.t > today;
    if (future) takeSnapshot();

    if (ev.kind === "purchase") {
      balance += ev.pkg.hours;
      timeline.push({
        date: iso(ev.t), balance, kind: "purchase", delta: ev.pkg.hours,
        label: `Bought ${fmt(ev.pkg.hours)}h`, future, packageId: ev.pkg.id,
      });
    } else if (ev.kind === "session") {
      let needed = ev.hours;
      // consume from the package that expires soonest and is active on that day
      const active = pkgs
        .filter((p) => p.remaining > 0 && p.purchased <= ev.t && p.expires >= ev.t)
        .sort((a, b) => a.expires - b.expires);
      for (const p of active) {
        if (needed <= 0) break;
        const take = Math.min(p.remaining, needed);
        p.remaining -= take;
        needed -= take;
      }
      const consumed = ev.hours - needed;
      balance -= consumed;
      if (!future) {
        asOfToday.used += consumed;
        if (needed > 0) asOfToday.overdraft += needed;
      }
      timeline.push({
        date: iso(ev.t), balance, kind: "session", delta: -ev.hours,
        label: `Session${ev.topic ? ` — ${ev.topic}` : ""} (−${fmt(ev.hours)}h)`,
        future, sessionId: ev.id, uncovered: needed > 0 ? needed : 0,
      });
    } else {
      // expiry: whatever is left in this package is gone after its last usable day
      if (ev.pkg.remaining > 0) {
        const lost = ev.pkg.remaining;
        ev.pkg.remaining = 0;
        balance -= lost;
        if (!future) asOfToday.expired += lost;
        timeline.push({
          date: iso(ev.t), balance, kind: "expiry", delta: -lost,
          label: `${fmt(lost)}h expired`, future, packageId: ev.pkg.id,
        });
      }
    }
  }
  takeSnapshot(); // no future events -> snapshot is the final state

  // next upcoming expiry that will actually lose hours (based on today's remaining)
  let nextExpiry = null;
  for (const p of snapshot.remaining
    .filter((p) => p.expires >= today && p.remaining > 0)
    .sort((a, b) => a.expires - b.expires)) {
    nextExpiry = { date: iso(p.expires), hours: p.remaining };
    break;
  }

  return {
    timeline,
    totals: {
      purchased: pkgs.reduce((s, p) => s + p.hours, 0),
      used: asOfToday.used,
      expired: asOfToday.expired,
      overdraft: asOfToday.overdraft,
      available: snapshot.balance,
      nextExpiry,
    },
  };
}

function fmt(n) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
