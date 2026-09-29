/* Scheduled meetings, as both /admin and the client's share page show them.

   A meeting is an instant plus the zone it was arranged in. Nothing here ever
   assumes whose clock it is: every function that prints a time takes the zone
   to print it in. The admin passes the zone they chose (or the device's), the
   share page passes the device's — so the same meeting reads 6:00 PM in Dubai
   and 5:00 PM in Istanbul, and "today" means today where the reader is.

   Exposes window.Meet. */
(function () {
  "use strict";

  var DAY_MS = 86400000;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /* ---------------- zones ---------------- */

  function isZone(tz) {
    if (!tz) return false;
    try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; } catch (e) { return false; }
  }

  function deviceZone() {
    try {
      var tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      return isZone(tz) ? tz : "UTC";
    } catch (e) { return "UTC"; }
  }

  var partsCache = {};
  function parts(date, tz) {
    var f = partsCache[tz] || (partsCache[tz] = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hourCycle: "h23",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    }));
    var p = {};
    f.formatToParts(date).forEach(function (x) { p[x.type] = Number(x.value); });
    return p;
  }

  function offsetMs(date, tz) {
    var p = parts(date, tz);
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(date.getTime() / 1000) * 1000;
  }

  /* "2026-10-01T18:00" on the wall in tz -> the instant. Looked up twice: the
     first guess can fall on the other side of a daylight-saving change. */
  function zonedToUtc(local, tz) {
    var m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(local || ""));
    if (!m || !isZone(tz)) return null;
    var wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
    var utc = wall - offsetMs(new Date(wall), tz);
    utc = wall - offsetMs(new Date(utc), tz);
    return new Date(utc);
  }

  /* the instant, as date and time fields would hold it in tz */
  function localFields(date, tz) {
    var p = parts(date, tz);
    var two = function (n) { return String(n).padStart(2, "0"); };
    return { date: p.year + "-" + two(p.month) + "-" + two(p.day), time: two(p.hour) + ":" + two(p.minute) };
  }

  function city(tz) {
    return String(tz || "UTC").split("/").pop().replace(/_/g, " ");
  }

  function offsetLabel(tz, date) {
    try {
      var p = new Intl.DateTimeFormat("en-GB", { timeZone: tz, timeZoneName: "shortOffset" })
        .formatToParts(date || new Date())
        .filter(function (x) { return x.type === "timeZoneName"; })[0];
      return p ? p.value : "GMT";
    } catch (e) { return "GMT"; }
  }

  function zoneLabel(tz, date) {
    return city(tz) + " · " + offsetLabel(tz, date);
  }

  var COMMON = [
    "Africa/Cairo", "Asia/Dubai", "Asia/Riyadh", "Asia/Kuwait", "Asia/Qatar", "Asia/Muscat",
    "Europe/Istanbul", "Europe/London", "Europe/Berlin", "America/New_York", "America/Los_Angeles",
    "Asia/Kolkata", "Asia/Singapore", "Australia/Sydney", "UTC",
  ];

  var allZonesCache = null;
  function allZones() {
    if (allZonesCache) return allZonesCache;
    var list = [];
    try { list = Intl.supportedValuesOf("timeZone"); } catch (e) { list = COMMON.slice(); }
    if (list.indexOf("UTC") === -1) list = list.concat(["UTC"]);
    allZonesCache = list.filter(isZone);
    return allZonesCache;
  }

  /* Fills a <select> with every zone, the likely ones first. `pinned` are the
     zones this particular screen has reason to expect — the admin's own, the
     client's last one. `first` is an optional leading option such as the
     "automatic" choice in settings. */
  function fillZoneSelect(select, selected, pinned, first) {
    var now = new Date();
    var opt = function (tz) {
      return '<option value="' + esc(tz) + '">' + esc(city(tz) + " (" + offsetLabel(tz, now) + ")") + "</option>";
    };
    var seen = {};
    var top = (pinned || []).concat(COMMON).filter(function (tz) {
      if (!isZone(tz) || seen[tz]) return false;
      seen[tz] = true;
      return true;
    });
    var groups = {};
    allZones().forEach(function (tz) {
      var region = tz.indexOf("/") === -1 ? "Other" : tz.split("/")[0];
      (groups[region] = groups[region] || []).push(tz);
    });
    var html = first ? '<option value="' + esc(first.value) + '">' + esc(first.label) + "</option>" : "";
    html += '<optgroup label="Suggested">' + top.map(opt).join("") + "</optgroup>";
    Object.keys(groups).sort().forEach(function (region) {
      var zones = groups[region].slice().sort(function (a, b) { return city(a).localeCompare(city(b)); });
      html += '<optgroup label="' + esc(region) + '">' + zones.map(opt).join("") + "</optgroup>";
    });
    select.innerHTML = html;
    if (selected) select.value = selected;
    if (!select.value && select.options.length) select.selectedIndex = 0;
  }

  /* ---------------- saying when ---------------- */

  function fmt(date, tz, opts, locale) {
    opts.timeZone = tz;
    return new Intl.DateTimeFormat(locale || "en-GB", opts).format(date);
  }

  function fmtTime(date, tz) {
    return fmt(date, tz, { hour: "numeric", minute: "2-digit", hour12: true }, "en-US");
  }

  /* whole calendar days from now to date, as tz's own calendar counts them */
  function dayDiff(date, now, tz) {
    var a = parts(date, tz), b = parts(now, tz);
    return Math.round((Date.UTC(a.year, a.month - 1, a.day) - Date.UTC(b.year, b.month - 1, b.day)) / DAY_MS);
  }

  function dayLabel(date, now, tz) {
    var d = dayDiff(date, now, tz);
    if (d === 0) return "Today";
    if (d === 1) return "Tomorrow";
    if (d === -1) return "Yesterday";
    if (d > 1 && d < 7) return fmt(date, tz, { weekday: "long" });
    return fmt(date, tz, { weekday: "short", day: "numeric", month: "short" });
  }

  function span(ms) {
    var mins = Math.max(1, Math.round(ms / 60000));
    if (mins < 60) return mins + " min";
    var h = Math.floor(mins / 60), m = mins % 60;
    if (h < 24) return h + "h" + (m ? " " + m + "m" : "");
    var d = Math.floor(h / 24), rh = h % 24;
    return d + "d" + (rh ? " " + rh + "h" : "");
  }

  /* "live" while it is running, otherwise which side of now it is on */
  function status(m, now) {
    var start = new Date(m.starts_at).getTime();
    var end = start + m.duration_min * 60000;
    var t = now.getTime();
    if (t >= start && t < end) return "live";
    return t < start ? "upcoming" : "past";
  }

  function relative(m, now) {
    var start = new Date(m.starts_at).getTime();
    var end = start + m.duration_min * 60000;
    var t = now.getTime();
    if (t < start) return "in " + span(start - t);
    if (t < end) return span(end - t) + " left";
    return span(t - end) + " ago";
  }

  function platform(link) {
    var l = String(link || "").toLowerCase();
    if (/(^|\/\/|\.)zoom\.(us|com)\b/.test(l)) return "Zoom";
    if (/\/\/meet\.google\.com\b/.test(l)) return "Google Meet";
    if (/teams\.(microsoft|live)\.com\b/.test(l)) return "Microsoft Teams";
    return null;
  }

  function safeLink(link) {
    return /^https?:\/\//i.test(String(link || "")) ? String(link) : null;
  }

  /* the one a page should lead with: what is on now, else what is next, else
     what has just been — "yesterday" is still worth saying */
  function focus(meetings, now) {
    var live = meetings.filter(function (m) { return status(m, now) === "live"; });
    if (live.length) return live[0];
    var next = meetings
      .filter(function (m) { return status(m, now) === "upcoming"; })
      .sort(function (a, b) { return new Date(a.starts_at) - new Date(b.starts_at); });
    if (next.length) return next[0];
    var past = meetings
      .filter(function (m) { return now - new Date(m.starts_at) < 2 * DAY_MS; })
      .sort(function (a, b) { return new Date(b.starts_at) - new Date(a.starts_at); });
    return past[0] || null;
  }

  /* ---------------- the card ----------------
     opts.tz        the zone to print in (required)
     opts.otherTz   a second zone worth stating — the client's, on the admin side
     opts.otherName whose zone that is ("Abdallah")
     opts.who       { name, avatarHtml } to show whose meeting it is; the name
                    is a button carrying data-act="open"
     opts.hero      the large, leading version
     opts.actions   extra HTML for the card's foot (edit/delete buttons)
     opts.reminders show which reminder emails have gone out
     opts.seriesOf  function (m) -> { n, total } when m is one of a repeating series */
  function cardHtml(m, now, opts) {
    var tz = opts.tz;
    var start = new Date(m.starts_at);
    var end = new Date(start.getTime() + m.duration_min * 60000);
    var st = status(m, now);
    var diff = dayDiff(start, now, tz);
    var tone = st === "live" ? "live" : st === "past" ? "past" : diff === 0 ? "today" : diff === 1 ? "tomorrow" : "later";
    var label = st === "live" ? "Happening now" : dayLabel(start, now, tz);
    var link = safeLink(m.link);
    var app = platform(link);

    var html = '<article class="meet meet--' + tone + (opts.hero ? " meet--hero" : "") + '" data-id="' + Number(m.id) + '">';
    html += '<div class="meet__cal" aria-hidden="true">' +
      '<span class="meet__mon">' + esc(fmt(start, tz, { month: "short" })) + "</span>" +
      '<span class="meet__day">' + esc(fmt(start, tz, { day: "numeric" })) + "</span>" +
      '<span class="meet__dow">' + esc(fmt(start, tz, { weekday: "short" })) + "</span></div>";

    html += '<div class="meet__body">';
    html += '<div class="meet__top"><span class="pill pill--' + tone + '">' +
      (st === "live" ? '<i class="pill__dot"></i>' : "") + esc(label) + "</span>" +
      '<span class="meet__rel">' + esc(relative(m, now)) + "</span>";
    var ser = opts.seriesOf ? opts.seriesOf(m) : null;
    if (ser) html += '<span class="meet__series" title="Part of a repeating series">↻ ' + Number(ser.n) + " of " + Number(ser.total) + "</span>";
    html += "</div>";

    if (opts.who) {
      html += '<button type="button" class="meet__who" data-act="open" title="Open ' + esc(opts.who.name) + '">' +
        (opts.who.avatarHtml || "") + "<strong>" + esc(opts.who.name) + "</strong></button>";
    }

    html += '<div class="meet__time">' + esc(fmtTime(start, tz)) + " – " + esc(fmtTime(end, tz)) +
      ' <span class="meet__zone">' + esc(zoneLabel(tz, start)) + "</span></div>";

    if (opts.otherTz && isZone(opts.otherTz) && offsetMs(start, opts.otherTz) !== offsetMs(start, tz)) {
      // across the date line the same meeting is on a different day for them
      var sameDay = localFields(start, opts.otherTz).date === localFields(start, tz).date;
      html += '<div class="meet__sub">' + esc((opts.otherName ? opts.otherName + "'s time: " : "Their time: ") +
        (sameDay ? "" : fmt(start, opts.otherTz, { weekday: "short", day: "numeric", month: "short" }) + ", ") +
        fmtTime(start, opts.otherTz) + " · " + zoneLabel(opts.otherTz, start)) + "</div>";
    }

    if (m.topic) html += '<div class="meet__topic">' + esc(m.topic) + "</div>";

    html += '<div class="meet__foot">';
    if (link && st !== "past") {
      html += '<a class="btn ' + (st === "live" || tone === "today" ? "btn--primary" : "btn--ghost") + ' btn--sm meet__join" href="' + esc(link) +
        '" target="_blank" rel="noopener noreferrer">' + esc(app ? "Join on " + app : "Join meeting") + "</a>";
      if (opts.copy) html += '<button type="button" class="btn btn--ghost btn--sm" data-act="copy">Copy link</button>';
    } else if (!link && st !== "past") {
      html += '<span class="meet__nolink">' + esc(opts.noLinkText || "Link to follow") + "</span>";
    }
    if (opts.reminders && st === "upcoming") {
      html += '<span class="meet__mail">' +
        esc("Reminders: 1 day " + (m.remind_day_at ? "sent" : "pending") + " · 2h " + (m.remind_2h_at ? "sent" : "pending")) + "</span>";
    }
    if (opts.actions) html += '<span class="meet__actions">' + opts.actions(m, st) + "</span>";
    html += "</div></div></article>";
    return html;
  }

  window.Meet = {
    esc: esc,
    isZone: isZone,
    deviceZone: deviceZone,
    zonedToUtc: zonedToUtc,
    localFields: localFields,
    city: city,
    offsetLabel: offsetLabel,
    zoneLabel: zoneLabel,
    fillZoneSelect: fillZoneSelect,
    fmt: fmt,
    fmtTime: fmtTime,
    dayDiff: dayDiff,
    dayLabel: dayLabel,
    status: status,
    relative: relative,
    platform: platform,
    focus: focus,
    cardHtml: cardHtml,
  };
})();
