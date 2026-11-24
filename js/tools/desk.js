/* Product desk — /desk.

   One inbox for every bug, request and idea across all products, and a rule
   for when each one is allowed to take coding time. It exists because a solo
   builder with several live products fixes whatever was mentioned last, and
   the day disappears into code that nobody was waiting for.

   The rules, in the order they are applied (see grade() and plan()):

   1. Severity ladder. Something that stops people paying, signing in, or that
      loses data is grade 1 and is fixed the day it is logged, on any product.
   2. Batching. Every other real defect is grade 2 and waits for the weekly
      fix day (Saturday by default). Context switching is the cost being
      avoided: one protected day instead of twenty interruptions.
   3. Demand gate. A feature or idea is grade 3 ("later") until enough paying
      customers have asked for it (three by default); then it is promoted to
      grade 2. Unrequested ideas expire after 30 days instead of piling up.
   4. Ordering inside the fix day is weighted shortest job first: the value
      of fixing it divided by the hours it takes. Value is who it reaches and
      who raised it, scaled by how bad it is (a defect: no way round it, how
      often; a feature: what it is expected to move), by whether customers
      may leave over it, and halved when the only evidence is a guess; then
      customers who asked, a near deadline and weeks waited are added on.
   5. Capacity. A fix day holds a fixed number of hours. What does not fit
      rolls to the next one; nothing is squeezed in.
   6. Maintenance products get grade 1 fixes like any other, but their grade 2
      work is limited to one hour, on the first fix day of the month.

   Storage follows /finance: on the site the whole state is one JSON document
   behind the passkey (api/ideas.js?desk=data); served from a local folder it
   lives in this browser's localStorage, so the page works with no server. */
(function () {
  "use strict";

  var T = window.T || function (en) { return en; };
  var I18N = window.I18N || { ar: false, loc: function (l) { return l || "en-GB"; } };

  var KEY = "desk.v1";
  var LOCAL = /^(localhost|127\.0\.0\.1|\[::1\]|)$/.test(location.hostname);
  var API = "/api/ideas?desk=data";
  var rev = "";
  var saveTimer = null;

  /* ---------- dates: local calendar days as YYYY-MM-DD ---------- */

  function pad(n) { return n < 10 ? "0" + n : "" + n; }
  function ymd(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function parse(s) { var p = s.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function addDays(s, n) { var d = parse(s); d.setDate(d.getDate() + n); return ymd(d); }
  function daysBetween(a, b) { return Math.round((parse(b) - parse(a)) / 86400000); }
  function today() { return ymd(new Date()); }
  function nice(s) {
    return parse(s).toLocaleDateString(I18N.loc("en-GB"), { weekday: "short", day: "numeric", month: "short" });
  }

  /* ---------- state ---------- */

  function seed() {
    return {
      v: 1,
      settings: { fixDay: 6, fixHours: 6, laterDays: 30, promoteAt: 3, maintHours: 1 },
      products: [
        { id: "gobachaloria", name: "GoBachaloria", mode: "active", metric: "Paying students", metricAr: "طلاب دافعين", category: "EdTech · exam prep", target: "Egyptian baccalaureate students and their parents", country: "EG", model: "b2c", who: "student", age: "u18", cares: ["results", "price"], channels: ["whatsapp", "facebook", "tiktok"], statsUrl: "https://gobachaloria.com/api/desk/stats", statsUse: "paying", logoUrl: "https://gobachaloria.com/brand/icon-192.png" },
        { id: "techmakerz", name: "Techmakerz", mode: "active", metric: "Seats booked", metricAr: "مقاعد محجوزة", category: "EdTech · robotics courses", target: "Parents of children in the UAE", country: "AE", model: "b2c", who: "parent", age: "35-44", cares: ["results", "trust"], channels: ["instagram", "tiktok"], statsUrl: "https://techmakerz.com/api/desk/stats", statsUse: "paying", logoUrl: "https://techmakerz.com/brand/logo-avatar.svg" },
        { id: "ashrhly", name: "Ashrhly", mode: "maintenance", metric: "Active users", metricAr: "مستخدمين نشطين", category: "EdTech · AI tutoring", target: "Learners in the UAE", country: "AE", model: "b2c", who: "student", age: "mixed", cares: ["results", "ease"], channels: ["instagram"], statsUrl: "https://ashrhly.com/api/desk/stats", statsUse: "paying", logoUrl: "https://ashrhly.com/brand/ashrhly-icon-color.svg" },
        { id: "elhsab", name: "Elhsab", mode: "maintenance", metric: "Paying clients", metricAr: "عملاء دافعين", category: "Management systems", target: "Café and restaurant owners", country: "", model: "b2b", who: "owner", age: "mixed", cares: ["time", "price"], channels: ["whatsapp"], statsUrl: "https://elhsab.com/api/desk/stats", statsUse: "paying", logoUrl: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='22' fill='%23101112'/%3E%3Cg transform='translate(10 10) scale(.8)'%3E%3Ccircle cx='50' cy='50' r='21' fill='none' stroke='%23FFC83D' stroke-width='11'/%3E%3Cg fill='none' stroke='%23FF5A2B' stroke-width='10' stroke-linecap='round'%3E%3Cpath d='M32.47 14.05A40 40 0 0 1 67.53 14.05'/%3E%3Cpath d='M85.95 32.47A40 40 0 0 1 85.95 67.53'/%3E%3Cpath d='M67.53 85.95A40 40 0 0 1 32.47 85.95'/%3E%3Cpath d='M14.05 67.53A40 40 0 0 1 14.05 32.47'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E" },
        { id: "brand", name: "Personal brand", mode: "active", metric: "Inbound messages", metricAr: "رسايل جاتلك", category: "Content", target: "Companies hiring a product manager", country: "AE", model: "b2b", who: "manager", age: "mixed", cares: ["trust", "results"], channels: ["linkedin"], logoUrl: "/logo/icon-192.png" }
      ],
      // the weekly shape of a working day; day 0 is Sunday
      // The shape of a week for one person running several products and a personal brand
      // (owner, Nov 2026): each kind of work gets its own day so nothing is done in scraps.
      // Content rhythm behind it: three videos a week in each language. The published
      // analyses agree that going from one post a week to two to five gives the biggest
      // lift per post and that more than that mostly buys more chances, at a cost a solo
      // owner cannot keep up; three is the number that survives a bad week.
      //   English: LinkedIn (Mon, Wed, Thu) and the same three on Instagram.
      //   Arabic: TikTok (Sun, Tue, Thu).
      // `every`: a block that comes round every so many weeks, counted from `from`.
      blocksVer: 3,
      blocks: [
        { days: [0, 1, 2, 3, 4], from: "09:00", to: "10:00", en: "Customers first: replies, calls, follow-ups. No code.", ar: "العملاء الأول: ردود، مكالمات، متابعة. من غير كود." },
        { days: [0], from: "10:00", to: "13:00", en: "Selling day: call GoBachaloria's paying students first (the only product with real buyers), then leads for the others", ar: "يوم البيع: كلّم الطلبة الدافعين في GoBachaloria الأول (المنتج الوحيد اللي فيه مشترين بجد)، وبعدهم المهتمين بالباقي" },
        { days: [0], from: "14:00", to: "16:00", en: "Plan the week: tickets, numbers, and pick this week's story (one real problem you solved)", ar: "خطة الأسبوع: التذاكر، الأرقام، واختار حكاية الأسبوع (مشكلة حقيقية حلّيتها)" },
        { days: [1], from: "10:00", to: "14:00", every: 3, from0: "2026-11-30", en: "Script day (every 3 weeks): 12 ideas, 9 scripts in English and Arabic. Mix: 4 GoBachaloria, 2 Techmakerz, 2 Ashrhly, 1 your own tools", ar: "يوم السكريبتات (كل 3 أسابيع): 12 فكرة، 9 سكريبتات إنجليزي وعربي. التوزيع: 4 GoBachaloria، 2 Techmakerz، 2 Ashrhly، 1 أدواتك الشخصية" },
        { days: [1], from: "10:00", to: "13:00", en: "Build: GoBachaloria, screen recording on (script day takes this slot every third week)", ar: "بناء: GoBachaloria وتسجيل الشاشة شغال (يوم السكريبتات بياخد الخانة دي كل تالت أسبوع)" },
        { days: [1], from: "14:00", to: "17:00", en: "Build: GoBachaloria first, then Techmakerz. Keep the screen recording: it is next week's footage", ar: "بناء: GoBachaloria الأول وبعده Techmakerz. سيب تسجيل الشاشة شغال: ده فيديو الأسبوع الجاي" },
        { days: [2], from: "10:00", to: "13:00", en: "Shooting day: 6 videos in one sitting (3 English for LinkedIn and Instagram, 3 Arabic for TikTok)", ar: "يوم التصوير: 6 فيديوهات في قعدة واحدة (3 إنجليزي لـLinkedIn وInstagram، 3 عربي لـTikTok)" },
        { days: [2], from: "14:00", to: "17:00", en: "Build: GoBachaloria and Techmakerz", ar: "بناء: GoBachaloria وTechmakerz" },
        { days: [3], from: "10:00", to: "15:00", en: "Voice-over, montage, then schedule next week's 6 videos", ar: "تعليق صوتي ومونتاج، وبعدها جدولة 6 فيديوهات الأسبوع الجاي" },
        { days: [3], from: "15:00", to: "17:00", en: "Search day (Google and AI answers): one page that answers one real question, for this week's product. Finish one topic before starting another", ar: "يوم البحث (جوجل وإجابات الذكاء الاصطناعي): صفحة واحدة بتجاوب سؤال حقيقي واحد لمنتج الأسبوع. خلّص موضوع قبل ما تبدأ التاني" },
        { days: [4], from: "10:00", to: "12:00", en: "Content waterfall, GoBachaloria: one main piece, AI cuts it into 4 posts, schedule them", ar: "شلال المحتوى، GoBachaloria: قطعة رئيسية واحدة، الذكاء الاصطناعي يقطّعها 4 بوستات، وجدولهم" },
        { days: [4], from: "12:00", to: "13:00", every: 2, from0: "2026-11-26", en: "Content waterfall, Techmakerz (every 2 weeks): one main piece into 4 posts", ar: "شلال المحتوى، Techmakerz (كل أسبوعين): قطعة رئيسية تتقطّع 4 بوستات" },
        { days: [4], from: "12:00", to: "13:00", every: 2, from0: "2026-12-03", en: "Content waterfall, Ashrhly (every 2 weeks): one main piece into 4 posts", ar: "شلال المحتوى، Ashrhly (كل أسبوعين): قطعة رئيسية تتقطّع 4 بوستات" },
        { days: [4], from: "13:00", to: "14:00", en: "Read the week's numbers and the graph. Elhesab once a month: call 5 cafes instead of posting", ar: "اقرا أرقام الأسبوع والرسم. Elhesab مرة في الشهر: كلّم 5 كافيهات بدل البوستات" },
        { days: [4], from: "14:00", to: "16:00", en: "Money and admin: invoices, subscriptions, renewals", ar: "الفلوس والإداريات: فواتير، اشتراكات، تجديدات" },
        { days: [0, 1, 2, 3, 4], from: "18:00", to: "18:30", en: "Answer comments and messages on today's posts", ar: "رد على التعليقات والرسايل على بوستات النهارده" },
        { days: [6], from: "09:00", to: "15:00", en: "Fix day: the queue below, top to bottom. Record the screen: the best fix is next week's story", ar: "يوم التصليح: الطابور اللي تحت بالترتيب. سجّل الشاشة: أحسن تصليح هو حكاية الأسبوع الجاي", fix: true }
      ],
      items: [],
      numbers: {}
    };
  }

  var S = seed();

  function adopt(doc) {
    var base = seed();
    if (!doc || typeof doc !== "object") return base;
    base.settings = Object.assign(base.settings, doc.settings || {});
    if (Array.isArray(doc.products) && doc.products.length) {
      // a desk saved before products had a category and an audience picks up the defaults for those
      var defaults = {};
      base.products.forEach(function (d) { defaults[d.id] = d; });
      base.products = doc.products.map(function (q) {
        var d = defaults[q.id] || {};
        ["category", "target", "country", "model", "who", "age", "statsUse"].forEach(function (k) { if (q[k] == null) q[k] = d[k] || ""; });
        // an address or a logo that arrived in a later version fills an empty one too: an earlier save
        // wrote "" for what it did not know yet, and that must not shut the product out for good
        ["statsUrl", "logoUrl"].forEach(function (k) { if (!q[k]) q[k] = d[k] || ""; });
        ["cares", "channels"].forEach(function (k) { if (!Array.isArray(q[k])) q[k] = (d[k] || []).slice(); });
        return q;
      });
    }
    var FIRST_WEEK = ["Selling and content. No code.", "Techmakerz videos", "GoBachaloria lessons and product", "Write the weekly numbers", "PM job applications and referrals", "Fix day: the queue below, top to bottom"];
    var untouched = Array.isArray(doc.blocks) && doc.blocks.length === FIRST_WEEK.length && doc.blocks.every(function (b, i) { return b && b.en === FIRST_WEEK[i]; });
    // the second default week (content days) gives way to the third (waterfall and search days) only if it was never edited
    var SECOND_WEEK = ["Customers first: replies, calls, follow-ups. No code.", "Selling day: call paying customers, chase leads, ask for referrals", "Plan the week: tickets, numbers, what ships", "Script day (every 3 weeks): 12 ideas, write 9 scripts, each in English and Arabic", "Build: GoBachaloria (script day takes this slot every third week)", "Build: GoBachaloria and Techmakerz", "Shooting day: 6 videos in one sitting (3 English, 3 Arabic)", "Build: GoBachaloria and Techmakerz", "Voice-over, montage, then schedule next week's 6 videos", "Company pages (not the personal brand): write and schedule 2 posts per product", "Read the week's numbers and the graph", "Money and admin: invoices, subscriptions, renewals", "Answer comments and messages on today's posts", "Fix day: the queue below, top to bottom"];
    var untouched2 = doc.blocksVer === 2 && Array.isArray(doc.blocks) && doc.blocks.length === SECOND_WEEK.length && doc.blocks.every(function (b, i) { return b && b.en === SECOND_WEEK[i]; });
    if (Array.isArray(doc.blocks) && doc.blocks.length && !untouched2 && (doc.blocksVer >= 2 || !untouched)) base.blocks = doc.blocks;
    base.blocksVer = 3;
    if (Array.isArray(doc.items)) base.items = doc.items;
    if (doc.numbers && typeof doc.numbers === "object") base.numbers = doc.numbers;
    base.captured = doc.captured || null;         // the last scheduled weekly capture: { week, at, ids }
    base.capturedSeen = doc.capturedSeen || 0;    // the capture the owner has already been told about
    if (doc.week && typeof doc.week === "object") base.week = doc.week; // the owner's week, edited on /time; carried through untouched
    base.seq = +doc.seq || 0; // last ticket number handed out
    base.stats = doc.stats && typeof doc.stats === "object" ? doc.stats : {}; // per week, per product: { users, paying } as fetched
    return base;
  }

  function load(done) {
    if (LOCAL) {
      try { S = adopt(JSON.parse(localStorage.getItem(KEY) || "null")); } catch (e) { S = seed(); }
      return done();
    }
    fetch(API, { cache: "no-store" }).then(function (r) {
      // not signed in: /time is where the passkey prompt lives
      if (r.status === 401) { location.replace("/time"); return null; }
      rev = r.headers.get("X-Rev") || "";
      return r.status === 404 ? {} : r.json();
    }).then(function (doc) {
      if (doc === null) return;
      S = adopt(doc);
      done();
    }).catch(function () {
      toast(T("Could not load the desk. Showing an empty one; nothing will be saved over your data.", "المكتب ما اتحمّلش. ده مكتب فاضي ومش هيتحفظ فوق بياناتك."), true);
      rev = "offline";
      done();
    });
  }

  function save() {
    if (LOCAL) {
      try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast(T("Could not save in this browser.", "ما اتحفظش في المتصفح ده."), true); }
      return;
    }
    if (rev === "offline") return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      fetch(API, { method: "PUT", headers: { "Content-Type": "application/json", "If-Match": rev }, body: JSON.stringify(S) })
        .then(function (r) {
          var next = r.headers.get("X-Rev");
          if (r.status === 409) {
            // another tab or device saved first: take its version rather than overwrite it
            if (next) rev = next;
            return r.json().then(function (doc) {
              S = adopt(doc);
              render();
              toast(T("This desk was changed on another device. Showing that version; redo your last change.", "المكتب اتغيّر من جهاز تاني. دي النسخة الأحدث؛ عيد آخر تعديل."), true);
            });
          }
          if (!r.ok) throw new Error("save " + r.status);
          if (next) rev = next;
        })
        .catch(function () { toast(T("Not saved. Check the connection.", "ما اتحفظش. شوف النت."), true); });
    }, 400);
  }

  /* ---------- the rules ---------- */

  function product(id) {
    for (var i = 0; i < S.products.length; i++) if (S.products[i].id === id) return S.products[i];
    return { id: id, name: id, mode: "active" };
  }

  /** 1 = fix today, 2 = fix day, 3 = later. */
  function grade(it) {
    if (it.blocks && it.blocks !== "none") return 1;
    if (it.kind === "bug") return 2;
    return (it.requests || 0) >= S.settings.promoteAt ? 2 : 3;
  }

  var REACH = { one: 1, few: 3, most: 5 };
  var SOURCE = { payer: 3, user: 2, me: 1 };

  var FREQ = { always: 1, sometimes: 0.75, rare: 0.5 };
  var OUTCOME = { fresh: 3, keep: 2, nice: 1 };
  var PROOF = { message: 1, data: 1, guess: 0.5 };
  var DEADLINE = { week: 10, month: 3, none: 0 };

  /** Points for a date it must be ready by: 10 inside a week (or already late), 3 inside a month. */
  function dueBonus(it, now) {
    if (!it.due) return DEADLINE[it.deadline] || 0; // items logged before dates were picked from a calendar
    var d = daysBetween(now, it.due);
    return d <= 7 ? 10 : d <= 31 ? 3 : 0;
  }

  /** Value of doing it, before effort is taken into account. Missing answers count as neutral. */
  function value(it, now) {
    var v = (REACH[it.reach] || 1) * (SOURCE[it.source] || 1);
    if (it.kind === "bug") v *= (it.workaround ? 1 : 2) * (FREQ[it.freq] || 1);
    else v *= OUTCOME[it.outcome] || 1;
    if (it.churn) v *= 1.5;
    v *= PROOF[it.proof] || 1;
    v += Math.min(it.requests || 0, 5);
    v += dueBonus(it, now);
    v += Math.floor(Math.max(0, daysBetween(it.created, now)) / 7); // a week waiting is worth a point, so nothing starves
    return v;
  }

  /** Weighted shortest job first: value per hour of work. */
  function score(it, now) {
    return value(it, now) / Math.max(0.25, +it.effort || 1);
  }

  /** Is this block on in the week of `day`? Weekly blocks always; an every-N block in its own weeks, counted from `from0`. */
  function blockOn(b, day) {
    if (!(b.every > 1)) return true;
    var anchor = b.from0 || day, weeks = Math.floor(daysBetween(anchor, day) / 7);
    return weeks >= 0 && weeks % b.every === 0;
  }

  function nextFixDay(from) {
    var d = from;
    for (var i = 0; i < 7; i++) {
      if (parse(d).getDay() === S.settings.fixDay) return d;
      d = addDays(d, 1);
    }
    return from;
  }

  function firstOfMonth(day) { return parse(day).getDate() <= 7; }

  /**
   * Lays the open grade 2 work over the coming fix days.
   * Returns { days: [{ date, hours, items: [...] }], when: { itemId: date } }.
   */
  function plan(now) {
    var open = S.items.filter(function (it) { return it.status === "open" && grade(it) === 2; });
    open.sort(function (a, b) { return score(b, now) - score(a, now) || (a.created < b.created ? -1 : 1); });

    var days = [], when = {}, left = open.slice();
    var day = nextFixDay(now);
    for (var n = 0; n < 12 && left.length; n++) {
      var slot = { date: day, hours: 0, items: [] };
      var maint = {};
      var rest = [];
      for (var i = 0; i < left.length; i++) {
        var it = left[i], h = Math.max(0.25, +it.effort || 1), p = product(it.product);
        var fits = slot.hours + h <= S.settings.fixHours || !slot.items.length; // a job longer than the day still gets a day
        if (p.mode === "maintenance") {
          var used = maint[p.id] || 0;
          if (!firstOfMonth(day) || (used + h > S.settings.maintHours && used > 0)) fits = false;
          if (fits) maint[p.id] = used + h;
        }
        if (fits) { slot.items.push(it); slot.hours += h; when[it.id] = day; }
        else rest.push(it);
      }
      if (slot.items.length) days.push(slot);
      left = rest;
      day = addDays(day, 7);
    }
    return { days: days, when: when, unplaced: left };
  }

  /** The moment a grade 3 item is dropped: its shelf life after the last time a customer asked. */
  function expiresAt(it) {
    var base = it.touchedAt || parse(it.touched || it.created).getTime();
    return base + S.settings.laterDays * 86400000;
  }

  /** Grade 3 items past their shelf life are dropped, not deleted: they can be brought back. */
  function expire(now) {
    var changed = false;
    S.items.forEach(function (it) {
      if (it.status === "open" && grade(it) === 3 && Date.now() >= expiresAt(it)) {
        it.status = "dropped"; it.closed = now; it.why = "expired"; changed = true;
      }
    });
    if (changed) save();
  }

  /* ---------- small helpers ---------- */

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return "&#" + c.charCodeAt(0) + ";"; }); }
  function hours(h) {
    var H = S.settings.fixHours;
    if (h > H) { // longer than one fix day: say it in days
      var dd = Math.floor(h / H), rr = Math.round((h - dd * H) * 100) / 100;
      return dd + T(" d", " يوم") + (rr ? " " + hours(rr) : "");
    }
    if (h < 1) return Math.round(h * 60) + T(" min", " د");
    var whole = Math.floor(h), mins = Math.round((h - whole) * 60);
    return whole + T(" h", " س") + (mins ? " " + mins + T(" min", " د") : ""); // 1.25 reads as "1 h 15 min"
  }
  var toastTimer = null;
  function toast(msg, bad) {
    var el = $("toast");
    el.textContent = msg;
    el.className = "toast" + (bad ? " toast--error" : "");
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, bad ? 6000 : 2600);
  }
  /* Sound: a few soft sine notes, quiet enough to sit under music. Off is remembered. */
  var SOUND_KEY = "desk.sound", muted = false, audio = null;
  try { muted = localStorage.getItem(SOUND_KEY) === "off"; } catch (e) {}
  var NOTES = { tap: [620], next: [520, 780], good: [523, 659, 784], warn: [392, 311] };
  function sfx(kind) {
    if (muted) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      var t = audio.currentTime;
      (NOTES[kind] || NOTES.tap).forEach(function (f, i) {
        var o = audio.createOscillator(), g = audio.createGain(), at = t + i * 0.075;
        o.type = "sine"; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, at);
        g.gain.exponentialRampToValueAtTime(0.03, at + 0.012); // deliberately quiet
        g.gain.exponentialRampToValueAtTime(0.0001, at + 0.17);
        o.connect(g); g.connect(audio.destination);
        o.start(at); o.stop(at + 0.19);
      });
    } catch (e) { /* no audio here: stay silent */ }
  }
  function paintSound() {
    var b = $("btnSound");
    if (!b) return;
    b.textContent = muted ? "🔇" : "🔊";
    b.setAttribute("aria-label", muted ? T("Turn sound on", "شغّل الصوت") : T("Turn sound off", "اقفل الصوت"));
    b.title = b.getAttribute("aria-label");
  }

  /** A picture on a raised, glossy tile; purely decorative, so it is hidden from screen readers. */
  function ico(e, cls) { return '<span class="desk-ico' + (cls ? " " + cls : "") + '" aria-hidden="true">' + e + "</span>"; }

  /** Hours of work as a clock reading, 1.5 -> "01:30". */
  function clock(h) { var m = Math.round(h * 60); return pad(Math.floor(m / 60)) + ":" + pad(m % 60); }

  /** A product's logo, or its initial on a tile whose colour comes from its name. */
  function logo(q, cls) {
    cls = "desk-logo" + (cls ? " " + cls : "");
    // only images this page made itself are ever stored, but check again before using one as a src
    if (typeof q.logo === "string" && q.logo.indexOf("data:image/") === 0) return '<img class="' + cls + '" alt="" src="' + esc(q.logo) + '">';
    // no logo chosen: the company's own mark from its site; if that cannot be loaded the letter tile takes over (see the "error" listener)
    if (typeof q.logoUrl === "string" && /^(https:\/\/|\/|data:image\/)/.test(q.logoUrl)) {
      return '<img class="' + cls + '" alt="" src="' + esc(q.logoUrl) + '" referrerpolicy="no-referrer" data-letter="' + esc((q.name || "?").charAt(0).toUpperCase()) + '">';
    }
    var hue = 0, name = q.name || "?", i;
    for (i = 0; i < name.length; i++) hue = (hue * 31 + name.charCodeAt(i)) % 360;
    return '<span class="' + cls + ' desk-logo--txt" style="--h:' + (198 + hue % 26) + '" aria-hidden="true">' + esc(name.charAt(0).toUpperCase()) + "</span>";
  }

  /** Time to a moment, or how late it is once the moment has passed. */
  function untilText(end) {
    var left = end - Date.now();
    return left >= 0 ? fmtLeft(left) : T("late by ", "متأخرة ") + fmtLeft(-left);
  }

  // every countdown on the desk runs to the second
  function fmtLeft(ms) {
    var sec = Math.max(0, Math.floor(ms / 1000));
    var d = Math.floor(sec / 86400), h = Math.floor(sec % 86400 / 3600), m = Math.floor(sec % 3600 / 60), x = sec % 60;
    return I18N.ar ? d + " يوم " + pad(h) + ":" + pad(m) + ":" + pad(x) : d + "d " + pad(h) + "h " + pad(m) + "m " + pad(x) + "s";
  }

  // what each countdown last showed, by ticket, so a repaint starts from there and only real changes flip
  var cdSeen = {};

  function cdParts(end) {
    var sec = Math.floor(Math.abs(end - Date.now()) / 1000);
    return [pad(Math.floor(sec / 86400)), pad(Math.floor(sec % 86400 / 3600)), pad(Math.floor(sec % 3600 / 60)), pad(sec % 60)];
  }

  /**
   * A countdown as four split-flap cards: days, hours, minutes, seconds. Each card is
   * two fixed halves; a change is shown by a flap falling over them (flipTo).
   * They are drawn with what was last shown, and tick() flips them to now.
   */
  function cdCells(end, key) {
    var was = cdSeen[key] && cdSeen[key].length === 4 ? cdSeen[key] : ["00", "00", "00", "00"];
    var labels = [T("days", "يوم"), T("hrs", "ساعة"), T("min", "دقيقة"), T("sec", "ثانية")];
    return was.map(function (v, i) {
      return '<span class="desk-flip" data-v="' + v + '"><i class="desk-flip__card"><b class="desk-flip__top"><u>' + v + '</u></b><b class="desk-flip__bot"><u>' + v + "</u></b></i><small>" + esc(labels[i]) + "</small></span>";
    }).join("");
  }

  /** Flips one card to a new reading: the old top half falls away, the new bottom half lands. */
  function flipTo(cell, val) {
    var old = cell.getAttribute("data-v");
    if (old === val) return;
    cell.setAttribute("data-v", val);
    var card = cell.firstChild, top = card.querySelector(".desk-flip__top u"), bot = card.querySelector(".desk-flip__bot u");
    if (calm) { top.textContent = bot.textContent = val; return; }
    var stale = card.querySelectorAll(".desk-flip__flap");
    for (var i = 0; i < stale.length; i++) card.removeChild(stale[i]); // a flip still in flight is cut short
    top.textContent = val; // revealed as the old top falls
    var f1 = document.createElement("b"), f2 = document.createElement("b");
    f1.className = "desk-flip__flap desk-flip__flap--top"; f1.innerHTML = "<u>" + old + "</u>";
    f2.className = "desk-flip__flap desk-flip__flap--bot"; f2.innerHTML = "<u>" + val + "</u>";
    card.appendChild(f1); card.appendChild(f2);
    setTimeout(function () {
      bot.textContent = val;
      if (f1.parentNode === card) card.removeChild(f1);
      if (f2.parentNode === card) card.removeChild(f2);
    }, 640);
  }

  /** The count of paying customers behind an item, with a button either side to change it. */
  function stepper(it) {
    var n = it.requests || 0;
    var label = it.kind === "bug" ? T(" reported", " بلّغوا") : T(" asked", " طلبوها");
    return '<span class="desk-step" title="' + esc(T("Paying customers behind this", "عدد الدافعين اللي وراها")) + '">' +
      '<button type="button" data-act="less" data-id="' + it.id + '" aria-label="' + esc(T("One fewer", "واحد أقل")) + '"' + (n ? "" : " disabled") + ">−</button>" +
      "<b>" + n + esc(label) + "</b>" +
      '<button type="button" data-act="more" data-id="' + it.id + '" aria-label="' + esc(T("One more", "واحد كمان")) + '">+</button></span>';
  }

  /** The countdown on a grade 3 item: time left before it is dropped, and how far it is from being promoted. */
  function timerRow(it) {
    var end = expiresAt(it), total = S.settings.laterDays * 86400000, left = Math.max(0, end - Date.now());
    return '<div class="desk-timer">' +
      '<span class="desk-timer__left">' + esc(T("Dropped in ", "هتتشال بعد ")) + '<b dir="ltr" data-expires="' + end + '">' + fmtLeft(left) + "</b></span>" +
      '<span class="desk-timer__need">' + (it.requests || 0) + " / " + S.settings.promoteAt + esc(T(" paying customers asked", " دافعين طلبوها")) + "</span>" +
      '<span class="desk-timer__bar"><i data-bar="' + end + '" style="width:' + Math.round(left / total * 1000) / 10 + '%"></i></span></div>';
  }

  /** Moves every visible countdown on by a tick; repaints when one of them runs out. */
  function tick() {
    var now = Date.now(), total = S.settings.laterDays * 86400000, out = false, i;
    var list = document.querySelectorAll("[data-expires]");
    for (i = 0; i < list.length; i++) {
      var end = +list[i].getAttribute("data-expires");
      if (end <= now) out = true;
      list[i].textContent = fmtLeft(end - now);
    }
    list = document.querySelectorAll("[data-until]");
    for (i = 0; i < list.length; i++) {
      var until = +list[i].getAttribute("data-until"), parts = cdParts(until), flips = list[i].querySelectorAll(".desk-flip");
      for (var fi = 0; fi < flips.length; fi++) flipTo(flips[fi], parts[fi]);
      cdSeen[list[i].getAttribute("data-cd")] = parts;
      list[i].classList.toggle("is-late", until < now);
    }
    list = document.querySelectorAll("[data-bar]");
    for (i = 0; i < list.length; i++) list[i].style.width = Math.max(0, Math.round((+list[i].getAttribute("data-bar") - now) / total * 1000) / 10) + "%";
    if (out && $("wizard").hidden && $("ticket").hidden) render();
  }

  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function find(id) { for (var i = 0; i < S.items.length; i++) if (S.items[i].id === id) return S.items[i]; return null; }

  var KIND = { bug: T("Broken", "عطل"), feature: T("Feature", "خاصية"), idea: T("Idea", "فكرة") };
  var GRADE = { 1: T("Grade 1 · today", "درجة 1 · النهارده"), 2: T("Grade 2 · fix day", "درجة 2 · يوم التصليح"), 3: T("Grade 3 · later", "درجة 3 · بعدين") };

  /** One sentence saying why an item landed where it did. */
  function reason(it, now, p) {
    var g = grade(it);
    if (g === 1) {
      var what = { money: T("it stops people paying", "بيمنع الناس تدفع"), login: T("it stops people getting in", "بيمنع الناس تدخل"), data: T("it loses data", "بيضيّع بيانات") }[it.blocks];
      return T("Fix it today: ", "صلّحه النهارده: ") + what + ".";
    }
    if (g === 2) {
      var d = p.when[it.id];
      var lead = it.kind === "bug" ? T("A real defect, but people can still work.", "عطل حقيقي بس الناس لسه عارفة تشتغل.")
        : T("Enough paying customers asked for it.", "عدد كافي من الدافعين طلبوها.");
      if (!d) return lead + " " + T("No room in the next 12 fix days.", "مفيش مكان في الـ 12 يوم تصليح الجايين.");
      var wait = product(it.product).mode === "maintenance" ? T(" This product is in maintenance: one hour, first fix day of the month.", " المنتج ده في وضع صيانة: ساعة واحدة في أول يوم تصليح في الشهر.") : "";
      return lead + " " + T("Planned for ", "متخطط ليوم ") + nice(d) + "." + wait;
    }
    var need = S.settings.promoteAt - (it.requests || 0);
    var leftDays = Math.max(0, Math.ceil((expiresAt(it) - Date.now()) / 86400000));
    return T("Waits. It needs " + need + " more paying customer" + (need === 1 ? "" : "s") + " to ask, or it is dropped in " + leftDays + " days.",
      "تستنى. محتاجة " + need + " دافعين كمان يطلبوها، وإلا تتشال بعد " + leftDays + " يوم.");
  }

  /* ---------- painting ---------- */

  var tab = "today";

  function itemRow(it, now, p, opts) {
    opts = opts || {};
    var g = grade(it), pr = product(it.product);
    var acts = "";
    if (it.status === "open") {
      var stage = it.stage === "doing" ? "doing" : "todo";
      var seg = function (act, st, label, on) { return '<button type="button" class="' + (on ? "is-on" : "") + '" data-act="' + act + '"' + (st ? ' data-stage="' + st + '"' : "") + ' data-id="' + it.id + '" aria-pressed="' + on + '">' + esc(label) + "</button>"; };
      acts += '<span class="desk-stage" role="group" aria-label="' + esc(T("Status", "الحالة")) + '">' + seg("stage", "todo", T("To do", "هتتعمل"), stage === "todo") +
        seg("stage", "doing", T("In progress", "شغال عليها"), stage === "doing") + seg("done", "", T("Done", "خلصت"), false) + "</span>";
      acts += '<button class="btn btn--ghost btn--sm" data-act="ticket" data-id="' + it.id + '">' + esc(T("Ticket", "التذكرة")) + "</button>";
      acts += '<button class="btn btn--ghost btn--sm" data-act="edit" data-id="' + it.id + '">' + esc(T("Re-answer", "عيد الإجابات")) + "</button>";
      acts += '<button class="btn btn--ghost btn--sm" data-act="drop" data-id="' + it.id + '">' + esc(T("Drop", "شيلها")) + "</button>";
    } else {
      acts += '<button class="btn btn--ghost btn--sm" data-act="ticket" data-id="' + it.id + '">' + esc(T("Ticket and pictures", "التذكرة والصور")) + "</button>";
      acts += '<button class="btn btn--ghost btn--sm" data-act="reopen" data-id="' + it.id + '">' + esc(T("Bring back", "رجّعها")) + "</button>";
      acts += '<button class="btn btn--danger btn--sm" data-act="delete" data-id="' + it.id + '">' + esc(T("Delete", "امسح")) + "</button>";
    }
    var DL = { week: T("due this week", "مطلوبة الأسبوع ده"), month: T("due this month", "مطلوبة الشهر ده") };
    var dueChip = it.due ? '<span class="chip' + (daysBetween(now, it.due) <= 7 ? " chip--due" : "") + '">' + esc(T("due ", "مطلوبة ") + nice(it.due)) + "</span>"
      : DL[it.deadline] ? '<span class="chip chip--due">' + esc(DL[it.deadline]) + "</span>" : "";
    var KICO = { bug: "🐞", feature: "✨", idea: "💡" };
    var PW = { 1: T("Today", "النهارده"), 2: T("Fix day", "يوم التصليح"), 3: T("Later", "بعدين") };
    // a ticket: a coloured stub carrying the grade, a tear line, then the detail
    // the side panel: the date that matters for this ticket as a calendar leaf, and the time left to it
    var side = "";
    if (it.status === "open") {
      var keyDay = it.due || (g === 1 ? now : g === 2 ? p.when[it.id] : ""), until, sideLabel;
      if (it.due) sideLabel = T("Due in", "فاضل على الميعاد");
      else if (g === 1) sideLabel = T("Fix by tonight", "تتصلح قبل آخر اليوم");
      else if (g === 2) sideLabel = T("Fix day in", "فاضل على يوم التصليح");
      else sideLabel = T("Dropped in", "هتتشال بعد");
      if (g === 3 && !it.due) { until = expiresAt(it); keyDay = ymd(new Date(until)); }
      else if (keyDay) until = parse(addDays(keyDay, 1)).getTime(); // the end of that day
      if (keyDay) {
        var kd = parse(keyDay), leftDays = Math.ceil((until - Date.now()) / 86400000);
        side = '<aside class="desk-item__side">' +
          '<div class="desk-leaf desk-leaf--card' + (until < Date.now() ? " is-late" : leftDays <= 2 ? " is-soon" : "") + '"><small>' + esc(kd.toLocaleDateString(I18N.loc("en-GB"), { weekday: "short" })) + "</small><b>" + kd.getDate() + "</b><i>" + esc(kd.toLocaleDateString(I18N.loc("en-GB"), { month: "short" })) + "</i></div>" +
          '<div class="desk-item__count"><small>' + esc(sideLabel) + '</small><div class="desk-cd' + (until < Date.now() ? " is-late" : "") + '" dir="ltr" data-until="' + until + '" data-late="' + esc(T("late", "متأخرة")) + '" data-cd="' + it.id + '">' + cdCells(until, it.id) + "</div></div>" +
          (g === 2 ? '<button type="button" class="desk-item__score" data-act="why" data-id="' + it.id + '" title="' + esc(T("See how this number is worked out", "شوف الرقم ده جه منين")) + '"><small>' + esc(T("Score · why?", "النقط · ليه؟")) + "</small><b>" + (Math.round(score(it, now) * 10) / 10) + "</b></button>" : "") +
          "</aside>";
      }
    }
    return '<article class="desk-item desk-item--g' + g + (it.status === "open" && it.stage === "doing" ? " is-doing" : "") + '"><div class="desk-item__in">' +
      '<div class="desk-item__stub">' + ico(KICO[it.kind] || "🎫", "desk-ico--lg") + "<b>P" + g + "</b><small>" + esc(PW[g]) + "</small></div>" +
      '<div class="desk-item__main">' +
      (g === 3 && it.status === "open" ? timerRow(it) : "") +
      '<div class="desk-item__top">' +
        (opts.rank ? '<span class="desk-item__rank">' + opts.rank + "</span>" : "") +
        '<span class="desk-item__title">' + esc(it.title) + "</span>" +
      "</div>" +
      '<div class="desk-item__meta">' +
        '<span class="chip chip--prod">' + logo(pr, "desk-logo--xs") + esc(pr.name) + "</span>" +
        '<span class="chip">' + esc(KIND[it.kind] || it.kind) + "</span>" +
        '<span class="chip">' + esc(hours(+it.effort || 1)) + "</span>" +
        dueChip +
        ((it.clients || []).length ? '<span class="chip" title="' + esc((it.clients || []).map(clientLabel).join(", ")) + '">👤 ' + esc(it.clients.slice(0, 2).map(clientLabel).join(T(", ", "، ")) + (it.clients.length > 2 ? " +" + (it.clients.length - 2) : "")) + "</span>" : "") +
        (shotCount(it, "before") + shotCount(it, "after") ? '<button type="button" class="chip chip--shots" data-act="ticket" data-id="' + it.id + '" title="' + esc(T("Open the pictures", "افتح الصور")) + '">📷 ' + shotCount(it, "before") + T(" before", " قبل") + " · " + shotCount(it, "after") + T(" after", " بعد") + "</button>" : "") +
        (it.churn ? '<span class="chip chip--due">' + esc(T("customers may leave", "ممكن عملاء يمشوا")) + "</span>" : "") +
        (it.proof === "guess" ? '<span class="chip">' + esc(T("a guess", "تخمين")) + "</span>" : "") +
        (it.status === "open" ? stepper(it) : it.requests ? '<span class="chip">' + esc(T(it.requests + " asked", it.requests + " طلبوها")) + "</span>" : "") +
      "</div>" +
      (it.note ? '<p class="desk-item__note">' + esc(it.note) + "</p>" : "") +
      (it.done ? '<p class="desk-item__done"><b>' + esc(T("Done when: ", "تخلص لما: ")) + "</b>" + esc(it.done) + "</p>" : "") +
      (it.status === "open" ? '<p class="desk-item__why">' + esc(reason(it, now, p)) + "</p>" : "") +
      '<div class="desk-item__acts">' + acts + "</div>" +
      "</div>" + side + "</div></article>";
  }

  function empty(msg) { return '<p class="muted center desk-empty">' + esc(msg) + "</p>"; }

  function paintToday(now, p) {
    var urgent = S.items.filter(function (it) { return it.status === "open" && grade(it) === 1; });
    var dow = parse(now).getDay();
    var clock = new Date(), hm = pad(clock.getHours()) + ":" + pad(clock.getMinutes());
    var blocks = S.blocks.filter(function (b) { return b.days.indexOf(dow) !== -1 && blockOn(b, now); })
      .sort(function (a, b) { return a.from < b.from ? -1 : 1; });
    var isFix = dow === S.settings.fixDay;
    var next = p.days[0];
    var html = captureBanner() + (dueInfo(now).state === "soon" ? "" : dueBanner(now, true));
    var doing = S.items.filter(function (it) { return it.status === "open" && it.stage === "doing" && grade(it) !== 1; });
    if (doing.length) {
      html += '<div class="card"><div class="card__head"><h2>' + ico("⚡") + esc(T("In progress", "شغال عليها")) + '</h2><span class="count">' + doing.length + "</span></div>" +
        doing.map(function (it) { return itemRow(it, now, p); }).join("") + "</div>";
    }

    html += '<div class="card"><div class="card__head"><h2>' + ico("🔥") + esc(T("Fix now", "صلّح دلوقتي")) + '</h2><span class="count">' + urgent.length + "</span></div>";
    html += urgent.length ? urgent.map(function (it) { return itemRow(it, now, p); }).join("")
      : empty(T("Nothing is stopping payments, sign-in or data. Do not open the code for anything else today.", "مفيش حاجة موقفة الدفع أو الدخول أو البيانات. ماتفتحش الكود لأي حاجة تانية النهارده."));
    html += "</div>";

    // the weekly routine moved to /time (js/tools/week.js): it is the owner's whole week, not one product's
    html += '<p class="muted desk-moved">' + esc(T("Your weekly schedule now lives in Time.", "جدول الأسبوع بقى في صفحة الوقت.")) + ' <a href="/time">' + esc(T("Open Time", "افتح الوقت")) + "</a></p>";

    html += '<div class="card"><div class="card__head"><h2>' + ico("🛠️") + esc(isFix ? T("Today is fix day", "النهارده يوم التصليح") : T("Next fix day", "يوم التصليح الجاي")) + "</h2>";
    if (next) html += '<span class="muted">' + esc(nice(next.date) + " · " + next.items.length + T(" items · ", " حاجة · ") + hours(next.hours) + T(" of ", " من ") + hours(S.settings.fixHours)) + "</span>";
    html += "</div>";
    if (!next) html += empty(T("The queue is empty.", "الطابور فاضي."));
    else if (isFix && next.date === now) html += next.items.map(function (it, i) { return itemRow(it, now, p, { rank: i + 1 }); }).join("");
    else html += '<ol class="desk-queue">' + next.items.map(function (it) { return "<li>" + esc(it.title) + ' <span class="muted">· ' + esc(product(it.product).name) + " · " + esc(hours(+it.effort || 1)) + "</span></li>"; }).join("") + "</ol>" +
      '<p class="muted">' + esc(T("These wait until then, even the five-minute ones.", "دول يستنوا لحد اليوم ده، حتى اللي ياخد 5 دقايق.")) + "</p>";
    html += "</div>";
    return html;
  }

  function paintFix(now, p) {
    if (!p.days.length) return '<div class="card">' + empty(T("No grade 2 work is waiting.", "مفيش شغل درجة 2 مستني.")) + "</div>";
    return p.days.map(function (d) {
      return '<div class="card"><div class="card__head"><h2>' + esc(nice(d.date)) + '</h2><span class="muted">' + esc(hours(d.hours) + T(" of ", " من ") + hours(S.settings.fixHours)) + "</span></div>" +
        (d.hours > S.settings.fixHours ? '<p class="form__note form__note--warn">' + esc(T("This job is longer than one fix day. Split it into smaller items.", "الشغلانة دي أطول من يوم تصليح. قسّمها لحاجات أصغر.")) + "</p>" : "") +
        d.items.map(function (it, i) { return itemRow(it, now, p, { rank: i + 1 }); }).join("") + "</div>";
    }).join("") + (p.unplaced.length ? '<div class="card"><div class="card__head"><h2>' + esc(T("Not placed", "مالهاش مكان")) + "</h2></div>" + p.unplaced.map(function (it) { return itemRow(it, now, p); }).join("") + "</div>" : "");
  }

  function paintLater(now, p) {
    var later = S.items.filter(function (it) { return it.status === "open" && grade(it) === 3; })
      .sort(function (a, b) { return (b.requests || 0) - (a.requests || 0) || (a.created < b.created ? -1 : 1); });
    var soon = later.slice().sort(function (a, b) { return expiresAt(a) - expiresAt(b); })[0];
    return '<div class="card"><div class="card__head"><h2>' + esc(T("Later", "بعدين")) + '</h2><span class="count">' + later.length + "</span></div>" +
      (soon ? '<p class="desk-next-drop">' + esc(T("Next to be dropped: ", "أول واحدة هتتشال: ")) + "<b>" + esc(soon.title) + "</b> · " + '<b dir="ltr" data-expires="' + expiresAt(soon) + '">' + fmtLeft(expiresAt(soon) - Date.now()) + "</b></p>" : "") +
      '<p class="muted">' + esc(T("Features and ideas wait here until " + S.settings.promoteAt + " paying customers ask. Untouched for " + S.settings.laterDays + " days, they are dropped.",
        "الخواص والأفكار بتستنى هنا لحد ما " + S.settings.promoteAt + " دافعين يطلبوها. لو فضلت " + S.settings.laterDays + " يوم من غير طلب، بتتشال.")) + "</p>" +
      (later.length ? later.map(function (it) { return itemRow(it, now, p); }).join("") : empty(T("Nothing parked.", "مفيش حاجة مركونة."))) + "</div>";
  }

  // weeks are named by their Thursday, the day the numbers are written
  function weekOf(day) {
    var d = day, i = 0;
    while (parse(d).getDay() !== 4 && i++ < 7) d = addDays(d, 1);
    return d;
  }

  /* ---------- numbers: one a week per product, and how they move ----------
     Each product is measured in its own unit (students, seats, messages), so
     they cannot share an axis as they are. The overview chart therefore plots
     each one against its own first recorded number (that week = 100); the
     actual figures live on the product cards and in the table. */

  /** A fixed chart colour per product, kept for good so hiding or deleting one never repaints the rest. */
  function assignSlots() {
    var used = {}, changed = false;
    S.products.forEach(function (q) { if (q.slot) used[q.slot] = true; });
    S.products.forEach(function (q) {
      if (q.slot != null) return;
      var n = 1;
      while (n <= 8 && used[n]) n++;
      q.slot = n <= 8 ? n : 0; // past eight there is no ninth hue: it is drawn in the neutral
      used[q.slot] = true; changed = true;
    });
    return changed;
  }

  /** Which week's numbers are wanted now, who has not written theirs, and how urgent that is. */
  function dueInfo(now) {
    var dow = parse(now).getDay(), wk = weekOf(now), state = "soon";
    if (dow === 4) state = "today";
    else if (dow === 5 || dow === 6) { // Thursday has passed: last Thursday's are still owed if any are missing
      var last = addDays(wk, -7);
      if (S.products.some(function (q) { return q.mode === "active" && !q.statsUrl && (S.numbers[last] || {})[q.id] == null; })) { wk = last; state = "late"; }
    }
    var missing = S.products.filter(function (q) { return q.mode === "active" && !q.statsUrl && (S.numbers[wk] || {})[q.id] == null; }); // connected products are taken by the weekly capture
    return { week: wk, state: state, missing: missing, days: daysBetween(now, wk) };
  }

  /** The weekly capture runs on the site's clock, with the desk closed. This says it has, until dismissed. */
  function captureBanner() {
    var c = S.captured;
    if (!c || !c.at || c.at === S.capturedSeen) return "";
    var names = (c.ids || []).map(function (id) { return product(id).name; }).join(T(", ", "، "));
    return '<div class="desk-due desk-due--done">' + ico("📸") + "<p><b>" + esc(T("This week's numbers were taken automatically.", "أرقام الأسبوع اتاخدت تلقائي.")) + "</b><span>" +
      esc(T("Week ending " + nice(c.week) + ", taken " + new Date(c.at).toLocaleString(I18N.loc("en-GB"), { weekday: "short", hour: "2-digit", minute: "2-digit" }) + ": " + names + ". They are on the graph.",
        "أسبوع " + nice(c.week) + "، اتاخدت " + new Date(c.at).toLocaleString(I18N.loc("en-GB"), { weekday: "short", hour: "2-digit", minute: "2-digit" }) + ": " + names + ". موجودة على الرسم.")) + "</span></p>" +
      '<button class="btn btn--ghost btn--sm" type="button" id="btnCaptureSeen">' + esc(T("Got it", "تمام")) + "</button></div>";
  }

  function dueBanner(now, withButton) {
    var d = dueInfo(now);
    if (!d.missing.length) return "";
    var names = d.missing.map(function (q) { return q.name; }).join(T(", ", "، "));
    var text = d.state === "today" ? T("It is Thursday: write this week's numbers.", "النهارده الخميس: اكتب أرقام الأسبوع.")
      : d.state === "late" ? T("Numbers for the week ending " + nice(d.week) + " are still missing.", "أرقام أسبوع " + nice(d.week) + " لسه ناقصة.")
      : T("This week's numbers are due " + nice(d.week) + ", in " + d.days + " day" + (d.days === 1 ? "" : "s") + ".", "أرقام الأسبوع مطلوبة " + nice(d.week) + "، بعد " + d.days + " يوم.");
    return '<div class="desk-due desk-due--' + d.state + '">' + ico(d.state === "soon" ? "🗓️" : "🔔") + "<p><b>" + esc(text) + "</b><span>" + esc(T("Not written yet: ", "لسه ماتكتبش: ") + names) + "</span></p>" +
      (withButton ? '<button class="btn btn--primary btn--sm" type="button" data-tabgo="numbers">' + esc(T("Write them", "اكتبهم")) + "</button>" : "") + "</div>";
  }

  /** A system notification on Thursday (or after) while numbers are missing; once per week, and only while the desk is open. */
  function maybeNotify() {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    // the scheduled capture is announced once, the first time the desk is open after it ran
    if (S.captured && S.captured.at && S.captured.at !== S.capturedSeen) {
      try {
        if (localStorage.getItem("desk.notifiedCapture") !== String(S.captured.at)) {
          localStorage.setItem("desk.notifiedCapture", String(S.captured.at));
          new Notification(T("This week's numbers are on the graph", "أرقام الأسبوع بقت على الرسم"), { body: T("Taken automatically for the week ending " + nice(S.captured.week), "اتاخدت تلقائي لأسبوع " + nice(S.captured.week)) });
        }
      } catch (e) { /* not allowed here */ }
    }
    var d = dueInfo(today());
    if (d.state === "soon" || !d.missing.length) return;
    try { if (localStorage.getItem("desk.notified") === d.week) return; localStorage.setItem("desk.notified", d.week); } catch (e) { return; }
    try { new Notification(T("Write this week's numbers", "اكتب أرقام الأسبوع"), { body: d.missing.map(function (q) { return q.name; }).join(", ") }); } catch (e) { /* not allowed here */ }
  }

  /* Automatic numbers. A product can name an address that answers
       { "users": 512, "paying": 41 }
     and the desk reads it instead of waiting to be told: once for the week
     that is due, whenever the desk is opened, or on demand. Run from a local
     folder the browser asks the address itself (so that address must allow
     it); on the site the request goes through the desk's own function, which
     keeps the key off the page and is not bound by the browser's cross-site rules. */
  function statsOf(w, id) { return ((S.stats || {})[w] || {})[id] || null; }
  function convPct(st) { return st && st.users > 0 ? Math.round(st.paying / st.users * 1000) / 10 : null; }

  /** From a local folder the browser must ask the product itself, which only works with a key of its own
      or a local address; the products' real addresses answer the site's server, not a page. */
  function reachable(q) { return !LOCAL || !!q.statsKey || /^http:\/\/(localhost|127\.0\.0\.1)[:/]/i.test(q.statsUrl || ""); }

  function pullStats(q, done) {
    if (!reachable(q)) return done(new Error(T("it is read from the site, not from this local copy", "بيتقري من الموقع، مش من النسخة المحلية دي")));
    var req = LOCAL
      ? fetch(q.statsUrl, { cache: "no-store", headers: q.statsKey ? { Authorization: "Bearer " + q.statsKey } : {} })
      : fetch("/api/ideas?desk=pull&id=" + encodeURIComponent(q.id), { cache: "no-store" });
    req.then(function (r) { if (!r.ok) throw new Error("status " + r.status); return r.json(); })
      .then(function (j) {
        var users = +j.users, paying = +j.paying;
        if (!isFinite(users) && !isFinite(paying)) throw new Error("no users or paying in the answer");
        done(null, { users: isFinite(users) ? users : null, paying: isFinite(paying) ? paying : null, at: Date.now() });
      })
      .catch(function (err) { done(err); });
  }

  /** Reads one product's figures into the week that is due, and repaints. */
  function pullInto(q, quiet) {
    var wk = dueInfo(today()).week;
    pullStats(q, function (err, st) {
      if (err) { if (!quiet) toast(T(q.name + ": could not read its numbers (" + err.message + ").", q.name + ": أرقامه ما اتقرتش (" + err.message + ")."), true); return; }
      S.stats = S.stats || {}; S.stats[wk] = S.stats[wk] || {}; S.stats[wk][q.id] = st;
      var v = q.statsUse === "users" ? st.users : st.paying;
      if (v != null) { S.numbers[wk] = S.numbers[wk] || {}; S.numbers[wk][q.id] = v; }
      save(); render();
      if (!quiet) toast(T(q.name + ": numbers updated.", q.name + ": الأرقام اتحدّثت."));
    });
  }

  /** On opening the desk: fetch for every connected product that has nothing yet for the week that is due. */
  function autoPull() {
    var wk = dueInfo(today()).week;
    S.products.forEach(function (q) { if (q.statsUrl && reachable(q) && !statsOf(wk, q.id)) pullInto(q, true); });
  }

  /* Live numbers: what each connected product says right now, asked again
     every minute while the Numbers tab is open. A figure that has changed
     counts up (or down) to its new value, and each product announces itself
     with its own three notes, so a change can be heard without looking. */
  var liveNow = {}, liveShown = {}, liveAt = 0, liveBusy = 0;
  // one root note per chart colour slot: the product's voice
  var VOICE = [392, 523, 587, 659, 698, 784, 880, 988, 1047];

  function voice(q) {
    if (muted) return;
    var root = VOICE[q.slot || 0] || 523;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      var t = audio.currentTime;
      [root, root * 1.25, root * 1.5].forEach(function (f, i) {
        var o = audio.createOscillator(), g = audio.createGain(), at = t + i * 0.09;
        o.type = "triangle"; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, at);
        g.gain.exponentialRampToValueAtTime(0.03, at + 0.015); // as quiet as the other sounds
        g.gain.exponentialRampToValueAtTime(0.0001, at + 0.22);
        o.connect(g); g.connect(audio.destination);
        o.start(at); o.stop(at + 0.24);
      });
    } catch (e) { /* no audio here: stay silent */ }
  }

  /** A count as it fits on a tile: exact below a thousand, then 1K, 8.5K, 100K, 1.2M. The exact figure is in the tooltip. */
  function shortNum(v) {
    if (v == null) return "—";
    if (v < 1000) return String(v);
    var u = v >= 999500 ? [1e6, "M"] : [1e3, "K"], x = v / u[0]; // 999,500 and up would round to "1000K"
    return (x >= 100 ? Math.round(x) : Math.round(x * 10) / 10) + u[1];
  }

  /** Runs a number from where it stands to its new value, then leaves the exact figure. */
  function countTo(el, from, to, suffix) {
    if (!el) return;
    var pct = suffix === "%", show = function (v) { return pct ? v.toFixed(1) + "%" : shortNum(Math.round(v)); };
    if (!pct) el.title = String(to);
    if (calm || from === to) { el.textContent = pct ? to + "%" : shortNum(to); return; }
    var start = null, span = to - from;
    (function frame(ts) {
      if (start == null) start = ts;
      var k = Math.min(1, (ts - start) / 900), eased = 1 - Math.pow(1 - k, 3);
      el.textContent = show(from + span * eased);
      if (k < 1 && el.isConnected) requestAnimationFrame(frame); else el.textContent = pct ? to + "%" : shortNum(to);
    })(performance.now());
  }

  /* The crowd. Every user is a figure standing on a small stage that never
     changes size: with a handful they are large, with a thousand they shrink
     and pack into rows, the back rows smaller and dimmer than the front, so it
     reads as depth. Those who pay wear the product's colour and stand together
     at the front, in the true proportion. It is
     drawn on a canvas (thousands of DOM nodes would crawl) from two sprites
     per product, and sways gently unless the crowd is very large. */
  var crowds = {}, crowdRaf = 0, crowdLast = 0, spriteCache = {};
  var CROWD_MAX = 12000;   // figures on one stage; past this each figure stands for several users
  var CROWD_SWAY = 800;    // up to this many they sway; a bigger crowd stands still
  var CROWD_WALK = 3000;   // up to this many they walk in; a bigger crowd is simply there

  function rng(seed) { // small seeded generator: the same crowd stands in the same places every time
    return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  function hashOf(str) { var h = 7, i; for (i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0; return h; }
  function shade(hex, k) { // k > 0 towards white, k < 0 towards black
    var m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim()), n = m ? parseInt(m[1], 16) : 0x7584A4;
    var ch = [n >> 16 & 255, n >> 8 & 255, n & 255].map(function (c) { return Math.round(k >= 0 ? c + (255 - c) * k : c * (1 + k)); });
    return "rgb(" + ch.join(",") + ")";
  }

  function crowd(q, st) {
    if (!st || !(st.users > 0)) return "";
    var n = Math.min(st.users, CROWD_MAX), per = st.users / n;
    var pay = Math.min(n, st.paying > 0 ? Math.max(1, Math.round(st.paying / per)) : 0), was = crowds[q.id];
    // the same crowd keeps standing; a changed one walks in again
    if (!was || was.n !== n || was.pay !== pay) crowds[q.id] = { n: n, pay: pay, slot: q.slot || 0, seed: hashOf(q.id), t0: performance.now() };
    var each = per > 1 ? T("each figure is about " + (Math.round(per * 10) / 10) + " users", "كل شكل حوالي " + (Math.round(per * 10) / 10) + " مستخدم") : T("one figure for every user", "شكل لكل مستخدم");
    return '<canvas class="desk-crowd3" data-crowd="' + esc(q.id) + '" role="img" aria-label="' + esc(T(st.paying + " of " + st.users + " users pay", st.paying + " من " + st.users + " بيدفعوا")) + '"></canvas>' +
      '<p class="desk-crowd__key"><span><i class="desk-man is-pay"></i>' + esc(T("paying", "بيدفع")) + '</span><span><i class="desk-man"></i>' + esc(T("not yet", "لسه")) + "</span><small>" + esc(each) + "</small></p>";
  }

  /** Where everyone stands for a stage of this width: the largest figure size that still fits them all. */
  function crowdLayout(c, W, H) {
    var s, cols, rows, colW, rowH, i, k;
    for (s = 30; s > 1.6; s -= s > 8 ? 1 : 0.2) {
      colW = s * 0.74; rowH = s * 0.5;
      cols = Math.max(1, Math.floor((W - s) / colW) + 1);
      rows = Math.ceil(c.n / cols);
      if ((rows - 1) * rowH + s * 1.62 <= H) break;
    }
    // those who pay stand together at the front, filling it row by row, so the
    // paying share is read as a band across the stage rather than hunted for
    var r = rng(c.seed), firstPay = c.n - c.pay;
    var figs = [], firstRow = c.n - (rows - 1) * cols, idx = 0, top = H - ((rows - 1) * rowH + s * 1.62);
    for (var row = 0; row < rows; row++) { // row 0 is the back; the short row goes there so the front is full
      var count = row === 0 ? firstRow : cols, depth = rows > 1 ? row / (rows - 1) : 1, scale = 0.7 + 0.3 * depth;
      var span = (count - 1) * colW * scale, x0 = (W - span) / 2;
      for (var col = 0; col < count; col++, idx++) {
        figs.push({ x: x0 + col * colW * scale + (r() - 0.5) * colW * 0.3, y: top / 2 + row * rowH + (r() - 0.5) * rowH * 0.25, scale: scale,
          alpha: 0.62 + 0.38 * depth, pay: idx >= firstPay, phase: r() * 6.283, delay: r() * 700 });
      }
    }
    return { W: W, H: H, s: s, figs: figs };
  }

  /** One figure, lit from the upper left: a ground shadow, shoulders, a head. Drawn once per colour and size, then stamped. */
  function crowdSprite(slot, s, pay, dpr) {
    var light = document.documentElement.getAttribute("data-theme") === "light";
    var key = [slot, Math.round(s * 10), pay, dpr, light].join("|");
    if (spriteCache[key]) return spriteCache[key];
    var w = Math.max(2, Math.ceil(s * dpr)), h = Math.max(3, Math.ceil(s * 1.62 * dpr)), cv = document.createElement("canvas");
    cv.width = w; cv.height = h;
    var x = cv.getContext("2d"), base = pay ? getComputedStyle(document.documentElement).getPropertyValue("--s" + slot) : (light ? "#939FB8" : "#66728C");
    var hi = shade(base, pay ? 0.5 : 0.35), lo = shade(base, pay ? -0.3 : -0.38);
    x.fillStyle = "rgba(0,0,0," + (light ? 0.18 : 0.38) + ")";
    x.beginPath(); x.ellipse(w / 2, h * 0.965, w * 0.4, h * 0.035, 0, 0, 6.283); x.fill();
    var g = x.createLinearGradient(w * 0.1, 0, w * 0.95, 0);
    g.addColorStop(0, hi); g.addColorStop(0.45, shade(base, 0)); g.addColorStop(1, lo);
    x.fillStyle = g; // shoulders and torso
    x.beginPath();
    x.moveTo(w * 0.06, h * 0.95); x.lineTo(w * 0.06, h * 0.62);
    x.bezierCurveTo(w * 0.06, h * 0.44, w * 0.94, h * 0.44, w * 0.94, h * 0.62);
    x.lineTo(w * 0.94, h * 0.95); x.quadraticCurveTo(w / 2, h * 1.0, w * 0.06, h * 0.95); x.fill();
    var hg = x.createRadialGradient(w * 0.4, h * 0.19, w * 0.03, w / 2, h * 0.25, w * 0.3);
    hg.addColorStop(0, shade(base, pay ? 0.7 : 0.5)); hg.addColorStop(0.55, shade(base, 0.05)); hg.addColorStop(1, lo);
    x.fillStyle = hg; // the head
    x.beginPath(); x.arc(w / 2, h * 0.25, w * 0.27, 0, 6.283); x.fill();
    spriteCache[key] = cv;
    return cv;
  }

  function drawCrowd(cv, c, ts) {
    var W = cv.clientWidth, H = cv.clientHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
    if (!W || !H) return;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    if (!c.lay || c.lay.W !== W || c.lay.H !== H) c.lay = crowdLayout(c, W, H);
    var x = cv.getContext("2d"), L = c.lay, s = L.s, sway = !calm && c.n <= CROWD_SWAY, walk = !calm && c.n <= CROWD_WALK;
    var grey = crowdSprite(c.slot, s, false, dpr), col = crowdSprite(c.slot, s, true, dpr), since = ts - c.t0, i, f;
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.clearRect(0, 0, W, H);
    for (i = 0; i < L.figs.length; i++) { // back row first, so the front stands over it
      f = L.figs[i];
      var a = walk ? Math.max(0, Math.min(1, (since - f.delay) / 380)) : 1;
      if (a <= 0) continue;
      var k = f.scale * (0.55 + 0.45 * (1 - Math.pow(1 - a, 3))), w = s * k, h = s * 1.62 * k;
      var bob = sway ? Math.sin(ts / 520 + f.phase) * s * 0.035 : 0;
      x.globalAlpha = f.alpha * a;
      x.drawImage(f.pay ? col : grey, f.x - w / 2, f.y + bob + (s * 1.62 * f.scale - h), w, h);
    }
    x.globalAlpha = 1;
  }

  function crowdLoop(ts) {
    crowdRaf = 0;
    var list = document.querySelectorAll("canvas[data-crowd]"), again = false, i;
    if (ts - crowdLast >= 30) { // about thirty frames a second is plenty for a sway
      crowdLast = ts;
      for (i = 0; i < list.length; i++) {
        var cv = list[i], c = crowds[cv.getAttribute("data-crowd")];
        if (!c) continue;
        var arriving = !calm && c.n <= CROWD_WALK && ts - c.t0 < 1300, moving = !calm && c.n <= CROWD_SWAY;
        if (arriving || moving || !cv.__drawn || !c.lay || c.lay.W !== cv.clientWidth) { drawCrowd(cv, c, ts); cv.__drawn = true; }
        if (arriving || moving) again = true;
      }
    } else again = list.length > 0;
    if (again && !document.hidden) crowdRaf = requestAnimationFrame(crowdLoop);
  }
  function kickCrowds() { if (!crowdRaf) crowdRaf = requestAnimationFrame(crowdLoop); }
  window.addEventListener("resize", kickCrowds);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) kickCrowds(); });

  function liveTile(q) {
    var st = liveShown[q.id], now = liveNow[q.id], cp = convPct(st);
    var num = function (key, v) { return '<b data-lv="' + key + '"' + (v == null ? "" : ' title="' + v + '"') + ">" + shortNum(v) + "</b>"; };
    // the counts are doors: users opens everyone, paying opens those who pay
    var door = function (filter, inner, label) {
      return q.statsUrl ? '<button type="button" class="desk-live2__n" data-users="' + esc(q.id) + '" data-uf="' + filter + '" title="' + esc(label) + '">' + inner + "</button>" : "<div>" + inner + "</div>";
    };
    return '<article class="desk-live2" data-live="' + esc(q.id) + '" style="--sc:var(--s' + (q.slot || 0) + ')">' +
      '<div class="desk-live2__top">' + logo(q, "desk-logo--sm") + "<b>" + esc(q.name) + '</b><i class="desk-live2__dot' + ((now && now.err) || !q.statsUrl || !reachable(q) ? " is-off" : "") + '" aria-hidden="true"></i></div>' +
      '<div class="desk-live2__nums">' + door("all", num("users", st ? st.users : null) + "<small>" + esc(T("users", "مستخدمين")) + "</small>", T("See every user", "شوف كل المستخدمين")) +
        door("paying", num("paying", st ? st.paying : null) + "<small>" + esc(T("paying", "دافعين")) + "</small>", T("See who pays", "شوف مين بيدفع")) +
"<div>" + '<b data-lv="conv">' + (cp == null ? "—" : cp + "%") + "</b><small>" + esc(T("conversion", "التحويل")) + "</small></div></div>" +
      '<div data-lv="crowd">' + crowd(q, st) + "</div>" +
      '<p class="desk-live2__when" data-lv="when">' + esc(now && now.err ? T("Could not read: ", "ما اتقراش: ") + now.err : st ? T("as of ", "لحد ") + new Date(st.at).toLocaleTimeString(I18N.loc("en-GB")) : !q.statsUrl ? T("not connected: its number is written by hand", "مش متوصّل: رقمه بيتكتب بالإيد") : reachable(q) ? T("reading…", "بيقرا…") : T("read on the site, not in this local copy", "بيتقري على الموقع، مش في النسخة المحلية")) + "</p></article>";
  }

  /** A fresh answer has arrived for one product: move its tile to it. */
  function landLive(q) {
    var now = liveNow[q.id], was = liveShown[q.id], box = document.querySelector('[data-live="' + q.id + '"]');
    if (!now || now.err) { if (box && tab === "numbers") box.outerHTML = liveTile(q); return; }
    var changed = !was || was.users !== now.users || was.paying !== now.paying;
    liveShown[q.id] = now;
    if (!box || tab !== "numbers") return;
    var set = function (key, from, to, suffix) { if (to != null) countTo(box.querySelector('[data-lv="' + key + '"]'), from == null ? 0 : from, to, suffix); };
    set("users", was && was.users, now.users, "");
    set("paying", was && was.paying, now.paying, "");
    set("conv", was ? convPct(was) : 0, convPct(now), "%");
    box.querySelector('[data-lv="when"]').textContent = T("as of ", "لحد ") + new Date(now.at).toLocaleTimeString(I18N.loc("en-GB"));
    box.querySelector(".desk-live2__dot").classList.remove("is-off");
    paintGroupSums();
    if (changed) { var cr = box.querySelector('[data-lv="crowd"]'); cr.innerHTML = crowd(q, now); kickCrowds(); } // the crowd walks in again only when it has changed
    if (changed) { box.classList.remove("is-new"); void box.offsetWidth; box.classList.add("is-new"); voice(q); }
  }

  function refreshLive(force) {
    if (!force && Date.now() - liveAt < 55000) return;
    liveAt = Date.now();
    S.products.forEach(function (q, i) {
      if (!q.statsUrl || !reachable(q)) return;
      liveBusy++;
      // a short stagger, so the products are heard one after another rather than as one chord
      setTimeout(function () {
        pullStats(q, function (err, st) { liveBusy--; liveNow[q.id] = err ? { err: err.message } : st; landLive(q); });
      }, i * 450);
    });
  }

  /** Which shelf a product sits on: education by market, everything else together. */
  function groupOf(q) {
    var c = row(PCOUNTRY, q.country);
    if (/edtech|education|تعليم/i.test(q.category || "")) {
      return { key: "edu-" + (q.country || "none"), label: T("EdTech", "تعليم") + " · " + (c ? lab(c) : T("no country set", "من غير بلد")), flag: c ? c[1] : "🎓" };
    }
    return { key: "other", label: T("Other products", "منتجات تانية"), flag: "🧩" };
  }
  function groups() {
    var list = [], at = {};
    S.products.forEach(function (q) {
      var g = groupOf(q);
      if (at[g.key] == null) { at[g.key] = list.length; g.items = []; list.push(g); }
      list[at[g.key]].items.push(q);
    });
    return list;
  }
  /** A shelf's totals: users and paying are the same kind of thing in every product, so they add up. */
  function groupSum(g) {
    var users = 0, paying = 0, n = 0;
    g.items.forEach(function (q) { var st = liveShown[q.id]; if (st) { users += st.users || 0; paying += st.paying || 0; n++; } });
    if (!n) return '<span class="muted">' + esc(T("no live numbers yet", "مفيش أرقام حية لسه")) + "</span>";
    var cp = users > 0 ? Math.round(paying / users * 1000) / 10 : null;
    var sep = function (v) { return v.toLocaleString("en-US"); };
    return "<b>" + sep(users) + "</b> " + esc(T("users", "مستخدم")) + " · <b>" + sep(paying) + "</b> " + esc(T("paying", "دافع")) + (cp != null ? " · <b>" + cp + "%</b>" : "") +
      (n < g.items.length ? ' <small class="muted">(' + esc(T(n + " of " + g.items.length + " products", n + " من " + g.items.length + " منتجات")) + ")</small>" : "");
  }
  function paintGroupSums() {
    groups().forEach(function (g) { var el = document.querySelector('[data-grpsum="' + g.key + '"]'); if (el) el.innerHTML = groupSum(g); });
  }

  function liveCard() {
    var can = S.products.some(function (q) { return q.statsUrl && reachable(q); });
    return '<div class="card"><div class="card__head"><h2>' + ico("📡") + esc(T("Right now", "دلوقتي")) + '</h2><span class="desk-live2__bar"><span class="muted">' + esc(T("asked again every minute", "بيتسأل كل دقيقة")) + "</span>" +
      (can ? '<button class="btn btn--ghost btn--sm" type="button" id="btnLive">' + esc(T("↻ Now", "↻ دلوقتي")) + "</button>" : "") + "</span></div>" +
      (can ? "" : '<p class="muted">' + esc(T("Live numbers are read by the site, not by this local copy. Open ahmedtarek.tech/desk to see them.", "الأرقام الحية بيقراها الموقع، مش النسخة المحلية دي. افتح ahmedtarek.tech/desk عشان تشوفها.")) + "</p>") +
      groups().map(function (g) {
        return '<section class="desk-grp"><header><h3><span class="desk-flag">' + g.flag + "</span>" + esc(g.label) + '</h3><p data-grpsum="' + g.key + '">' + groupSum(g) + "</p></header>" +
          '<div class="desk-live2s">' + g.items.map(liveTile).join("") + "</div></section>";
      }).join("") + "</div>";
  }

  var numHidden = {}, numAvg = true, chartModel = null, numMeasure = "index";
  try { numHidden = JSON.parse(localStorage.getItem("desk.numHidden") || "{}") || {}; } catch (e) {}
  function keepHidden() { try { localStorage.setItem("desk.numHidden", JSON.stringify(numHidden)); } catch (e) {} }

  function weeksBack(wk, n) { var out = []; for (var i = n - 1; i >= 0; i--) out.push(addDays(wk, -7 * i)); return out; }
  function valuesOf(q, weeks) { return weeks.map(function (w) { var v = (S.numbers[w] || {})[q.id]; return v == null ? null : v; }); }
  /** Each value as a share of the first non-zero one (= 100), so unlike units can share an axis. */
  function indexed(vals) {
    var base = null;
    return vals.map(function (v) { if (v == null) return null; if (base == null && v > 0) base = v; return base == null ? null : Math.round(v / base * 1000) / 10; });
  }
  function r1(n) { return Math.round(n * 10) / 10; }

  /** A product's own little line: its actual numbers over the last weeks. */
  function spark(vals, slot) {
    var pts = [], lo = Infinity, hi = -Infinity, i;
    for (i = 0; i < vals.length; i++) if (vals[i] != null) { lo = Math.min(lo, vals[i]); hi = Math.max(hi, vals[i]); }
    if (lo === Infinity) return '<svg class="desk-spark" viewBox="0 0 120 36" aria-hidden="true"><line x1="2" y1="30" x2="118" y2="30" class="desk-chart__grid"/></svg>';
    var y = function (v) { return hi === lo ? 18 : 31 - (v - lo) / (hi - lo) * 26; }, x = function (n) { return 4 + n * 112 / Math.max(1, vals.length - 1); }, d = "", pen = false, last;
    for (i = 0; i < vals.length; i++) {
      if (vals[i] == null) { pen = false; continue; }
      d += (pen ? "L" : "M") + r1(x(i)) + " " + r1(y(vals[i])); pen = true; last = i;
    }
    return '<svg class="desk-spark" viewBox="0 0 120 36" aria-hidden="true"><path d="' + d + '" fill="none" stroke="var(--s' + slot + ')" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<circle cx="' + r1(x(last)) + '" cy="' + r1(y(vals[last])) + '" r="4" fill="var(--s' + slot + ')" stroke="var(--glass)" stroke-width="2"/></svg>';
  }

  /** The overview: every visible product indexed to its own start, plus their average. */
  function chart(weeks) {
    var W = 720, H = 290, L = 46, R = 122, Tp = 16, B = 34, n = weeks.length;
    var series = S.products.filter(function (q) { return !numHidden[q.id]; }).map(function (q) {
      return { id: q.id, name: q.name, slot: q.slot || 0, raw: valuesOf(q, weeks), unit: T(q.metric || "", q.metricAr || q.metric || "") };
    });
    var conv = numMeasure === "conv"; // conversion is already one unit for every product, so it is drawn as it is
    series.forEach(function (sr) {
      sr.pairs = weeks.map(function (w) { return statsOf(w, sr.id); });
      sr.idx = conv ? sr.pairs.map(convPct) : indexed(sr.raw);
    });
    series = series.filter(function (sr) { return sr.idx.some(function (v) { return v != null; }); });
    var avg = weeks.map(function (w, i) {
      var sum = 0, k = 0;
      series.forEach(function (sr) { if (sr.idx[i] != null) { sum += sr.idx[i]; k++; } });
      return k ? r1(sum / k) : null;
    });
    if (!series.length) {
      chartModel = null;
      return '<p class="muted center desk-empty">' + esc(conv ? T("No conversion to draw yet. It needs both figures, users and paying, which arrive once a product is connected.", "مفيش نسبة تحويل تترسم لسه. محتاجة الرقمين، المستخدمين والدافعين، وبييجوا لما المنتج يتوصّل.")
        : T("Nothing to draw yet. Write this week's numbers and the line starts here.", "مفيش حاجة تترسم لسه. اكتب أرقام الأسبوع والخط يبدأ من هنا.")) + "</p>";
    }
    var lo = conv ? 0 : 100, hi = conv ? 5 : 100;
    series.forEach(function (sr) { sr.idx.forEach(function (v) { if (v != null) { lo = Math.min(lo, v); hi = Math.max(hi, v); } }); });
    // gridlines on round numbers: the first step that leaves five lines or fewer
    var span = Math.max(conv ? 4 : 20, hi - lo), stepY = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000].filter(function (st) { return span / st <= 5; })[0] || 10000;
    lo = Math.max(0, Math.floor((lo - span * 0.04) / stepY) * stepY); hi = Math.ceil((hi + span * 0.04) / stepY) * stepY;
    var x = function (i) { return L + (n > 1 ? i * (W - L - R) / (n - 1) : 0); }, y = function (v) { return Tp + (hi - v) / (hi - lo) * (H - Tp - B); };
    var out = '<svg class="desk-chart__svg" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + esc(T("Each product's weekly number as a share of where it started", "رقم كل منتج الأسبوعي كنسبة من بدايته")) + '">', i, g;
    for (var gv = lo; gv <= hi + 0.001; gv += stepY) { // recessive grid
      out += '<line class="desk-chart__grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + r1(y(gv)) + '" y2="' + r1(y(gv)) + '"/><text class="desk-chart__tick" x="' + (L - 8) + '" y="' + r1(y(gv) + 4) + '" text-anchor="end">' + Math.round(gv) + (conv ? "%" : "") + "</text>";
    }
    if (!conv) out += '<line class="desk-chart__base" x1="' + L + '" x2="' + (W - R) + '" y1="' + r1(y(100)) + '" y2="' + r1(y(100)) + '"/>';
    for (i = 0; i < n; i++) if (n <= 8 || i % 2 === (n - 1) % 2) out += '<text class="desk-chart__tick" x="' + r1(x(i)) + '" y="' + (H - 10) + '" text-anchor="middle">' + esc(parse(weeks[i]).toLocaleDateString(I18N.loc("en-GB"), { day: "numeric", month: "short" })) + "</text>";
    var line = function (vals) { var d = "", pen = false; for (var k = 0; k < n; k++) { if (vals[k] == null) { pen = false; continue; } d += (pen ? "L" : "M") + r1(x(k)) + " " + r1(y(vals[k])); pen = true; } return d; };
    var lastAt = function (vals) { for (var k = n - 1; k >= 0; k--) if (vals[k] != null) return k; return -1; };
    var ends = [];
    series.forEach(function (sr) {
      out += '<path d="' + line(sr.idx) + '" fill="none" stroke="var(--s' + sr.slot + ')" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
      sr.idx.forEach(function (v, k) { if (v != null) out += '<circle cx="' + r1(x(k)) + '" cy="' + r1(y(v)) + '" r="4" fill="var(--s' + sr.slot + ')" stroke="var(--glass)" stroke-width="2"/>'; });
      var la = lastAt(sr.idx); ends.push({ name: sr.name, x: x(la), y: y(sr.idx[la]) });
    });
    var showAvg = numAvg && series.length > 1;
    if (showAvg) {
      out += '<path class="desk-chart__avg" d="' + line(avg) + '"/>';
      var al = lastAt(avg); ends.push({ name: T("Average", "المتوسط"), x: x(al), y: y(avg[al]), avg: true });
    }
    if (ends.length <= 5) { // few enough to name at the line's end; the legend above always carries them all
      ends.sort(function (p1, p2) { return p1.y - p2.y; });
      for (i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 15) ends[i].y = ends[i - 1].y + 15;
      ends.forEach(function (e) { out += '<text class="desk-chart__end' + (e.avg ? " desk-chart__end--avg" : "") + '" x="' + r1(e.x + 10) + '" y="' + r1(e.y + 4) + '">' + esc(e.name.length > 16 ? e.name.slice(0, 15) + "…" : e.name) + "</text>"; });
    }
    out += '<line class="desk-chart__cross" id="chartCross" x1="0" x2="0" y1="' + Tp + '" y2="' + (H - B) + '" visibility="hidden"/>';
    out += '<rect class="desk-chart__hit" x="' + L + '" y="' + Tp + '" width="' + (W - L - R) + '" height="' + (H - Tp - B) + '"/></svg>';
    chartModel = { W: W, L: L, R: R, n: n, weeks: weeks, series: series, avg: showAvg ? avg : null, x: x, conv: conv };
    return out + '<div class="desk-chart__tip" id="chartTip" hidden></div>';
  }

  function paintNumbers(now) {
    if (assignSlots()) save();
    var due = dueInfo(now), wk = due.week, weeks = weeksBack(weekOf(now), 12);
    var canNotify = "Notification" in window, perm = canNotify ? Notification.permission : "denied";
    var legend = S.products.map(function (q) {
      return '<button type="button" class="desk-leg' + (numHidden[q.id] ? "" : " is-on") + '" data-leg="' + esc(q.id) + '" aria-pressed="' + !numHidden[q.id] + '"><i style="background:var(--s' + (q.slot || 0) + ')"></i>' + esc(q.name) + "</button>";
    }).join("") + '<button type="button" class="desk-leg desk-leg--avg' + (numAvg ? " is-on" : "") + '" data-leg="__avg" aria-pressed="' + numAvg + '"><i></i>' + esc(T("Average", "المتوسط")) + "</button>" +
      '<button type="button" class="linklike desk-leg__all" data-leg="__all">' + esc(T("Show all", "ورّي الكل")) + "</button>";

    var cards = S.products.filter(function (q) { return !q.statsUrl; }).map(function (q) {
      var v = (S.numbers[wk] || {})[q.id], prev = (S.numbers[addDays(wk, -7)] || {})[q.id], delta = v != null && prev != null ? v - prev : null;
      return '<article class="desk-numcard' + (v == null && q.mode === "active" ? " is-missing" : "") + '">' +
        '<div class="desk-numcard__top">' + logo(q, "desk-logo--sm") + "<div><b>" + esc(q.name) + "</b><small>" + esc(T(q.metric || "—", q.metricAr || q.metric || "—")) + "</small></div>" + spark(valuesOf(q, weeks), q.slot || 0) + "</div>" +
        '<div class="desk-dial" dir="ltr"><button type="button" class="desk-wiz__pm desk-wiz__pm--sm" data-numstep="' + esc(q.id) + '" data-d="-1" aria-label="' + esc(T("One fewer", "واحد أقل")) + '"' + (v ? "" : " disabled") + ">−</button>" +
          '<span class="desk-dial__face"><input class="desk-num desk-num--big" type="number" inputmode="decimal" min="0" data-week="' + wk + '" data-product="' + esc(q.id) + '" value="' + (v == null ? "" : v) + '" placeholder="—" aria-label="' + esc(q.name + ": " + (q.metric || "")) + '"></span>' +
          '<button type="button" class="desk-wiz__pm desk-wiz__pm--sm" data-numstep="' + esc(q.id) + '" data-d="1" aria-label="' + esc(T("One more", "واحد كمان")) + '">+</button></div>' +
        '<p class="desk-numcard__delta">' + (delta == null ? '<span class="muted">' + esc(v == null ? T("not written yet", "لسه ماتكتبش") : T("first week recorded", "أول أسبوع يتسجل")) + "</span>"
          : '<span class="' + (delta > 0 ? "desk-up" : delta < 0 ? "desk-down" : "muted") + '">' + (delta > 0 ? "▲ +" : delta < 0 ? "▼ " : "● ") + delta + "</span> " + esc(T("since last week", "عن الأسبوع اللي فات"))) + "</p>" +
        (function () {
          var st = statsOf(wk, q.id), cp = convPct(st);
          return (cp != null ? '<p class="desk-numcard__conv"><b>' + cp + "%</b> " + esc(T("pay: " + st.paying + " of " + st.users, "بيدفعوا: " + st.paying + " من " + st.users)) + "</p>" : "") +
            (q.statsUrl ? '<button type="button" class="btn btn--ghost btn--sm" data-pull="' + esc(q.id) + '">' + esc(st ? T("↻ Fetch again", "↻ هات تاني") : T("↻ Fetch its numbers", "↻ هات أرقامه")) + "</button>"
              : '<span class="desk-numcard__manual">' + esc(T("Written by hand · not connected", "بيتكتب بالإيد · مش متوصّل")) + "</span>");
        })() +
        '<button type="button" class="linklike desk-numcard__solo" data-solo="' + esc(q.id) + '">' + esc(T("See only this on the chart", "ورّيه لوحده على الرسم")) + "</button></article>";
    }).join("");

    var head = "<tr><th>" + esc(T("Week ending", "أسبوع")) + "</th>" + S.products.map(function (q) { return "<th>" + esc(q.name) + '<br><small class="muted">' + esc(T(q.metric || "", q.metricAr || q.metric || "")) + "</small></th>"; }).join("") + "</tr>";
    var rows = weeks.slice().reverse().map(function (w) {
      return "<tr" + (w === wk ? ' class="is-now"' : "") + "><td>" + esc(nice(w)) + "</td>" + S.products.map(function (q) {
        var v = (S.numbers[w] || {})[q.id];
        return '<td><input class="desk-num" type="number" inputmode="decimal" min="0" data-week="' + w + '" data-product="' + esc(q.id) + '" value="' + (v == null ? "" : v) + '" aria-label="' + esc(q.name + ", " + nice(w)) + '"></td>';
      }).join("") + "</tr>";
    }).join("");
    var flat = S.products.filter(function (q) {
      var a1 = (S.numbers[wk] || {})[q.id], b1 = (S.numbers[addDays(wk, -7)] || {})[q.id], c1 = (S.numbers[addDays(wk, -14)] || {})[q.id];
      return q.mode === "active" && a1 != null && b1 != null && c1 != null && a1 <= b1 && b1 <= c1;
    });

    return captureBanner() + dueBanner(now, false) + liveCard() +
      (flat.length ? '<p class="form__note form__note--warn">' + esc(T("Flat for two weeks: ", "واقف بقاله أسبوعين: ") + flat.map(function (q) { return q.name; }).join(", ") + T(". The selling block for these has to change.", ". خانة البيع بتاعتهم لازم تتغير.")) + "</p>" : "") +
      (cards ? '<div class="card"><div class="card__head"><h2>' + ico("✍️") + esc(T("Written by hand · week ending ", "بيتكتب بالإيد · أسبوع ") + nice(wk)) + '</h2><span class="muted">' + esc(T("Only the products that are not connected", "المنتجات اللي مش متوصّلة بس")) + "</span></div>" +
        '<div class="desk-numcards">' + cards + "</div></div>" : "") +
      '<div class="card"><div class="card__head"><h2>' + ico("📈") + esc(T("All products over time", "كل المنتجات مع الوقت")) + '</h2><span class="desk-stage" role="group" aria-label="' + esc(T("What to draw", "ترسم إيه")) + '"><button type="button" data-measure="index" class="' + (numMeasure === "index" ? "is-on" : "") + '" aria-pressed="' + (numMeasure === "index") + '">' + esc(T("Growth", "النمو")) + '</button><button type="button" data-measure="conv" class="' + (numMeasure === "conv" ? "is-on" : "") + '" aria-pressed="' + (numMeasure === "conv") + '">' + esc(T("Conversion %", "نسبة التحويل")) + "</button></span></div>" +
        '<div class="desk-legend" role="group" aria-label="' + esc(T("Show or hide a product", "ورّي أو خبّي منتج")) + '">' + legend + "</div>" +
        '<div class="desk-chart" id="chartBox">' + chart(weeks) + "</div>" +
        '<p class="muted desk-chart__note">' + esc(numMeasure === "conv" ? T("Conversion is paying customers as a share of all users. It is the same unit for every product, so the lines share one scale as they are. Only connected products have it.", "نسبة التحويل هي الدافعين من كل المستخدمين. وحدة واحدة لكل المنتجات، فالخطوط على مقياس واحد زي ما هي. موجودة للمنتجات المتوصّلة بس.") : T("Growth: each line starts at 100, its first recorded week. Products are counted in different units, so each is drawn against its own start instead of sharing one scale of raw numbers. The actual figures are on the cards above and in the table below.", "النمو: كل خط بيبدأ من 100، أول أسبوع اتسجل. كل منتج بيتعدّ بوحدة مختلفة، فكل واحد مرسوم قصاد بدايته هو بدل ما يتحطوا على مقياس واحد. الأرقام الحقيقية على الكروت فوق وفي الجدول تحت.")) + "</p></div>" +
      '<div class="card"><div class="card__head"><h2>' + ico("🔔") + esc(T("Weekly reminder", "تذكير أسبوعي")) + "</h2></div>" +
        '<p class="muted">' + esc(T("Connected products are read automatically every Thursday at 10:00 Dubai time (08:00 Cairo), even with the desk closed, and that week's point is added to the graph. The next time the desk is opened a notice says so. Products written by hand get a reminder banner from Thursday until their number is in. A system notification can be added for both; it only fires while this page is open.",
          "المنتجات المتوصّلة بتتقري تلقائي كل خميس الساعة 10:00 بتوقيت دبي (8:00 القاهرة)، حتى والمكتب مقفول، ونقطة الأسبوع بتتحط على الرسم. أول ما تفتح المكتب بعدها بيطلعلك تنبيه. المنتجات اللي بتتكتب بالإيد بيطلعلها شريط تذكير من الخميس لحد ما رقمها يتكتب. تقدر تضيف إشعار من النظام للاتنين؛ بيشتغل بس والصفحة دي مفتوحة.")) + "</p>" +
        '<div class="form__actions">' + (!canNotify ? '<span class="muted">' + esc(T("This browser has no notifications.", "المتصفح ده مفيهوش إشعارات.")) + "</span>"
          : perm === "granted" ? '<span class="form__note form__note--ok">' + esc(T("System notification is on for this browser.", "إشعار النظام شغال على المتصفح ده.")) + "</span>"
          : perm === "denied" ? '<span class="form__note form__note--warn">' + esc(T("Notifications are blocked for this page in the browser's settings.", "الإشعارات مقفولة للصفحة دي من إعدادات المتصفح.")) + "</span>"
          : '<button class="btn btn--ghost btn--sm" type="button" id="btnNotify">' + esc(T("Turn on the system notification", "شغّل إشعار النظام")) + "</button>") + "</div></div>" +
      '<details class="card desk-tablecard"><summary class="btnish">' + esc(T("Table: every week, every product (you can fill in past weeks)", "الجدول: كل أسبوع وكل منتج (تقدر تملا الأسابيع اللي فاتت)")) + "</summary>" +
        '<div class="table-scroll"><table class="table desk-table">' + head + rows + "</table></div></details>";
  }

  function paintDone(now, p) {
    var closed = S.items.filter(function (it) { return it.status !== "open"; })
      .sort(function (a, b) { return (b.closed || "") < (a.closed || "") ? -1 : 1; });
    var doneN = closed.filter(function (it) { return it.status === "done"; }).length;
    return '<div class="card"><div class="card__head"><h2>' + esc(T("Closed", "اتقفلت")) + '</h2><span class="muted">' + esc(doneN + T(" done · ", " خلصت · ") + (closed.length - doneN) + T(" dropped", " اتشالت")) + "</span></div>" +
      (closed.length ? closed.map(function (it) {
        return '<div class="desk-closed"><span class="badge' + (it.status === "done" ? "" : " badge--warn") + '">' + esc(it.status === "done" ? T("done", "خلصت") : it.why === "expired" ? T("expired", "انتهت") : T("dropped", "اتشالت")) + "</span>" + itemRow(it, now, p) + "</div>";
      }).join("") : empty(T("Nothing closed yet.", "مفيش حاجة اتقفلت لسه."))) + "</div>";
  }

  /** One number setting: a big readout with a button either side, like setting a clock. */
  function dial(label, key, val, unit, min, max, stepBy) {
    var b = function (sign, d, off) { return '<button type="button" class="desk-wiz__pm desk-wiz__pm--sm" data-set="' + key + '" data-d="' + d + '" data-min="' + min + '" data-max="' + max + '" aria-label="' + esc(label + " " + sign) + '"' + (off ? " disabled" : "") + ">" + sign + "</button>"; };
    return '<div class="desk-set__row"><span class="desk-set__label">' + esc(label) + '</span><div class="desk-dial" dir="ltr">' + b("−", -stepBy, val - stepBy < min) +
      '<span class="desk-dial__face"><b>' + pad(val) + "</b><small>" + esc(unit) + "</small></span>" + b("+", stepBy, val + stepBy > max) + "</div></div>";
  }

  function paintRules() {
    var s = S.settings;
    var days = [T("Sunday", "الأحد"), T("Monday", "الاتنين"), T("Tuesday", "التلات"), T("Wednesday", "الأربع"), T("Thursday", "الخميس"), T("Friday", "الجمعة"), T("Saturday", "السبت")];
    return '<div class="card"><div class="card__head"><h2>' + esc(T("The rules", "القواعد")) + "</h2></div>" +
      '<ol class="desk-rules">' +
      "<li>" + esc(T("Stops payment, sign-in or loses data: fixed the same day, on any product.", "بيوقف الدفع أو الدخول أو بيضيّع بيانات: يتصلح نفس اليوم في أي منتج.")) + "</li>" +
      "<li>" + esc(T("Any other defect waits for fix day.", "أي عطل تاني يستنى يوم التصليح.")) + "</li>" +
      "<li>" + esc(T("A feature or idea waits until enough paying customers ask.", "الخاصية أو الفكرة تستنى لحد ما عدد كافي من الدافعين يطلبوها.")) + "</li>" +
      "<li>" + esc(T("On fix day the order is value per hour: many people, paying customers, no way round it, quick to do.", "في يوم التصليح الترتيب بالقيمة لكل ساعة: ناس كتير، دافعين، مفيش حل بديل، وسريعة.")) + "</li>" +
      "<li>" + esc(T("What does not fit in the day moves to the next one.", "اللي مايكفيش في اليوم يتنقل لليوم اللي بعده.")) + "</li>" +
      "<li>" + esc(T("Products in maintenance get one hour, on the first fix day of the month.", "المنتجات اللي في وضع صيانة ليها ساعة واحدة في أول يوم تصليح في الشهر.")) + "</li>" +
      "</ol>" +
      '<div class="desk-set">' +
        '<div class="desk-set__row desk-set__row--wide"><span class="desk-set__label">' + esc(T("Fix day", "يوم التصليح")) + '</span><div class="desk-week" role="group" aria-label="' + esc(T("Fix day", "يوم التصليح")) + '">' +
          days.map(function (d, i) {
            // each leaf shows the next date that weekday falls on, like a page of a desk calendar
            var next = today(), k = 0;
            while (parse(next).getDay() !== i && k++ < 7) next = addDays(next, 1);
            var dt = parse(next);
            return '<button type="button" class="desk-leaf' + (i === s.fixDay ? " is-on" : "") + '" data-fixday="' + i + '" aria-pressed="' + (i === s.fixDay) + '"><small>' + esc(d.slice(0, I18N.ar ? 12 : 3)) + "</small><b>" + dt.getDate() + "</b><i>" + esc(dt.toLocaleDateString(I18N.loc("en-GB"), { month: "short" })) + "</i></button>";
          }).join("") + "</div></div>" +
        dial(T("Hours in a fix day", "ساعات يوم التصليح"), "fixHours", s.fixHours, T("hours", "ساعات"), 1, 12, 1) +
        dial(T("Paying customers needed for a feature", "عدد الدافعين المطلوب للخاصية"), "promoteAt", s.promoteAt, T("customers", "عملاء"), 1, 20, 1) +
        dial(T("Days before an idea is dropped", "أيام قبل ما الفكرة تتشال"), "laterDays", s.laterDays, T("days", "يوم"), 7, 180, 1) +
      "</div></div>" +
      '<div class="card" hidden><div class="card__head"><h2>' + esc(T("Weekly schedule", "جدول الأسبوع")) + '</h2><button class="btn btn--ghost btn--sm" type="button" id="btnAddBlock">' + esc(T("+ Add a block", "+ ضيف خانة")) + "</button></div>" +
      '<p class="muted">' + esc(T("These are the blocks the Today tab shows. Pick the days, set the hours, name the work, and say if it comes round every week or every few. The suggested week gives each kind of work its own day: selling, scripts (every 3 weeks), shooting, montage, company pages, and the fix day. It assumes 3 videos a week in each language: English on LinkedIn and Instagram, Arabic on TikTok.",
          "دي الخانات اللي بتظهر في تبويب النهارده. اختار الأيام، حدد الساعات، سمّي الشغل، وقول هي كل أسبوع ولا كل كام أسبوع. الأسبوع المقترح بيدّي كل نوع شغل يومه: البيع، السكريبتات (كل 3 أسابيع)، التصوير، المونتاج، صفحات الشركات، ويوم التصليح. مبني على 3 فيديوهات في الأسبوع لكل لغة: إنجليزي على LinkedIn وInstagram، وعربي على TikTok.")) + "</p>" +
      S.blocks.map(function (b, i) {
        var short = I18N.ar ? ["ح", "ن", "ث", "ر", "خ", "ج", "س"] : ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
        return '<div class="desk-block" data-bi="' + i + '">' +
          '<div class="desk-days" role="group" aria-label="' + esc(T("Days", "الأيام")) + '">' + short.map(function (d, n) {
            var on = b.days.indexOf(n) !== -1;
            return '<button type="button" data-day="' + n + '" class="' + (on ? "is-on" : "") + '" aria-pressed="' + on + '" title="' + esc(days[n]) + '">' + d + "</button>";
          }).join("") + "</div>" +
          '<div class="desk-block__time" dir="ltr"><input type="time" data-bf="from" value="' + esc(b.from) + '" aria-label="' + esc(T("From", "من")) + '"><span>–</span><input type="time" data-bf="to" value="' + esc(b.to) + '" aria-label="' + esc(T("To", "لحد")) + '">' +
            '<select data-bf="every" aria-label="' + esc(T("How often", "كل قد إيه")) + '">' + [1, 2, 3, 4].map(function (n) { return '<option value="' + n + '"' + ((b.every || 1) === n ? " selected" : "") + ">" + esc(n === 1 ? T("every week", "كل أسبوع") : T("every " + n + " weeks", "كل " + n + " أسابيع")) + "</option>"; }).join("") + "</select></div>" +
          '<input type="text" data-bf="text" maxlength="90" value="' + esc(T(b.en, b.ar)) + '" aria-label="' + esc(T("What the block is for", "الخانة دي لإيه")) + '">' +
          '<button type="button" class="iconbtn" data-bdel aria-label="' + esc(T("Delete this block", "امسح الخانة")) + '">✕</button></div>';
      }).join("") + "</div>" +
      '<div class="card"><div class="card__head"><h2>' + esc(T("Backup", "نسخة احتياطية")) + "</h2></div>" +
      '<p class="muted">' + esc(LOCAL ? T("On this computer the desk is kept in this browser only. Download a copy now and then.", "على الجهاز ده المكتب محفوظ في المتصفح ده بس. نزّل نسخة كل فترة.") : T("The desk is saved on the site, behind your passkey.", "المكتب محفوظ على الموقع ورا مفتاح الدخول.")) + "</p>" +
      '<div class="form__actions"><button class="btn btn--ghost" type="button" id="btnExport">' + esc(T("Download a copy", "نزّل نسخة")) + '</button><label class="btn btn--ghost desk-import">' + esc(T("Load a copy", "حمّل نسخة")) + '<input type="file" id="importFile" accept="application/json,.json" hidden></label></div></div>';
  }

  function openCount(id) { return S.items.filter(function (it) { return it.product === id && it.status === "open"; }).length; }

  // option lists for a product's market and customer: [id, picture, English, Arabic]
  var PCOUNTRY = [["EG", "🇪🇬", "Egypt", "مصر"], ["AE", "🇦🇪", "UAE", "الإمارات"], ["SA", "🇸🇦", "Saudi Arabia", "السعودية"], ["QA", "🇶🇦", "Qatar", "قطر"], ["KW", "🇰🇼", "Kuwait", "الكويت"], ["GULF", "🌙", "The Gulf", "الخليج"], ["WW", "🌍", "Worldwide", "العالم كله"]];
  var PMODEL = [["b2c", "🧍", "B2C: the person who uses it pays", "B2C: اللي بيستخدمه هو اللي بيدفع"], ["b2b", "🏢", "B2B: a company pays", "B2B: شركة بتدفع"], ["b2b2c", "🤝", "B2B2C: a company buys it for its customers", "B2B2C: شركة بتشتريه لعملائها"], ["b2g", "🏛️", "B2G: a government body pays", "B2G: جهة حكومية بتدفع"]];
  var PWHO = [["student", "🎓", "Student", "طالب"], ["parent", "👪", "Parent", "ولي أمر"], ["teacher", "🧑‍🏫", "Teacher", "مدرس"], ["owner", "🏪", "Business owner", "صاحب بيزنس"], ["manager", "💼", "Manager", "مدير"], ["developer", "💻", "Developer", "مبرمج"], ["customer", "🙂", "Someone else", "حد تاني"]];
  var PAGE = [["u18", "", "Under 18", "أقل من 18"], ["18-24", "", "18–24", "18–24"], ["25-34", "", "25–34", "25–34"], ["35-44", "", "35–44", "35–44"], ["45+", "", "45 and over", "45 وأكتر"], ["mixed", "", "All ages", "كل الأعمار"]];
  var PCARES = [["results", "📈", "Results", "النتيجة"], ["price", "💸", "Price", "السعر"], ["time", "⏱️", "Saving time", "توفير الوقت"], ["trust", "🤝", "Trust", "الثقة"], ["ease", "✨", "Ease of use", "السهولة"]];
  var PCHAN = [["whatsapp", "", "WhatsApp", "واتساب"], ["instagram", "", "Instagram", "إنستجرام"], ["tiktok", "", "TikTok", "تيك توك"], ["facebook", "", "Facebook", "فيسبوك"], ["linkedin", "", "LinkedIn", "لينكدإن"], ["youtube", "", "YouTube", "يوتيوب"], ["search", "", "Google search", "بحث جوجل"]];
  function row(list, id) { for (var i = 0; i < list.length; i++) if (list[i][0] === id) return list[i]; return null; }
  function lab(r) { return r ? T(r[2], r[3]) : ""; }
  function labs(list, ids) { return (ids || []).map(function (id) { return lab(row(list, id)); }).filter(Boolean).join(T(", ", "، ")); }
  function shortModel(id) { return id ? id.toUpperCase() : ""; }

  /** One product as a card. In a preview the footer is left off and unanswered facts show a dash. */
  function productCard(q, preview) {
    var c = row(PCOUNTRY, q.country), w = row(PWHO, q.who), age = lab(row(PAGE, q.age));
    var fact = function (label, val) { return "<div><dt>" + esc(label) + "</dt><dd>" + (val || "—") + "</dd></div>"; };
    return '<article class="desk-prod' + (preview ? " desk-prod--live" : "") + '">' +
      '<div class="desk-prod__top">' + logo(q, "desk-logo--lg") + '<div class="desk-prod__id"><h2>' + esc(q.name || T("New product", "منتج جديد")) + "</h2>" +
        '<div class="desk-prod__tags">' + (q.category ? '<span class="chip">' + esc(q.category) + "</span>" : "") +
          (q.model ? '<span class="chip chip--model">' + esc(shortModel(q.model)) + "</span>" : "") +
          (c ? '<span class="chip"><span class="desk-flag">' + c[1] + "</span>" + esc(lab(c)) + "</span>" : "") + "</div></div></div>" +
      '<dl class="desk-prod__facts">' +
        fact(T("Customer", "العميل"), w ? '<span class="desk-flag">' + w[1] + "</span>" + esc(lab(w) + (age ? " · " + age : "")) : esc(q.target || "")) +
        fact(T("Cares about", "بيهمه"), esc(labs(PCARES, q.cares))) +
        fact(T("Reach them on", "توصلّه على"), esc(labs(PCHAN, q.channels))) +
        fact(T("Weekly number", "رقم الأسبوع"), esc(T(q.metric || "", q.metricAr || q.metric || "")) + (q.statsUrl ? ' <span class="chip chip--model">' + esc(T("auto", "تلقائي")) + "</span>" : "")) +
        (preview ? "" : fact(T("Open items", "حاجات مفتوحة"), String(openCount(q.id)))) +
      "</dl>" +
      (preview ? "" : '<div class="desk-prod__foot"><select data-mode="' + esc(q.id) + '" aria-label="' + esc(T("Status", "الحالة")) + '"><option value="active"' + (q.mode === "active" ? " selected" : "") + ">" + esc(T("Active", "شغال")) + '</option><option value="maintenance"' + (q.mode === "maintenance" ? " selected" : "") + ">" + esc(T("Maintenance", "صيانة")) + "</option></select>" +
        '<button class="btn btn--ghost btn--sm" type="button" data-pact="edit" data-pid="' + esc(q.id) + '">' + esc(T("Edit", "تعديل")) + "</button>" +
        '<button class="btn btn--ghost btn--sm" type="button" data-pact="del" data-pid="' + esc(q.id) + '">' + esc(T("Delete", "مسح")) + "</button></div>") +
      "</article>";
  }

  function paintProducts() {
    return '<div class="desk-prods">' + S.products.map(function (q) { return productCard(q, false); }).join("") +
      '<button class="desk-prod desk-prod--add" type="button" id="btnAddProduct"><b>+</b><span>' + esc(T("Add a product", "ضيف منتج")) + "</span></button></div>";
  }

  /* Setting a product up: the same one-question-at-a-time dialog as logging an
     item, with the card filling in beside it and a line on what each answer changes. */
  var prodDraft = null, pstep = 0, pfb = "", pPct = 0;

  function prodSteps() {
    return [
      { key: "name", text: true, logo: true, q: T("What is the product called?", "المنتج اسمه إيه؟"), ph: "GoBachaloria" },
      { key: "category", text: true, q: T("What category is it in?", "تصنيفه إيه؟"), ph: T("e.g. EdTech · exam prep", "مثال: تعليم · تحضير امتحانات") },
      { key: "country", opts: PCOUNTRY, q: T("Which country is it for?", "معمول لأنهي بلد؟") },
      { key: "model", opts: PMODEL, q: T("Who pays for it?", "مين اللي بيدفع؟") },
      { key: "who", opts: PWHO, q: T("Who is the customer?", "مين العميل؟") },
      { key: "age", opts: PAGE, q: T("How old are they?", "سنه قد إيه؟") },
      { key: "cares", multi: PCARES, q: T("What do they care about most?", "أكتر حاجة بتهمه إيه؟") },
      { key: "channels", multi: PCHAN, q: T("Where do you reach them?", "بتوصلّه فين؟") },
      { key: "metric", text: true, q: T("Which one number will you watch each week?", "أنهي رقم واحد هتتابعه كل أسبوع؟"), ph: T("e.g. paying students", "مثال: طلاب دافعين") },
      { key: "statsUrl", text: true, q: T("Where can the desk read its numbers? (optional)", "المكتب يقرا أرقامه منين؟ (اختياري)"), ph: "https://…/api/desk-stats" },
      { key: "statsKey", text: true, secret: true, q: T("Does that address need a key? (optional)", "العنوان ده محتاج مفتاح؟ (اختياري)"), ph: T("leave empty if it is open", "سيبه فاضي لو مفتوح") },
      { key: "statsUse", opts: [["paying", "💳", "Paying customers", "عدد الدافعين"], ["users", "👥", "All users", "كل المستخدمين"]], q: T("Which figure is this product's weekly number?", "أنهي رقم هو رقم الأسبوع للمنتج ده؟") },
      { key: "mode", opts: [["active", "🟢", "Active: a place in every fix day", "شغال: ليه مكان في كل يوم تصليح"], ["maintenance", "🟡", "Maintenance: one hour a month", "صيانة: ساعة في الشهر"]], q: T("Is it being worked on now?", "شغال عليه دلوقتي؟") }
    ];
  }

  /** What a product answer changes elsewhere in the desk. */
  function pfeed(key, val) {
    switch (key) {
      case "name": return T("Its tickets will be numbered " + (String(val).replace(/[^a-z]/gi, "").slice(0, 3).toUpperCase() || "TKT") + "-001, " + (String(val).replace(/[^a-z]/gi, "").slice(0, 3).toUpperCase() || "TKT") + "-002…", "تذاكره هتترقّم " + (String(val).replace(/[^a-z]/gi, "").slice(0, 3).toUpperCase() || "TKT") + "-001 وهكذا.");
      case "category": return T("Shown on the card and beside the product when you log something.", "بيظهر على الكارت وجنب المنتج وإنت بتسجّل حاجة.");
      case "country": return T("The flag goes on the card. Price, language and working days follow this market.", "العلم هيتحط على الكارت. السعر واللغة وأيام الشغل تبع السوق ده.");
      case "model": return { b2c: T("One person uses it and pays: a ticket counts each paying customer who asks.", "شخص واحد بيستخدم وبيدفع: التذكرة بتعدّ كل دافع طلبها."),
        b2b: T("The buyer and the user are different people. A request from the buyer weighs most.", "اللي بيشتري غير اللي بيستخدم. طلب اللي بيشتري هو الأتقل."),
        b2b2c: T("Two customers to please: the company that buys and the people it serves.", "عميلين ترضيهم: الشركة اللي بتشتري والناس اللي بتخدمهم."),
        b2g: T("Long buying cycles: a date they give you matters more than a count of requests.", "دورة شرا طويلة: الميعاد اللي يدّوهولك أهم من عدد الطلبات.") }[val];
      case "who": return T("Stories for this product will read “As a paying " + (WHO_NOUN[val] || ["customer"])[0] + ", I want…”.", "قصص المنتج ده هتتكتب «كـ" + (WHO_NOUN[val] || ["", "عميل"])[1] + " بيدفع، عايز…».");
      case "age": return val === "u18" ? T("Under 18: someone else usually pays, so ask the parent as well.", "أقل من 18: غالبًا حد تاني بيدفع، فاسأل ولي الأمر كمان.") : T("Noted on the card.", "اتكتب على الكارت.");
      case "cares": return T("Use these words in the “So that…” line of a story.", "استخدم الكلمات دي في سطر «عشان…» في القصة.");
      case "channels": return T("This is where the selling block in your day should be spent.", "ده المكان اللي خانة البيع في يومك المفروض تتصرف فيه.");
      case "metric": return T("You will be asked for this number every Thursday.", "هتتسأل عن الرقم ده كل خميس.");
      case "statsUrl": return val ? T("The desk will read { users, paying } from there each week, so this number no longer has to be typed.", "المكتب هيقرا { users, paying } من هناك كل أسبوع، فالرقم ما يتكتبش بالإيد.") : T("Not connected: this number is written by hand.", "مش متوصّل: الرقم بيتكتب بالإيد.");
      case "statsKey": return val ? T("Sent as “Authorization: Bearer …”. It is saved with the desk and never shown on the card.", "بيتبعت كـ «Authorization: Bearer …». بيتحفظ مع المكتب ومش بيظهر على الكارت.") : T("No key: the address must be readable without one.", "من غير مفتاح: العنوان لازم يتقري من غيره.");
      case "statsUse": return T("Both figures are kept either way, so conversion is always worked out.", "الرقمين بيتحفظوا في الحالتين، فنسبة التحويل دايمًا بتتحسب.");
      case "mode": return val === "maintenance" ? T("Only a grade 1 is fixed right away; the rest gets one hour a month.", "درجة 1 بس اللي بتتصلح فورًا؛ الباقي ليه ساعة في الشهر.") : T("It gets a place in every fix day.", "ليه مكان في كل يوم تصليح.");
    }
    return "";
  }

  function openProductForm(q) {
    prodDraft = q ? JSON.parse(JSON.stringify(q)) : { id: null, name: "", category: "", country: "", model: "", who: "", age: "", cares: [], channels: [], metric: "", mode: "active", logo: "" };
    prodDraft.cares = prodDraft.cares || []; prodDraft.channels = prodDraft.channels || [];
    pstep = 0; pfb = ""; pPct = 0;
    $("wizard").hidden = false;
    paintProdStep();
  }

  function paintProdStep() {
    var list = prodSteps(), body = $("wizardBody"), end = pstep >= list.length, s = list[pstep];
    var pct = Math.round(Math.min(pstep, list.length) / list.length * 100);
    var html = '<div class="desk-wiz__bar"><i style="--from:' + pPct + "%;--to:" + pct + '%"></i></div>' +
      (pfb ? '<p class="desk-wiz__fb">' + esc(pfb) + "</p>" : "") + '<div class="desk-wiz__step">';
    pPct = pct;
    if (end) {
      html += '<p class="desk-wiz__count">' + esc(T("Ready", "جاهز")) + "</p><h2>" + esc(T("That is the product. Save it?", "ده المنتج. تحفظه؟")) + "</h2>" +
        '<div class="form__actions"><button class="btn btn--primary" type="button" id="prodSave">' + esc(T("Save product", "احفظ المنتج")) + "</button></div>";
    } else {
      html += '<p class="desk-wiz__count">' + (pstep + 1) + " / " + list.length + "</p><h2>" + esc(s.q) + "</h2>";
      if (s.text) {
        html += '<form id="prodText" class="form" data-key="' + s.key + '">' +
          (s.logo ? '<div class="desk-logo-pick"><label class="btn btn--ghost btn--sm desk-import">' + esc(T("Choose a logo", "اختار لوجو")) + '<input type="file" id="prodLogo" accept="image/*" hidden></label>' +
            (prodDraft.logo ? '<button class="linklike" type="button" id="prodLogoClear">' + esc(T("Remove logo", "شيل اللوجو")) + "</button>" : "") + "</div>" : "") +
          '<input id="prodIn" type="' + (s.secret ? "password" : "text") + '" maxlength="' + (s.key === "statsUrl" || s.secret ? 300 : 90) + '"' + (s.secret ? ' autocomplete="off"' : "") + (s.key === "statsUrl" ? ' dir="ltr" inputmode="url"' : "") + ' value="' + esc(prodDraft[s.key] || "") + '" placeholder="' + esc(s.ph || "") + '"' + (s.key === "name" ? " required" : "") + ">" +
          '<div class="form__actions"><button class="btn btn--primary" type="submit">' + esc(T("Next", "التالي")) + "</button></div></form>";
      } else {
        var multi = !!s.multi, opts = s.opts || s.multi, cur = prodDraft[s.key];
        html += '<div class="desk-wiz__opts' + (opts.length > 5 ? " desk-wiz__opts--two" : "") + '">' + opts.map(function (o) {
          var on = multi ? cur.indexOf(o[0]) !== -1 : cur === o[0];
          return '<button type="button" class="desk-opt desk-opt--pick' + (on ? " desk-opt--on" : "") + '" data-p' + (multi ? "multi" : "key") + '="' + s.key + '" data-pval="' + esc(o[0]) + '"' + (multi ? ' aria-pressed="' + on + '"' : "") + ">" +
            (o[1] ? '<span class="desk-flag">' + o[1] + "</span>" : "") + esc(T(o[2], o[3])) + "</button>";
        }).join("") + "</div>" +
          (multi ? '<p class="muted">' + esc(T("Pick every one that fits.", "اختار كل اللي ينفع.")) + '</p><div class="form__actions"><button class="btn btn--primary" type="button" id="prodNext">' + esc(T("Next", "التالي")) + "</button></div>" : "");
      }
    }
    html += '</div><div class="desk-wiz__nav">' + (pstep > 0 ? '<button type="button" class="linklike" id="prodBack">' + esc(T("Back", "رجوع")) + "</button>" : "<span></span>") +
      (prodDraft.id && !end ? '<button type="button" class="linklike" id="prodSave">' + esc(T("Save now", "احفظ دلوقتي")) + "</button>" : "") +
      '<button type="button" class="linklike" id="wizCancel">' + esc(T("Cancel", "إلغاء")) + "</button></div>";
    body.innerHTML = '<div class="desk-wiz__q">' + html + '</div><aside class="desk-wiz__live"><p class="desk-live__cap">' + esc(T("Your product card, as you answer", "كارت المنتج وإنت بتجاوب")) + '</p><div id="prodLive">' + productCard(prodDraft, true) + "</div></aside>";
    body.classList.add("desk-wiz__card--split");
    var t = $("prodIn");
    if (t) t.focus();
  }

  function saveProduct() {
    var name = String(prodDraft.name || "").trim();
    if (!name) { pstep = 0; pfb = T("It needs a name first.", "محتاج اسم الأول."); return paintProdStep(); }
    var rec = prodDraft.id ? product(prodDraft.id) : { id: "p" + uid() };
    ["category", "country", "model", "who", "age", "mode", "logo", "statsUrl", "statsKey"].forEach(function (k) { rec[k] = prodDraft[k] || ""; });
    rec.statsUse = prodDraft.statsUse === "users" ? "users" : "paying";
    rec.name = name; rec.mode = rec.mode || "active";
    rec.cares = prodDraft.cares.slice(); rec.channels = prodDraft.channels.slice();
    var metric = String(prodDraft.metric || "").trim();
    if (metric !== (rec.metric || "")) { rec.metric = metric; delete rec.metricAr; } // the Arabic label belonged to the old one
    if (!prodDraft.id) S.products.push(rec);
    save(); closeWizard(); tab = "products"; render();
    sfx("good");
    toast(T("Product saved.", "المنتج اتحفظ."));
  }

  /** Shrinks a chosen picture to a small square so the saved desk stays light. */
  function readLogo(file, done) {
    var reader = new FileReader();
    reader.onload = function () {
      var img = new Image();
      img.onload = function () {
        var size = 128, c = document.createElement("canvas"), k = Math.min(size / img.width, size / img.height);
        c.width = c.height = size;
        c.getContext("2d").drawImage(img, (size - img.width * k) / 2, (size - img.height * k) / 2, img.width * k, img.height * k);
        done(c.toDataURL("image/png"));
      };
      img.onerror = function () { toast(T("That file is not a picture.", "الملف ده مش صورة."), true); };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  function render() {
    var now = today();
    expire(now);
    var p = plan(now);
    var counts = {
      today: S.items.filter(function (it) { return it.status === "open" && grade(it) === 1; }).length,
      fix: S.items.filter(function (it) { return it.status === "open" && grade(it) === 2; }).length,
      later: S.items.filter(function (it) { return it.status === "open" && grade(it) === 3; }).length,
      numbers: dueInfo(now).state === "soon" ? 0 : dueInfo(now).missing.length
    };
    var tabs = document.querySelectorAll("#tabbar .tab");
    for (var i = 0; i < tabs.length; i++) {
      var name = tabs[i].getAttribute("data-tab");
      tabs[i].classList.toggle("tab--active", name === tab);
      var c = tabs[i].querySelector(".tab__count");
      if (c) { c.textContent = counts[name] || ""; c.hidden = !counts[name]; }
    }
    var out = $("panel");
    if (tab === "numbers") setTimeout(function () { refreshLive(false); }, 0); // after the tiles exist
    if (tab === "today") out.innerHTML = paintToday(now, p);
    else if (tab === "fix") out.innerHTML = paintFix(now, p);
    else if (tab === "later") out.innerHTML = paintLater(now, p);
    else if (tab === "numbers") out.innerHTML = paintNumbers(now);
    else if (tab === "done") out.innerHTML = paintDone(now, p);
    else if (tab === "products") out.innerHTML = paintProducts();
    else out.innerHTML = paintRules();
    kickCrowds(); // any crowd just put on the page needs drawing
  }

  /* ---------- the capture wizard: one question at a time ---------- */

  var draft = null, step = 0;

  // Each step carries a tag naming the part of the ticket its answer writes,
  // so the questions read as the user story being filled in: As a / I want / So that.
  function steps() {
    var bug = draft.kind === "bug";
    var list = [
      { key: "product", tag: T("Product", "المنتج"), q: T("Which product?", "أنهي منتج؟") },
      { key: "title", tag: T("Title", "العنوان"), q: T("What is it, in one line?", "إيه هي، في سطر واحد؟"), text: true },
      { key: "kind", tag: T("Type", "النوع"), q: T("What kind of thing is it?", "دي إيه بالظبط؟"), opts: [
        ["bug", T("Something is broken or missing that should be there", "حاجة بايظة أو ناقصة والمفروض تكون موجودة")], ["feature", T("A new feature someone wants", "خاصية جديدة حد عايزها")], ["idea", T("My own idea or improvement", "فكرة أو تحسين من عندي")]] },
      { key: "source", tag: T("Story · As a…", "القصة · كـ…"), q: T("Who is this for? Who raised it?", "دي لمين؟ مين اللي قالها؟"), opts: [
        ["payer", T("A paying customer", "عميل بيدفع")], ["user", T("A user who does not pay", "مستخدم مش بيدفع")], ["me", T("Me, nobody asked", "أنا، محدش طلب")]] },
      { key: "goal", line: true, tag: T("Story · I want…", "القصة · عايز…"), q: T("What does that person want to do?", "الشخص ده عايز يعمل إيه؟"),
        ph: T("e.g. watch this week's lesson video (optional)", "مثال: يتفرج على فيديو درس الأسبوع (اختياري)") },
      { key: "benefit", line: true, tag: T("Story · So that…", "القصة · عشان…"), q: T("What do they get out of it?", "هيستفيد إيه منها؟"),
        ph: T("e.g. I can revise before the live class (optional)", "مثال: أقدر أراجع قبل الحصة اللايف (اختياري)") }
    ];
    if (bug) {
      list.push({ key: "blocks", tag: T("Priority", "الأولوية"), q: T("Does it stop any of these?", "بيوقف حاجة من دول؟"), opts: [
        ["money", T("People cannot pay", "الناس مش عارفة تدفع")], ["login", T("People cannot sign in or open it", "الناس مش عارفة تدخل أو تفتح")], ["data", T("Data is lost or wrong", "بيانات بتضيع أو غلط")], ["none", T("No, it is only annoying", "لأ، مزعج بس")]] });
      if (draft.blocks === "none" || draft.blocks == null) {
        list.push({ key: "workaround", tag: T("Today", "الوضع الحالي"), q: T("Can people get round it?", "الناس تقدر تتصرف من غيره؟"), opts: [["yes", T("Yes, there is another way", "أيوه، فيه طريقة تانية")], ["no", T("No, they are stuck", "لأ، واقفين")]] });
        list.push({ key: "freq", tag: T("Today", "الوضع الحالي"), q: T("How often does it happen?", "بيحصل قد إيه؟"), opts: [
          ["always", T("Every time", "كل مرة")], ["sometimes", T("Sometimes", "ساعات")], ["rare", T("It happened once", "حصل مرة واحدة")]] });
      }
      list.push({ key: "churn", tag: T("Risk", "الخطر"), q: T("Could a customer leave or ask for a refund over it?", "ممكن عميل يمشي أو يطلب فلوسه بسببها؟"), opts: [["yes", T("Yes", "أيوه")], ["no", T("No", "لأ")]] });
    } else if (draft.kind) {
      list.push({ key: "outcome", tag: T("Value", "القيمة"), q: T("What do you expect it to change?", "متوقع تغيّر إيه؟"), opts: [
        ["fresh", T("It brings new paying customers", "هتجيب دافعين جداد")], ["keep", T("It keeps current customers paying", "هتخلي الحاليين يكمّلوا يدفعوا")], ["nice", T("It is nicer, nothing more", "شكلها أحلى وخلاص")]] });
    }
    list.push({ key: "reach", tag: T("Impact", "التأثير"), q: T("How many people does it touch?", "بتأثر على كام واحد؟"), opts: [
      ["one", T("One person", "واحد")], ["few", T("A few", "كام واحد")], ["most", T("Most users", "أغلب المستخدمين")]] });
    list.push({ key: "requests", num: true, tag: T("Customers", "العملاء"), q: bug ? T("How many paying customers reported it so far?", "كام دافع بلّغ عنها لحد دلوقتي؟") : T("How many paying customers asked for it so far?", "كام دافع طلبها لحد دلوقتي؟") });
    list.push({ key: "due", date: true, tag: T("Due date", "الميعاد"), q: T("Is there a date it must be ready by?", "فيه ميعاد لازم تكون جاهزة قبله؟") });
    list.push({ key: "proof", tag: T("Evidence", "الدليل"), q: T("How do you know it is real?", "عرفت منين إنها حقيقية؟"), opts: [
      ["message", T("A customer told me", "عميل قالّي")], ["data", T("I saw it in the numbers or reproduced it", "شفتها في الأرقام أو جرّبتها بنفسي")], ["guess", T("I am guessing", "تخمين مني")]] });
    list.push({ key: "shots", shots: true, tag: T("Screenshots", "صور الشاشة"), q: T("Got a screenshot of how it looks now?", "عندك صورة للشاشة زي ما هي دلوقتي؟") });
    list.push({ key: "effort", clock: true, tag: T("Estimate", "التقدير"), q: T("How long will it take?", "هتاخد وقت قد إيه؟") });
    list.push({ key: "done", line: true, last: true, tag: T("Acceptance criteria", "شروط القبول"), q: T("How will you know it is done?", "هتعرف إزاي إنها خلصت؟"),
      ph: T("e.g. a student pays with Vodafone Cash and gets access (optional)", "مثال: طالب يدفع بـ Vodafone Cash ويدخل (اختياري)") });
    return list;
  }

  /** What one answer does to the verdict, said in a line, so each step teaches the rule behind it. */
  function feedback(key, val) {
    var n, need;
    switch (key) {
      case "product":
        return product(val).mode === "maintenance"
          ? T("In maintenance: only a grade 1 is fixed right away. Anything else gets one hour, on the first fix day of the month.", "في وضع صيانة: درجة 1 بس اللي بتتصلح فورًا. أي حاجة تانية ليها ساعة في أول يوم تصليح في الشهر.")
          : T("An active product: it gets a place in every fix day.", "منتج شغال: ليه مكان في كل يوم تصليح.");
      case "kind":
        return val === "bug" ? T("A defect gets fixed. The next answers decide when.", "العطل بيتصلح. الإجابات الجاية بتحدد إمتى.")
          : T("It waits until " + S.settings.promoteAt + " paying customers ask for it.", "هتستنى لحد ما " + S.settings.promoteAt + " دافعين يطلبوها.");
      case "source":
        return { payer: T("Paying customer: value ×3.", "عميل بيدفع: القيمة ×3."), user: T("Non-paying user: value ×2.", "مستخدم مش بيدفع: القيمة ×2."), me: T("Only you: value ×1. Nobody is waiting for it yet.", "إنت بس: القيمة ×1. محدش مستنيها لسه.") }[val];
      case "blocks":
        return val === "none" ? T("Not grade 1. It does not interrupt today.", "مش درجة 1. مش هتقطع يومك.")
          : T("Grade 1: fix it today, before anything else.", "درجة 1: تتصلح النهارده قبل أي حاجة.");
      case "workaround":
        return val === "yes" ? T("People can carry on, so it can wait: value ×1.", "الناس تقدر تكمّل، يبقى تستنى: القيمة ×1.") : T("People are stuck: value ×2.", "الناس واقفة: القيمة ×2.");
      case "freq":
        return { always: T("Every time: full value.", "كل مرة: القيمة كاملة."), sometimes: T("Sometimes: value ×0.75.", "ساعات: القيمة ×0.75."), rare: T("Once: value ×0.5. Watch whether it comes back.", "مرة واحدة: القيمة ×0.5. شوف هترجع ولا لأ.") }[val];
      case "churn":
        return val === "yes" ? T("It can cost you a customer: value ×1.5.", "ممكن تخسّرك عميل: القيمة ×1.5.") : T("Nobody leaves over it: no change.", "محدش هيمشي بسببها: مفيش تغيير.");
      case "outcome":
        return { fresh: T("New paying customers: value ×3.", "دافعين جداد: القيمة ×3."), keep: T("Keeps customers paying: value ×2.", "بتخلي العملاء يكمّلوا: القيمة ×2."), nice: T("Nicer only: value ×1. It will sit low in the queue.", "شكل بس: القيمة ×1. هتبقى تحت في الطابور.") }[val];
      case "reach":
        return { one: T("One person: value ×1.", "واحد: القيمة ×1."), few: T("A few people: value ×3.", "كام واحد: القيمة ×3."), most: T("Most users: value ×5.", "الأغلب: القيمة ×5.") }[val];
      case "requests":
        n = +val || 0;
        if (draft.kind === "bug") return T("+" + Math.min(n, 5) + " to the value (5 at most).", "+" + Math.min(n, 5) + " على القيمة (5 بحد أقصى).");
        need = S.settings.promoteAt - n;
        return need <= 0 ? T("Enough asked: grade 2, it goes to the fix day.", "عدد كافي طلبها: درجة 2، هتروح يوم التصليح.")
          : T("Grade 3 for now. " + need + " more to go, or it is dropped in " + S.settings.laterDays + " days.", "درجة 3 دلوقتي. فاضل " + need + "، وإلا تتشال بعد " + S.settings.laterDays + " يوم.");
      case "due":
        n = daysBetween(today(), val);
        return n <= 7 ? T("Due in " + Math.max(0, n) + " days: +10 to the value.", "فاضل " + Math.max(0, n) + " يوم: +10 على القيمة.")
          : n <= 31 ? T("Due in " + n + " days: +3 to the value.", "فاضل " + n + " يوم: +3 على القيمة.")
          : T("More than a month away: nothing added yet.", "أبعد من شهر: مفيش زيادة لسه.");
      case "proof":
        return val === "guess" ? T("A guess: the value is halved until a customer confirms it.", "تخمين: القيمة بتتنصّص لحد ما عميل يأكدها.") : T("Real evidence: full value.", "دليل حقيقي: القيمة كاملة.");
      case "effort":
        return +val > S.settings.fixHours ? T("Longer than one fix day: it has to be split.", "أطول من يوم تصليح: لازم تتقسم.")
          : T("The value is divided by " + hours(+val) + ". Quick jobs rise.", "القيمة هتتقسم على " + hours(+val) + ". السريع بيطلع فوق.");
    }
    return "";
  }

  /** The answers given so far, each with what it did to the verdict; the latest is marked. */
  function trail(list) {
    var rows = [], i, s, v, label, k;
    for (i = 0; i < Math.min(step, list.length); i++) {
      s = list[i]; v = draft[s.key];
      if (v == null || v === "" || s.line || s.shots) continue;
      label = s.date ? nice(v) : s.clock ? hours(+v) : s.key === "product" ? product(v).name : String(v);
      if (s.opts) for (k = 0; k < s.opts.length; k++) if (s.opts[k][0] === String(v)) label = s.opts[k][1];
      rows.push({ a: label, f: feedback(s.key, v) });
    }
    if (!rows.length) return "";
    return '<ol class="desk-trail" id="wizTrail">' + rows.map(function (r, n) {
      return '<li class="' + (n === rows.length - 1 ? "is-last" : "") + '"><b>' + esc(r.a) + "</b>" + (r.f ? "<span>" + esc(r.f) + "</span>" : "") + "</li>";
    }).join("") + "</ol>";
  }

  /** The grade as soon as the answers settle it, shown while the questions are still running. */
  function soFar(list) {
    var decided = false, i;
    for (i = 0; i < Math.min(step, list.length); i++) {
      if (list[i].key === "blocks" && draft.blocks && draft.blocks !== "none") decided = true;       // grade 1 is settled at once
      if (list[i].key === "blocks" && draft.blocks === "none") decided = true;                        // a defect that waits is grade 2
      if (list[i].key === "requests" && draft.kind !== "bug") decided = true;                         // a feature is settled by who asked
    }
    if (!decided) return "";
    var g = grade({ kind: draft.kind, blocks: draft.kind === "bug" ? draft.blocks : "none", requests: +draft.requests || 0 });
    return '<span class="desk-sofar desk-sofar--g' + g + '">' + esc(T("So far: ", "لحد دلوقتي: ") + GRADE[g]) + "</span>";
  }

  function openWizard(existing) {
    draft = existing ? JSON.parse(JSON.stringify(existing)) : { id: null, requests: null, note: "" };
    if (existing) {
      draft.workaround = existing.workaround ? "yes" : "no";
      draft.churn = existing.churn ? "yes" : "no";
      draft.effort = String(existing.effort);
      draft.requests = existing.requests || 0;
    }
    step = 0; wizPct = 0; calView = "";
    liveLast = {};
    $("wizard").hidden = false;
    paintStep();
  }
  function closeWizard() { usersView = null; $("wizardBody").classList.remove("desk-wiz__card--wide"); if (shotCtx && !shotCtx.saved) shotCtx = null; $("wizard").hidden = true; draft = null; prodDraft = null; clearInterval(liveTimer); $("wizardBody").classList.remove("desk-wiz__card--split"); }

  function paintStep() {
    var list = steps(), body = $("wizardBody");
    if (step >= list.length) return paintVerdict();
    var s = list[step];
    var pct = Math.round(step / list.length * 100);
    liveKey = s.key;
    var html = '<div class="desk-wiz__bar"><i style="--from:' + wizPct + "%;--to:" + pct + '%"></i></div>' + trail(list) +
      '<div class="desk-wiz__step' + (sameStep ? " is-same" : "") + '"><p class="desk-wiz__count">' + (step + 1) + " / " + list.length + soFar(list) + "</p>" +
      (s.tag ? '<p class="desk-wiz__tag">' + esc(T("This writes: ", "ده بيكتب: ")) + "<b>" + esc(s.tag) + "</b></p>" : "") + "<h2>" + esc(s.q) + "</h2>";
    if (s.text) {
      html += '<form id="wizText" class="form"><input id="wizTitle" type="text" maxlength="140" required value="' + esc(draft.title || "") + '" placeholder="' + esc(T("e.g. Vodafone Cash payment fails", "مثال: الدفع بـ Vodafone Cash مش شغال")) + '">' +
        '<textarea id="wizNote" rows="3" maxlength="600" placeholder="' + esc(T("Details, who said it, a link (optional)", "تفاصيل، مين قالها، لينك (اختياري)")) + '">' + esc(draft.note || "") + "</textarea>" +
        '<div class="form__actions"><button class="btn btn--primary" type="submit">' + esc(T("Next", "التالي")) + "</button></div></form>";
    } else if (s.num) {
      if (draft.requests == null) draft.requests = draft.source === "payer" ? 1 : 0;
      shotCtx = { target: draft, saved: false, repaint: function () { sameStep = true; paintStep(); } };
      html += '<div class="desk-wiz__num"><button type="button" class="desk-wiz__pm" id="wizMinus" aria-label="' + esc(T("One fewer", "واحد أقل")) + '"' + (draft.requests ? "" : " disabled") + '>−</button>' +
        '<b id="wizCount">' + draft.requests + '</b><button type="button" class="desk-wiz__pm" id="wizPlus" aria-label="' + esc(T("One more", "واحد كمان")) + '">+</button></div>' +
        '<p class="muted center">' + esc(T("You can change this later on the item itself.", "تقدر تغيّره بعدين من على الحاجة نفسها.")) + "</p>" +
        clientsBlock(draft, true) +
        '<div class="form__actions"><button class="btn btn--primary" type="button" id="wizNext">' + esc(T("Next", "التالي")) + "</button></div>";
    } else if (s.shots) {
      shotCtx = { target: draft, saved: false, repaint: function () { sameStep = true; paintStep(); } };
      html += '<div class="desk-shots">' + shotStrip(draft, "before", true) + "</div>" +
        '<p class="muted">' + esc(T("Optional. Choose pictures, or paste one with Cmd+V. Up to " + SHOT_MAX + ". You can add the “after” pictures later, from the ticket.", "اختياري. اختار صور، أو الزق صورة بـ Cmd+V. لحد " + SHOT_MAX + ". صور «بعد» تتضاف بعدين من التذكرة.")) + "</p>" +
        '<div class="form__actions"><button class="btn btn--primary" type="button" id="wizNext">' + esc(T("Next", "التالي")) + "</button></div>";
    } else if (s.date) {
      // a calendar drawn here rather than the browser's own date picker, so it matches the desk
      var now0 = today(), view = calView || (draft.due || now0).slice(0, 7), vy = +view.slice(0, 4), vm = +view.slice(5, 7) - 1;
      calView = view;
      var first = new Date(vy, vm, 1), count = new Date(vy, vm + 1, 0).getDate(), cells = "", di;
      var dows = I18N.ar ? ["ح", "ن", "ث", "ر", "خ", "ج", "س"] : ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
      for (di = 0; di < first.getDay(); di++) cells += "<span></span>";
      for (di = 1; di <= count; di++) {
        var dayStr = vy + "-" + pad(vm + 1) + "-" + pad(di);
        cells += '<button type="button" data-cal="' + dayStr + '" class="' + (dayStr === draft.due ? "is-on" : "") + (dayStr === now0 ? " is-today" : "") + '"' + (dayStr < now0 ? " disabled" : "") +
          ' aria-pressed="' + (dayStr === draft.due) + '">' + di + "</button>";
      }
      var quick = [[3, T("In 3 days", "بعد 3 أيام")], [7, T("In a week", "بعد أسبوع")], [14, T("In 2 weeks", "بعد أسبوعين")], [30, T("In a month", "بعد شهر")]];
      html += '<div class="desk-cal">' +
        '<div class="desk-cal__head"><button type="button" id="calPrev" aria-label="' + esc(T("Previous month", "الشهر اللي فات")) + '"' + (view <= now0.slice(0, 7) ? " disabled" : "") + ">‹</button>" +
          "<b>" + esc(first.toLocaleDateString(I18N.loc("en-GB"), { month: "long", year: "numeric" })) + "</b>" +
          '<button type="button" id="calNext" aria-label="' + esc(T("Next month", "الشهر الجاي")) + '">›</button></div>' +
        '<div class="desk-cal__dow">' + dows.map(function (d) { return "<span>" + d + "</span>"; }).join("") + "</div>" +
        '<div class="desk-cal__grid">' + cells + "</div>" +
        '<div class="desk-cal__quick">' + quick.map(function (qk) { return '<button type="button" class="chip' + (draft.due === addDays(now0, qk[0]) ? " chip--on" : "") + '" data-cal="' + addDays(now0, qk[0]) + '">' + esc(qk[1]) + "</button>"; }).join("") + "</div></div>" +
        '<p class="desk-cal__pick">' + (draft.due ? "<b>" + esc(nice(draft.due)) + "</b> · " + esc(feedback("due", draft.due)) : esc(T("Pick a day, or say there is no date.", "اختار يوم، أو قول مفيش ميعاد."))) + "</p>" +
        '<div class="form__actions"><button class="btn btn--primary" type="button" id="wizNext"' + (draft.due ? "" : " disabled") + ">" + esc(T("Next", "التالي")) + '</button><button class="btn btn--ghost" type="button" id="wizNoDate">' + esc(T("No date", "مفيش ميعاد")) + "</button></div>";
    } else if (s.clock) {
      // days : hours : minutes, where a day is one fix day's worth of hours
      var H = S.settings.fixHours, eff = Math.max(0.25, parseFloat(draft.effort) || 1);
      var ed = Math.floor(eff / H), rest = eff - ed * H, eh = Math.floor(rest), em = Math.round((rest - eh) * 60);
      draft.effort = String(eff);
      var top = eff >= H * 20;
      var pm = function (id, sign, off) { return '<button type="button" class="desk-wiz__pm desk-wiz__pm--sm" id="' + id + '"' + (off ? " disabled" : "") + ">" + sign + "</button>"; };
      var col = function (id, val, label, step) { return '<div class="desk-clock__col">' + pm(id + "p", "+", top) + "<b>" + pad(val) + "</b>" + pm(id + "m", "−", eff - step < 0.25) + "<small>" + esc(label) + "</small></div>"; };
      html += '<div class="desk-clock" dir="ltr">' + col("effD", ed, T("days", "أيام"), H) + '<span class="desk-clock__sep">:</span>' +
        col("effH", eh, T("hours", "ساعات"), 1) + '<span class="desk-clock__sep">:</span>' + col("effM", em, T("minutes", "دقايق"), 0.25) + "</div>" +
        '<p class="muted center">' + esc(T("A day here is one fix day: " + H + " working hours. ", "اليوم هنا يوم تصليح واحد: " + H + " ساعات شغل. ") + feedback("effort", eff)) + "</p>" +
        '<div class="form__actions"><button class="btn btn--primary" type="button" id="wizNext">' + esc(T("Next", "التالي")) + "</button></div>";
    } else if (s.key === "product") {
      html += '<div class="desk-wiz__opts">' + S.products.map(function (q) {
        return '<button type="button" class="desk-opt desk-opt--prod' + (draft.product === q.id ? " desk-opt--on" : "") + '" data-key="product" data-val="' + esc(q.id) + '">' + logo(q) +
          "<span><b>" + esc(q.name) + "</b>" + (q.category ? "<small>" + esc(q.category) + "</small>" : "") + "</span></button>";
      }).join("") + "</div>";
    } else if (s.line) {
      html += '<form id="wizLine" class="form" data-key="' + s.key + '"><input id="wizDone" type="text" maxlength="160" value="' + esc(draft[s.key] || "") + '" placeholder="' + esc(s.ph || "") + '">' +
        '<div class="form__actions"><button class="btn btn--primary" type="submit">' + esc(s.last ? T("See the verdict", "شوف الحكم") : T("Next", "التالي")) + "</button></div></form>";
    } else {
      html += '<div class="desk-wiz__opts">' + s.opts.map(function (o) {
        return '<button type="button" class="desk-opt' + (String(draft[s.key]) === o[0] ? " desk-opt--on" : "") + '" data-key="' + s.key + '" data-val="' + esc(o[0]) + '">' + esc(o[1]) + "</button>";
      }).join("") + "</div>";
    }
    wizPct = pct; sameStep = false;
    html += '</div><div class="desk-wiz__nav">' + (step > 0 ? '<button type="button" class="linklike" id="wizBack">' + esc(T("Back", "رجوع")) + "</button>" : "<span></span>") +
      '<button type="button" class="linklike" id="wizCancel">' + esc(T("Cancel", "إلغاء")) + "</button></div>";
    body.innerHTML = '<div class="desk-wiz__q">' + html + '</div><aside class="desk-wiz__live" id="wizLive"></aside>';
    body.classList.add("desk-wiz__card--split");
    paintLive(s.key);
    var t = $("wizTitle") || $("wizDone");
    if (t) t.focus();
    var tr = $("wizTrail");
    if (tr) tr.scrollTop = tr.scrollHeight; // the newest feedback is at the bottom
  }

  function build() {
    var now = today(), old = draft.id ? find(draft.id) : null, bug = draft.kind === "bug";
    var req = Math.max(0, parseInt(draft.requests, 10) || 0);
    // only a new customer asking restarts the countdown; re-answering does not
    var grew = !old || req > (old.requests || 0);
    return {
      id: draft.id || uid(),
      product: draft.product, title: String(draft.title || "").trim(), note: String(draft.note || "").trim(),
      kind: draft.kind, source: draft.source,
      blocks: bug ? (draft.blocks || "none") : "none",
      workaround: bug ? draft.workaround === "yes" : true,
      freq: bug ? (draft.freq || "always") : undefined,
      churn: bug && draft.churn === "yes",
      outcome: bug ? undefined : draft.outcome,
      reach: draft.reach, effort: Math.max(0.25, parseFloat(draft.effort) || 1),
      due: draft.due || "", deadline: "none", proof: draft.proof || "message",
      done: String(draft.done || "").trim(),
      shots: draft.shots,
      clients: draft.clients,
      goal: String(draft.goal || "").trim(),
      benefit: String(draft.benefit || "").trim(),
      no: old ? old.no : undefined,
      requests: req,
      created: old ? old.created : now,
      touched: grew ? now : old.touched,
      touchedAt: grew ? Date.now() : (old.touchedAt || parse(old.touched || old.created).getTime()),
      status: "open"
    };
  }

  function paintVerdict() {
    var it = build(), now = today();
    // score it against the real queue without saving yet
    var keep = S.items;
    S.items = keep.filter(function (x) { return x.id !== it.id; }).concat([it]);
    var p = plan(now), g = grade(it), pos = 0;
    if (g === 2 && p.when[it.id]) p.days.forEach(function (d) { if (d.date === p.when[it.id]) pos = d.items.indexOf(it) + 1; });
    var why = reason(it, now, p);
    S.items = keep;
    $("wizardBody").innerHTML = trail(steps()) + '<p class="desk-wiz__count">' + esc(T("Verdict", "الحكم")) + '</p><div class="desk-verdict desk-verdict--g' + g + '"><b>' + esc(GRADE[g]) + "</b><h2>" + esc(it.title) + "</h2><p>" + esc(why) + "</p>" +
      (g === 2 ? "<p>" + esc(T("Score ", "النقط ")) + (Math.round(score(it, now) * 10) / 10) + esc(T(" (value ", " (القيمة ")) + (Math.round(value(it, now) * 10) / 10) + " ÷ " + esc(hours(it.effort)) + ")</p>" : "") +
      (it.effort > S.settings.fixHours ? '<p class="form__note form__note--warn">' + esc(T("Longer than one fix day. Split it into smaller items before Saturday.", "أطول من يوم تصليح. قسّمها لحاجات أصغر قبل السبت.")) + "</p>" : "") +
      (pos ? "<p>" + esc(T("Position " + pos + " in that day's queue.", "ترتيبها " + pos + " في طابور اليوم ده.")) + "</p>" : "") +
      (g !== 1 ? '<p class="muted">' + esc(T("Close this and go back to what you were doing.", "اقفل ده وارجع للي كنت بتعمله.")) + "</p>" : "") + "</div>" +
      '<div class="form__actions"><button class="btn btn--primary" type="button" id="wizSave">' + esc(T("Save", "احفظ")) + '</button><button class="btn btn--ghost" type="button" id="wizBack">' + esc(T("Change answers", "غيّر الإجابات")) + "</button></div>";
    var vb = $("wizardBody");
    vb.innerHTML = '<div class="desk-wiz__q">' + vb.innerHTML + '</div><aside class="desk-wiz__live" id="wizLive"></aside>';
    paintLive("");
    sfx("next");
  }

  /* ---------- screenshots: before and after ----------
     Pictures are kept inside the desk's one document, so each is shrunk hard
     on the way in and their number is capped; the whole document has to stay
     under what one save request can carry. */
  var SHOT_MAX = 4, SHOT_BYTES = 3800000;
  var shotCtx = null;      // where an added picture goes right now: { target, saved, repaint }
  var ticketItem = null;   // the item whose full ticket is open
  var view = null;         // the picture viewer: { it, side, i } or { it, cmp: i }

  function shotsOf(o) {
    o.shots = o.shots || {};
    o.shots.before = o.shots.before || []; o.shots.after = o.shots.after || [];
    return o.shots;
  }
  // a picture is its data URL, or { u, by } once it has been marked as coming from someone
  function su(x) { return typeof x === "string" ? x : (x && x.u) || ""; }
  function sb(x) { return typeof x === "string" ? "" : (x && x.by) || ""; }
  function okShot(x) { return su(x).indexOf("data:image/") === 0; } // only pictures this page made

  /* The people behind a ticket. Every field is optional: a name alone, or just a number, is enough. */
  function clientsOf(o) { o.clients = o.clients || []; return o.clients; }
  function clientLabel(c) { return c.name || c.email || c.phone || T("Client", "عميل"); }
  function whoLabel(o, id) {
    if (id === "me") return T("Me", "أنا");
    var c = (o.clients || []).filter(function (x) { return x.id === id; })[0];
    return c ? clientLabel(c) : "";
  }
  function clientsBlock(o, editable) {
    var list = o.clients || [];
    return '<div class="desk-clients"><p class="desk-clients__label">' + esc(T("Clients behind it", "العملاء اللي وراها")) + " · " + list.length + "</p>" +
      (list.length ? "<ul>" + list.map(function (c) {
        var tel = String(c.phone || "").replace(/[^0-9+]/g, "");
        return "<li><b>" + esc(c.name || T("No name", "من غير اسم")) + "</b>" +
          (c.email ? '<a href="mailto:' + encodeURIComponent(c.email) + '">' + esc(c.email) + "</a>" : "") +
          (c.phone ? (tel ? '<a dir="ltr" href="tel:' + esc(tel) + '">' + esc(c.phone) + "</a>" : "<span>" + esc(c.phone) + "</span>") : "") +
          (editable ? '<button type="button" data-clientdel="' + esc(c.id) + '" aria-label="' + esc(T("Remove this client", "شيل العميل ده")) + '">×</button>' : "") + "</li>";
      }).join("") + "</ul>" : "") +
      (editable ? '<form class="desk-clients__add" data-clientform novalidate>' +
        '<input name="name" type="text" maxlength="60" placeholder="' + esc(T("Name", "الاسم")) + '" aria-label="' + esc(T("Name", "الاسم")) + '">' +
        '<input name="email" type="email" maxlength="90" placeholder="' + esc(T("Email", "الإيميل")) + '" aria-label="' + esc(T("Email", "الإيميل")) + '">' +
        '<input name="phone" type="tel" maxlength="30" dir="ltr" placeholder="' + esc(T("Number", "الرقم")) + '" aria-label="' + esc(T("Number", "الرقم")) + '">' +
        '<button class="btn btn--ghost btn--sm" type="submit">' + esc(T("+ Add client", "+ ضيف عميل")) + "</button></form>" +
        '<p class="desk-shots__hint">' + esc(T("All optional: a name, an email or a number is enough.", "كله اختياري: اسم أو إيميل أو رقم كفاية.")) + "</p>" : "") + "</div>";
  }
  function shotCount(o, side) { return o.shots && o.shots[side] ? o.shots[side].length : 0; }

  function readShot(file, done) {
    var reader = new FileReader();
    reader.onload = function () {
      var img = new Image();
      img.onload = function () {
        var k = Math.min(1, 1000 / Math.max(img.width, img.height)), c = document.createElement("canvas");
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        var x = c.getContext("2d");
        x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height); // a transparent PNG would turn black as a JPEG
        x.drawImage(img, 0, 0, c.width, c.height);
        done(c.toDataURL("image/jpeg", 0.62));
      };
      img.onerror = function () { done(null); };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  function addShots(side, files) {
    var ctx = shotCtx;
    if (!ctx) return;
    var list = shotsOf(ctx.target)[side], todo = [].slice.call(files).filter(function (f) { return /^image\//.test(f.type); }), i = 0;
    if (!todo.length) return;
    (function next() {
      if (i >= todo.length || list.length >= SHOT_MAX) {
        if (i < todo.length) toast(T("Up to " + SHOT_MAX + " pictures on each side.", "لحد " + SHOT_MAX + " صور في كل ناحية."), true);
        if (ctx.saved) save();
        sfx("tap");
        return ctx.repaint();
      }
      readShot(todo[i++], function (url) {
        if (!url) toast(T("That file is not a picture.", "الملف ده مش صورة."), true);
        else {
          list.push({ u: url, by: "" });
          if (JSON.stringify(S).length + (ctx.saved ? 0 : url.length) > SHOT_BYTES) {
            list.pop(); i = todo.length;
            toast(T("The desk is full of pictures. Remove some from closed tickets first.", "المكتب اتملى صور. شيل شوية من التذاكر المقفولة الأول."), true);
          }
        }
        next();
      });
    })();
  }

  /** One side's pictures as a strip that scrolls sideways, with a tile to add more. */
  function shotStrip(o, side, editable) {
    var list = (o.shots && o.shots[side]) || [];
    return '<div class="desk-shots__row desk-shots__row--' + side + '"><small>' + esc(side === "before" ? T("Before", "قبل") : T("After", "بعد")) + " · " + list.length + "</small>" +
      '<div class="desk-shots__strip">' + list.map(function (u, i) {
        if (!okShot(u)) return "";
        var by = sb(u), from = whoLabel(o, by);
        var pick = editable ? '<select data-shotby="' + side + ":" + i + '" aria-label="' + esc(T("Who this picture is from", "الصورة دي من مين")) + '"><option value="">' + esc(T("From…", "من…")) + '</option><option value="me"' + (by === "me" ? " selected" : "") + ">" + esc(T("Me", "أنا")) + "</option>" +
          (o.clients || []).map(function (c) { return '<option value="' + esc(c.id) + '"' + (by === c.id ? " selected" : "") + ">" + esc(clientLabel(c)) + "</option>"; }).join("") + "</select>"
          : (from ? "<figcaption>" + esc(from) + "</figcaption>" : "");
        return '<figure><img alt="' + esc((side === "before" ? T("Before", "قبل") : T("After", "بعد")) + " " + (i + 1) + (from ? T(", from ", "، من ") + from : "")) + '" src="' + esc(su(u)) + '" data-shot="' + side + ":" + i + '">' +
          (editable ? '<button type="button" data-shotdel="' + side + ":" + i + '" aria-label="' + esc(T("Remove this picture", "شيل الصورة دي")) + '">×</button>' : "") + pick + "</figure>";
      }).join("") +
      (editable && list.length < SHOT_MAX ? '<label class="desk-shots__add" title="' + esc(T("Add pictures", "ضيف صور")) + '"><b>+</b><span>' + esc(T("Add", "ضيف")) + '</span><input type="file" accept="image/*" multiple hidden data-shotadd="' + side + '"></label>' : "") +
      (!editable && !list.length ? '<span class="muted">—</span>' : "") + "</div></div>";
  }

  function paintTicketShots() {
    var box = $("ticketShots"), it = ticketItem;
    if (!box || !it) return;
    var b = shotCount(it, "before"), a = shotCount(it, "after");
    box.innerHTML = clientsBlock(it, true) + '<p class="desk-tix__label">' + esc(T("Screenshots", "صور الشاشة")) + "</p>" + shotStrip(it, "before", true) + shotStrip(it, "after", true) +
      (b && a ? '<button class="btn btn--primary btn--sm" type="button" id="shotCompare">' + esc(T("See before and after", "شوف قبل وبعد")) + "</button>"
        : '<p class="desk-shots__hint">' + esc(b ? T("Add an “after” picture when it is fixed, to compare the two.", "ضيف صورة «بعد» لما تتصلح، عشان تقارن الاتنين.") : T("Optional. Add pictures, or paste one with Cmd+V.", "اختياري. ضيف صور، أو الزق صورة بـ Cmd+V.")) + "</p>");
  }

  /** The viewer: one picture at a time with arrows, or a before/after pair under a sliding divider. */
  function paintView() {
    var box = $("shotViewBody"), sh = shotsOf(view.it), html;
    if (view.cmp != null) {
      var n = Math.min(sh.before.length, sh.after.length);
      view.cmp = Math.max(0, Math.min(view.cmp, n - 1));
      html = '<p class="desk-view__cap">' + esc(T("Before and after", "قبل وبعد")) + (n > 1 ? " · " + (view.cmp + 1) + " / " + n : "") + "</p>" +
        '<div class="desk-cmp" id="cmpBox"><img class="desk-cmp__after" alt="' + esc(T("After", "بعد")) + '" src="' + esc(su(sh.after[view.cmp])) + '">' +
        '<div class="desk-cmp__before" id="cmpBefore"><img alt="' + esc(T("Before", "قبل")) + '" src="' + esc(su(sh.before[view.cmp])) + '"></div>' +
        '<i class="desk-cmp__line" id="cmpLine"></i><span class="desk-cmp__tag desk-cmp__tag--b">' + esc(T("Before", "قبل")) + '</span><span class="desk-cmp__tag desk-cmp__tag--a">' + esc(T("After", "بعد")) + "</span></div>" +
        '<input type="range" id="cmpRange" min="0" max="100" value="50" aria-label="' + esc(T("Slide between before and after", "حرّك بين قبل وبعد")) + '">' +
        '<div class="desk-view__nav">' + (n > 1 ? '<button class="btn btn--ghost btn--sm" type="button" id="shotPrev">‹</button><button class="btn btn--ghost btn--sm" type="button" id="shotNext">›</button>' : "") +
        '<button class="btn btn--ghost btn--sm" type="button" id="shotClose">' + esc(T("Close", "قفل")) + "</button></div>";
    } else {
      var list = sh[view.side];
      view.i = (view.i + list.length) % list.length;
      var other = view.side === "before" ? "after" : "before";
      var from = whoLabel(view.it, sb(list[view.i]));
      html = '<p class="desk-view__cap">' + esc(view.side === "before" ? T("Before", "قبل") : T("After", "بعد")) + " · " + (view.i + 1) + " / " + list.length + (from ? esc(T(" · from ", " · من ") + from) : "") + "</p>" +
        '<figure class="desk-view__pic"><img alt="" src="' + esc(su(list[view.i])) + '"></figure>' +
        '<div class="desk-view__thumbs">' + list.map(function (u, i) { return '<img alt="" src="' + esc(su(u)) + '" data-viewgo="' + i + '" class="' + (i === view.i ? "is-on" : "") + '">'; }).join("") + "</div>" +
        '<div class="desk-view__nav">' + (list.length > 1 ? '<button class="btn btn--ghost btn--sm" type="button" id="shotPrev">‹</button><button class="btn btn--ghost btn--sm" type="button" id="shotNext">›</button>' : "") +
        (sh[other].length ? '<button class="btn btn--ghost btn--sm" type="button" id="shotSide">' + esc(other === "after" ? T("Show after", "ورّيني بعد") : T("Show before", "ورّيني قبل")) + "</button>" : "") +
        (sh.before.length && sh.after.length ? '<button class="btn btn--primary btn--sm" type="button" id="shotCompare">' + esc(T("Before and after", "قبل وبعد")) + "</button>" : "") +
        '<button class="btn btn--ghost btn--sm" type="button" id="shotClose">' + esc(T("Close", "قفل")) + "</button></div>";
    }
    box.innerHTML = html;
    $("shotView").hidden = false;
    setCompare(50);
  }
  function setCompare(pct) {
    var box = $("cmpBox");
    if (!box) return;
    // the "before" picture is clipped, not squeezed: it keeps the full width while its window narrows
    $("cmpBefore").style.width = pct + "%";
    $("cmpBefore").firstChild.style.width = box.clientWidth + "px";
    $("cmpLine").style.left = pct + "%";
  }
  function closeView() { $("shotView").hidden = true; view = null; }

  /* ---------- who the users are ----------
     A product's users, read live from the product each time the window is
     opened and kept only in this page's memory: they are never written into
     the saved desk, so the desk holds no copy of anyone's contact details. */
  var usersView = null, usersTimer = null;

  function ago(iso) {
    if (!iso) return "";
    var d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
    if (!(d >= 0)) return "";
    if (d === 0) return T("today", "النهارده");
    if (d === 1) return T("yesterday", "إمبارح");
    if (d < 30) return T(d + " days ago", "من " + d + " يوم");
    if (d < 365) return T(Math.floor(d / 30) + " mo ago", "من " + Math.floor(d / 30) + " شهر");
    return T(Math.floor(d / 365) + " yr ago", "من " + Math.floor(d / 365) + " سنة");
  }
  function day(iso) { return iso ? new Date(iso).toLocaleDateString(I18N.loc("en-GB"), { day: "numeric", month: "short", year: "numeric" }) : ""; }

  function usersUrl(q, v) {
    var qs = "filter=" + v.filter + "&page=" + v.page + "&limit=50" + (v.q ? "&q=" + encodeURIComponent(v.q) : "");
    if (!LOCAL) return "/api/ideas?desk=users&id=" + encodeURIComponent(q.id) + "&" + qs;
    return String(q.statsUrl).replace(/stats(?=[^/]*$)/, "users") + (/\?/.test(q.statsUrl) ? "&" : "?") + qs; // a local stand-in only
  }

  function loadUsers(reset) {
    var v = usersView, q = v && product(v.id);
    if (!v) return;
    if (reset) { v.page = 1; v.list = []; }
    v.loading = true; v.err = ""; paintUsers();
    if (!reachable(q)) { v.loading = false; v.err = T("The list is read by the site, not by this local copy. Open ahmedtarek.tech/desk.", "القايمة بيقراها الموقع، مش النسخة المحلية دي. افتح ahmedtarek.tech/desk."); return paintUsers(); }
    var stamp = v.stamp = Date.now();
    fetch(usersUrl(q, v), { cache: "no-store", headers: LOCAL && q.statsKey ? { Authorization: "Bearer " + q.statsKey } : {} })
      .then(function (r) { if (!r.ok) throw new Error("status " + r.status); return r.json(); })
      .then(function (j) {
        if (usersView !== v || v.stamp !== stamp) return; // an older answer arriving late
        v.list = v.list.concat(Array.isArray(j.users) ? j.users : []);
        v.total = +j.total || 0; v.pages = +j.pages || 1; v.counts = j.counts || v.counts;
        v.loading = false; paintUsers();
      })
      .catch(function (err) { if (usersView !== v) return; v.loading = false; v.err = T("Could not read the list (" + err.message + ").", "القايمة ما اتقرتش (" + err.message + ")."); paintUsers(); });
  }

  function userRow(u) {
    var name = u.name || u.email || u.phone || T("No name", "من غير اسم"), tel = String(u.phone || "").replace(/[^0-9+]/g, "");
    var ava = /^https:\/\//.test(u.avatar || "")
      ? '<img class="desk-ava" alt="" loading="lazy" referrerpolicy="no-referrer" src="' + esc(u.avatar) + '" data-letter="' + esc(name.charAt(0).toUpperCase()) + '">'
      : '<span class="desk-ava desk-logo--txt" style="--h:' + (198 + hashOf(String(u.id || name)) % 26 + 26) % 360 + '" aria-hidden="true">' + esc(name.charAt(0).toUpperCase()) + "</span>";
    var facts = [];
    if (u.joined) facts.push(T("joined ", "انضم ") + day(u.joined));
    if (u.lastSeen) facts.push(T("last seen ", "آخر ظهور ") + ago(u.lastSeen));
    if (u.until) facts.push((u.paying ? T("paid until ", "مدفوع لحد ") : T("ended ", "انتهى ")) + day(u.until));
    return '<li class="desk-user' + (u.paying ? " is-pay" : "") + '">' + ava +
      '<div class="desk-user__main"><p class="desk-user__name"><b>' + esc(name) + "</b>" +
        '<span class="desk-user__tag' + (u.paying ? " is-pay" : "") + '">' + (u.paying ? "✓ " + esc(T("Paying", "بيدفع")) : esc(T("Not yet", "لسه"))) + "</span>" +
        (u.plan ? '<span class="chip">' + esc(u.plan) + "</span>" : "") + "</p>" +
        '<p class="desk-user__contact">' + (u.email ? '<a href="mailto:' + encodeURIComponent(u.email) + '">' + esc(u.email) + "</a>" : "") +
          (u.phone ? (tel ? '<a dir="ltr" href="tel:' + esc(tel) + '">' + esc(u.phone) + "</a>" : "<span>" + esc(u.phone) + "</span>") : "") +
          (!u.email && !u.phone ? '<span class="muted">' + esc(T("no contact details", "مفيش بيانات اتصال")) + "</span>" : "") + "</p>" +
        (facts.length ? '<p class="desk-user__facts">' + esc(facts.join(" · ")) + "</p>" : "") +
        (Array.isArray(u.extra) && u.extra.length ? '<p class="desk-user__extra">' + u.extra.slice(0, 4).map(function (e) { return '<span class="chip"><small>' + esc(e[0]) + "</small> " + esc(e[1]) + "</span>"; }).join("") + "</p>" : "") +
      "</div></li>";
  }

  function paintUsers() {
    var v = usersView, body = $("wizardBody");
    if (!v) return;
    var q = product(v.id), c = v.counts || {}, keep = document.activeElement && document.activeElement.id === "usersQ";
    var chip = function (f, label, n) { return '<button type="button" class="desk-leg' + (v.filter === f ? " is-on" : "") + '" data-userfilter="' + f + '" aria-pressed="' + (v.filter === f) + '">' + esc(label) + (n != null ? " <b>" + n.toLocaleString("en-US") + "</b>" : "") + "</button>"; };
    body.classList.remove("desk-wiz__card--split"); body.classList.add("desk-wiz__card--wide");
    body.innerHTML = '<div class="desk-users__head">' + logo(q, "desk-logo--lg") + "<div><h2>" + esc(q.name) + "</h2><p class=\"muted\">" + esc(T("Read live from the product. Nothing here is saved in the desk.", "بتتقري حي من المنتج. مفيش حاجة هنا بتتحفظ في المكتب.")) + '</p></div><button type="button" class="btn btn--ghost btn--sm" id="wizCancel">' + esc(T("Close", "قفل")) + "</button></div>" +
      '<div class="desk-users__bar"><div class="desk-legend" role="group" aria-label="' + esc(T("Which users", "أنهي مستخدمين")) + '">' + chip("all", T("All", "الكل"), c.all) + chip("paying", T("Paying", "بيدفعوا"), c.paying) + chip("free", T("Not paying", "مش بيدفعوا"), c.free) + "</div>" +
        '<input id="usersQ" type="search" maxlength="60" value="' + esc(v.q) + '" placeholder="' + esc(T("Search a name, email or number", "دوّر باسم أو إيميل أو رقم")) + '" aria-label="' + esc(T("Search", "بحث")) + '"></div>' +
      (v.err ? '<p class="form__note form__note--warn">' + esc(v.err) + "</p>" : "") +
      '<ul class="desk-users">' + v.list.map(userRow).join("") + "</ul>" +
      (v.loading ? '<p class="muted center desk-empty">' + esc(T("Reading…", "بيقرا…")) + "</p>"
        : !v.err && !v.list.length ? '<p class="muted center desk-empty">' + esc(T("Nobody matches.", "مفيش حد مطابق.")) + "</p>"
        : v.list.length ? '<p class="desk-users__foot"><span class="muted">' + esc(T("Showing " + v.list.length + " of " + v.total, "ظاهر " + v.list.length + " من " + v.total)) + "</span>" +
            (v.page < v.pages ? '<button type="button" class="btn btn--ghost btn--sm" id="usersMore">' + esc(T("Show more", "ورّي كمان")) + "</button>" : "") + "</p>" : "");
    $("wizard").hidden = false;
    if (keep) { var inp = $("usersQ"); inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
  }

  function openUsers(id, filter) {
    usersView = { id: id, filter: filter || "all", page: 1, q: "", list: [], counts: null, total: 0, pages: 1, loading: false, err: "" };
    loadUsers(true);
  }

  /* ---------- why a score is what it is ---------- */

  /** Every step from the answers to the score, in the order value() applies them. */
  function openWhy(it) {
    var now = today(), bug = it.kind === "bug", rows = [], sub = 1;
    var times = function (label, answer, f) { sub *= f; rows.push([label, answer, "× " + f]); };
    var r1 = function (n) { return Math.round(n * 100) / 100; };
    times(T("People it touches", "بتأثر على كام"), { one: T("one person", "واحد"), few: T("a few", "كام واحد"), most: T("most users", "الأغلب") }[it.reach] || "—", REACH[it.reach] || 1);
    times(T("Who raised it", "مين قالها"), { payer: T("a paying customer", "عميل بيدفع"), user: T("a user who does not pay", "مستخدم مش بيدفع"), me: T("me", "أنا") }[it.source] || "—", SOURCE[it.source] || 1);
    if (bug) {
      times(T("A way round it", "حل بديل"), it.workaround ? T("there is one", "فيه") : T("none", "مفيش"), it.workaround ? 1 : 2);
      times(T("How often", "بتحصل قد إيه"), { always: T("every time", "كل مرة"), sometimes: T("sometimes", "ساعات"), rare: T("once", "مرة واحدة") }[it.freq] || "—", FREQ[it.freq] || 1);
    } else {
      times(T("What it changes", "هتغيّر إيه"), { fresh: T("brings new paying customers", "دافعين جداد"), keep: T("keeps customers paying", "الحاليين يكمّلوا"), nice: T("nicer only", "شكل بس") }[it.outcome] || "—", OUTCOME[it.outcome] || 1);
    }
    if (it.churn) times(T("A customer could leave", "ممكن عميل يمشي"), T("yes", "أيوه"), 1.5);
    times(T("Evidence", "الدليل"), it.proof === "guess" ? T("a guess", "تخمين") : T("real", "حقيقي"), PROOF[it.proof] || 1);
    rows.push({ total: T("Subtotal", "المجموع الجزئي"), n: r1(sub) });
    var asked = Math.min(it.requests || 0, 5), due = dueBonus(it, now), wait = Math.floor(Math.max(0, daysBetween(it.created, now)) / 7);
    rows.push([T("Paying customers behind it", "دافعين وراها"), (it.requests || 0) + T(" (counted up to 5)", " (بحد أقصى 5)"), "+ " + asked]);
    rows.push([T("Date it must be ready by", "الميعاد"), it.due ? nice(it.due) : T("none", "مفيش"), "+ " + due]);
    rows.push([T("Weeks it has waited", "أسابيع الانتظار"), String(wait), "+ " + wait]);
    var val = value(it, now), eff = Math.max(0.25, +it.effort || 1);
    rows.push({ total: T("Value", "القيمة"), n: r1(val) });
    rows.push([T("Hours of work", "ساعات الشغل"), hours(eff), "÷ " + r1(eff)]);
    rows.push({ total: T("Score", "النقط"), n: Math.round(val / eff * 10) / 10, big: true });
    $("wizardBody").classList.remove("desk-wiz__card--split");
    $("wizardBody").innerHTML = '<p class="desk-wiz__count">' + esc(T("Why this score", "النقط دي جت منين")) + "</p><h2>" + esc(it.title) + "</h2>" +
      '<table class="desk-why">' + rows.map(function (r) {
        return r.total ? '<tr class="desk-why__total' + (r.big ? " desk-why__total--big" : "") + '"><td colspan="2">' + esc(r.total) + "</td><td>" + r.n + "</td></tr>"
          : "<tr><td>" + esc(r[0]) + "</td><td>" + esc(r[1]) + '</td><td dir="ltr">' + esc(r[2]) + "</td></tr>";
      }).join("") + "</table>" +
      '<p class="muted">' + esc(T("Higher scores go first on fix day. To raise this one: make the job smaller, or wait for more customers to ask.", "النقط الأعلى بتتعمل الأول يوم التصليح. عشان ترفعها: صغّر الشغلانة، أو استنى دافعين أكتر يطلبوها.")) + "</p>" +
      '<div class="form__actions"><button class="btn btn--primary" type="button" id="wizCancel">' + esc(T("Got it", "تمام")) + '</button><button class="btn btn--ghost" type="button" data-act="edit" data-id="' + it.id + '">' + esc(T("Change the answers", "غيّر الإجابات")) + "</button></div>";
    $("wizard").hidden = false;
  }

  /* ---------- the ticket: the answers written up as a user story ---------- */

  // who the customer is, per product, so the story names a person instead of "the user"
  var NOUN = {
    gobachaloria: ["student", "طالب"], techmakerz: ["parent", "ولي أمر"], ashrhly: ["learner", "متعلّم"],
    elhsab: ["café owner", "صاحب كافيه"], brand: ["client", "عميل"]
  };

  var WHO_NOUN = { student: ["student", "طالب"], parent: ["parent", "ولي أمر"], teacher: ["teacher", "مدرس"], owner: ["business owner", "صاحب بيزنس"], manager: ["manager", "مدير"], developer: ["developer", "مبرمج"] };

  /** Lowers a leading capital so the words sit mid-sentence, but leaves acronyms ("PDF export") and "I" alone. */
  function lowerFirst(t) { return t && !/^([A-Z]{2}|I\b)/.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t; }
  function noDot(t) { return String(t || "").trim().replace(/[.。!؟?]+$/, ""); }

  /** Everything the ticket shows, built from the item's answers. Nothing here is stored except the number. */
  function ticketData(it, preview) {
    var now = today(), p = plan(now), g = grade(it), pr = product(it.product), bug = it.kind === "bug";
    var no = it.no;
    if (!no) {
      if (preview) no = (S.seq || 0) + 1; // what its number would be; nothing is taken until it is saved and opened
      else { S.seq = (S.seq || 0) + 1; it.no = no = S.seq; save(); }
    }
    var noun = WHO_NOUN[pr.who] || NOUN[it.product] || ["customer", "عميل"];
    var who = it.source === "payer" ? T("a paying " + noun[0], noun[1] + " بيدفع")
      : it.source === "user" ? T("a " + noun[0] + " on the free plan", noun[1] + " على الخطة المجانية")
      : T("the product owner", "صاحب المنتج");
    var benefit = bug
      ? ({ money: T("I can pay without asking for help", "أقدر أدفع من غير ما أطلب مساعدة"),
           login: T("I can get into my account when I need it", "أقدر أدخل حسابي وقت ما أحتاجه"),
           data: T("my work and my results are safe and correct", "شغلي ونتايجي محفوظين وصح") }[it.blocks]
          || (it.workaround ? T("I get what I was promised without extra steps", "آخد اللي اتوعدت بيه من غير لفّ") : T("I am not left stuck", "ما أفضلش واقف")))
      : ({ fresh: T("it is worth paying for", "تستاهل إني أدفع"), keep: T("I keep getting value from it every week", "أفضل مستفيد منها كل أسبوع"),
           nice: T("it is nicer to use", "تبقى أحلى في الاستخدام") }[it.outcome] || T("it does more for me", "تفيدني أكتر"));
    if (it.benefit) benefit = T(lowerFirst(noDot(it.benefit)), noDot(it.benefit)); // their own words win over the stock phrase
    var want = it.goal ? T("to " + lowerFirst(noDot(it.goal)), noDot(it.goal))
      : bug ? T("“" + noDot(it.title) + "” fixed", "إن «" + noDot(it.title) + "» تتصلح") : T("“" + noDot(it.title) + "”", "«" + noDot(it.title) + "»");
    var story = T("As " + who + ", I want " + want + ", so that " + benefit + ".", "كـ" + who + "، عايز " + want + "، عشان " + benefit + ".");

    var reach = { one: T("one person", "واحد"), few: T("a few people", "كام واحد"), most: T("most users", "أغلب المستخدمين") }[it.reach] || "";
    var today_ = "";
    if (bug) {
      today_ = noDot(it.title) + ". " + ({ always: T("It happens every time", "بتحصل كل مرة"), sometimes: T("It happens sometimes", "بتحصل ساعات"), rare: T("It happened once", "حصلت مرة واحدة") }[it.freq] || T("It happens", "بتحصل")) +
        T(", for " + reach, "، لـ" + reach) + (it.blocks !== "none" ? "." : it.workaround ? T(", and there is a way round it.", "، وفيه حل بديل.") : T(", and there is no way round it.", "، ومفيش حل بديل."));
    } else {
      today_ = T("This does not exist yet. It would reach " + reach + ".", "دي مش موجودة لسه. هتوصل لـ" + reach + ".");
    }

    var ac = [];
    ac.push(it.done ? noDot(it.done) + "." : bug ? T("The problem in the title no longer happens.", "المشكلة اللي في العنوان ما بقتش تحصل.") : T("It does what the title says.", "بتعمل اللي مكتوب في العنوان."));
    if (bug) ac.push({ money: T("A payment goes through from start to finish, on a phone and on a laptop.", "عملية دفع بتكمل من الأول للآخر، على الموبايل واللابتوب."),
      login: T("Sign-in works on a phone and on a laptop.", "الدخول شغال على الموبايل واللابتوب."),
      data: T("The affected records are correct, and the wrong ones are repaired.", "البيانات المتأثرة بقت صح، والغلط اتصلّح.") }[it.blocks]
      || T("Checked with the people it touched (" + reach + ").", "اتراجعت مع اللي اتأثروا (" + reach + ")."));
    else ac.push(T("At least one customer who asked confirms it meets the need.", "عميل واحد على الأقل من اللي طلبوها يأكد إنها كفاية."));
    ac.push(T("Sign-in, payment and the main screen still work after the change.", "الدخول والدفع والشاشة الرئيسية لسه شغالين بعد التعديل."));

    var when = g === 1 ? T("Today", "النهارده") : g === 2 ? (p.when[it.id] ? nice(p.when[it.id]) : T("Not placed yet", "لسه مالهاش مكان"))
      : T("After " + Math.max(0, S.settings.promoteAt - (it.requests || 0)) + " more ask", "بعد " + Math.max(0, S.settings.promoteAt - (it.requests || 0)) + " طلبات كمان");
    // the prefix comes from the product's name, so a product added later still reads sensibly
    var id = (String(pr.name || "").replace(/[^a-z]/gi, "").slice(0, 3).toUpperCase() || "TKT") + "-" + ("00" + no).slice(-3);
    return {
      parts: { who: who, want: want, benefit: benefit },
      who: (it.clients || []).map(clientLabel),
      id: id, g: g, kind: KIND[it.kind] || it.kind, logo: logo(pr, "desk-logo--sm"), title: it.title, story: story, today: today_, ac: ac, note: it.note,
      fields: [
        [T("Product", "المنتج"), pr.name],
        [T("Due", "مطلوبة"), it.due ? nice(it.due) : "—"],
        [T("Priority", "الأولوية"), "P" + g],
        [T("Scheduled", "الميعاد"), when],
        [T("Estimate", "التقدير"), hours(+it.effort || 1)],
        [T("Score", "النقط"), g === 2 ? String(Math.round(score(it, now) * 10) / 10) : "—"],
        [T("Customers", "العملاء"), String(it.requests || 0)],
        [T("Evidence", "الدليل"), { message: T("Customer said", "عميل قال"), data: T("Seen in data", "من الأرقام"), guess: T("A guess", "تخمين") }[it.proof] || "—"]
      ]
    };
  }

  /** The ticket as plain text, for pasting into Jira, Linear, a message or a portfolio post. */
  function ticketText(d) {
    return "[" + d.id + "] " + d.title + "\n\n" +
      T("User story", "القصة") + "\n" + d.story + "\n\n" +
      T("Today", "الوضع الحالي") + "\n" + d.today + (d.note ? "\n" + d.note : "") + "\n\n" +
      T("Acceptance criteria", "شروط القبول") + "\n" + d.ac.map(function (a, i) { return (i + 1) + ". " + a; }).join("\n") + "\n\n" +
      d.fields.map(function (f) { return f[0] + ": " + f[1]; }).join("\n") +
      (d.who && d.who.length ? "\n" + T("Raised by", "اللي بلّغوا") + ": " + d.who.join(", ") : ""); // names only: contact details stay in the desk
  }

  var liveLast = {}, liveTimer = null, liveKey = "", wizPct = 0;
  var calView = "";       // the month the due-date calendar is showing, as YYYY-MM
  var sameStep = false;   // set before repainting the step already on screen, so it does not slide in again

  /**
   * The ticket as it stands, drawn beside the question being answered. Parts
   * not answered yet show as a faint placeholder; a part whose text has just
   * changed is written in, so each answer is seen landing on the ticket.
   */
  function paintLive(current, instant) {
    var box = $("wizLive");
    if (!box || !draft) return;
    var has = function (k) { return draft[k] != null && draft[k] !== ""; };
    var bug = draft.kind === "bug";
    var it = build();
    var keep = S.items;
    S.items = keep.filter(function (x) { return x.id !== it.id; }).concat([it]); // so the plan can place it
    var d = ticketData(it, true);
    S.items = keep;
    var settled = (bug && has("blocks")) || (draft.kind && !bug && draft.requests != null);
    // which question writes each part: clicking the part goes back to that question
    var GO = { title: "title", who: "source", want: "goal", benefit: "benefit", today: "reach", ac0: "done", f0: "product", f1: "due",
      f2: bug ? "blocks" : "requests", f3: bug ? "blocks" : "requests", f4: "effort", f5: "effort", f6: "requests", f7: "proof" };
    var tip = T("Click to change this answer", "دوس عشان تغيّر الإجابة دي");
    var slot = function (key, text, tag, cls, ph) {
      return "<" + tag + ' class="' + (cls || "") + (text ? "" : " is-empty") + '" data-slot="' + key + '" data-text="' + esc(text || "") + '"' +
        (GO[key] ? ' data-go="' + GO[key] + '" title="' + esc(tip) + '"' : "") + ">" + esc(text || ph) + "</" + tag + ">";
    };
    var part = function (label, key, text, ph, active) {
      return '<div class="desk-live__part' + (active ? " is-active" : "") + '"><small>' + esc(label) + "</small>" + slot(key, text, "p", "", ph) + "</div>";
    };
    var f = d.fields, known = [has("product"), has("due"), settled, settled, has("effort"), settled && d.g === 2 && has("effort"), draft.requests != null, has("proof")];
    box.innerHTML = '<p class="desk-live__cap">' + esc(T("Your ticket, as you answer", "تذكرتك وإنت بتجاوب")) + "</p>" +
      // the same coloured stub the saved ticket wears in the lists: picture for its kind, grade, when
      '<div class="desk-livetix desk-item--g' + (settled ? d.g : 0) + (liveLast.__g !== (settled ? d.g : 0) ? " is-turn" : "") + '">' +
      '<div class="desk-item__stub" data-go="kind" title="' + esc(tip) + '">' + ico({ bug: "🐞", feature: "✨", idea: "💡" }[draft.kind] || "🎫", "desk-ico--lg") +
        "<b>" + (settled ? "P" + d.g : "P?") + "</b><small>" + esc(settled ? { 1: T("Today", "النهارده"), 2: T("Fix day", "يوم التصليح"), 3: T("Later", "بعدين") }[d.g] : T("not graded yet", "لسه مالهاش درجة")) + "</small></div>" +
      '<article class="desk-tix__card desk-tix__card--live' + (settled ? " desk-tix__card--g" + d.g : "") + '">' +
      '<header class="desk-tix__head">' + (has("product") ? d.logo : "") + '<span class="desk-tix__id" dir="ltr">' + esc(has("product") ? d.id : "NEW") + "</span>" +
        (settled ? '<span class="desk-tix__pri">P' + d.g + "</span>" : "") + (draft.kind ? '<span class="desk-tix__pri">' + esc(d.kind) + "</span>" : "") + "</header>" +
      '<div class="desk-tix__body">' +
        slot("title", has("title") ? d.title : "", "h2", "desk-tix__title", T("Title", "العنوان")) +
        part(T("As", "كـ"), "who", has("source") ? d.parts.who : "", T("who it is for", "لمين"), current === "source") +
        part(T("I want", "عايز"), "want", has("goal") || has("title") ? d.parts.want : "", T("what they want to do", "عايز يعمل إيه"), current === "goal") +
        part(T("So that", "عشان"), "benefit", has("benefit") || (bug ? has("blocks") : has("outcome")) ? d.parts.benefit : "", T("what they get out of it", "هيستفيد إيه"), current === "benefit") +
        '<p class="desk-tix__label">' + esc(T("Today", "الوضع الحالي")) + "</p>" +
        slot("today", draft.kind && has("reach") ? d.today : "", "p", "desk-tix__text", T("what happens now", "إيه اللي بيحصل دلوقتي")) +
        '<p class="desk-tix__label">' + esc(T("Acceptance criteria", "شروط القبول")) + '</p><ol class="desk-tix__ac">' +
          slot("ac0", has("done") ? d.ac[0] : "", "li", "", T("how you will know it is done", "هتعرف إزاي إنها خلصت")) +
          (draft.kind && has("reach") ? slot("ac1", d.ac[1], "li", "", "") + slot("ac2", d.ac[2], "li", "", "") : "") + "</ol>" +
        (shotCount(draft, "before") ? '<div class="desk-shots desk-shots--mini">' + shotStrip(draft, "before", false) + "</div>" : "") +
      "</div>" +
      '<footer class="desk-tix__stub">' + f.map(function (x, i) { return "<div><small>" + esc(x[0]) + "</small>" + slot("f" + i, known[i] ? x[1] : "", "b", "", "—") + "</div>"; }).join("") + "</footer>" +
      "</article></div>";
    liveLast.__g = settled ? d.g : 0;

    // write in whatever changed since the last paint
    var nodes = box.querySelectorAll("[data-slot]"), fresh = [], i, key, text;
    for (i = 0; i < nodes.length; i++) {
      key = nodes[i].getAttribute("data-slot"); text = nodes[i].getAttribute("data-text");
      if (text && liveLast[key] !== text) fresh.push(nodes[i]);
      liveLast[key] = text;
    }
    clearInterval(liveTimer);
    if (instant) return; // typed by hand, letter by letter: it is already being written in
    for (i = 0; i < fresh.length; i++) fresh[i].classList.add("is-fresh");
    if (calm || !fresh.length || fresh.length > 5) return; // opening an existing item changes everything at once: show it, do not type it
    for (i = 0; i < fresh.length; i++) fresh[i].textContent = "";
    var n = 0, c = 0;
    liveTimer = setInterval(function () {
      if (n >= fresh.length) return clearInterval(liveTimer);
      var el = fresh[n], full = el.getAttribute("data-text");
      el.classList.add("is-typing");
      c += 2;
      el.textContent = full.slice(0, c);
      if (c >= full.length) { el.classList.remove("is-typing"); n++; c = 0; }
    }, 16);
  }

  var typing = null, ticketNow = null;
  var calm = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /** Writes the ticket's text in, one piece after another, the way it would be typed. */
  function typeIn(nodes, fast) {
    clearInterval(typing);
    var i, n = 0, c = 0;
    if (fast || calm) { for (i = 0; i < nodes.length; i++) { nodes[i].textContent = nodes[i].getAttribute("data-type"); nodes[i].classList.remove("is-typing"); } $("ticketCard").classList.add("is-written"); return; }
    for (i = 0; i < nodes.length; i++) nodes[i].textContent = "";
    $("ticketCard").classList.remove("is-written");
    typing = setInterval(function () {
      if (n >= nodes.length) { clearInterval(typing); $("ticketCard").classList.add("is-written"); return; }
      var el = nodes[n], full = el.getAttribute("data-type");
      el.classList.add("is-typing");
      c += 2; // two characters a tick: quick enough to watch, not to wait for
      el.textContent = full.slice(0, c);
      if (c >= full.length) { el.classList.remove("is-typing"); n++; c = 0; }
    }, 16);
  }

  function openTicket(it, fast) {
    var d = ticketData(it);
    ticketNow = d;
    var ty = function (text, tag, cls) { return "<" + tag + ' class="' + (cls || "") + '" data-type="' + esc(text) + '"></' + tag + ">"; };
    $("ticketCard").className = "desk-tix__card desk-tix__card--stub desk-tix__card--g" + d.g;
    $("ticketCard").innerHTML =
      // the same coloured stub it wears in the lists and while it is being written
      '<div class="desk-item__stub desk-item--g' + d.g + '">' + ico({ bug: "🐞", feature: "✨", idea: "💡" }[it.kind] || "🎫", "desk-ico--lg") +
        "<b>P" + d.g + "</b><small>" + esc({ 1: T("Today", "النهارده"), 2: T("Fix day", "يوم التصليح"), 3: T("Later", "بعدين") }[d.g]) + "</small></div>" +
      '<header class="desk-tix__head">' + d.logo + '<span class="desk-tix__id" dir="ltr">' + esc(d.id) + '</span><span class="desk-tix__pri">P' + d.g + '</span><span class="desk-tix__pri">' + esc(d.kind) + '</span><span class="desk-tix__dot" aria-hidden="true"></span></header>' +
      '<div class="desk-tix__body">' +
        ty(d.title, "h2", "desk-tix__title") +
        '<p class="desk-tix__label">' + esc(T("User story", "القصة")) + "</p>" + ty(d.story, "p", "desk-tix__story") +
        '<p class="desk-tix__label">' + esc(T("Today", "الوضع الحالي")) + "</p>" + ty(d.today, "p", "desk-tix__text") +
        '<p class="desk-tix__label">' + esc(T("Acceptance criteria", "شروط القبول")) + '</p><ol class="desk-tix__ac">' + d.ac.map(function (a) { return ty(a, "li"); }).join("") + "</ol>" +
        '<div class="desk-shots" id="ticketShots"></div>' +
      "</div>" +
      '<footer class="desk-tix__stub">' + d.fields.map(function (f) { return "<div><small>" + esc(f[0]) + "</small><b>" + esc(f[1]) + "</b></div>"; }).join("") + "</footer>" +
      '<span class="desk-tix__glare" aria-hidden="true"></span>';
    ticketItem = it;
    shotCtx = { target: it, saved: true, repaint: function () { paintTicketShots(); render(); } };
    paintTicketShots();
    $("ticket").hidden = false;
    $("ticketTilt").style.transform = "";
    var wrap = $("ticketIn");
    wrap.classList.remove("is-in"); void wrap.offsetWidth; wrap.classList.add("is-in"); // replay the arrival
    typeIn($("ticketCard").querySelectorAll("[data-type]"), fast);
  }

  function closeTicket() { clearInterval(typing); $("ticket").hidden = true; ticketNow = null; ticketItem = null; shotCtx = null; }

  // the card leans toward the pointer, and a highlight follows it
  // the chart's hover layer: a crosshair on the nearest week and every visible line's value there
  function chartHover(e) {
    var box = $("chartBox"), tip = $("chartTip"), m = chartModel;
    if (!box || !tip || !m) return;
    var svg = box.querySelector("svg"), rect = svg.getBoundingClientRect(), over = e.target.closest && e.target.closest(".desk-chart__svg");
    if (!over || e.type === "pointerleave") { tip.hidden = true; $("chartCross").setAttribute("visibility", "hidden"); return; }
    var sx = (e.clientX - rect.left) / rect.width * m.W;
    var i = Math.max(0, Math.min(m.n - 1, Math.round((sx - m.L) / ((m.W - m.L - m.R) / Math.max(1, m.n - 1)))));
    var cx = m.x(i), cross = $("chartCross");
    cross.setAttribute("x1", cx); cross.setAttribute("x2", cx); cross.setAttribute("visibility", "visible");
    var rows = m.series.filter(function (sr) { return sr.idx[i] != null; }).map(function (sr) {
      return '<li><i style="background:var(--s' + sr.slot + ')"></i><span>' + esc(sr.name) + "</span><b>" + (m.conv ? sr.idx[i] + "%" : sr.raw[i]) + "</b><small>" + esc(m.conv ? T(sr.pairs[i].paying + " paying of " + sr.pairs[i].users, sr.pairs[i].paying + " دافع من " + sr.pairs[i].users) : sr.unit + " · " + sr.idx[i]) + "</small></li>";
    }).join("");
    if (m.avg && m.avg[i] != null) rows += '<li class="is-avg"><i></i><span>' + esc(T("Average", "المتوسط")) + "</span><b>" + m.avg[i] + (m.conv ? "%" : "") + "</b><small>" + esc(m.conv ? T("across the products shown", "للمنتجات الظاهرة") : T("of their starts", "من بداياتهم")) + "</small></li>";
    tip.innerHTML = "<p>" + esc(T("Week ending ", "أسبوع ") + nice(m.weeks[i])) + "</p>" + (rows ? "<ul>" + rows + "</ul>" : '<span class="muted">' + esc(T("Nothing written", "مفيش حاجة مكتوبة")) + "</span>");
    tip.hidden = false;
    var left = cx / m.W * rect.width, flip = left > rect.width * 0.6;
    tip.style.left = (flip ? left - tip.offsetWidth - 14 : left + 14) + "px";
  }
  document.addEventListener("pointermove", chartHover);
  document.addEventListener("pointerdown", chartHover);

  document.addEventListener("pointermove", function (e) {
    if ($("ticket").hidden || calm || e.pointerType === "touch") return;
    var r = $("ticketIn").getBoundingClientRect();
    var x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    $("ticketTilt").style.transform = "rotateX(" + ((0.5 - y) * 12).toFixed(2) + "deg) rotateY(" + ((x - 0.5) * 16).toFixed(2) + "deg)";
    $("ticketCard").style.setProperty("--mx", (x * 100).toFixed(1) + "%");
    $("ticketCard").style.setProperty("--my", (y * 100).toFixed(1) + "%");
  });

  /* ---------- events ---------- */

  document.addEventListener("click", function (e) {
    var t = e.target, el;
    if (!t.closest) return;

    if ((el = t.closest("#tabbar .tab"))) { tab = el.getAttribute("data-tab"); render(); return; }
    // pictures: these come first because a click inside the open ticket is otherwise swallowed
    if (view) {
      if (t.id === "shotView" || t.closest("#shotClose")) return closeView();
      if (t.closest("#shotPrev") || t.closest("#shotNext")) {
        var stepBy = t.closest("#shotNext") ? 1 : -1;
        if (view.cmp != null) view.cmp += stepBy; else view.i += stepBy;
        return paintView();
      }
      if (t.closest("#shotSide")) { view.side = view.side === "before" ? "after" : "before"; view.i = 0; return paintView(); }
      if (t.closest("#shotCompare")) { view = { it: view.it, cmp: 0 }; return paintView(); }
      if ((el = t.closest("[data-viewgo]"))) { view.i = +el.getAttribute("data-viewgo"); return paintView(); }
      return;
    }
    if ((el = t.closest("[data-clientdel]")) && shotCtx) {
      var who = clientsOf(shotCtx.target), cid = el.getAttribute("data-clientdel"), gone = who.filter(function (c) { return c.id === cid; })[0];
      if (!gone || !confirm(T("Remove " + clientLabel(gone) + " from this ticket?", "تشيل " + clientLabel(gone) + " من التذكرة دي؟"))) return;
      shotCtx.target.clients = who.filter(function (c) { return c.id !== cid; });
      ["before", "after"].forEach(function (sd0) { shotsOf(shotCtx.target)[sd0].forEach(function (x) { if (typeof x !== "string" && x.by === cid) x.by = ""; }); }); // their pictures stay, unmarked
      if (shotCtx.saved) save();
      return shotCtx.repaint();
    }
    if ((el = t.closest("[data-shotdel]")) && shotCtx) {
      var sd = el.getAttribute("data-shotdel").split(":");
      if (!confirm(T("Remove this picture? It cannot be brought back.", "تشيل الصورة دي؟ مش هترجع."))) return;
      shotsOf(shotCtx.target)[sd[0]].splice(+sd[1], 1);
      if (shotCtx.saved) save();
      return shotCtx.repaint();
    }
    if ((el = t.closest("img[data-shot]")) && (ticketItem || draft)) {
      var sv = el.getAttribute("data-shot").split(":");
      view = { it: ticketItem || draft, side: sv[0], i: +sv[1] };
      return paintView();
    }
    if (t.closest("#shotCompare") && ticketItem) { view = { it: ticketItem, cmp: 0 }; return paintView(); }
    if (t.closest("#ticketShots")) return; // the add tile and the strip itself: leave them to the browser
    if (t.closest("#btnAdd")) return openWizard(null);
    if (t.id === "ticket" || t.closest("#ticketClose")) return closeTicket();
    if (t.closest("#ticketCopy")) {
      var text = ticketNow ? ticketText(ticketNow) : "";
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { toast(T("Ticket copied.", "التذكرة اتنسخت.")); }, function () { toast(T("Could not copy.", "ما اتنسختش."), true); });
      else toast(T("Could not copy in this browser.", "النسخ مش شغال في المتصفح ده."), true);
      return;
    }
    if (t.closest("#ticketCard")) { if (typing) typeIn($("ticketCard").querySelectorAll("[data-type]"), true); return; } // a click finishes the writing
    if (t.id === "wizard" || t.closest("#wizCancel")) return closeWizard();
    if (t.closest("#wizBack")) { step = Math.max(0, Math.min(step, steps().length) - 1); return paintStep(); }
    if (t.closest("#btnSound")) {
      muted = !muted;
      try { localStorage.setItem(SOUND_KEY, muted ? "off" : "on"); } catch (err) {}
      paintSound(); sfx("tap"); return;
    }
    if (prodDraft && !$("wizard").hidden) {
      if ((el = t.closest("[data-pkey]"))) {
        prodDraft[el.getAttribute("data-pkey")] = el.getAttribute("data-pval");
        pfb = pfeed(el.getAttribute("data-pkey"), el.getAttribute("data-pval"));
        pstep++; sfx("tap"); return paintProdStep();
      }
      if ((el = t.closest("[data-pmulti]"))) {
        var arr = prodDraft[el.getAttribute("data-pmulti")], pv = el.getAttribute("data-pval"), ix = arr.indexOf(pv);
        if (ix === -1) arr.push(pv); else arr.splice(ix, 1);
        sfx("tap"); return paintProdStep();
      }
      if (t.closest("#prodNext")) { pfb = pfeed(prodSteps()[pstep].key, ""); pstep++; sfx("tap"); return paintProdStep(); }
      if (t.closest("#prodBack")) { pstep = Math.max(0, pstep - 1); pfb = ""; return paintProdStep(); }
      if (t.closest("#prodSave")) return saveProduct();
      if (t.closest("#prodLogoClear")) { prodDraft.logo = ""; return paintProdStep(); }
    }
    if ((el = t.closest(".desk-opt")) && draft) {
      draft[el.getAttribute("data-key")] = el.getAttribute("data-val");
      step++;
      sfx(el.getAttribute("data-key") === "blocks" && el.getAttribute("data-val") !== "none" ? "warn" : "tap");
      return paintStep();
    }
    if (t.closest("#wizMinus") || t.closest("#wizPlus")) {
      draft.requests = Math.max(0, (draft.requests || 0) + (t.closest("#wizPlus") ? 1 : -1));
      sameStep = true; sfx("tap");
      return paintStep();
    }
    if (t.closest("#wizNext")) { step++; return paintStep(); }
    if (draft && (el = t.closest("#wizLive [data-go]"))) {
      var goKey = el.getAttribute("data-go"), all = steps(), gi;
      for (gi = 0; gi < all.length; gi++) if (all[gi].key === goKey) { step = gi; sfx("tap"); return paintStep(); }
      return;
    }
    if (t.closest("#wizNoDate")) { draft.due = ""; step++; return paintStep(); }
    if (draft && (el = t.closest("[data-cal]"))) {
      if (el.disabled) return;
      draft.due = el.getAttribute("data-cal"); calView = draft.due.slice(0, 7);
      sameStep = true; sfx("tap");
      return paintStep();
    }
    if (draft && (el = t.closest("#calPrev, #calNext"))) {
      if (el.disabled) return;
      var cm = new Date(+calView.slice(0, 4), +calView.slice(5, 7) - 1 + (el.id === "calNext" ? 1 : -1), 1);
      calView = cm.getFullYear() + "-" + pad(cm.getMonth() + 1);
      sameStep = true;
      return paintStep();
    }
    if ((el = t.closest("#effDp, #effDm, #effHp, #effHm, #effMp, #effMm"))) {
      if (el.disabled) return;
      var d = { effDp: S.settings.fixHours, effDm: -S.settings.fixHours, effHp: 1, effHm: -1, effMp: 0.25, effMm: -0.25 }[el.id];
      draft.effort = String(Math.max(0.25, (parseFloat(draft.effort) || 1) + d));
      sameStep = true; sfx("tap");
      return paintStep();
    }
    if (t.closest("#btnAddProduct")) return openProductForm(null);
    if ((el = t.closest("[data-tabgo]"))) { tab = el.getAttribute("data-tabgo"); return render(); }
    if ((el = t.closest("[data-leg]"))) {
      var lg = el.getAttribute("data-leg");
      if (lg === "__all") { numHidden = {}; numAvg = true; }
      else if (lg === "__avg") numAvg = !numAvg;
      else if (numHidden[lg]) delete numHidden[lg]; else numHidden[lg] = true;
      keepHidden(); sfx("tap"); return render();
    }
    if ((el = t.closest("[data-users]"))) { sfx("tap"); return openUsers(el.getAttribute("data-users"), el.getAttribute("data-uf")); }
    if (usersView && (el = t.closest("[data-userfilter]"))) { usersView.filter = el.getAttribute("data-userfilter"); sfx("tap"); return loadUsers(true); }
    if (usersView && t.closest("#usersMore")) { usersView.page += 1; return loadUsers(false); }
    if (t.closest("#btnCaptureSeen")) { S.capturedSeen = S.captured ? S.captured.at : 0; save(); return render(); }
    if (t.closest("#btnLive")) { sfx("tap"); return refreshLive(true); }
    if ((el = t.closest("[data-measure]"))) { numMeasure = el.getAttribute("data-measure"); sfx("tap"); return render(); }
    if ((el = t.closest("[data-pull]"))) { sfx("tap"); toast(T("Reading…", "بيقرا…")); return pullInto(product(el.getAttribute("data-pull")), false); }
    if ((el = t.closest("[data-solo]"))) {
      numHidden = {};
      S.products.forEach(function (q) { if (q.id !== el.getAttribute("data-solo")) numHidden[q.id] = true; });
      keepHidden(); sfx("tap"); render();
      var cb = $("chartBox"); if (cb && cb.scrollIntoView) cb.scrollIntoView({ block: "center", behavior: calm ? "auto" : "smooth" });
      return;
    }
    if ((el = t.closest("[data-numstep]"))) {
      if (el.disabled) return;
      var nw = dueInfo(today()).week, np = el.getAttribute("data-numstep");
      S.numbers[nw] = S.numbers[nw] || {};
      S.numbers[nw][np] = Math.max(0, (+S.numbers[nw][np] || 0) + (+el.getAttribute("data-d")));
      save(); sfx("tap"); return render();
    }
    if (t.closest("#btnNotify")) { Notification.requestPermission().then(function () { maybeNotify(); render(); }); return; }
    if ((el = t.closest("[data-fixday]"))) {
      S.settings.fixDay = +el.getAttribute("data-fixday");
      // the fix-day block in the daily schedule follows the chosen day
      S.blocks.forEach(function (b) { if (b.fix || /^Fix day/.test(b.en)) b.days = [S.settings.fixDay]; });
      save(); render(); sfx("tap"); return;
    }
    if ((el = t.closest("[data-set]"))) {
      if (el.disabled) return;
      var sk = el.getAttribute("data-set");
      S.settings[sk] = Math.min(+el.getAttribute("data-max"), Math.max(+el.getAttribute("data-min"), (+S.settings[sk] || 0) + (+el.getAttribute("data-d"))));
      save(); render(); sfx("tap"); return;
    }
    if (t.closest("#btnAddBlock")) {
      S.blocks.push({ days: [new Date().getDay()], from: "09:00", to: "10:00", en: "New block", ar: "خانة جديدة" });
      save(); render(); return;
    }
    if ((el = t.closest(".desk-block [data-day], .desk-block [data-bdel]"))) {
      var bi = +el.closest(".desk-block").getAttribute("data-bi"), blk = S.blocks[bi];
      if (!blk) return;
      if (el.hasAttribute("data-bdel")) {
        if (!confirm(T("Delete this block from the weekly schedule?", "تمسح الخانة دي من جدول الأسبوع؟"))) return;
        S.blocks.splice(bi, 1);
      } else {
        var dn = +el.getAttribute("data-day"), at = blk.days.indexOf(dn);
        if (at === -1) blk.days.push(dn); else blk.days.splice(at, 1);
      }
      save(); render(); return;
    }
    if ((el = t.closest("[data-pact]"))) {
      var q = product(el.getAttribute("data-pid"));
      if (el.getAttribute("data-pact") === "edit") return openProductForm(q);
      var left = openCount(q.id);
      if (left) return toast(T(q.name + " still has " + left + " open item" + (left === 1 ? "" : "s") + ". Close or drop them first.", q.name + " لسه فيه " + left + " حاجة مفتوحة. اقفلهم أو شيلهم الأول."), true);
      if (S.products.length < 2) return toast(T("Keep at least one product.", "لازم يفضل منتج واحد على الأقل."), true);
      if (!confirm(T("Delete " + q.name + "? Its closed items stay in the list.", "تمسح " + q.name + "؟ الحاجات المقفولة بتاعته هتفضل في القايمة."))) return;
      S.products = S.products.filter(function (x) { return x.id !== q.id; });
      save(); render();
      return toast(T("Product deleted.", "المنتج اتمسح."));
    }
    if (t.closest("#wizSave")) {
      var it = build(), i;
      for (i = 0; i < S.items.length; i++) if (S.items[i].id === it.id) break;
      S.items[i] = it;
      save(); closeWizard(); sfx("good");
      tab = grade(it) === 1 ? "today" : grade(it) === 2 ? "fix" : "later";
      render();
      return openTicket(it); // the answers, written up as a ticket
    }
    if (t.closest("#btnExport")) {
      var a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([JSON.stringify(S, null, 2)], { type: "application/json" }));
      a.download = "desk-" + today() + ".json";
      a.click();
      return;
    }

    if ((el = t.closest("[data-act]"))) {
      var item = find(el.getAttribute("data-id")), act = el.getAttribute("data-act"), now = today();
      if (!item) return;
      if (act === "done") {
        item.status = "done"; item.closed = now; sfx("good");
        if (shotCount(item, "before") && !shotCount(item, "after")) toast(T("Done. Add an “after” picture from Closed → Ticket and pictures to compare.", "خلصت. ضيف صورة «بعد» من اتقفلت ← التذكرة والصور عشان تقارن."));
      }
      else if (act === "stage") {
        var to = el.getAttribute("data-stage");
        if (to === "doing" && item.stage !== "doing") {
          var busy = S.items.filter(function (x) { return x.status === "open" && x.stage === "doing" && x.id !== item.id; }).length;
          item.startedAt = Date.now();
          // one thing at a time is the point of the desk, so say so; it is still allowed
          if (busy) toast(T("You already have " + busy + " in progress. Finishing one before starting another is faster.", "عندك " + busy + " شغال عليها بالفعل. إنك تخلّص واحدة قبل ما تبدأ التانية أسرع."), true);
        }
        item.stage = to; sfx("tap");
      }
      else if (act === "drop") { item.status = "dropped"; item.closed = now; item.why = "dropped"; }
      else if (act === "reopen") { item.status = "open"; item.stage = "todo"; item.touched = now; item.touchedAt = Date.now(); delete item.closed; delete item.why; }
      else if (act === "more") {
        // a new customer asking restarts the countdown
        item.requests = (item.requests || 0) + 1; item.touched = now; item.touchedAt = Date.now();
        if (item.kind !== "bug" && item.requests === S.settings.promoteAt) toast(T("Enough customers asked. Moved to the fix day queue.", "عدد كافي طلبوها. اتنقلت لطابور يوم التصليح."));
      }
      else if (act === "less") {
        if (el.disabled || !(item.requests > 0)) return;
        item.requests -= 1;
        if (item.kind !== "bug" && item.requests === S.settings.promoteAt - 1) toast(T("Below the bar again. Back to Later.", "بقت أقل من المطلوب. رجعت لبعدين."));
      }
      else if (act === "edit") return openWizard(item);
      else if (act === "ticket") return openTicket(item, true);
      else if (act === "why") { sfx("tap"); return openWhy(item); }
      else if (act === "delete") {
        if (!confirm(T("Delete this for good? It cannot be brought back.", "تمسحها نهائي؟ مش هترجع."))) return;
        S.items = S.items.filter(function (x) { return x.id !== item.id; });
      }
      save(); render();
    }
  });

  document.addEventListener("submit", function (e) {
    if (e.target.hasAttribute && e.target.hasAttribute("data-clientform")) {
      e.preventDefault();
      if (!shotCtx) return;
      var cf = e.target, rec = { id: "c" + uid(), name: cf.name.value.trim(), email: cf.email.value.trim(), phone: cf.phone.value.trim() };
      if (!rec.name && !rec.email && !rec.phone) return toast(T("Write a name, an email or a number first.", "اكتب اسم أو إيميل أو رقم الأول."), true);
      if (rec.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(rec.email)) return toast(T("That email does not look right.", "الإيميل ده شكله مش مظبوط."), true);
      var all = clientsOf(shotCtx.target);
      all.push(rec);
      // the count never lags behind the people actually named
      shotCtx.target.requests = Math.max(+shotCtx.target.requests || 0, all.length);
      if (shotCtx.saved) { shotCtx.target.touched = today(); shotCtx.target.touchedAt = Date.now(); save(); }
      sfx("tap");
      return shotCtx.repaint();
    }
    if (e.target.id === "wizText") {
      e.preventDefault();
      draft.title = $("wizTitle").value; draft.note = $("wizNote").value;
      if (!String(draft.title).trim()) return;
      step++; paintStep();
    } else if (e.target.id === "prodText") {
      e.preventDefault();
      var pk = e.target.getAttribute("data-key");
      prodDraft[pk] = $("prodIn").value.trim();
      if (pk === "statsUrl" && prodDraft[pk] && !(/^https:\/\//i.test(prodDraft[pk]) || (LOCAL && /^http:\/\/(localhost|127\.0\.0\.1)[:/]/i.test(prodDraft[pk])))) {
        pfb = T("That address has to start with https://", "العنوان لازم يبدأ بـ https://"); prodDraft[pk] = ""; return paintProdStep();
      }
      pfb = pfeed(pk, prodDraft[pk]);
      pstep++; sfx("tap"); paintProdStep();
    } else if (e.target.id === "wizLine") {
      e.preventDefault();
      draft[e.target.getAttribute("data-key")] = $("wizDone").value;
      step++; paintStep();
    } else if (e.target.id === "rulesForm") {
      e.preventDefault();
      var f = e.target, s = S.settings;
      s.fixDay = +f.fixDay.value;
      s.fixHours = Math.min(12, Math.max(1, +f.fixHours.value || 6));
      s.promoteAt = Math.min(20, Math.max(1, Math.round(+f.promoteAt.value) || 3));
      s.laterDays = Math.min(180, Math.max(7, Math.round(+f.laterDays.value) || 30));
      // the fix-day block in the daily schedule follows the chosen day
      S.blocks.forEach(function (b) { if (b.fix || /^Fix day/.test(b.en)) b.days = [s.fixDay]; });
      save(); render(); toast(T("Rules saved.", "القواعد اتحفظت."));
    }
  });

  document.addEventListener("change", function (e) {
    var t = e.target;
    if (t.getAttribute && t.getAttribute("data-shotby") && shotCtx) {
      var sp = t.getAttribute("data-shotby").split(":"), arr = shotsOf(shotCtx.target)[sp[0]], cur = arr[+sp[1]];
      arr[+sp[1]] = { u: su(cur), by: t.value };
      if (shotCtx.saved) save();
      return shotCtx.repaint();
    }
    if (t.getAttribute && t.getAttribute("data-shotadd")) {
      addShots(t.getAttribute("data-shotadd"), t.files);
      t.value = "";
      return;
    }
    if (t.classList && t.classList.contains("desk-num")) {
      var w = t.getAttribute("data-week"), p = t.getAttribute("data-product");
      S.numbers[w] = S.numbers[w] || {};
      if (t.value === "") delete S.numbers[w][p]; else S.numbers[w][p] = +t.value;
      save(); render();
    } else if (t.getAttribute && t.getAttribute("data-mode")) {
      product(t.getAttribute("data-mode")).mode = t.value;
      save(); render();
    } else if (t.getAttribute && t.getAttribute("data-bf")) {
      var row = S.blocks[+t.closest(".desk-block").getAttribute("data-bi")], what = t.getAttribute("data-bf");
      if (!row) return;
      if (what === "every") { row.every = +t.value || 1; if (row.every > 1 && !row.from0) row.from0 = today(); if (row.every === 1) delete row.from0; save(); return render(); } // counted from the day it was set
      if (what === "text") { if (t.value.trim()) row.en = row.ar = t.value.trim(); } // one text now serves both languages
      else if (t.value && (what === "from" ? t.value < row.to : t.value > row.from)) row[what] = t.value;
      else toast(T("A block has to end after it starts.", "الخانة لازم تخلص بعد ما تبدأ."), true);
      save(); render();
    } else if (t.id === "prodLogo" && t.files[0]) {
      readLogo(t.files[0], function (url) { if (!prodDraft) return; prodDraft.logo = url; prodDraft.name = $("prodIn") ? $("prodIn").value : prodDraft.name; paintProdStep(); });
      t.value = "";
    } else if (t.id === "importFile" && t.files[0]) {
      var reader = new FileReader();
      reader.onload = function () {
        var doc;
        try { doc = JSON.parse(reader.result); } catch (err) { return toast(T("That file is not a desk copy.", "الملف ده مش نسخة من المكتب."), true); }
        if (!doc || !Array.isArray(doc.items)) return toast(T("That file is not a desk copy.", "الملف ده مش نسخة من المكتب."), true);
        if (S.items.length && !confirm(T("Replace the " + S.items.length + " items here with the file?", "تبدّل الـ " + S.items.length + " حاجة اللي هنا بالملف؟"))) return;
        S = adopt(doc); save(); render(); toast(T("Loaded.", "اتحمّلت."));
      };
      reader.readAsText(t.files[0]);
      t.value = "";
    }
  });

  // a screenshot on the clipboard goes straight in: "before" while logging, and on an open
  // ticket "after" once it has a "before" (or is closed), since that is when one is pasted
  document.addEventListener("paste", function (e) {
    var files = e.clipboardData && e.clipboardData.files;
    if (!files || !files.length || !shotCtx || view) return;
    var side = "before";
    if (ticketItem) side = shotCount(ticketItem, "before") || ticketItem.status !== "open" ? "after" : "before";
    else if (!draft || !$("wizardBody").querySelector("[data-shotadd]")) return; // not on the pictures step
    e.preventDefault();
    addShots(side, files);
  });

  document.addEventListener("input", function (e) {
    var t = e.target;
    if (t.id === "cmpRange") return setCompare(+t.value);
    if (t.id === "usersQ" && usersView) { // wait for a pause in typing before asking the product again
      usersView.q = t.value.trim();
      clearTimeout(usersTimer);
      usersTimer = setTimeout(function () { if (usersView) loadUsers(true); }, 350);
      return;
    }
    if ($("wizard").hidden) return;
    if (prodDraft && t.id === "prodIn") {
      prodDraft[t.form.getAttribute("data-key")] = t.value;
      $("prodLive").innerHTML = productCard(prodDraft, true);
      return;
    }
    if (!draft) return;
    if (t.id === "wizTitle") draft.title = t.value;
    else if (t.id === "wizNote") draft.note = t.value;
    else if (t.id === "wizDone" && t.form && t.form.getAttribute("data-key")) draft[t.form.getAttribute("data-key")] = t.value;
    else return;
    paintLive(liveKey, true);
  });

  // a company logo that fails to load gives way to the product's initial
  document.addEventListener("error", function (e) {
    var t = e.target;
    if (!t || t.tagName !== "IMG" || !t.getAttribute("data-letter")) return;
    var sp = document.createElement("span");
    sp.className = t.className + " desk-logo--txt"; sp.setAttribute("aria-hidden", "true"); sp.style.setProperty("--h", "210");
    sp.textContent = t.getAttribute("data-letter");
    if (t.parentNode) t.parentNode.replaceChild(sp, t);
  }, true);

  document.addEventListener("keydown", function (e) {
    if (view) {
      if (e.key === "Escape") return closeView();
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        var by = (e.key === "ArrowRight") === !I18N.ar ? 1 : -1;
        if (view.cmp != null) view.cmp += by; else view.i += by;
        return paintView();
      }
      return;
    }
    if (e.key === "Escape" && !$("ticket").hidden) return closeTicket();
    if (e.key === "Escape" && !$("wizard").hidden) closeWizard();
  });

  // exposed for checking the rules from the console, nothing depends on it
  window.Desk = { grade: grade, score: score, value: value, plan: plan, expiresAt: expiresAt, state: function () { return S; } };

  load(function () {
    paintSound();
    $("view-loading").hidden = true;
    $("view-app").hidden = false;
    render();
    // the "now" marker on today's blocks moves with the clock
    setInterval(function () {
      maybeNotify();
      if (tab === "numbers" && !document.hidden) refreshLive(false);
      if (tab === "today" && $("wizard").hidden && $("ticket").hidden) render();
    }, 60000);
    maybeNotify();
    autoPull();
    setInterval(tick, 1000);
  });
})();
