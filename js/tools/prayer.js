/* prayer.js — prayer times worked out in the browser from where you are
   (owner, 2026-11-21: "get real time of salah depending on my location now").
   No outside service: the sun's position for the day and place gives each time,
   the same sums prayer apps use (praytimes.org method). Accurate to a minute or two.

   Method by country (from the device's time zone, which tracks where you are):
     UAE   (Asia/Dubai)   Fajr 18.2°, Isha 18.2°, Dhuhr +3 min, Maghrib +3 min (Awqaf / "Dubai")
     Egypt (Africa/Cairo) Fajr 19.5°, Isha 17.5°                (Egyptian General Authority)
     else                 Fajr 18°,   Isha 17°                  (Muslim World League)
   Asr: shadow = object + its noon shadow (Shafi'i / the majority).

   window.Prayer.times(date "YYYY-MM-DD", lat, lng, region?) ->
     { region, fajr, sunrise, dhuhr, asr, maghrib, isha }   each "HH:MM" in the device's local time */
(function () {
  "use strict";
  var RAD = Math.PI / 180, DEG = 180 / Math.PI;
  var sin = function (d) { return Math.sin(d * RAD); }, cos = function (d) { return Math.cos(d * RAD); }, tan = function (d) { return Math.tan(d * RAD); };
  var asin = function (x) { return Math.asin(x) * DEG; }, acos = function (x) { return Math.acos(Math.max(-1, Math.min(1, x))) * DEG; };
  var atan2 = function (y, x) { return Math.atan2(y, x) * DEG; }, acot = function (x) { return Math.atan(1 / x) * DEG; };
  var fix = function (a, b) { a = a - b * Math.floor(a / b); return a < 0 ? a + b : a; };

  var METHODS = {
    uae: { fajr: 18.2, isha: 18.2, adj: { dhuhr: 3, maghrib: 3 } },
    egypt: { fajr: 19.5, isha: 17.5, adj: {} },
    mwl: { fajr: 18, isha: 17, adj: {} },
  };

  function regionOf() {
    var tz = "";
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (e) {}
    if (tz === "Asia/Dubai") return "uae";
    if (tz === "Africa/Cairo") return "egypt";
    return "mwl";
  }

  function julian(y, m, d) {
    if (m <= 2) { y -= 1; m += 12; }
    var A = Math.floor(y / 100), B = 2 - A + Math.floor(A / 4);
    return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + B - 1524.5;
  }

  function sun(jd) {
    var D = jd - 2451545.0;
    var g = fix(357.529 + 0.98560028 * D, 360), q = fix(280.459 + 0.98564736 * D, 360);
    var L = fix(q + 1.915 * sin(g) + 0.020 * sin(2 * g), 360), e = 23.439 - 0.00000036 * D;
    var RA = fix(atan2(cos(e) * sin(L), cos(L)) / 15, 24);
    return { decl: asin(sin(e) * sin(L)), eqt: q / 15 - RA };
  }

  function times(date, lat, lng, region) {
    region = region || regionOf();
    var M = METHODS[region] || METHODS.mwl;
    var p = String(date).split("-").map(Number);
    var jd = julian(p[0], p[1], p[2]) - lng / (15 * 24);
    var noon = function (t) { return fix(12 - sun(jd + t).eqt, 24); };
    var angleTime = function (angle, t, before) {
      var s = sun(jd + t), n = noon(t);
      var x = acos((-sin(angle) - sin(s.decl) * sin(lat)) / (cos(s.decl) * cos(lat))) / 15;
      return n + (before ? -x : x);
    };
    var asrTime = function (t) {
      var s = sun(jd + t);
      return angleTime(-acot(1 + tan(Math.abs(lat - s.decl))), t);
    };
    // two passes: a first guess of each time, then again using that guess
    var t = { fajr: 5, sunrise: 6, dhuhr: 12, asr: 13, maghrib: 18, isha: 18 };
    for (var i = 0; i < 2; i++) {
      var d = {}; for (var k in t) d[k] = t[k] / 24;
      t = {
        fajr: angleTime(M.fajr, d.fajr, true),
        sunrise: angleTime(0.833, d.sunrise, true),
        dhuhr: noon(d.dhuhr),
        asr: asrTime(d.asr),
        maghrib: angleTime(0.833, d.maghrib),
        isha: angleTime(M.isha, d.isha),
      };
    }
    // apparent sun time -> the clock on this device for that day
    var tz = -new Date(p[0], p[1] - 1, p[2], 12).getTimezoneOffset() / 60;
    var out = { region: region };
    for (var key in t) {
      var h = t[key] + tz - lng / 15 + (M.adj[key] || 0) / 60;
      // rounded up (never call a prayer before its time), except sunrise: the end of Fajr, rounded down
      var m = fix(h, 24) * 60, mins = (key === "sunrise" ? Math.floor(m) : Math.ceil(m - 0.05)) % 1440;
      out[key] = String(Math.floor(mins / 60)).padStart(2, "0") + ":" + String(mins % 60).padStart(2, "0");
    }
    return out;
  }

  window.Prayer = { times: times, regionOf: regionOf, METHODS: METHODS };
})();
