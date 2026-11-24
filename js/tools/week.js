/* My week, on /time.

   The weekly routine used to sit in the product desk as "Today's blocks". It is
   a plan for the owner's whole life, not for one product, so it lives here:

     - a strip of seven days, each labelled with what that day is FOR
     - click a day: its whole schedule, morning to bed. Morning and free time
       are the same every day; the work part (office 10:00–19:00) is that
       day's own work. Prayers are worked out for that date in Dubai and put
       in between; no work runs inside them (Pomodoro pauses).
     - the list is the owner's: add, edit, delete, and drag a row by its handle
       to put the day in the order he wants
     - the week as one picture, to open or download

   Saved inside the same private document the desk uses (key `week`), so it
   follows him across devices; on this computer (no server) it is kept in the
   browser. The desk passes the key through untouched. */
(function () {
  "use strict";
  var host = document.getElementById("weekCard");
  if (!host) return;

  var T = window.T || function (en) { return en; };
  var LOCAL = /^(localhost|127\.0\.0\.1|\[::1\]|)$/.test(location.hostname);
  var KEY = "desk.v1", API = "/api/ideas?desk=data";
  var doc = {}, rev = "", W = null, saveTimer = null, status = "", moved = false;
  var alerted = {}, lastPhase = "";
  var todayDow = new Date().getDay(), sel = todayDow, editing = null, drag = null;

  // Saturday first: the week starts with the plan day
  var ORDER = [6, 0, 1, 2, 3, 4, 5];
  var DAY = {
    6: { en: "Sat", ar: "السبت", ico: "🧭", fen: "Plan", far: "خطة", len: "Numbers and feedback, the marketing focus, which problems become systems or AI agents, tasks: GoBachaloria → Techmakerz → Ashrhly", lar: "الأرقام والفيدباك، تركيز التسويق، أنهي مشاكل تبقى سيستم أو AI agent، والمهام: GoBachaloria ← Techmakerz ← Ashrhly" },
    0: { en: "Sun", ar: "الأحد", ico: "🌿", fen: "Weekend", far: "إجازة", len: "No office, no business: rest, wife, family, an outing. Prayers and the evening sport only", lar: "مفيش مكتب ولا بيزنس: راحة ومراتي والعيلة وخروجة. الصلاة والرياضة بالليل بس" },
    1: { en: "Mon", ar: "الاثنين", ico: "✍️", fen: "Script · Shoot", far: "سكريبت · تصوير", len: "Create part 1: 6 video scripts, 2 LinkedIn posts, 13 product posts, then shoot", lar: "صناعة المحتوى 1: 6 سكريبتات فيديو و2 بوست LinkedIn و13 بوست للمنتجات، وبعدها التصوير" },
    2: { en: "Tue", ar: "الثلاثاء", ico: "🎬", fen: "Edit · Schedule", far: "مونتاج · جدولة", len: "Create part 2: montage, design the posts, schedule everything at the best hours", lar: "صناعة المحتوى 2: مونتاج، تصميم البوستات، وجدولة كل حاجة في أحسن المواعيد" },
    3: { en: "Wed", ar: "الأربعاء", ico: "📣", fen: "Distribute", far: "توزيع", len: "DMs, emails, cold calls and replies: UAE in the morning, Egypt in the evening", lar: "رسايل خاصة وإيميلات ومكالمات وردود: الإمارات الصبح ومصر بالليل" },
    4: { en: "Thu", ar: "الخميس", ico: "🧗", fen: "My path", far: "طريقي", len: "Close the week with reports, money check, then check and edit your own path", lar: "قفّل الأسبوع بالتقارير، راجع الفلوس، وبعدها راجع طريقك وعدّله" },
    5: { en: "Fri", ar: "الجمعة", ico: "🤖", fen: "Build · Agents", far: "بناء · Agents", len: "Office day + Good Product (bugs) + Good AI Agents: one problem of the week becomes an agent", lar: "يوم مكتب + Good Product (الأخطاء) + Good AI Agents: مشكلة من الأسبوع تتحول لـagent" }
  };

  function uid() { return "w" + Math.random().toString(36).slice(2, 9); }
  function it(from, to, en, ar, more) {
    var o = { id: uid(), from: from, to: to, en: en, ar: ar };
    if (more) for (var k in more) o[k] = more[k];
    return o;
  }
  /* v11 (2026-11-24): a 25% buffer on everything (block = work `est` + a quarter).
     Morning: Fajr, azkar 15, Quran and khulwa 15, learning 1 h 30, breakfast 30,
     shower 15, then 45 min of business work at home before the office.
     Office 10 AM – 7 PM: part-time job 4 h work + buffer = 5 h (10:00–12:15,
     3:45–5:30, 6:00–7:00); food at the desk 15 min; job hunt 30 min with Claude,
     buffer included; the day's main task 1 h 45 (1:30–3:15).
     Evening: at least 2 h with people every day, shared out over the week:
     wife 3 days (Sat, Mon, Wed), family 2 (Sun, Fri), friends 1 (Thu), me 1 (Tue).
     Gym 1 h 30, 3 evenings (Sun, Tue, Thu), before that; those nights sleep is
     at 11 PM so the 2 h with people still fit. Other nights sleep 10:30 PM.
     Prayers 30 min at most around the iqama. */
  var WEEK_V = 26;
  function seed() {
    var d = function (sec, from, to, en, ar, more) { var o = it(from, to, en, ar, more); o.sec = sec; return o; };
    var i = function (en, ar, est, ai) { var o = { en: en, ar: ar, est: est }; if (ai !== false) o.ai = 1; return o; };
    var P = { pomo: 1 }, GYM = [0, 2, 4], NOGYM = [6, 1, 3, 5];
    var comments = function () { return i("Answer comments and messages on today's posts", "رد على التعليقات والرسايل على بوستات النهارده", 10, false); };
    var job = function (f, t) { return d("w", f || "14:45", t || "15:15", "🎯 Job hunt with Claude (30 min)", "🎯 التقديم على الوظايف مع Claude (30 دقيقة)", { items: [
      i("3 UAE product manager jobs (25K+ AED)", "3 وظايف مدير منتج في الإمارات (25 ألف درهم أو أكتر)", 12),
      i("2 Europe jobs with visa sponsorship", "2 وظايف أوروبا بكفالة فيزا", 8),
      i("Udacity mentor jobs: check", "شغل منتور يوداسيتي: شوف لو فيه", 4, false)
    ] }); };
    var food = function () { return d("w", "12:45", "13:00", "🥗 Food at the desk", "🥗 أكل على المكتب"); };
    // the part-time job first: exactly 4 h, no buffer (10:00–12:15 + 1:00–2:45; Friday around Jumu'ah),
    // then my business right after it (2:45–3:15, 3:45–5:30, 6:00–7:00)
    var office = function (fri) { return fri ? [
      d("w", "10:00", "12:15", "🏢 Part-time job: the urgent things first, then the day's work", "🏢 البارت تايم: المستعجل الأول وبعدين شغل اليوم", { cat: "office", pomo: 1 }),
      d("w", "13:45", "15:15", "🏢 Part-time job work", "🏢 شغل البارت تايم", { cat: "office", pomo: 1 }),
      d("w", "15:45", "16:00", "🏢 Part-time job: wrap up", "🏢 البارت تايم: قفّل", { cat: "office" })
    ] : [
      d("w", "10:00", "12:15", "🏢 Part-time job: the urgent things first, then the day's work", "🏢 البارت تايم: المستعجل الأول وبعدين شغل اليوم", { cat: "office", pomo: 1 }),
      d("w", "13:00", "14:45", "🏢 Part-time job work, then wrap up", "🏢 شغل البارت تايم وبعدين قفّل", { cat: "office", pomo: 1 })
    ]; };
    var early = function (cat, items) { return d("w", "08:45", "09:30", "⭐ Business, at home before the office", "⭐ البيزنس، في البيت قبل المكتب", { cat: cat, pomo: 1, items: items }); };
    var day = function (cat, before, aEn, aAr, A, bEn, bAr, B, catA) {
      var o = office();
      return [early(cat, before), o[0], food(), o[1], job(),
        d("w", "15:45", "17:30", aEn, aAr, { cat: catA || cat, pomo: 1, items: A }),
        d("w", "18:00", "18:45", bEn, bAr, { cat: cat, pomo: 1, items: B.concat([comments()]) })];
    };
    return { v: WEEK_V, jobs: { daily: 5, log: {} }, meetings: [],
      myday: [
        d("m", "06:00", "06:15", "📿 Morning azkar", "📿 أذكار الصباح"),
        d("m", "06:15", "06:30", "📖 Quran and khulwa: quiet time alone, phone away", "📖 قرآن وخلوة: وقت لوحدك والموبايل بعيد"),
        // learn, then build it into the business the same morning (learning by building)
        d("m", "06:30", "07:30", "🧠 Learn one thing the business needs this week (AI agents, marketing, product)", "🧠 اتعلم حاجة البيزنس محتاجها الأسبوع ده (AI agents، تسويق، منتج)", { pomo: 1, est: 48, on: [6, 1, 2, 3, 4, 5] }),
        d("m", "07:30", "08:00", "🤖 Apply it to the business: one step of an AI agent (GoBachaloria first)", "🤖 طبّقه على البيزنس: خطوة في AI agent (GoBachaloria الأول)", { cat: "product", pomo: 1, on: [6, 1, 2, 3, 4, 5] }),
        d("m", "08:00", "08:30", "🍳 Breakfast: dates and eggs", "🍳 فطار: تمر وبيض"),
        d("m", "08:30", "08:45", "🚿 Shower", "🚿 دش"),
        d("m", "09:30", "09:45", "👔 Get ready, pack the gym bag", "👔 اجهز وحضّر شنطة الجيم", { on: [6, 1, 2, 3, 4, 5] }),
        d("m", "09:45", "10:00", "🚗 To the office (15 min)", "🚗 للمكتب (15 دقيقة)", { on: [6, 1, 2, 3, 4, 5] }),
        // evening: gym Sun, Tue, Thu + sport Fri, 1 h 30 each and a 15-min buffer after it (shower, way
        // home); Sat, Mon, Wed off. Every night a 15-min wind-down buffer, lights off at 10:30 PM (7 h sleep).
        d("f", "19:30", "21:00", "🏋️ Gym after Isha: 1 h 30 of training", "🏋️ الجيم بعد العشا: ساعة ونص تمرين", { on: [0, 2, 4] }),
        d("f", "19:30", "21:00", "⚽ Sport: football, padel or swimming (1 h 30)", "⚽ رياضة: كورة أو بادل أو سباحة (ساعة ونص)", { on: [5] }),
        d("f", "21:00", "21:15", "🛟 Sport buffer: shower, the way home", "🛟 احتياطي الرياضة: دش والمشوار للبيت", { cat: "bufSport", on: [0, 2, 4, 5] }),
        d("f", "21:15", "22:15", "👨‍👩‍👧 With the family: dinner together, phone away", "👨‍👩‍👧 مع العيلة: عشا مع بعض، والموبايل بعيد", { on: [0, 5] }),
        d("f", "21:15", "22:15", "🎮 Me: anything I enjoy", "🎮 أنا: أي حاجة بحبها", { on: [2] }),
        d("f", "21:15", "22:15", "🤝 With friends", "🤝 مع الصحاب", { on: [4] }),
        d("f", "19:30", "19:45", "🏠 Home (15 min)", "🏠 البيت (15 دقيقة)", { on: [6, 1, 3] }),
        d("f", "19:45", "22:15", "💑 With my wife: dinner and time together, phone away", "💑 مع مراتي: عشا ووقت مع بعض، والموبايل بعيد", { on: [6, 1, 3] }),
        d("w", "18:45", "19:00", "📋 Plan tomorrow: open Tomorrow in the Today tab, move or add what you need", "📋 خطّط لبكرة: افتح بكرة في تاب النهارده، وحرّك أو ضيف اللي محتاجه", { cat: "plan" }),
        d("f", "22:15", "22:30", "🛟 Sleep buffer: wind down, wudu, sleep azkar, lights off at 10:30 PM", "🛟 احتياطي النوم: تهدية ووضوء وأذكار النوم والنور يتقفل 10:30", { cat: "bufSleep" })
      ],
      days: {
        6: day("plan", [
          i("Numbers, videos' stats and customer feedback: Claude sums them up", "الأرقام وإحصائيات الفيديوهات وفيدباك العملاء: Claude يلخصهم", 35)
        ], "🧭 Plan the week: focus and systems", "🧭 خطة الأسبوع: التركيز والسيستم", [
          i("Our marketing focus for the week", "تركيز التسويق بتاعنا للأسبوع", 15),
          i("This week's problems: which one becomes a system or an AI agent (not a one-off fix)", "مشاكل الأسبوع: أنهي واحدة تتحول لسيستم أو AI agent (مش حل مرة واحدة)", 20)
        ], "🧭 Plan the week: the tasks", "🧭 خطة الأسبوع: المهام", [
          i("Tasks in order: GoBachaloria 5, Techmakerz 3, Ashrhly 2, into the desk, sent to the team", "المهام بالترتيب: GoBachaloria 5، Techmakerz 3، Ashrhly 2، في الـdesk ومتبعتة للفريق", 35)
        ]),
        // the free day, shared like the evenings: wife 3 · family 2 · friends 1 · me 1
        0: [
          d("w", "06:30", "08:00", "🎮 Me: a walk, a book, quiet time", "🎮 أنا: مشية، كتاب، وقت هادي"),
          d("w", "08:45", "12:15", "💑 With my wife: a morning out together", "💑 مع مراتي: خروجة الصبح مع بعض"),
          d("w", "12:45", "15:15", "👨‍👩‍👧 With the family: lunch and a visit", "👨‍👩‍👧 مع العيلة: غدا وزيارة"),
          d("w", "15:45", "17:30", "🤝 With friends", "🤝 مع الصحاب"),
          d("w", "18:00", "18:45", "💑 With my wife: time together", "💑 مع مراتي: وقت مع بعض")
        ],
        1: day("content", [
          i("6 video scripts with Claude: 3 English, 3 Arabic", "6 سكريبتات فيديو مع Claude: 3 إنجليزي و3 عربي", 35)
        ], "🎥 Shoot: English", "🎥 تصوير: إنجليزي", [
          i("Shoot 3 English videos, or make them with AI", "صوّر 3 فيديوهات إنجليزي، أو اعملهم بالذكاء الاصطناعي", 25),
          i("2 LinkedIn posts with Claude", "2 بوست LinkedIn مع Claude", 10)
        ], "🎥 Shoot: Arabic", "🎥 تصوير: عربي", [
          i("Shoot 3 Arabic videos, or make them with AI", "صوّر 3 فيديوهات عربي، أو اعملهم بالذكاء الاصطناعي", 25),
          i("Upload the raw videos to one folder", "ارفع الفيديوهات الخام في فولدر واحد", 5, false)
        ]),
        2: day("content", [
          i("13 product posts with AI: GoBachaloria 6, Techmakerz 4, Ashrhly 3", "13 بوست للمنتجات بالذكاء الاصطناعي: GoBachaloria 6، Techmakerz 4، Ashrhly 3", 35)
        ], "🎬 Montage: the English videos", "🎬 مونتاج: الفيديوهات الإنجليزي", [
          i("Montage 3 videos: template, AI captions", "مونتاج 3 فيديوهات: قالب وترجمة بالذكاء الاصطناعي", 35)
        ], "🎬 Montage the Arabic videos, then schedule", "🎬 مونتاج العربي وبعدين الجدولة", [
          i("Montage 3 videos: template, AI captions", "مونتاج 3 فيديوهات: قالب وترجمة بالذكاء الاصطناعي", 20),
          i("Schedule everything at the best hours", "جدول كل حاجة في أحسن المواعيد", 10, false),
          i("Wednesday's emails with Claude, scheduled", "إيميلات الأربعاء مع Claude ومتجدولة", 8)
        ]),
        3: [
          d("w", "08:00", "08:15", "✉️ Emails go out on their own (UAE 8 AM, Egypt schools 10 AM)", "✉️ الإيميلات بتتبعت لوحدها (الإمارات 8 الصبح، مدارس مصر 10 الصبح)", { cat: "content" }),
          early("content", [i("Today's call list and DMs, written with Claude", "ليستة مكالمات النهارده والرسايل، مكتوبة مع Claude", 35)]),
          office()[0], food(), office()[1], job(),
          d("w", "15:45", "17:30", "🇦🇪 Distribute: UAE (offices still open)", "🇦🇪 التوزيع: الإمارات (المكاتب لسه فاتحة)", { cat: "content", pomo: 1, items: [
            i("Cold calls to UAE businesses, about 5", "مكالمات لشركات في الإمارات، حوالي 5", 25, false),
            i("Send the DMs", "ابعت الرسايل", 10, false)
          ] }),
          d("w", "18:00", "18:45", "🇪🇬 Distribute: Egypt (4 PM Cairo, after school) + clients", "🇪🇬 التوزيع: مصر (4 العصر بتوقيت القاهرة، بعد المدرسة) + العملاء", { cat: "content", pomo: 1, items: [
            i("Replies to paying students + DMs to who tried and did not pay", "ردود للطلبة الدافعين + رسايل للي جرّبوا وما دفعوش", 30),
            i("Reply to current clients", "رد على العملاء الحاليين", 8, false),
            comments()
          ] })
        ],
        4: day("plan", [
          i("Reports + money check: each product vs last week, Claude writes it", "التقارير ومراجعة الفلوس: كل منتج قدام الأسبوع اللي فات، Claude يكتبها", 35)
        ], "🔎 Search page and next week", "🔎 صفحة البحث والأسبوع الجاي", [
          i("1 search page with Claude: it answers 1 real question", "صفحة بحث واحدة مع Claude: بتجاوب سؤال حقيقي واحد", 25),
          i("Top 3 for next week", "أهم 3 حاجات للأسبوع الجاي", 10, false)
        ], "🧗 My path", "🧗 طريقي", [
          i("Where am I against my goals, edit the path", "أنا فين من أهدافي، وعدّل الطريق", 38, false)
        ], "content"),
        5: [
          early("product", [i("Fix bugs, top of the list first, screen recording on", "صلّح الأخطاء من أول القايمة، وتسجيل الشاشة شغال", 35)]),
          office(true)[0],
          d("w", "13:30", "13:45", "🥗 Food at the desk", "🥗 أكل على المكتب"),
          office(true)[1], office(true)[2],
          job("16:00", "16:30"),
          d("w", "16:30", "17:30", "🛠️ Good Product: what stops clients paying, one new feature", "🛠️ Good Product: اللي بيمنع العميل يدفع، وميزة جديدة", { cat: "product", pomo: 1, items: [
            i("What stops clients from paying", "اللي بيمنع العميل يدفع", 30),
            i("One new feature, tested on the live site", "ميزة جديدة واحدة، ومتجربة على الموقع الحقيقي", 30)
          ] }),
          d("w", "18:00", "18:45", "🤖 One problem → one AI agent", "🤖 مشكلة واحدة ← AI agent واحد", { cat: "product", pomo: 1, items: [
            i("Pick the problem from Saturday's list (GoBachaloria first)", "اختار المشكلة من ليستة السبت (GoBachaloria الأول)", 8, false),
            i("Build the agent with Claude", "ابني الـagent مع Claude", 30),
            i("Test it, switch it on, write how it works", "جرّبه وشغّله واكتب بيشتغل إزاي", 10)
          ] })
        ]
      } };
  }

  var SEC = {
    m: { en: "🌅 Morning routine", ar: "🌅 روتين الصبح" },
    w: { en: "💼 Work · office 10 AM – 7 PM", ar: "💼 الشغل · المكتب 10 الصبح – 7 بالليل" },
    f: { en: "🏡 Free time · me and family", ar: "🏡 الوقت الحر · أنا والعيلة" }
  };

  /* Prayers, the same way the Time page does them (js/tools/time.js, shared through
     window.TimePrayer when it is there):
       where you are (phone location, kept in "time-prayer-loc") → that day's times
       from AlAdhan (cached in "time-prayer-times"; offline → js/tools/prayer.js)
       → iqama = adhan + your mosque's wait (UAE: Fajr 20, Dhuhr 20, Asr 20,
       Maghrib 5, Isha 20; changed on the Time page) → the prayer takes the half
       hour the iqama falls in, so you pray in the masjid. Friday: Jumu'ah from
       the half hour before the khutba (UAE 12:45). */
  var PNAME = { fajr: ["Fajr", "الفجر"], dhuhr: ["Dhuhr", "الظهر"], asr: ["Asr", "العصر"], maghrib: ["Maghrib", "المغرب"], isha: ["Isha", "العشا"] };
  var PNOTE = { fajr: ["wake up 10 min before", "اصحى قبلها بـ10 دقايق"], dhuhr: ["", ""], asr: ["", ""], maghrib: ["right at the adhan", "على الأذان على طول"], isha: ["then leave the office", "وبعدها امشي من المكتب"] };
  var IQ_DEFAULT = { AE: { fajr: 20, dhuhr: 20, asr: 20, maghrib: 5, isha: 20, jumuah: "12:45" }, EG: { fajr: 20, dhuhr: 10, asr: 10, maghrib: 7, isha: 10, jumuah: "" },
    SA: { fajr: 25, dhuhr: 20, asr: 20, maghrib: 10, isha: 20, jumuah: "" }, "*": { fajr: 20, dhuhr: 15, asr: 15, maghrib: 10, isha: 15, jumuah: "" } };
  var PT = {}, ptAsk = {};
  function lsGet(k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function place() { return lsGet("time-prayer-loc") || { lat: 25.2048, lng: 55.2708, name: "Dubai", cc: "AE", guess: true }; }
  function iqamaSet() {
    if (window.TimePrayer && TimePrayer.settings) return TimePrayer.settings();
    var cc = place().cc || "AE", saved = (lsGet("time-prayer") || {})[cc] || {}, d = IQ_DEFAULT[cc] || IQ_DEFAULT["*"], out = {};
    for (var k in d) out[k] = saved[k] != null ? saved[k] : d[k];
    return out;
  }
  function iso(d) { return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }
  // right now, without waiting: the cached times, else worked out on this device
  function timesNow(date) {
    if (PT[date]) return PT[date];
    var pl = place(), c = (lsGet("time-prayer-times") || {})[date + "|" + pl.lat.toFixed(2) + "," + pl.lng.toFixed(2)];
    if (c) return (PT[date] = { t: c, place: pl, src: c.source || "AlAdhan" });
    var t = window.Prayer ? window.Prayer.times(date, pl.lat, pl.lng) : dubaiTimes(new Date(date + "T12:00:00"));
    return { t: t, place: pl, src: "device" };
  }
  // then the real thing, and draw again when it comes
  function askTimes(date) {
    if (PT[date] || ptAsk[date]) return;
    ptAsk[date] = 1;
    var got = function (t, pl) { PT[date] = { t: t, place: pl, src: t.source || "AlAdhan" }; render(); };
    if (window.TimePrayer && TimePrayer.place) {
      TimePrayer.place().then(function (pl) { return TimePrayer.timesFor(date, pl).then(function (t) { got(t, pl); }); }).catch(function () {});
      return;
    }
    var pl = place(), dd = date.split("-");
    fetch("https://api.aladhan.com/v1/timings/" + dd[2] + "-" + dd[1] + "-" + dd[0] + "?latitude=" + pl.lat + "&longitude=" + pl.lng)
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (r) {
        if (!r || !r.data) return;
        var x = r.data.timings, hm = function (v) { return String(v).slice(0, 5); };
        var t = { fajr: hm(x.Fajr), sunrise: hm(x.Sunrise), dhuhr: hm(x.Dhuhr), asr: hm(x.Asr), maghrib: hm(x.Maghrib), isha: hm(x.Isha), source: "AlAdhan" };
        var cache = lsGet("time-prayer-times") || {}; cache[date + "|" + pl.lat.toFixed(2) + "," + pl.lng.toFixed(2)] = t; lsSet("time-prayer-times", cache);
        got(t, pl);
      }).catch(function () {});
  }
  // last resort with no prayer.js: Dubai, UAE method
  function dubaiTimes(date) {
    var lat = 25.2048, lng = 55.2708, tz = 4, rad = Math.PI / 180;
    var jd = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 864e5 + 2440587.5 - lng / 360 + 0.5;
    var D = jd - 2451545, g = (357.529 + 0.98560028 * D) * rad, q = 280.459 + 0.98564736 * D;
    var L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad, e = (23.439 - 0.00000036 * D) * rad;
    var ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)) / rad / 15, dec = Math.asin(Math.sin(e) * Math.sin(L));
    var eqt = q / 15 - ((ra % 24) + 24) % 24; eqt = ((eqt + 12) % 24 + 24) % 24 - 12;
    var noon = 12 + tz - lng / 15 - eqt, la = lat * rad;
    function TT(alt) { return Math.acos((Math.sin(alt * rad) - Math.sin(dec) * Math.sin(la)) / (Math.cos(dec) * Math.cos(la))) / rad / 15; }
    var asrAlt = Math.atan(1 / (1 + Math.tan(Math.abs(la - dec)))) / rad;
    var h = { fajr: noon - TT(-18.2), dhuhr: noon + 3 / 60, asr: noon + TT(asrAlt), maghrib: noon + TT(-0.833) + 3 / 60, isha: noon + TT(-18.2) };
    var out = {}; for (var k in h) out[k] = hhmm(Math.round(h[k] * 60)); return out;
  }
  function hhmm(m) { m = ((m % 1440) + 1440) % 1440; return ("0" + Math.floor(m / 60)).slice(-2) + ":" + ("0" + (m % 60)).slice(-2); }
  function mins(t) { return t ? +t.slice(0, 2) * 60 + +t.slice(3, 5) : 0; }
  // 13:30 → "1:30 PM" (Arabic ص / م); times are still kept as 24-hour "HH:MM"
  function ap(t) {
    var m = typeof t === "number" ? t : mins(t); m = ((m % 1440) + 1440) % 1440;
    var h = Math.floor(m / 60), pm = h >= 12;
    return (h % 12 || 12) + ":" + ("0" + (m % 60)).slice(-2) + " " + T(pm ? "PM" : "AM", pm ? "م" : "ص");
  }
  // how long a block is: "30 min", "1 h", "1 h 30 min" (Arabic: دقيقة / ساعة)
  function howLong(a, b) {
    var n = (typeof b === "number" ? b : mins(b)) - (typeof a === "number" ? a : mins(a));
    if (n === 0 && a === 0) return T("0 min", "0 دقيقة");
    if (n <= 0) n += 1440;
    var h = Math.floor(n / 60), m = n % 60;
    return T((h ? h + " h" : "") + (h && m ? " " : "") + (m ? m + " min" : ""), (h ? (h === 1 ? "ساعة" : h === 2 ? "ساعتين" : h + " ساعات") : "") + (h && m ? " و" : "") + (m ? m + " دقيقة" : ""));
  }
  function durTag(a, b) { return '<i class="day-tag day-tag--dur">⏱ ' + esc(howLong(a, b)) + "</i>"; }
  /* Categories: every block has one, by its words unless picked by hand (x.cat).
     Each has a colour (the stub, the edge, the day strip) and an icon. */
  var CAT = {
    deen:    { c: "#3AA682", ico: "🕌", en: "Islamic", ar: "دين" },
    learn:   { c: "#F9B233", ico: "🧠", en: "Learning", ar: "تعلّم" },
    office:  { c: "#C9B79C", ico: "🏢", en: "Part-time job · 4 h a day", ar: "البارت تايم · 4 ساعات في اليوم" },
    job:     { c: "#FF6B5B", ico: "🎯", en: "Job search", ar: "البحث عن وظيفة" },
    client:  { c: "#E86A92", ico: "🤝", en: "Client meetings", ar: "مواعيد العملاء" },
    udacity: { c: "#F28C6B", ico: "🎓", en: "Udacity", ar: "يوداسيتي" },
    product: { c: "#7F94C2", ico: "🛠️", en: "Good Product (incl. AI agents)", ar: "Good Product (ومعاه الـAI agents)" },
    system:  { c: "#9D8DF1", ico: "⚙️", en: "Good System", ar: "Good System" },
    content: { c: "#4FB3BF", ico: "📣", en: "Good Marketing", ar: "Good Marketing" },
    agents:  { c: "#B48EE8", ico: "🤖", en: "Good AI Agents", ar: "Good AI Agents" },
    plan:    { c: "#8FA3C2", ico: "📋", en: "Planning", ar: "التخطيط" },
    biz:     { c: "#5E86C1", ico: "💼", en: "Open business time", ar: "وقت بيزنس مفتوح" },
    rest:    { c: "#7CC6A4", ico: "🌿", en: "Sunday free hours", ar: "ساعات الأحد الحرة" },
    buffer:  { c: "#C4C9D6", ico: "🛟", en: "Buffer time", ar: "وقت احتياطي" },
    bufSport: { c: "#C9E3A8", ico: "🛟", en: "Buffer: sport (shower, way home)", ar: "احتياطي: الرياضة (دش ومشوار)" },
    bufSleep: { c: "#AEB8D6", ico: "🛟", en: "Buffer: sleep (wind down)", ar: "احتياطي: النوم (تهدية)" },
    bufLearn: { c: "#FAD98A", ico: "🛟", en: "Buffer: learning", ar: "احتياطي: التعلّم" },
    bufOffice: { c: "#E6DCC9", ico: "🛟", en: "Buffer: part-time (+25%)", ar: "احتياطي: البارت تايم (+25%)" },
    bufBiz:  { c: "#B3C6E6", ico: "🛟", en: "Buffer: business (+25%)", ar: "احتياطي: البيزنس (+25%)" },
    bufCash: { c: "#F7B9AD", ico: "🛟", en: "Buffer: cashflow (+25%)", ar: "احتياطي: الكاش فلو (+25%)" },
    fitness: { c: "#9CCC65", ico: "🏋️", en: "Fitness", ar: "رياضة" },
    food:    { c: "#F4A261", ico: "🍽️", en: "Food", ar: "أكل" },
    sleep:   { c: "#5B6B9A", ico: "😴", en: "Sleep", ar: "نوم" },
    wife:    { c: "#FF8FB1", ico: "💑", en: "Wife", ar: "مراتي" },
    family:  { c: "#E8A87C", ico: "👨‍👩‍👧", en: "Family", ar: "العيلة" },
    friends: { c: "#B5838D", ico: "🤝", en: "Friends", ar: "الصحاب" },
    me:      { c: "#A3B18A", ico: "🎮", en: "Me", ar: "أنا" },
    life:    { c: "#8D99AE", ico: "🏠", en: "Getting ready & on the way", ar: "تجهيز ومشاوير" },
    free:    { c: "#3A4566", ico: "⬜", en: "Not planned", ar: "مش متخطط" }
  };
  // two groups: the business (Good Marketing, Good System, Good Product) and cashflow from side income
  var GROUPS = [
    { id: "biz", ico: "💼", en: "Business", ar: "البيزنس", cats: ["plan", "content", "product", "system", "biz"] },
    { id: "cash", ico: "💸", en: "Cashflow (side income)", ar: "كاش فلو (دخل جانبي)", cats: ["job", "client", "udacity"] },
    { id: "free", ico: "🎉", en: "Free time & entertainment", ar: "وقت حر وترفيه", cats: ["wife", "family", "friends", "me", "rest"] },
    { id: "spare", ico: "🛟", en: "Spare time (buffers)", ar: "وقت احتياطي", cats: ["bufSport", "bufSleep", "bufLearn"] }
  ];
  var CAT_ORDER = ["plan", "content", "product", "system", "agents", "biz", "job", "client", "udacity", "office", "learn", "deen", "wife", "family", "friends", "me", "fitness", "food", "sleep", "life", "rest", "bufSport", "bufSleep", "bufLearn", "free"];
  var CAT_WORDS = [
    ["life", /wind down|تهدية/i],
    ["deen", /azkar|quran|khulwa|masjid|pray|أذكار|قرآن|خلوة|صلا/i],
    ["learn", /learn|اتعلم|تعلّم/i],
    ["wife", /wife|مراتي/i],
    ["family", /family|العيلة/i],
    ["friends", /friends|الصحاب/i],
    ["me", /^🎮|\bme:|أنا:/i],
    ["life", /get ready|اجهز/i],
    ["fitness", /gym|sport|جيم|رياضة/i],
    ["food", /breakfast|lunch|food|فطار|غدا|أكل/i],
    ["life", /get ready|to the office|shower|home \(|read or relax|metro|اجهز|للمكتب|دش|البيت|اقرا أو ارتاح/i],
    ["office", /part-time|^🏢|office:|البارت|المكتب:/i],
    ["job", /job hunt|job search|job application|الوظايف|تقديمات/i],
    ["udacity", /udacity|يوداسيتي/i],
    ["client", /client meeting|prep for|meeting with|ميعاد عميل|تحضير لـ/i],
    ["content", /distribute|cold call|dms? |reply to|emails go|students|التوزيع|مكالمات|رسايل|إيميلات/i],
    ["plan", /plan the week|close the week|reports|my path|next week|خطة الأسبوع|قفّل الأسبوع|التقارير|طريقي|الأسبوع الجاي/i],
    ["system", /automat|good system|أوتوماتيك/i],
    ["product", /build with|bugs|feature|البناء|الأخطاء|ميزة/i],
    ["content", /create part|script|shoot|montage|posts|schedule everything|search page|comments|المحتوى|سكريبت|صوّر|مونتاج|بوست|جدول|صفحة بحث|التعليقات/i]
  ];
  function catOf(x) {
    if (x.cat === "agents") return "product";
    if (x.cat && CAT[x.cat]) return x.cat;
    if (x.kind === "pray") return "deen";
    if (x.kind === "meet" || x.kind === "prep") return x.cat || "client";
    if (x.kind === "gap") return x.cat;
    var t = (x.text || "") + " " + (x.en || "");
    for (var i = 0; i < CAT_WORDS.length; i++) if (CAT_WORDS[i][1].test(t)) return CAT_WORDS[i][0];
    return "product";
  }
  // the time stub: start big with AM/PM small, the end under it, and how long
  function stub(from, to, cat, extraCls) {
    var a = ap(from).split(" "), cc = CAT[cat];
    return '<b dir="ltr" class="cat-stub' + (extraCls || "") + '" style="--cat:' + cc.c + '" data-ico="' + cc.ico + '" title="' + esc(T(cc.en, cc.ar)) + '">' +
      '<span class="cat-stub__ico">' + cc.ico + "</span>" +
      "<strong>" + esc(a[0]) + "<sup>" + esc(a[1]) + "</sup></strong>" +
      (to ? "<small>" + esc(T("to ", "لحد ")) + esc(ap(to)) + "</small><em>⏱ " + esc(howLong(from, to)) + "</em>" : "") + "</b>";
  }
  function catTag(cat) { var cc = CAT[cat]; return '<i class="day-cat" style="--cat:' + cc.c + '">' + cc.ico + " " + esc(T(cc.en, cc.ar)) + "</i>"; }
  function dateOf(dow) { var d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + ((dow - d.getDay() + 7) % 7)); return d; }
  function prayers(dow) {
    var date = iso(dateOf(dow)), got = timesNow(date), t = got.t, set = iqamaSet(), fri = dow === 5;
    askTimes(date);
    return ["fajr", "dhuhr", "asr", "maghrib", "isha"].map(function (k) {
      var adhan = mins(t[k]), n = PNAME[k], note = (k === "isha" && tpl(dow) === 0) ? ["", ""] : PNOTE[k] || ["", ""];
      if (k === "dhuhr" && fri) {
        // Jumu'ah is the one longer than 30 min: the khutba, then the prayer
        var kh = set.jumuah ? mins(set.jumuah) : adhan, f0 = Math.floor((kh - 10) / 15) * 15;
        return { kind: "pray", k: k, at: adhan, iq: kh, from: f0, to: Math.ceil((kh + 35) / 15) * 15, en: "Jumu'ah", ar: "الجمعة", sub: [ "khutba " + ap(kh), "الخطبة " + ap(kh)] };
      }
      // from: wudu and the walk to the masjid (Fajr: waking up too), never before the adhan's half hour
      // to: the prayer, the sunnah and the walk back
      var iq = adhan + (Number(set[k]) || 0);
      // on quarter hours, 30 minutes at most: start ~10 min before the iqama (never before the adhan), end 30 min later
      var from = Math.max(Math.floor(adhan / 15) * 15, Math.floor((iq - 10) / 15) * 15);
      var to = Math.min(from + 30, Math.max(from + 15, Math.ceil((iq + 15) / 15) * 15));
      return { kind: "pray", k: k, at: adhan, iq: iq, from: from, to: to, en: n[0], ar: n[1], note: note,
        sub: ["adhan " + ap(adhan) + " · iqama " + ap(iq), "الأذان " + ap(adhan) + " · الإقامة " + ap(iq)] };
    });
  }

  /* Client meetings: from the Clients page on the site (/api/clients, every meeting
     still to come), plus any added here by hand. Each one takes its half hours and
     gets a 30-minute prep right before it. */
  var MEET = [];
  /* ---------- Google Calendar (api/_lib/gcal.js) ----------
     Connected once from Today. Then: today and tomorrow are written to the "My day" calendar a
     couple of seconds after any change (add, edit, delete, move, tick), and the meetings and
     interviews you accepted (from email, in your Google Calendar) come into Today and Tomorrow. */
  var GC = { configured: false, connected: false, last: "", err: "" }, GEV = [], gcTimer = null;
  function gcStatus() {
    if (LOCAL) return;
    fetch("/api/ideas?gcal=status", { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      if (!d) return;
      GC.configured = !!d.configured; GC.connected = !!d.connected;
      if (GC.connected) { gcSync(); gcEvents(); }
      if (W) render();
    }).catch(function () {});
  }
  function dayEvents(off) {
    var dow = (todayDow + off) % 7, d = new Date(Date.now() + off * 864e5), key = iso(d);
    var o = W.dates && W.dates[key], rows = o ? o.myday.concat(o.work) : W.myday.filter(function (x) { return !x.on || x.on.indexOf(tpl(dow)) > -1; }).concat(W.days[tpl(dow)] || []);
    var done = (o && o.done) || {}, ev = [];
    rows.forEach(function (x) {
      if (!x.from || !x.to) return;
      var its = Array.isArray(x.items) ? x.items.map(function (y) { return "• " + T(y.en, y.ar); }).join("\n") : "";
      ev.push({ key: "r" + x.id, title: (done[x.id] ? "✓ " : "") + (x.text || T(x.en, x.ar)), from: x.from, to: x.to, desc: (its ? its + "\n\n" : "") + (CAT[catOf(x)] ? T(CAT[catOf(x)].en, CAT[catOf(x)].ar) : "") });
    });
    prayers(dow).forEach(function (p) {
      ev.push({ key: "p" + p.k, title: (done["pray:" + p.k] ? "✓ " : "") + "🕌 " + T(p.en, p.ar) + " · " + T("iqama ", "الإقامة ") + ap(p.iq), from: hhmm(p.from), to: hhmm(p.to), desc: T("Adhan ", "الأذان ") + ap(p.at) });
    });
    return { date: key, events: ev };
  }
  // the new plan starts on Thursday 26 Nov 2026 (owner, 2026-11-24): nothing from it goes to Google
  // Calendar or into the Today tab for an earlier day
  var PLAN_START = "2026-11-26";
  function gcSync() {
    if (LOCAL || !GC.connected || !W) return;
    clearTimeout(gcTimer);
    gcTimer = setTimeout(function () {
      var tz = ""; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (e) {}
      fetch("/api/ideas?gcal=sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tz: tz, days: [0, 1].filter(function (off) { return iso(new Date(Date.now() + off * 864e5)) >= PLAN_START; }).map(dayEvents) }) })
        .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
        .then(function (x) {
          if (x.ok) { var n = new Date(); GC.last = ap(n.getHours() * 60 + n.getMinutes()); GC.err = ""; }
          else { GC.err = (x.d && x.d.error) || "sync failed"; if (/not connected/i.test(GC.err)) GC.connected = false; }
          var el = host.querySelector(".gc-bar"); if (el) el.outerHTML = gcBar();
        }).catch(function () { GC.err = T("No connection", "مفيش نت"); });
    }, 2000);
  }
  function gcEvents() {
    if (LOCAL || !GC.connected) return;
    var tz = ""; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (e) {}
    fetch("/api/ideas?gcal=events&from=" + iso(new Date()) + "&to=" + iso(new Date(Date.now() + 864e5)) + "&tz=" + encodeURIComponent(tz), { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; }).then(function (d) { if (d && Array.isArray(d.events)) { GEV = d.events; if (W) render(); } }).catch(function () {});
  }
  function gcBar() {
    if (LOCAL) return '<div class="gc-bar muted">📅 ' + esc(T("Google Calendar works on the live site", "جوجل كالندر شغال على الموقع نفسه")) + "</div>";
    if (!GC.configured) return '<div class="gc-bar muted">📅 ' + esc(T("Google Calendar: waiting for the one-time Google setup", "جوجل كالندر: مستني إعداد جوجل مرة واحدة")) + "</div>";
    if (!GC.connected) { var tz = ""; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (e) {}
      return '<div class="gc-bar"><a class="btn btn--primary btn--sm" href="/api/ideas?gcal=connect&tz=' + encodeURIComponent(tz) + '">📅 ' + esc(T("Connect Google Calendar", "اربط جوجل كالندر")) + '</a><span class="muted">' + esc(T("Today and tomorrow go to a 'My day' calendar, in real time; accepted meetings and interviews come in here.", "النهارده وبكرة يتكتبوا في كالندر 'My day' أول بأول، والمواعيد والمقابلات اللي قبلتها تيجي هنا.")) + "</span></div>"; }
    return '<div class="gc-bar"><span>📅 ' + esc(T("Google Calendar: on", "جوجل كالندر: شغال")) + (GC.err ? " · ⚠️ " + esc(GC.err) : GC.last ? " · " + esc(T("synced ", "اتزامن ") + GC.last) + " ✓" : "") + "</span>" +
      '<button type="button" class="btn btn--ghost btn--sm" data-gc-now>↻ ' + esc(T("Sync now", "زامن دلوقتي")) + '</button><button type="button" class="btn btn--ghost btn--sm" data-gc-off>' + esc(T("Disconnect", "افصل")) + "</button></div>";
  }
  function loadMeetings() {
    if (LOCAL) return;
    fetch("/api/clients", { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { if (d && Array.isArray(d.meetings)) { MEET = d.meetings; render(); } }).catch(function () {});
  }
  function meetings(dow) {
    var date = iso(dateOf(dow)), out = [];
    var add = function (start, dur, who, topic, id, mine) {
      var f0 = Math.floor(start / 30) * 30, t0 = Math.ceil((start + (dur || 60)) / 30) * 30;
      out.push({ kind: "prep", from: f0 - 30, to: f0, en: "Prep for " + who, ar: "تحضير لـ" + who, sub: [topic || "", topic || ""], id: id, mine: mine });
      out.push({ kind: "meet", from: f0, to: t0, en: "Client: " + who, ar: "عميل: " + who, sub: [ap(start) + " · " + (dur || 60) + " min" + (topic ? " · " + topic : ""), ap(start) + " · " + (dur || 60) + " دقيقة" + (topic ? " · " + topic : "")], id: id, mine: mine });
    };
    MEET.forEach(function (m) {
      var s = new Date(m.starts_at); if (isNaN(s) || iso(s) !== date) return;
      add(s.getHours() * 60 + s.getMinutes(), m.duration_min, m.client_name || T("client", "عميل"), m.topic, "api" + m.id, false);
    });
    (W.meetings || []).forEach(function (m) { if (m.date === date) add(mins(m.from), m.dur, m.client, m.topic, m.id, true); });
    // from Google Calendar: meetings and interviews accepted from email (not all-day ones)
    GEV.forEach(function (e) {
      if (e.allDay || !e.start) return;
      var s0 = new Date(e.start), s1 = e.end ? new Date(e.end) : null; if (isNaN(s0) || iso(s0) !== date) return;
      var st = s0.getHours() * 60 + s0.getMinutes(), dur = s1 && !isNaN(s1) ? Math.max(15, Math.round((s1 - s0) / 60000)) : 60;
      var job = /interview|hiring|recruit|screen|مقابلة|انترفيو/i.test(e.title), cat = job ? "job" : "client";
      var f0 = Math.floor(st / 30) * 30, t0 = Math.ceil((st + dur) / 30) * 30, lbl = (job ? "🎯 " : "📅 ") + e.title;
      out.push({ kind: "prep", cat: cat, from: f0 - 30, to: f0, en: "Prep for " + e.title, ar: "تحضير لـ" + e.title, sub: ["", ""], id: "g" + e.id });
      out.push({ kind: "meet", cat: cat, from: f0, to: t0, en: lbl, ar: lbl, sub: [ap(st) + " · " + dur + " min · " + (e.calendar || "Google"), ap(st) + " · " + dur + " دقيقة · " + (e.calendar || "Google")], id: "g" + e.id });
    });
    return out;
  }

  /* Pomodoro, 25 minutes on and 5 off, counted from the block's start, with prayer
     minutes taken out: the clock stops while you pray. */
  function pomo(x, P, nowM) {
    var a = mins(x.from), b = mins(x.to); if (!(b > a)) return null;
    var free = function (t0, t1) { var n = t1 - t0; P.forEach(function (p) { n -= Math.max(0, Math.min(t1, p.to) - Math.max(t0, p.from)); }); return Math.max(0, n); };
    var total = free(a, b), cycles = Math.max(1, Math.round(total / 30));
    var r = { cycles: cycles, pauses: P.filter(function (p) { return p.from < b && p.to > a; }) };
    if (nowM < a || nowM >= b) return r;
    var inPray = P.filter(function (p) { return nowM >= p.from && nowM < p.to; })[0];
    if (inPray) { r.pray = inPray; return r; }
    var done = free(a, nowM), c = Math.floor(done / 30), inC = done % 30;
    r.cycle = Math.min(cycles, c + 1); r.focus = inC < 25; r.left = r.focus ? 25 - inC : 30 - inC;
    return r;
  }
  function beep(n) {
    try {
      var A = window.AudioContext || window.webkitAudioContext; if (!A) return;
      var ac = beep.ac || (beep.ac = new A());
      for (var i = 0; i < (n || 1); i++) {
        var o = ac.createOscillator(), g = ac.createGain(), t0 = ac.currentTime + i * 0.35;
        o.frequency.value = 660 + i * 220; g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.25, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.3);
        o.connect(g); g.connect(ac.destination); o.start(t0); o.stop(t0 + 0.32);
      }
    } catch (e) {}
  }

  // each row keeps the same texture for life: it is picked from the row's id, not its position
  function tex(id) { var n = 0; for (var i = 0; i < id.length; i++) n = (n * 31 + id.charCodeAt(i)) % 997; return n % 6; }

  /* ---------- job applications: a monthly target turned into a number for today ---------- */
  function ymd(d) { return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }
  function jobs() {
    if (!W.jobs || typeof W.jobs !== "object") W.jobs = { daily: 5, log: {} };
    if (!W.jobs.log) W.jobs.log = {};
    var now = new Date(), key = ymd(now), month = key.slice(0, 7), daily = +W.jobs.daily || 5;
    var done = 0, today = +W.jobs.log[key] || 0;
    for (var k in W.jobs.log) if (k.slice(0, 7) === month) done += +W.jobs.log[k] || 0;
    // working days: every day but Friday
    var d = new Date(now.getFullYear(), now.getMonth(), now.getDate()), left = 0, all = 0;
    for (var x = new Date(d); x.getMonth() === d.getMonth(); x.setDate(x.getDate() + 1)) if (x.getDay() !== 5) left++;
    for (var y = new Date(d.getFullYear(), d.getMonth(), 1); y.getMonth() === d.getMonth(); y.setDate(y.getDate() + 1)) if (y.getDay() !== 5) all++;
    var rest = now.getDay() === 5;
    return { key: key, daily: daily, target: daily * all, done: done, today: today, quota: rest ? 0 : daily, left: left, rest: rest };
  }
  function jobsCard() {
    var j = jobs(), pct = Math.min(100, Math.round(j.done / j.target * 100)), ok = !j.rest && j.today >= j.quota;
    return '<div class="week-jobs' + (ok ? " is-done" : "") + '">' +
      '<div class="week-jobs__top"><b>🎯 ' + esc(T("Job applications", "التقديم على الوظائف")) + '</b>' +
        '<button type="button" class="week-jobs__target" data-jobs-target title="' + esc(T("Change the daily number", "غيّر رقم اليوم")) + '">' + j.daily + " " + esc(T("a day", "في اليوم")) + " ✎</button></div>" +
      '<div class="week-jobs__nums">' +
        '<div><small>' + esc(T("Today's number", "رقم النهارده")) + "</small><strong>" + (j.rest ? "0" : j.quota) + "</strong><em>" + esc(j.rest ? T("Friday: rest", "الجمعة: راحة") : T("every working day", "كل يوم شغل")) + "</em></div>" +
        '<div><small>' + esc(T("Done today", "اتعمل النهارده")) + "</small><strong>" + j.today + '</strong><span class="week-jobs__btns"><button type="button" data-jobs="-1" aria-label="' + esc(T("One less", "واحد أقل")) + '">−</button><button type="button" data-jobs="1">+1</button><button type="button" data-jobs="5">+5</button></span></div>' +
        '<div><small>' + esc(T("This month", "الشهر ده")) + "</small><strong>" + j.done + '<i> / ' + j.target + "</i></strong><em>" + esc(T(j.left + " working days left", "فاضل " + j.left + " يوم شغل")) + "</em></div>" +
      "</div>" +
      '<div class="week-jobs__bar"><i style="width:' + pct + '%"></i></div>' +
      '<p class="muted week-jobs__note">' + esc(T(j.daily + " a day, Friday off, makes " + j.target + " this month. Five good ones beat fifty rushed ones.", j.daily + " في اليوم والجمعة راحة يعني " + j.target + " الشهر ده. خمسة متعوب عليهم أحسن من خمسين على السريع.")) + "</p></div>";
  }

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  // morning and free time are shared by every day; the work part belongs to the chosen day
  /* The weekend: the free day is Sunday in the UAE and Friday in Egypt. "auto" follows
     where you are (the place the Time page found); Friday or Sunday can be picked by
     hand. The week is written with Sunday as the free day and Friday as the build
     day; with a Friday weekend the two simply swap (prayers stay on the real day,
     so Jumu'ah is always Friday). */
  function offDay() {
    var w = W && W.weekend;
    if (w === "fri") return 5; if (w === "sun") return 0;
    return (place().cc || "AE") === "EG" ? 5 : 0;
  }
  function tpl(d) { if (offDay() === 5) { if (d === 5) return 0; if (d === 0) return 5; } return d; }
  /* Two views of one card (owner, 2026-11-24: "today is the day I am in from this week, but I can
     add, remove, rearrange, change times"). In the Today tab ("today"), the card shows today from
     the week, and the first change makes today's own copy (W.dates[date]: myday + work + done), so
     the week itself is never touched. In the My week tab ("week") the card edits the week. */
  var mode = "week", viewOff = 0;   // in the Today tab: 0 = today, 1 = tomorrow
  function viewDow() { return (todayDow + viewOff) % 7; }
  function todayKey() { return iso(new Date(Date.now() + viewOff * 864e5)); }
  function curOv() { return mode === "today" && W.dates ? W.dates[todayKey()] || null : null; }
  function ensureOv() {
    if (mode !== "today") return null;
    if (!W.dates) W.dates = {};
    var k = todayKey();
    if (!W.dates[k]) {
      var copy = function (x) { var o = JSON.parse(JSON.stringify(x)); delete o.on; return o; };
      W.dates[k] = { myday: W.myday.filter(function (x) { return !x.on || x.on.indexOf(tpl(viewDow())) > -1; }).map(copy),
        work: (W.days[tpl(viewDow())] || []).map(copy), done: {} };
      // keep two weeks of days
      var cut = iso(new Date(Date.now() - 14 * 864e5)); Object.keys(W.dates).forEach(function (d) { if (d < cut) delete W.dates[d]; });
    }
    return W.dates[k];
  }
  function mdRows() { var o = curOv(); return o ? o.myday : W.myday; }
  function setMd(a) { var o = curOv(); if (o) o.myday = a; else W.myday = a; }
  function work() { var o = curOv(); if (o) return o.work; var k = tpl(sel); if (!W.days[k]) W.days[k] = []; return W.days[k]; }
  function setWork(a) { var o = curOv(); if (o) o.work = a; else W.days[tpl(sel)] = a; }
  function find(id) { return mdRows().concat(work()).filter(function (x) { return x.id === id; })[0]; }
  function drop1(id) { setMd(mdRows().filter(function (x) { return x.id !== id; })); setWork(work().filter(function (x) { return x.id !== id; })); }
  function isDone(id) { var o = curOv(); return !!(o && o.done && o.done[id]); }

  /* ---------- storage ---------- */
  function adopt(d) {
    doc = d && typeof d === "object" && !Array.isArray(d) ? d : {};
    // a first visit saves the new week straight away, so its rows keep the same ids
    if (doc.week && doc.week.days) W = doc.week; else { W = seed(); moved = true; }
    // an older week is replaced by the new one; the job log is kept, and so is the old week (prev)
    if (W.v !== WEEK_V) {
      var fresh = seed();
      if (W.jobs) fresh.jobs = W.jobs;
      if (W.days && W.v) fresh.prev = { v: W.v, days: W.days };
      W = fresh; moved = true;
    }
    if (!Array.isArray(W.myday)) { W.myday = seed().myday; moved = true; }
  }
  function load(done) {
    if (LOCAL) {
      try { adopt(JSON.parse(localStorage.getItem(KEY) || "null")); } catch (e) { adopt(null); }
      return done();
    }
    fetch(API, { cache: "no-store" }).then(function (r) {
      if (r.status === 401) return null;         // the page's own sign-in takes over
      rev = r.headers.get("X-Rev") || "";
      return r.status === 404 ? {} : r.json();
    }).then(function (d) { if (d === null) return; adopt(d); done(); })
      .catch(function () { adopt(null); rev = "offline"; status = T("Could not load your week. Changes will not be saved.", "الأسبوع ما اتحمّلش. التعديلات مش هتتحفظ."); done(); });
  }
  var saveQuiet = false;
  function bsave() { saveQuiet = true; try { save(); } finally { saveQuiet = false; } }   // the board: keep the data, skip the redraw
  function save() {
    doc.week = W;
    if (!saveQuiet) { gcSync(); if (nowHost) setTimeout(renderNow, 0); }
    if (LOCAL) { try { localStorage.setItem(KEY, JSON.stringify(doc)); status = T("Saved", "اتحفظ"); } catch (e) { status = T("Could not save in this browser.", "ما اتحفظش في المتصفح ده."); } return; }
    if (rev === "offline") return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () { put(true); }, 400);
  }
  function put(retry) {
    fetch(API, { method: "PUT", headers: { "Content-Type": "application/json", "If-Match": rev }, body: JSON.stringify(doc) })
      .then(function (r) {
        var next = r.headers.get("X-Rev");
        if (r.status === 409) {
          // the desk (or another device) saved first: keep its document, put this week on top, try once more
          return r.json().then(function (d) {
            if (next) rev = next;
            var mine = W; doc = d && typeof d === "object" ? d : {}; doc.week = mine;
            if (retry) return put(false);
            throw new Error("conflict");
          });
        }
        if (!r.ok) throw new Error("save " + r.status);
        if (next) rev = next;
        note(T("Saved", "اتحفظ"));
      })
      .catch(function () { note(T("Not saved. Check the connection.", "ما اتحفظش. شوف النت.")); });
  }
  function note(t) { status = t; var el = host.querySelector(".week__status"); if (el) el.textContent = t; }

  /* ---------- drawing ---------- */
  function row(x, P) {
    var now = new Date(), hm = ("0" + now.getHours()).slice(-2) + ":" + ("0" + now.getMinutes()).slice(-2), nowM = now.getHours() * 60 + now.getMinutes();
    var isToday = sel === todayDow;
    var live = isToday && x.from && x.to && hm >= x.from && hm < x.to;
    var past = isToday && x.to && hm >= x.to;
    if (editing === x.id) {
      return '<li class="week-row is-edit" data-id="' + x.id + '"><form class="week-form">' +
        '<div class="week-form__time" dir="ltr"><input type="time" name="from" value="' + esc(x.from || "") + '" aria-label="' + esc(T("From", "من")) + '"><span>–</span><input type="time" name="to" value="' + esc(x.to || "") + '" aria-label="' + esc(T("To", "لحد")) + '"></div>' +
        '<input type="text" name="text" maxlength="140" value="' + esc(x.text || T(x.en, x.ar)) + '" placeholder="' + esc(T("What is this time for?", "الوقت ده لإيه؟")) + '" aria-label="' + esc(T("What the time is for", "الوقت ده لإيه")) + '">' +
        '<select name="cat" class="week-form__cat" aria-label="' + esc(T("Category", "النوع")) + '">' + CAT_ORDER.map(function (k) { return '<option value="' + k + '"' + (catOf(x) === k ? " selected" : "") + ">" + CAT[k].ico + " " + esc(T(CAT[k].en, CAT[k].ar)) + "</option>"; }).join("") + "</select>" +
        '<label class="week-form__pomo"><input type="checkbox" name="pomo"' + (x.pomo ? " checked" : "") + "> 🍅 " + esc(T("Pomodoro", "بومودورو")) + "</label>" +
        '<div class="week-form__acts"><button class="btn btn--primary btn--sm" type="submit">' + esc(T("Save", "احفظ")) + '</button><button class="btn btn--ghost btn--sm" type="button" data-cancel>' + esc(T("Cancel", "إلغاء")) + "</button></div></form></li>";
    }
    var cat = catOf(x), pm = pomo(x, P, nowM), extra = "";
    // the tasks inside the block, and how much of it is work and how much buffer
    var its = Array.isArray(x.items) ? x.items : [], work = its.length ? its.reduce(function (n, y) { return n + (+y.est || 0); }, 0) : (+x.est || 0);
    var body = "";
    if (its.length) body += '<ul class="day-items">' + its.map(function (y) {
      return "<li><span>" + esc(T(y.en, y.ar)) + "</span>" + (y.ai ? '<i class="day-ai">🤖 Claude</i>' : "") + (y.est ? "<em>" + esc(howLong(0, +y.est)) + "</em>" : "") + "</li>";
    }).join("") + "</ul>";
    if (work && x.from && x.to && /^(learn|fitness)$/.test(cat)) {
      var len = mins(x.to) - mins(x.from), buf = Math.max(0, len - work), wp = Math.min(100, Math.round(work / len * 100));
      body += '<div class="day-buf"><div class="day-buf__bar"><i style="width:' + wp + '%"></i></div><small>⚙️ ' + esc(T("work ", "شغل ") + howLong(0, work)) +
        (buf ? " · 🛟 " + esc(T("buffer ", "وقت احتياطي ") + howLong(0, buf)) : " · " + esc(T("no buffer", "مفيش وقت احتياطي"))) + "</small></div>";
    }
    if (pm && x.pomo) extra += ' <i class="day-tag">🍅 ×' + pm.cycles + "</i>";
    if (pm) pm.pauses.forEach(function (p) { extra += ' <i class="day-tag' + (p.kind === "pray" ? " day-tag--pray" : " day-tag--meet") + '">' + (p.kind === "pray" ? "🕌 " : "🤝 ") + esc(T("stop for " + p.en, "وقف عشان " + p.ar) + " " + ap(p.from)) + "</i>"; });
    if (pm && live && x.pomo && pm.pray) extra += '<em class="day-now day-now--pray">' + (pm.pray.kind === "pray" ? "🕌 " + esc(T("Prayer time: no work now", "وقت الصلاة: مفيش شغل دلوقتي")) : "🤝 " + esc(T(pm.pray.en + " now", pm.pray.ar + " دلوقتي"))) + "</em>";
    else if (pm && live && x.pomo && pm.cycle) extra += '<em class="day-now' + (pm.focus ? "" : " day-now--break") + '">' + (pm.focus ? "🍅 " + esc(T("Focus", "تركيز")) : "☕ " + esc(T("Break", "بريك"))) + " · " + pm.cycle + "/" + pm.cycles + " · " + esc(T(pm.left + " min left", "فاضل " + pm.left + " دقيقة")) + "</em>";
    var dn = mode === "today" && isDone(x.id);
    return '<li class="week-row has-cat' + (live ? " is-now" : "") + (past ? " is-past" : "") + (dn ? " is-done" : "") + '" data-id="' + x.id + '" style="--cat:' + CAT[cat].c + '">' +
      '<button type="button" class="week-row__grip" data-drag aria-label="' + esc(T("Drag to move", "اسحب عشان تنقل")) + '" title="' + esc(T("Drag to move", "اسحب عشان تنقل")) + '">⠿</button>' +
      (x.from ? stub(x.from, x.to, cat) : '<b dir="ltr" class="cat-stub" style="--cat:' + CAT[cat].c + '" data-ico="' + CAT[cat].ico + '"><span class="cat-stub__ico">' + CAT[cat].ico + "</span><strong>--:--</strong></b>") +
      '<span><b class="day-title">' + esc(x.text || T(x.en, x.ar)) + "</b>" + extra + body + "</span>" +
      (live ? '<i class="badge">' + esc(T("now", "دلوقتي")) + "</i>" : "") +
      '<span class="week-row__acts">' + (mode === "today" && !viewOff ? '<button type="button" class="iconbtn day-tick' + (dn ? " is-on" : "") + '" data-done="' + x.id + '" aria-pressed="' + dn + '" title="' + esc(T("Done", "خلصت")) + '">' + (dn ? "✓" : "○") + "</button>" : "") + '<button type="button" class="iconbtn" data-edit aria-label="' + esc(T("Edit", "عدّل")) + '" title="' + esc(T("Edit", "عدّل")) + '">✎</button>' +
      '<button type="button" class="iconbtn" data-del aria-label="' + esc(T("Delete", "امسح")) + '" title="' + esc(T("Delete", "امسح")) + '">✕</button></span></li>';
  }

  function fixedRow(p) {
    var now = new Date(), nowM = now.getHours() * 60 + now.getMinutes(), isToday = sel === todayDow;
    var live = isToday && nowM >= p.from && nowM < p.to, past = isToday && nowM >= p.to;
    var cls = { pray: "is-pray", meet: "is-meet", prep: "is-prep", gap: "is-gap" }[p.kind], ico = { pray: "🕌 ", meet: "🤝 ", prep: "📝 ", gap: p.cat === "rest" ? "🌿 " : "✦ " }[p.kind];
    var title = p.kind === "pray" ? T(p.en + " in the masjid" + (p.note && p.note[0] ? ": " + p.note[0] : ""), p.ar + " في المسجد" + (p.note && p.note[1] ? ": " + p.note[1] : "")) : T(p.en, p.ar);
    var cat = catOf(p);
    return '<li class="week-row has-cat ' + cls + (live ? " is-now" : "") + (past ? " is-past" : "") + '" style="--cat:' + CAT[cat].c + '">' +
      (p.kind === "gap" ? '<span class="week-row__grip day-lock" title="' + esc(T("Fills itself: any time with no block", "بيتملا لوحده: أي وقت من غير بلوك")) + '">✦</span>' :
      '<span class="week-row__grip day-lock" title="' + esc(p.kind === "pray" ? T("Prayer is fixed: it follows the iqama", "الصلاة ثابتة: ماشية مع الإقامة") : T("Set by the client meeting", "متحدد بميعاد العميل")) + '">🔒</span>') +
      stub(p.from, p.to, cat, p.kind === "prep" ? " is-soft" : "") +
      "<span>" + ico + esc(title) + (p.sub && p.sub[0] ? ' <i class="day-tag' + (p.kind === "pray" ? " day-tag--pray" : "") + '">' + esc(T(p.sub[0], p.sub[1])) + "</i>" : "") +
        (p.kind === "pray" ? ' <i class="day-tag">' + esc(T("no work", "مفيش شغل")) + "</i>" : "") + "</span>" +
      (live ? '<i class="badge">' + esc(T("now", "دلوقتي")) + "</i>" : "") +
      (mode === "today" && !viewOff && p.kind === "pray" ? '<span class="week-row__acts"><button type="button" class="iconbtn day-tick' + (isDone("pray:" + p.k) ? " is-on" : "") + '" data-done="pray:' + p.k + '" title="' + esc(T("Prayed", "صليت")) + '">' + (isDone("pray:" + p.k) ? "✓" : "○") + "</button></span>" : "") +
      (p.kind === "meet" && p.mine ? '<span class="week-row__acts"><button type="button" class="iconbtn" data-meet-del="' + esc(p.id) + '" aria-label="' + esc(T("Delete the meeting", "امسح الميعاد")) + '" title="' + esc(T("Delete the meeting", "امسح الميعاد")) + '">✕</button></span>' : "") +
      "</li>";
  }

  function dayFocus(dow) {
    var n = {};
    (W.days[tpl(dow)] || []).forEach(function (x) {
      var c = catOf(x); if (!x.from || !x.to || ["plan", "content", "product", "system"].indexOf(c) < 0) return;
      n[c] = (n[c] || 0) + mins(x.to) - mins(x.from);
    });
    var best = "product"; for (var k in n) if (!n[best] || n[k] > n[best]) best = k;
    return best;
  }
  function rowsOf(dow) {
    var o = mode === "today" && dow === viewDow() ? curOv() : null;
    if (o) return o.myday.concat(o.work);
    return W.myday.filter(function (x) { return !x.on || x.on.indexOf(tpl(dow)) > -1; }).concat(W.days[tpl(dow)] || []);
  }
  // minutes per category over the 24 hours of a day: the rows, prayers and meetings on top, sleep around them
  function dayMinutes(dow) {
    var map = new Array(1440), out = {};
    var fill = function (a, b, cat, over) { for (var m = Math.max(0, a); m < Math.min(1440, b); m++) if (over || !map[m]) map[m] = cat; };
    var rows = rowsOf(dow);
    // a block with an estimate: its work first, the rest of it is buffer
    rows.forEach(function (x) {
      if (!x.from || !x.to) return;
      var a = mins(x.from), b = mins(x.to), its = Array.isArray(x.items) ? x.items : [];
      var work = its.length ? its.reduce(function (n, y) { return n + (+y.est || 0); }, 0) : (+x.est || 0);
      var c = catOf(x), bc = c === "learn" ? "bufLearn" : c === "fitness" ? "bufSport" : null;
      if (bc && work > 0 && work < b - a) { fill(a, a + work, c, false); fill(a + work, b, bc, false); }
      else fill(a, b, catOf(x), false);
    });
    prayers(dow).concat(meetings(dow)).forEach(function (p) { fill(p.from, p.to, catOf(p), true); });
    var ends = rows.filter(function (x) { return x.sec === "f" && x.to; }).map(function (x) { return mins(x.to); });
    var bed = ends.length ? Math.max.apply(null, ends) : 1350;
    var wake = Math.min(prayers(dow)[0].from, rows.reduce(function (n, x) { return x.from ? Math.min(n, mins(x.from)) : n; }, 1440));
    fill(0, wake, "sleep", false); fill(bed, 1440, "sleep", false);
    var gapCat = tpl(dow) === 0 ? "rest" : dayFocus(dow);
    for (var m = 0; m < 1440; m++) { var c = map[m] || gapCat; out[c] = (out[c] || 0) + 1; }
    return out;
  }
  /* "where the time goes": one panel that can be hidden, with a Day / Week switch.
     A donut of the hours (day = 24 h, week = 168 h) and, per category, the hours
     and the share in percent. Open/closed and Day/Week are kept in the browser. */
  var TP = (function () { try { return JSON.parse(localStorage.getItem("week.tp") || "null") || {}; } catch (e) { return {}; } })();
  if (TP.open == null) TP.open = true;
  if (TP.scope !== "week") TP.scope = "day";
  if (["high", "low", "type"].indexOf(TP.sort) < 0) TP.sort = "high";
  // groups folded shut: their parts hidden in the list, one slice for the whole group in the donut
  if (!TP.shut || typeof TP.shut !== "object") TP.shut = {};
  function tpSave() { try { localStorage.setItem("week.tp", JSON.stringify(TP)); } catch (e) {} }
  // Business, Cashflow and Free time as groups (their parts under them), the rest on their own, in the chosen order
  function entriesOf(got) {
    var inGroup = {}; GROUPS.forEach(function (g) { g.cats.forEach(function (k) { inGroup[k] = g; }); });
    var by = function (a, b) { return TP.sort === "low" ? a.n - b.n : b.n - a.n; }, out = [];
    GROUPS.forEach(function (g) {
      var kids = g.cats.filter(function (k) { return got[k]; });
      if (TP.sort !== "type") kids.sort(function (a, b) { return by({ n: got[a] }, { n: got[b] }); });
      // the buffers stay together, after the rest of the group
      var isBuf = function (k) { return /^buf|^buffer$|^life$/.test(k); };
      kids = kids.filter(function (k) { return !isBuf(k); }).concat(kids.filter(isBuf));
      if (kids.length) out.push({ g: g, kids: kids, n: kids.reduce(function (n, k) { return n + got[k]; }, 0) });
    });
    CAT_ORDER.forEach(function (k) { if (got[k] && !inGroup[k]) out.push({ k: k, n: got[k] }); });
    if (TP.sort !== "type") out.sort(by);
    return out;
  }
  function tipOf(k, g, n, all, scope) {
    return (CAT[k] ? CAT[k].ico + " " + T(CAT[k].en, CAT[k].ar) : "") + (g ? T("  ·  in ", "  ·  جوه ") + g.ico + " " + T(g.en, g.ar) : "") +
      "\n" + howLong(0, n) + "  ·  " + pct(n, all) + T(" of ", " من ") + scope;
  }
  function groupTip(e, got, all, scope) {
    return e.g.ico + " " + T(e.g.en, e.g.ar) + "\n" + howLong(0, e.n) + "  ·  " + pct(e.n, all) + T(" of ", " من ") + scope +
      e.kids.map(function (k) { return "\n   " + CAT[k].ico + " " + T(CAT[k].en, CAT[k].ar) + ": " + howLong(0, got[k]) + " (" + pct(got[k], all) + ")"; }).join("");
  }
  function timePanel() {
    var head = function (inner) {
      return '<div class="tp__top"><button type="button" class="tp__toggle" data-tp-open aria-expanded="' + TP.open + '">📊 ' + esc(T("Where the time goes", "الوقت بيروح فين")) + ' <span aria-hidden="true">' + (TP.open ? "▾" : "▸") + "</span></button>" + (inner || "") + "</div>";
    };
    if (!TP.open) return '<section class="tp is-closed">' + head() + "</section>";
    var week = TP.scope === "week", got = {};
    if (week) ORDER.forEach(function (n) { var m = dayMinutes(n); for (var k in m) got[k] = (got[k] || 0) + m[k]; });
    else got = dayMinutes(sel);
    var all = week ? 7 * 1440 : 1440, scope = week ? T("the week's 168 h", "168 ساعة في الأسبوع") : T(DAY[sel].en + "'s 24 h", "24 ساعة يوم " + DAY[sel].ar);
    var entries = entriesOf(got);
    // the donut goes round the whole 24 h / 168 h, a group's parts side by side
    var R = 70, C = 2 * Math.PI * R, at = 0, segs = [];
    entries.forEach(function (e) {
      if (e.g && TP.shut[e.g.id]) segs.push({ n: e.n, c: CAT[e.kids[0]].c, tip: groupTip(e, got, all, scope), k: "g-" + e.g.id });
      else (e.g ? e.kids : [e.k]).forEach(function (k) { segs.push({ n: got[k], c: CAT[k].c, tip: tipOf(k, e.g, got[k], all, scope), k: k }); });
    });
    var arcs = segs.map(function (sg) {
      var len = sg.n / all * C, out = '<circle r="' + R + '" cx="90" cy="90" fill="none" stroke="' + sg.c + '" stroke-width="30" stroke-dasharray="' + len.toFixed(3) + " " + (C - len).toFixed(3) +
        '" stroke-dashoffset="' + (-at).toFixed(3) + '" data-tip="' + esc(sg.tip) + '" data-k="' + sg.k + '"></circle>';
      at += len; return out;
    }).join("");
    var worked = ["office", "job", "client", "udacity", "product", "system", "content", "agents", "biz"].reduce(function (n, k) { return n + (got[k] || 0); }, 0);
    var tabs = '<div class="tp__tabs" role="tablist">' +
      '<button type="button" role="tab" data-tp-scope="day" aria-selected="' + !week + '" class="' + (week ? "" : "is-on") + '">' + esc(T("Day", "اليوم")) + "</button>" +
      '<button type="button" role="tab" data-tp-scope="week" aria-selected="' + week + '" class="' + (week ? "is-on" : "") + '">' + esc(T("Week", "الأسبوع")) + "</button></div>";
    var sortLbl = { high: T("↓ Most first", "↓ الأكتر الأول"), low: T("↑ Least first", "↑ الأقل الأول"), type: T("☰ By type", "☰ حسب النوع") }[TP.sort];
    var anyOpen = GROUPS.some(function (g) { return !TP.shut[g.id]; });
    tabs = '<div class="tp__tools"><button type="button" class="tp__sort" data-tp-foldall="' + (anyOpen ? "shut" : "open") + '">' + esc(anyOpen ? T("▸ Fold all", "▸ اقفل الكل") : T("▾ Open all", "▾ افتح الكل")) + "</button>" +
      '<button type="button" class="tp__sort" data-tp-sort title="' + esc(T("Change the order", "غيّر الترتيب")) + '">' + esc(sortLbl) + "</button>" + tabs + "</div>";
    var top = Math.max.apply(null, entries.map(function (e) { return e.n; }).concat([1]));
    var line = function (cls, color, label, n, tip, k) {
      return '<div class="tp__row' + cls + '" style="--cat:' + color + ";--p:" + (n / top * 100).toFixed(1) + "%;--pn:" + (n / top).toFixed(3) + '" data-tip="'  + esc(tip) + '"' + (k ? ' data-k="' + k + '"' : "") + '><span><i></i>' + label + "</span><b>" + esc(howLong(0, n)) + "</b><b>" + esc(pct(n, all)) + "</b></div>";
    };
    var list = entries.map(function (e) {
      if (!e.g) return line("", CAT[e.k].c, CAT[e.k].ico + " " + esc(T(CAT[e.k].en, CAT[e.k].ar)), e.n, tipOf(e.k, null, e.n, all, scope), e.k);
      var shut = !!TP.shut[e.g.id];
      var head = line(" tp__row--group" + (shut ? " is-shut" : ""), CAT[e.kids[0]].c, '<em class="tp__fold" aria-hidden="true">' + (shut ? "▸" : "▾") + "</em>" + e.g.ico + " " + esc(T(e.g.en, e.g.ar)) + ' <small class="tp__count">' + e.kids.length + "</small>", e.n, groupTip(e, got, all, scope), "g-" + e.g.id)
        .replace('<div class="tp__row', '<div role="button" tabindex="0" aria-expanded="' + !shut + '" data-tp-group="' + e.g.id + '" class="tp__row');
      return '<div class="tp__group' + (shut ? " is-shut" : "") + '" data-g="' + e.g.id + '">' + head +
        (shut ? "" : e.kids.map(function (k) { return line(" tp__row--kid", CAT[k].c, CAT[k].ico + " " + esc(T(CAT[k].en, CAT[k].ar)), got[k], tipOf(k, e.g, got[k], all, scope), k); }).join("")) + "</div>";
    }).join("");
    return '<section class="tp">' + head(tabs) + '<div class="tp__body">' +
      '<div class="tp__chart"><svg viewBox="0 0 180 180" role="img" aria-label="' + esc(T("Hours per category", "الساعات لكل نوع")) + '"><g transform="rotate(-90 90 90)">' + arcs + "</g></svg>" +
        '<div class="tp__mid"><small>' + esc(week ? T("Week", "الأسبوع") : T(DAY[sel].en, DAY[sel].ar)) + "</small><b>" + (week ? "168h" : "24h") + '</b><span class="tp__mid-line"></span><em>' + esc(T("Work", "شغل")) + "</em><strong>" + esc(shortH(worked)) + "</strong><i>" + esc(pct(worked, all)) + "</i></div></div>" +
      '<div class="tp__list"><div class="tp__row tp__row--head"><span>' + esc(week ? T("This week · 168 h", "الأسبوع ده · 168 ساعة") : T(DAY[sel].en + " · 24 h", DAY[sel].ar + " · 24 ساعة")) + "</span><b>" + esc(T("Hours", "ساعات")) + "</b><b>%</b></div>" +
        list + "</div></div><div class=\"tp__tip\" role=\"tooltip\" hidden></div></section>";
  }
  // compact hours for tight places: 6h 24m
  function shortH(n) { var h = Math.floor(n / 60), m = n % 60; return (h ? h + "h" : "") + (h && m ? " " : "") + (m || !h ? m + "m" : ""); }
  function pct(n, all) { var p = n / all * 100; return (p >= 10 ? Math.round(p) : Math.round(p * 10) / 10) + "%"; }
  /* Live progress for Today: done against what was planned up to now, and a graph of the day
     (planned minutes building up as a dashed line, done minutes as a solid line, "now" marked).
     A tick counts the whole block, at the time it was ticked. */
  function progressPanel(groups, nowM) {
    var ov = curOv(), done = (ov && ov.done) || {}, items = [];
    ["m", "w", "f"].forEach(function (k) { groups[k].forEach(function (g) {
      if (g.p && g.p.kind === "pray") items.push({ id: "pray:" + g.p.k, from: g.p.from, to: g.p.to });
      else if (g.x && g.x.from && g.x.to) items.push({ id: g.x.id, from: mins(g.x.from), to: mins(g.x.to) });
    }); });
    if (!items.length) return "";
    items.sort(function (a, b) { return a.from - b.from; });
    var len = function (x) { return Math.max(0, x.to - x.from); };
    var total = items.reduce(function (n, x) { return n + len(x); }, 0);
    var soFar = items.reduce(function (n, x) { return n + Math.max(0, Math.min(nowM, x.to) - x.from > 0 ? Math.min(nowM, x.to) - x.from : 0); }, 0);
    var did = items.filter(function (x) { return done[x.id]; }), doneMin = did.reduce(function (n, x) { return n + len(x); }, 0);
    var dueBlocks = items.filter(function (x) { return x.to <= nowM; }).length;
    var pctDay = total ? Math.round(doneMin / total * 100) : 0, pace = soFar ? doneMin / soFar : 1;
    var mood = !soFar ? T("The day hasn't started yet", "اليوم لسه ما بدأش") : pace >= 0.9 ? T("✅ On track", "✅ ماشي تمام") : pace >= 0.6 ? T("🟡 A bit behind", "🟡 متأخر شوية") : T("🔴 Behind: pick the next block and start", "🔴 متأخر: خد البلوك الجاي وابدأ");
    // the graph
    var t0 = items[0].from, t1 = Math.max.apply(null, items.map(function (x) { return x.to; })), W2 = 600, H2 = 150, pad = 8;
    var X = function (t) { return pad + (t - t0) / Math.max(1, t1 - t0) * (W2 - 2 * pad); };
    var Y = function (m) { return H2 - pad - m / Math.max(1, total) * (H2 - 2 * pad); };
    var planPts = [], step = 15;
    for (var t = t0; t <= t1 + step; t += step) {
      var tt = Math.min(t, t1), m = items.reduce(function (n, x) { return n + Math.max(0, Math.min(tt, x.to) - x.from > 0 ? Math.min(tt, x.to) - x.from : 0); }, 0);
      planPts.push(X(tt).toFixed(1) + "," + Y(m).toFixed(1));
    }
    var ticks = did.map(function (x) { return { at: typeof done[x.id] === "number" ? done[x.id] : x.to, m: len(x) }; }).sort(function (a, b) { return a.at - b.at; });
    var acc = 0, donePts = [X(t0).toFixed(1) + "," + Y(0).toFixed(1)];
    ticks.forEach(function (k) { var at = Math.max(t0, Math.min(t1, k.at)); donePts.push(X(at).toFixed(1) + "," + Y(acc).toFixed(1)); acc += k.m; donePts.push(X(at).toFixed(1) + "," + Y(acc).toFixed(1)); });
    var endAt = Math.max(t0, Math.min(t1, nowM)); donePts.push(X(endAt).toFixed(1) + "," + Y(acc).toFixed(1));
    var hrs = []; for (var h = Math.ceil(t0 / 60) * 60; h <= t1; h += 180) hrs.push(h);
    var svg = '<svg class="pg__graph" viewBox="0 0 ' + W2 + " " + H2 + '" preserveAspectRatio="none" role="img" aria-label="' + esc(T("Planned and done through the day", "المتخطط والمتعمل على مدار اليوم")) + '">' +
      '<polyline points="' + planPts.join(" ") + '" class="pg__plan"/>' +
      '<polyline points="' + donePts.join(" ") + '" class="pg__done"/>' +
      (nowM > t0 && nowM < t1 ? '<line x1="' + X(nowM).toFixed(1) + '" x2="' + X(nowM).toFixed(1) + '" y1="0" y2="' + H2 + '" class="pg__now"/>' : "") + "</svg>" +
      '<div class="pg__hours">' + hrs.map(function (h) { return '<span style="left:' + ((h - t0) / Math.max(1, t1 - t0) * 100).toFixed(1) + '%">' + esc(ap(h).replace(":00", "")) + "</span>"; }).join("") + "</div>";
    return '<section class="pg"><div class="pg__top"><b>📈 ' + esc(T("Today's progress", "تقدّم النهارده")) + "</b><span>" + esc(mood) + "</span></div>" +
      '<div class="pg__nums">' +
        "<div><small>" + esc(T("Done", "خلصت")) + "</small><strong>" + did.length + "<i> / " + items.length + "</i></strong><em>" + esc(T("blocks", "بلوك")) + "</em></div>" +
        "<div><small>" + esc(T("Of the day", "من اليوم")) + "</small><strong>" + pctDay + "%</strong><em>" + esc(howLong(0, doneMin) + T(" of ", " من ") + howLong(0, total)) + "</em></div>" +
        "<div><small>" + esc(T("Should be done by now", "المفروض لحد دلوقتي")) + "</small><strong>" + esc(shortH(soFar)) + "</strong><em>" + esc(T(dueBlocks + " blocks ended", "خلص وقت " + dueBlocks + " بلوك")) + "</em></div>" +
      "</div>" +
      '<div class="pg__bar"><i style="width:' + Math.min(100, pctDay) + '%"></i><b style="left:' + (total ? Math.min(100, soFar / total * 100) : 0).toFixed(1) + '%" title="' + esc(T("where you should be now", "المفروض تكون فين دلوقتي")) + '"></b></div>' +
      '<div class="pg__chart">' + svg + '</div><p class="pg__legend"><span class="pg__k pg__k--plan"></span>' + esc(T("planned", "المتخطط")) + ' <span class="pg__k pg__k--done"></span>' + esc(T("done (tick ○ on a block)", "اللي خلص (علّم ○ على البلوك)")) + "</p></section>";
  }
  // in the office: how much is the part-time job and how much is my own work
  function officeSplit() {
    var off = 0, mine = 0;
    work().forEach(function (x) { if (!x.from || !x.to || mins(x.from) < 600 || mins(x.to) > 1140) return; var n = mins(x.to) - mins(x.from); if (/lunch|food|غدا|أكل/i.test(x.en || "")) return; if (catOf(x) === "office") off += n; else mine += n; });
    return off || mine ? T("  ·  part-time " + howLong(0, off) + " · mine " + howLong(0, mine), "  ·  البارت تايم " + howLong(0, off) + " · بتاعي " + howLong(0, mine)) : "";
  }
  // the day line says what kind of evening it is: gym, sport or off
  function gymNote() {
    var f = mdRows().filter(function (x) { return (!x.on || x.on.indexOf(tpl(sel)) > -1) && catOf(x) === "fitness"; })[0];
    var days = function (re) { return ORDER.filter(function (n) { return W.myday.some(function (x) { return x.on && x.on.indexOf(tpl(n)) > -1 && catOf(x) === "fitness" && re.test(x.en || ""); }); }).map(function (n) { return T(DAY[n].en, DAY[n].ar); }).join(" · "); };
    if (f) return "<b>" + esc((/sport/i.test(f.en) ? "⚽ " + T("Sport day: ", "يوم رياضة: ") : "🏋️ " + T("Gym day: ", "يوم جيم: ")) + ap(f.from) + " · " + howLong(f.from, f.to)) + "</b>";
    return esc("🛋️ " + T("Rest from sport today (gym: " + days(/gym/i) + " · sport: " + days(/sport/i) + ")", "راحة من الرياضة النهارده (جيم: " + days(/gym/i) + " · رياضة: " + days(/sport/i) + ")"));
  }
  // Weekend: Auto (from where you are) · Friday · Sunday
  function weekendSwitch() {
    var w = W.weekend === "fri" || W.weekend === "sun" ? W.weekend : "auto", pl = place(), eg = (pl.cc || "AE") === "EG";
    var autoLbl = T("Auto", "تلقائي") + " · 📍 " + (eg ? T("Egypt → Fri", "مصر ← الجمعة") : T("UAE → Sun", "الإمارات ← الأحد"));
    var b = function (v, lbl) { return '<button type="button" data-weekend="' + v + '" aria-pressed="' + (w === v) + '" class="' + (w === v ? "is-on" : "") + '">' + esc(lbl) + "</button>"; };
    return '<div class="wk-end"><span>🌿 ' + esc(T("My weekend", "الإجازة بتاعتي")) + '</span><div class="tp__tabs">' + b("auto", autoLbl) + b("fri", T("Friday", "الجمعة")) + b("sun", T("Sunday", "الأحد")) + "</div></div>";
  }
  function render() {
    if (mode === "today") sel = viewDow();
    var got = timesNow(iso(dateOf(sel))), d = { en: DAY[sel].en, ar: DAY[sel].ar, len: DAY[tpl(sel)].len, lar: DAY[tpl(sel)].lar }, PR = prayers(sel), P = PR.concat(meetings(sel)), now = new Date(), nowM = now.getHours() * 60 + now.getMinutes(), hm = hhmm(nowM);
    var fri = sel === 5, isToday = sel === todayDow;
    var secOf = function (m) { return m < 600 ? "m" : m < 1140 ? "w" : "f"; };
    var groups = { m: [], w: [], f: [] };
    var free = tpl(sel) === 0;
    var shown = function (x) { return !x.on || x.on.indexOf(tpl(sel)) > -1; };
    var lateWork = [];
    mdRows().filter(shown).forEach(function (x) { if (x.sec === "w") lateWork.push(x); else (groups[x.sec] || groups.f).push({ x: x }); });
    // a work row before the office opens (Wednesday's 8 AM emails) sits in the morning, in time order
    work().forEach(function (x) {
      if (x.from && mins(x.from) < 600) { var g = groups.m, k = 0; while (k < g.length && mins(g[k].x.from) <= mins(x.from)) k++; g.splice(k, 0, { x: x }); }
      else groups.w.push({ x: x });
    });
    // a shared row that sits in the work part (Plan tomorrow) goes in by its time
    lateWork.forEach(function (x) { var g = groups.w, k = 0; while (k < g.length && mins(g[k].x.from) <= mins(x.from)) k++; g.splice(k, 0, { x: x }); });
    // each prayer and meeting goes into its part of the day, before the first row that starts after it
    P.slice().sort(function (a, b) { return a.from - b.from; }).forEach(function (p) {
      var g = groups[secOf(p.from)], i = 0;
      while (i < g.length && (g[i].p || mins(g[i].x.from) <= p.from)) i++;
      g.splice(i, 0, { p: p });
    });
    // the gaps between blocks (15 min or more): open business time, or free hours on Sunday
    var have = [];
    ["m", "w", "f"].forEach(function (k) { groups[k].forEach(function (g) {
      if (g.p) have.push([g.p.from, g.p.to]); else if (g.x.from && g.x.to) have.push([mins(g.x.from), mins(g.x.to)]);
    }); });
    have.sort(function (a, b) { return a[0] - b[0]; });
    var cur = have.length ? have[0][0] : 0, gaps = [];
    have.forEach(function (h) { if (h[0] - cur >= 15) gaps.push({ kind: "gap", cat: free ? "rest" : dayFocus(sel), from: cur, to: h[0] }); cur = Math.max(cur, h[1]); });
    gaps.forEach(function (gp) {
      gp.en = free ? "Free: rest, wife, family, an outing" : "Open time → " + CAT[gp.cat].en + ": the next task from the desk";
      gp.ar = free ? "حر: راحة ومراتي والعيلة وخروجة" : "وقت مفتوح ← " + CAT[gp.cat].ar + ": المهمة الجاية من الـdesk";
      var g = groups[secOf(gp.from)], i = 0;
      while (i < g.length && ((g[i].p ? g[i].p.from : mins(g[i].x.from)) <= gp.from)) i++;
      g.splice(i, 0, { p: gp });
    });
    var nextP = isToday ? PR.filter(function (p) { return p.iq > nowM; })[0] : null;
    var bed = mdRows().filter(function (x) { return x.sec === "f" && shown(x); }).map(function (x) { return mins(x.to); }).sort(function (a, b) { return b - a; })[0] || 1320;
    var sleep = (prayers((sel + 1) % 7)[0].from + 1440 - bed) % 1440;
    var j = jobs();
    // every block of the day, by time, for the strip and the totals
    var blocks = [];
    ["m", "w", "f"].forEach(function (k) { groups[k].forEach(function (g) {
      if (g.p) blocks.push({ from: g.p.from, to: g.p.to, cat: catOf(g.p), name: T(g.p.en, g.p.ar) });
      else if (g.x.from && g.x.to) blocks.push({ from: mins(g.x.from), to: mins(g.x.to), cat: catOf(g.x), name: g.x.text || T(g.x.en, g.x.ar) });
    }); });
    blocks.sort(function (a, b) { return a.from - b.from; });
    var d0 = blocks.length ? blocks[0].from : 300, d1 = blocks.length ? Math.max.apply(null, blocks.map(function (b) { return b.to; })) : 1320, span = Math.max(60, d1 - d0);
    var tot = {}; blocks.forEach(function (b) {
      // a prayer or meeting on top of a block counts once: only the part not covered by an earlier block
      tot[b.cat] = (tot[b.cat] || 0) + (b.to - b.from);
    });
    var hours = []; for (var hh = Math.ceil(d0 / 60) * 60; hh <= d1; hh += 120) hours.push(hh);
    var strip = '<div class="day-strip" aria-hidden="true"><div class="day-strip__bar">' +
      blocks.map(function (b) { return '<i style="--cat:' + CAT[b.cat].c + ";left:" + ((b.from - d0) / span * 100).toFixed(2) + "%;width:" + ((b.to - b.from) / span * 100).toFixed(2) + '%" title="' + esc(ap(b.from) + " – " + ap(b.to) + " · " + b.name) + '"></i>'; }).join("") +
      (isToday && nowM >= d0 && nowM <= d1 ? '<b class="day-strip__now" style="left:' + ((nowM - d0) / span * 100).toFixed(2) + '%"><span>' + esc(ap(nowM)) + "</span></b>" : "") +
      '</div><div class="day-strip__hours">' + hours.map(function (h) { return '<span style="left:' + ((h - d0) / span * 100).toFixed(2) + '%">' + esc(ap(h).replace(":00", "")) + "</span>"; }).join("") + "</div></div>";
    var sec = function (k, title) {
      return '<h3 class="day-sec">' + esc(title) + "</h3>" +
        '<ol class="week-list" data-sec="' + k + '">' + groups[k].map(function (g) { return g.p ? fixedRow(g.p) : row(g.x, P); }).join("") + "</ol>" +
        '<div class="week__foot"><button type="button" class="btn btn--ghost btn--sm" data-add="' + k + '">+ ' + esc(T("Add a time", "ضيف وقت")) + "</button>" +
        (k === "w" ? '<button type="button" class="btn btn--ghost btn--sm" data-meet>🤝 ' + esc(T("Client meeting", "ميعاد عميل")) + "</button>" : "") + "</div>";
    };
    var tday = mode === "today", ov = curOv();
    var doneN = ov && ov.done ? Object.keys(ov.done).length : 0;
    var vd = new Date(Date.now() + viewOff * 864e5);
    var headToday = '<div class="card__head week__head"><h2>' + (viewOff ? "🌙 " + esc(T("Tomorrow", "بكرة")) : "☀️ " + esc(T("Today", "النهارده"))) + ' <small class="muted">' + esc(T(DAY[sel].en, DAY[sel].ar) + " " + vd.getDate()) + '</small></h2><span class="muted week__status">' + esc(status) + "</span></div>" +
      '<div class="tp__tabs day-view" role="tablist"><button type="button" data-view="0" class="' + (viewOff ? "" : "is-on") + '" aria-selected="' + !viewOff + '">☀️ ' + esc(T("Today", "النهارده")) + '</button><button type="button" data-view="1" class="' + (viewOff ? "is-on" : "") + '" aria-selected="' + !!viewOff + '">🌙 ' + esc(T("Tomorrow: plan it", "بكرة: خطّطله")) + "</button></div>" +
      (viewOff ? "" : alertBar()) + gcBar() +
      '<div class="today-bar"><span>' + esc(viewOff
        ? (ov ? T("✎ Tomorrow is planned, the week is as it was", "✎ بكرة متخطط، والأسبوع زي ما هو") : T("Tomorrow from My week. Change anything: it changes tomorrow only", "بكرة من أسبوعي. عدّل أي حاجة: بتتغير بكرة بس"))
        : (ov ? T("✎ Changed for today only, the week is as it was", "✎ متعدّل للنهارده بس، والأسبوع زي ما هو") : T("From My week. Change anything: it changes today only", "من أسبوعي. عدّل أي حاجة: بتتغير النهارده بس"))) + (doneN && !viewOff ? " · ✓ " + doneN : "") + "</span>" +
      (ov ? '<button type="button" class="btn btn--ghost btn--sm" data-reset-today>↺ ' + esc(T("Back to the week", "رجّعه زي الأسبوع")) + "</button>" : "") +
      '<button type="button" class="btn btn--ghost btn--sm" data-to-week>🗓️ ' + esc(T("Edit the week", "عدّل الأسبوع")) + "</button></div>";
    // before the plan's first day (Thu 26 Nov): Today says so; Tomorrow on Wednesday shows Thursday
    if (tday && todayKey() < PLAN_START) {
      var startD = new Date(PLAN_START + "T12:00:00");
      host.innerHTML = headToday + '<div class="plan-wait"><b>🗓️ ' + esc(T("Your plan starts on " + DAY[startD.getDay()].en + " " + startD.getDate() + " " + startD.toLocaleString("en", { month: "short" }) + ".", "خطتك بتبدأ " + DAY[startD.getDay()].ar + " " + startD.getDate() + " نوفمبر.")) + "</b><span>" +
        esc(iso(new Date(Date.now() + 864e5)) >= PLAN_START ? T("Open 🌙 Tomorrow to see and plan the first day.", "افتح 🌙 بكرة تشوف أول يوم وتخطّطله.") : T("Nothing is scheduled before it. The day before, open 🌙 Tomorrow to plan the first day.", "مفيش حاجة متجدولة قبله. اليوم اللي قبله افتح 🌙 بكرة وخطّط لأول يوم.")) + "</span></div>";
      return;
    }
    host.innerHTML = (tday ? headToday :
      '<div class="card__head week__head"><h2>🗓️ ' + esc(T("My week", "أسبوعي")) + '</h2><span class="muted week__status">' + esc(status) + "</span></div>" +
      weekendSwitch()) +
      jobsCard() +
      (tday ? "" : '<p class="day-funnel">📈 ') + (tday ? "" : esc(T(
        "The numbers: " + j.daily + " tailored a day × 26 working days = about " + (j.daily * 26) + " a month. Roughly 1 in 20 gets a reply → about " + Math.round(j.daily * 26 / 20) + " first calls → 2 final rounds → about 1 offer every 1–2 months. 25K AED a month ≈ €75K a year; in Europe aim for €70K+ with visa sponsorship (Netherlands, Germany, Ireland).",
        "الأرقام: " + j.daily + " تقديمات متظبطة في اليوم × 26 يوم شغل = حوالي " + (j.daily * 26) + " في الشهر. تقريبًا واحد من كل 20 بيرد ← حوالي " + Math.round(j.daily * 26 / 20) + " مكالمات أولى ← 2 مقابلات نهائية ← حوالي عرض شغل كل شهر أو شهرين. 25 ألف درهم في الشهر ≈ 75 ألف يورو في السنة؛ في أوروبا خلّي هدفك 70 ألف يورو أو أكتر بكفالة فيزا (هولندا، ألمانيا، أيرلندا).")) + "</p>") +
      (tday ? "" : '<p class="week__kicker">' + esc(T("Click a day to see its whole schedule", "دوس على أي يوم تشوف جدوله كله")) + "</p>" +
      '<div class="week-days" role="tablist">' + ORDER.map(function (n) {
        var x = { en: DAY[n].en, ar: DAY[n].ar, ico: DAY[tpl(n)].ico, fen: DAY[tpl(n)].fen, far: DAY[tpl(n)].far };
        return '<button type="button" role="tab" class="week-day' + (n === sel ? " is-on" : "") + (n === todayDow ? " is-today" : "") + '" data-day="' + n + '" aria-selected="' + (n === sel) + '">' +
          "<small>" + esc(T(x.en, x.ar)) + "</small><em>" + x.ico + "</em><b>" + esc(T(x.fen, x.far)) + "</b></button>";
      }).join("") + "</div>") +
      '<p class="week__for"><b>' + esc(T(d.en, d.ar)) + " " + dateOf(sel).getDate() + ":</b> " + esc(T(d.len, d.lar)) +
        (nextP ? ' · <b>🕌 ' + esc(T(nextP.en + " iqama " + ap(nextP.iq), "إقامة " + nextP.ar + " " + ap(nextP.iq))) + "</b>" : "") +
        " · " + gymNote() + " · 😴 " + esc(T("sleep ", "نوم ") + howLong(0, sleep)) + "</p>" + (tday ? (viewOff ? "" : progressPanel(groups, nowM)) : timePanel()) + strip +
      sec("m", T(SEC.m.en, SEC.m.ar)) +
      sec("w", free ? T("🌿 " + DAY[sel].en + ": free day, no office, no business", "🌿 " + DAY[sel].ar + ": يوم حر، مفيش مكتب ولا بيزنس") : T(SEC.w.en, SEC.w.ar) + officeSplit()) +
      sec("f", T(SEC.f.en, SEC.f.ar)) +
      // in Today the plan comes first, then live progress, then the analytics
      (tday ? timePanel() : "") +
      '<p class="muted day-note">' + esc(T("Prayers: " + (got.place.name || "Dubai") + (got.src === "device" ? ", worked out on this device" : ", times from AlAdhan") + ". Each prayer is 30 min at most, from about 10 min before the iqama, on quarter hours (Jumu'ah is longer, for the khutba); change your mosque's wait on the Time page. Client meetings come from Clients by themselves, each with 30 min of prep before. Morning and evening are the same every day; the work part is this day's own. Every block = the work + 25% buffer (the bar under it). 🍅 = 25 min focus, 5 min break; the clock stops for prayer and meetings. Drag ⠿ to reorder.",
        "الصلاة: " + (got.place.name || "دبي") + (got.src === "device" ? "، محسوبة على الجهاز" : "، المواعيد من AlAdhan") + ". كل صلاة 30 دقيقة بالكتير، من قبل الإقامة بحوالي 10 دقايق، على أرباع الساعة (الجمعة أطول عشان الخطبة)؛ غيّر انتظار مسجدك من صفحة Time. مواعيد العملاء بتيجي من Clients لوحدها، وقبل كل واحد نص ساعة تحضير. الصبح والليل نفسهم كل يوم؛ جزء الشغل خاص باليوم ده. كل بلوك = الشغل + 25% وقت احتياطي (الشريط اللي تحته). 🍅 = 25 دقيقة تركيز و5 بريك؛ العداد بيقف للصلاة والمواعيد. اسحب ⠿ عشان ترتّب.")) + "</p>" +
      (tday ? "" : '<div class="week-post"><span class="week-chip week-chip--uae">🇦🇪 ' + esc(T("Post, UAE time: LinkedIn Wed Thu Fri 4 PM · Instagram Tue Wed Thu 9 AM", "النشر بتوقيت الإمارات: LinkedIn الأربعاء والخميس والجمعة 4 العصر · Instagram الثلاثاء والأربعاء والخميس 9 الصبح")) + "</span>" +
        '<span class="week-chip week-chip--egy">🇪🇬 ' + esc(T("Post, Egypt time: TikTok Sat 1 PM · Sun 9 AM · Mon 1 PM", "النشر بتوقيت مصر: TikTok السبت 1 الضهر · الأحد 9 الصبح · الاثنين 1 الضهر")) + "</span></div>" +
      '<details class="week-pic"><summary>🖼️ ' + esc(T("The whole week as one picture", "الأسبوع كله في صورة واحدة")) + "</summary>" +
        '<a href="/assets/week/routine-waterfall-v2-k7q2.png" target="_blank" rel="noopener"><img loading="lazy" src="/assets/week/routine-waterfall-v2-k7q2.png" alt="' + esc(T("Weekly routine waterfall", "شلال الروتين الأسبوعي")) + '"></a>' +
        '<div class="week-pic__acts">' +
          '<a class="btn btn--primary btn--sm" href="/assets/week/routine-waterfall-v2-k7q2.png" download="my-week.png">⬇ ' + esc(T("Download the week", "نزّل صورة الأسبوع")) + "</a>" +
        "</div></details>");
    // sounds (only for today): 3 notes when a prayer comes in; 2 when focus starts, 1 when a break starts
    if (!isToday) return;
    var TP = P;
    PR.forEach(function (p) { var key = ymd(now) + p.k; if ((hm === hhmm(p.at) || hm === hhmm(p.from)) && !alerted[key + hm]) { alerted[key + hm] = 1; beep(3); } });
    var liveRow = mdRows().filter(shown).concat(work()).filter(function (x) { return x.pomo && hm >= x.from && hm < x.to; })[0], ph = "";
    if (liveRow) { var pm = pomo(liveRow, TP, nowM); ph = liveRow.id + (pm.pray ? "p" : pm.focus ? "f" + pm.cycle : "b" + pm.cycle); }
    if (lastPhase && ph && ph !== lastPhase) beep(ph.indexOf("f") > -1 ? 2 : 1);
    lastPhase = ph;
  }

  /* Before-the-adhan reminder (owner, 2026-11-24): a sound N minutes before every adhan of today
     (default 10), from where you are. The sound is chosen: three tones, a bell, beeps, or your own
     file (an adhan recording you pick; kept in this browser only). Settings live in this browser.
     A browser only plays sound after you have clicked on the page once. */
  var AL = (function () { try { return JSON.parse(localStorage.getItem("week.alert") || "null") || {}; } catch (e) { return {}; } })();
  if (AL.on == null) AL.on = true;
  if (!(AL.before >= 0)) AL.before = 10;
  if (["chime", "bell", "beeps", "custom"].indexOf(AL.sound) < 0) AL.sound = "chime";
  var alFired = {};
  function alSave() { try { localStorage.setItem("week.alert", JSON.stringify(AL)); } catch (e) {} }
  function tone(seq) {
    try {
      var A = window.AudioContext || window.webkitAudioContext; if (!A) return;
      var ac = beep.ac || (beep.ac = new A()); if (ac.state === "suspended") ac.resume();
      seq.forEach(function (n) {
        var o = ac.createOscillator(), g = ac.createGain(), t0 = ac.currentTime + n.t;
        o.type = n.type || "sine"; o.frequency.value = n.f;
        g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(n.v || 0.3, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + n.d);
        o.connect(g); g.connect(ac.destination); o.start(t0); o.stop(t0 + n.d + 0.05);
      });
    } catch (e) {}
  }
  // little sound effects on /now: a soft 3D click, coins for money, a pop for a new note (mute with 🔊)
  var SFX = (function () { try { return localStorage.getItem("now.sfx") !== "off"; } catch (e) { return true; } })(), sndOpen = false;
  function sfx(k) {
    if (!SFX) return;
    if (k === "click") tone([{ f: 2200, d: 0.03, t: 0, v: 0.035, type: "triangle" }, { f: 150, d: 0.07, t: 0, v: 0.09 }]);
    else if (k === "coin") tone([{ f: 988, d: 0.12, t: 0, v: 0.12, type: "square" }, { f: 1319, d: 0.5, t: 0.09, v: 0.1, type: "square" }, { f: 2637, d: 0.4, t: 0.09, v: 0.03 }]);
    else if (k === "spend") tone([{ f: 1319, d: 0.1, t: 0, v: 0.08, type: "triangle" }, { f: 880, d: 0.12, t: 0.07, v: 0.08, type: "triangle" }, { f: 220, d: 0.18, t: 0.12, v: 0.1 }]);
    else if (k === "pop") tone([{ f: 420, d: 0.07, t: 0, v: 0.1 }, { f: 840, d: 0.12, t: 0.04, v: 0.08 }]);
    else if (k === "page") tone([{ f: 600, d: 0.08, t: 0, v: 0.05, type: "triangle" }, { f: 900, d: 0.1, t: 0.05, v: 0.05, type: "triangle" }]);
  }
  function playAlert() {
    if (AL.sound === "custom") {
      var src = ""; try { src = localStorage.getItem("week.alert.file") || ""; } catch (e) {}
      if (src) { try { var a = new Audio(src); a.play().catch(function () {}); return; } catch (e) {} }
    }
    if (AL.sound === "bell") return tone([{ f: 523, d: 2.2, v: 0.35 }, { f: 1046, d: 1.6, v: 0.12 }, { f: 523, d: 2.2, t: 2.4, v: 0.35 }, { f: 1046, d: 1.6, t: 2.4, v: 0.12 }].map(function (n) { n.t = n.t || 0; return n; }));
    if (AL.sound === "beeps") return tone([0, 0.45, 0.9, 1.35].map(function (t) { return { f: 880, d: 0.3, t: t, type: "square", v: 0.12 }; }));
    tone([{ f: 659, d: 0.9, t: 0 }, { f: 784, d: 0.9, t: 0.45 }, { f: 988, d: 1.4, t: 0.9 }]);
  }
  function checkAlert() {
    if (!AL.on || !W) return;
    var now = new Date(), nowM = now.getHours() * 60 + now.getMinutes(), day = ymd(now);
    prayers(todayDow).forEach(function (p) {
      var at = p.at - (+AL.before || 0), key = day + p.k;
      if (nowM >= at && nowM < at + 2 && !alFired[key]) {
        alFired[key] = 1; playAlert();
        var msg = T(p.en + " adhan in " + (AL.before || 0) + " min (" + ap(p.at) + ") · iqama " + ap(p.iq), "أذان " + p.ar + " بعد " + (AL.before || 0) + " دقيقة (" + ap(p.at) + ") · الإقامة " + ap(p.iq));
        try { if (window.Notification && Notification.permission === "granted") new Notification("🕌 " + T(p.en, p.ar), { body: msg, tag: key }); } catch (e) {}
        note("🕌 " + msg);
      }
    });
  }
  function alertBar() {
    var o = function (v, l) { return '<option value="' + v + '"' + (AL.sound === v ? " selected" : "") + ">" + esc(l) + "</option>"; };
    var has = false; try { has = !!localStorage.getItem("week.alert.file"); } catch (e) {}
    return '<div class="al-bar"><label class="al-on"><input type="checkbox" data-al-on' + (AL.on ? " checked" : "") + "> 🔔 " + esc(T("Sound before the adhan", "صوت قبل الأذان")) + "</label>" +
      '<label>' + '<input type="number" min="0" max="60" step="1" value="' + (+AL.before || 0) + '" data-al-before aria-label="' + esc(T("Minutes before", "دقايق قبل")) + '"> ' + esc(T("min before", "دقيقة قبل")) + "</label>" +
      '<select data-al-sound aria-label="' + esc(T("Sound", "الصوت")) + '">' + o("chime", T("🎵 Three tones", "🎵 تلات نغمات")) + o("bell", T("🔔 Bell", "🔔 جرس")) + o("beeps", T("📢 Beeps", "📢 تنبيه")) + o("custom", T("🕌 My own adhan file", "🕌 ملف أذان من عندي")) + "</select>" +
      (AL.sound === "custom" ? '<label class="btn btn--ghost btn--sm al-file">' + esc(has ? T("Change the file", "غيّر الملف") : T("Choose a file", "اختار ملف")) + '<input type="file" accept="audio/*" data-al-file hidden></label>' : "") +
      '<button type="button" class="btn btn--ghost btn--sm" data-al-test>▶ ' + esc(T("Test", "جرّب")) + "</button></div>";
  }

  // "2:30 PM", "2:30 م", "14:30", "2 pm" → minutes; null if it cannot be read
  function parseTime(v) {
    var m = String(v || "").trim().toLowerCase().match(/^(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|ص|م)?$/); if (!m) return null;
    var h = +m[1], mm = +(m[2] || 0); if (h > 23 || mm > 59) return null;
    if (m[3] === "pm" || m[3] === "م") { if (h < 12) h += 12; } else if ((m[3] === "am" || m[3] === "ص") && h === 12) h = 0;
    return h * 60 + mm;
  }

  /* What the Today tab takes from the week (js/tools/time.js prayerPlan): that date's breakfast,
     gym or sport, and sleep from bedtime to the next Fajr. null until the week has loaded. */
  window.MyWeek = {
    life: function (date) {
      if (!W) return null;
      if (date < PLAN_START) return { none: true };
      var dow = new Date(date + "T12:00:00").getDay(), rows = rowsOf(dow);
      var bf = rows.filter(function (x) { return catOf(x) === "food" && /breakfast|فطار/i.test(x.en || ""); })[0];
      var gym = rows.filter(function (x) { return catOf(x) === "fitness"; })[0];
      var ends = rows.filter(function (x) { return x.sec === "f" && x.to; }).map(function (x) { return mins(x.to); });
      var bed = ends.length ? Math.max.apply(null, ends) : 1350, wake = prayers((dow + 1) % 7)[0].from, len = (wake + 1440 - bed) % 1440;
      return {
        breakfast: bf ? { from: bf.from, to: bf.to } : null,
        gym: gym ? { from: gym.from, to: gym.to, note: T(/sport/i.test(gym.en) ? "Sport · from My week" : "Gym · from My week", /sport/i.test(gym.en) ? "رياضة · من أسبوعي" : "جيم · من أسبوعي") } : null,
        sleep: { from: hhmm(bed), to: hhmm(wake), note: T(howLong(0, len) + " · wake for Fajr", howLong(0, len) + " · اصحى للفجر") }
      };
    }
  };
  // every block of My week on that date, as tasks for the Today tab (prayers, meetings and the
  // free-time fillers are not rows; the morning azkar is already Today's own)
  window.MyWeek.today = function (date) {
    if (!W) return null;
    if (date < PLAN_START) return [];
    var dow = new Date(date + "T12:00:00").getDay();
    return rowsOf(dow).filter(function (x) { return x.from && x.to && !/^📿 Morning azkar/.test(x.en || ""); }).map(function (x) {
      var cat = catOf(x), name = x.text || T(x.en, x.ar), m = name.match(/^(\S+)\s+(.*)$/);
      var lead = m && !/[A-Za-z0-9\u0600-\u06FF]/.test(m[1]) ? m[1] : "";
      var its = Array.isArray(x.items) ? x.items.map(function (y) { return T(y.en, y.ar); }) : [];
      var note = (CAT[cat] ? T(CAT[cat].en, CAT[cat].ar) : "") + (its.length ? " · " + its.join(" · ") : "");
      return { key: "week:" + x.id, title: (lead ? m[2] : name).slice(0, 140), icon: lead || (CAT[cat] ? CAT[cat].ico : "🗓️"),
        from: x.from, to: x.to, note: note.slice(0, 118) };
    });
  };
  // a "see the whole day" link anywhere on the page opens the My week tab
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("[data-goto-week]"); if (!a) return;
    e.preventDefault(); var tab = document.querySelector('#tabbar [data-tab="week"]'); if (tab) tab.click();
  });

  /* ---------- actions ---------- */
  host.addEventListener("click", function (e) {
    var t = e.target, b;
    if ((b = t.closest("[data-done]"))) { var ov = ensureOv(); if (!ov.done) ov.done = {}; var did = b.getAttribute("data-done"); if (ov.done[did]) delete ov.done[did]; else { var nw = new Date(); ov.done[did] = nw.getHours() * 60 + nw.getMinutes() || 1; } save(); return render(); }
    if (t.closest("[data-gc-now]")) { gcSync(); gcEvents(); return; }
    if (t.closest("[data-gc-off]")) {
      if (!window.confirm(T("Disconnect Google Calendar? The 'My day' calendar stays in Google; nothing is written to it any more.", "تفصل جوجل كالندر؟ كالندر 'My day' هيفضل في جوجل، بس مش هيتكتب فيه حاجة تاني."))) return;
      fetch("/api/ideas?gcal=disconnect", { method: "POST" }).then(function () { GC.connected = false; GEV = []; render(); });
      return;
    }
    if (t.closest("[data-al-test]")) { playAlert(); try { if (window.Notification && Notification.permission === "default") Notification.requestPermission(); } catch (e) {} return; }
    if ((b = t.closest("[data-view]"))) { viewOff = +b.getAttribute("data-view") ? 1 : 0; editing = null; return render(); }
    if (t.closest("[data-reset-today]")) { if (!window.confirm(T("Undo today's changes and take today from the week again?", "ترجع النهارده زي الأسبوع وتلغي تعديلات النهارده؟"))) return; delete W.dates[todayKey()]; save(); return render(); }
    if (t.closest("[data-to-week]")) { var wt = document.querySelector('#tabbar [data-tab="week"]'); if (wt) wt.click(); return; }
    if ((b = t.closest("[data-weekend]"))) { var v = b.getAttribute("data-weekend"); if (v === "auto") delete W.weekend; else W.weekend = v; editing = null; save(); return render(); }
    if (t.closest("[data-tp-open]")) { TP.open = !TP.open; tpSave(); return render(); }
    if ((b = t.closest("[data-tp-group]"))) { var gid = b.getAttribute("data-tp-group"); if (TP.shut[gid]) delete TP.shut[gid]; else TP.shut[gid] = 1; tpSave(); return render(); }
    if ((b = t.closest("[data-tp-foldall]"))) { var shutAll = b.getAttribute("data-tp-foldall") === "shut"; TP.shut = {}; if (shutAll) GROUPS.forEach(function (g) { TP.shut[g.id] = 1; }); tpSave(); return render(); }
    if (t.closest("[data-tp-sort]")) { TP.sort = { high: "low", low: "type", type: "high" }[TP.sort]; tpSave(); return render(); }
    if ((b = t.closest("[data-tp-scope]"))) { TP.scope = b.getAttribute("data-tp-scope"); tpSave(); return render(); }
    if ((b = t.closest("[data-day]"))) { sel = +b.getAttribute("data-day"); editing = null; return render(); }
    if ((b = t.closest("[data-jobs]"))) {
      var jj = jobs(); W.jobs.log[jj.key] = Math.max(0, jj.today + (+b.getAttribute("data-jobs"))); save(); return render();
    }
    if (t.closest("[data-jobs-target]")) {
      var v = window.prompt(T("How many job applications a day?", "كام تقديم وظيفة في اليوم؟"), String(jobs().daily)), nn = Math.round(+v);
      if (v !== null && nn >= 1 && nn <= 200) { W.jobs.daily = nn; save(); render(); }
      return;
    }
    if (t.closest("[data-meet]")) {
      var who = window.prompt(T("Client name?", "اسم العميل؟")); if (!who || !who.trim()) return;
      var at = window.prompt(T("Start time? (like 2:30 PM or 14:30)", "الساعة كام؟ (زي 2:30 م أو 14:30)"), "14:00"), tm = parseTime(at); if (tm == null) return;
      var du = Math.round(+window.prompt(T("How many minutes?", "كام دقيقة؟"), "60")) || 60;
      if (!W.meetings) W.meetings = [];
      W.meetings.push({ id: uid(), date: iso(dateOf(sel)), from: hhmm(tm), dur: Math.max(15, Math.min(480, du)), client: who.trim().slice(0, 60) });
      save(); return render();
    }
    if ((b = t.closest("[data-meet-del]"))) {
      if (!window.confirm(T("Delete this meeting and its prep?", "تمسح الميعاد ده والتحضير بتاعه؟"))) return;
      var mid = b.getAttribute("data-meet-del"); W.meetings = (W.meetings || []).filter(function (m) { return m.id !== mid; }); save(); return render();
    }
    if ((b = t.closest("[data-add]"))) {
      ensureOv();
      var sec = b.getAttribute("data-add"), arr = sec === "w" ? work() : mdRows();
      var mine = arr.filter(function (y) { return (y.sec || "w") === sec; });
      var last = mine[mine.length - 1], from = last && last.to ? last.to : { m: "06:00", w: "10:00", f: "19:35" }[sec];
      var h = Math.min(23, +from.slice(0, 2) + 1), x = { id: uid(), sec: sec, from: from, to: ("0" + h).slice(-2) + from.slice(2), text: "" };
      arr.push(x); editing = x.id; render();
      var inp = host.querySelector('.week-form input[name="text"]'); if (inp) inp.focus();
      return;
    }
    var li = t.closest(".week-row"); if (!li) return;
    var id = li.getAttribute("data-id"); if (!id) return;
    if (t.closest("[data-edit]") || t.closest("[data-del]")) ensureOv();
    if (t.closest("[data-edit]")) { editing = id; render(); var i2 = host.querySelector('.week-form input[name="text"]'); if (i2) i2.focus(); return; }
    if (t.closest("[data-cancel]")) {
      var cur = find(id);
      if (cur && !cur.text && !cur.en) drop1(id);   // a new row never filled in
      editing = null; return render();
    }
    if (t.closest("[data-del]")) {
      if (!window.confirm(T("Delete this time from your day?", "تمسح الوقت ده من يومك؟"))) return;
      drop1(id); save(); render();
    }
  });
  host.addEventListener("change", alChange);
  function alChange(e) {
    var el = e.target;
    if (el.matches("[data-al-on]")) { AL.on = el.checked; alSave(); if (AL.on) { try { if (window.Notification && Notification.permission === "default") Notification.requestPermission(); } catch (x) {} } return render(); }
    if (el.matches("[data-al-before]")) { AL.before = Math.max(0, Math.min(60, Math.round(+el.value) || 0)); alSave(); return; }
    if (el.matches("[data-al-sound]")) { AL.sound = el.value; alSave(); return render(); }
    if (el.matches("[data-al-file]") && el.files && el.files[0]) {
      var f = el.files[0];
      if (f.size > 3 * 1024 * 1024) { window.alert(T("Please choose a file under 3 MB.", "اختار ملف أقل من 3 ميجا.")); return; }
      var rd = new FileReader();
      rd.onload = function () { try { localStorage.setItem("week.alert.file", rd.result); note(T("Saved: your adhan sound", "اتحفظ صوت الأذان بتاعك")); playAlert(); } catch (x) { window.alert(T("This browser could not keep the file; try a shorter one.", "المتصفح ما قدرش يحفظ الملف؛ جرّب واحد أقصر.")); } render(); if (nowHost) renderNow(); };
      rd.readAsDataURL(f);
    }
  }
  host.addEventListener("submit", function (e) {
    var f = e.target.closest(".week-form"); if (!f) return;
    e.preventDefault(); ensureOv();
    var x = find(f.closest(".week-row").getAttribute("data-id"));
    if (!x) return;
    var text = f.elements.text.value.trim();
    if (!text) { f.elements.text.focus(); return; }
    x.from = f.elements.from.value; x.to = f.elements.to.value;
    if (f.elements.pomo.checked) x.pomo = 1; else delete x.pomo;
    var pick = f.elements.cat && f.elements.cat.value; delete x.cat; if (pick && pick !== catOf(x)) x.cat = pick;
    if (text !== T(x.en, x.ar)) x.text = text;
    editing = null; save(); render();
  });

  host.addEventListener("keydown", function (e) {
    var g = e.target.closest && e.target.closest("[data-tp-group]");
    if (g && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); g.click(); }
  });
  // the panel's tips: over a slice or a row, say what it is, its group, hours and share
  function lit(k, on) {
    [].forEach.call(host.querySelectorAll('.tp [data-k="' + k + '"]'), function (el) { el.classList.toggle("is-lit", on); });
    var svg = host.querySelector(".tp__chart svg"); if (svg) svg.classList.toggle("has-lit", on);
  }
  var tipOn = null;
  host.addEventListener("pointermove", function (e) {
    var el = e.target.closest && e.target.closest(".tp [data-tip]"), tip = host.querySelector(".tp__tip");
    if (!tip) return;
    if (!el) { if (tipOn) { lit(tipOn, false); tipOn = null; } tip.hidden = true; return; }
    var k = el.getAttribute("data-k");
    if (k !== tipOn) { if (tipOn) lit(tipOn, false); if (k) lit(k, true); tipOn = k; }
    tip.textContent = el.getAttribute("data-tip"); tip.hidden = false;
    var box = tip.parentNode.getBoundingClientRect(), x = e.clientX - box.left + 14, y = e.clientY - box.top + 14;
    if (x + tip.offsetWidth > box.width) x = e.clientX - box.left - tip.offsetWidth - 14;
    tip.style.left = Math.max(0, x) + "px"; tip.style.top = y + "px";
  });
  host.addEventListener("pointerleave", function () { var tip = host.querySelector(".tp__tip"); if (tip) tip.hidden = true; if (tipOn) { lit(tipOn, false); tipOn = null; } });

  // drag a row by its handle (mouse, pen or finger), inside its own part of the day
  host.addEventListener("pointerdown", function (e) {
    var g = e.target.closest("[data-drag]"); if (!g) return;
    var li = g.closest(".week-row"); if (!li) return;
    drag = { li: li, ol: li.parentNode }; li.classList.add("is-drag");
    try { g.setPointerCapture(e.pointerId); } catch (err) {}
    e.preventDefault();
  });
  host.addEventListener("pointermove", function (e) {
    if (!drag) return;
    var over = document.elementFromPoint(e.clientX, e.clientY), t = over && over.closest(".week-row");
    if (!t || t === drag.li || t.parentNode !== drag.ol) return;
    var r = t.getBoundingClientRect();
    drag.ol.insertBefore(drag.li, e.clientY > r.top + r.height / 2 ? t.nextSibling : t);
  });
  function drop() {
    if (!drag) return;
    var sec = drag.ol.getAttribute("data-sec"), by = {};
    var ids = [].map.call(drag.ol.querySelectorAll(".week-row[data-id]"), function (li) { return li.getAttribute("data-id"); });
    ensureOv();
    var arr = sec === "w" ? work() : mdRows();
    arr.forEach(function (x) { by[x.id] = x; });
    var moved2 = ids.map(function (id) { return by[id]; }).filter(Boolean);
    if (sec === "w") setWork(moved2.concat(arr.filter(function (x) { return ids.indexOf(x.id) < 0; })));
    else setMd(mdRows().filter(function (x) { return ids.indexOf(x.id) < 0; }).concat(moved2));
    drag = null; save(); render();
  }
  host.addEventListener("pointerup", drop);
  host.addEventListener("pointercancel", drop);

  /* ================= ⏱️ Now (owner, 2026-11-24) =================
     One screen while working: the next prayer, what to do right now and the next 2 hours (from
     Today, with its own changes), money in one tap (adds straight to Floosy, no need to open it)
     with what is left to spend today, a quick client meeting, and sticky notes. */
  var nowHost = document.getElementById("nowCard");
  var FIN = { S: null, rev: "", err: "", RL: null, last: null }, CLIENTS = null, noteDrag = null, noteTimer = null;
  var NOTE_COLORS = ["#FFE58F", "#FFB3C7", "#B8F2C9", "#B3D4FF", "#FFC78F", "#D9C2FF"];
  function finLoad() {
    if (LOCAL || !nowHost) return;
    Promise.all([
      FIN.RL ? Promise.resolve(FIN.RL) : import("/finance/rules.js").then(function (m) { FIN.RL = m; return m; }),
      fetch("/api/ideas?finance=data", { cache: "no-store" }).then(function (r) { FIN.rev = r.headers.get("X-Rev") || ""; return r.ok ? r.json() : null; })
    ]).then(function (x) { FIN.S = x[1]; FIN.err = x[1] ? "" : T("Floosy has no data yet", "مفيش داتا في فلوسي لسه"); renderNow(); })
      .catch(function () { FIN.err = T("Could not read Floosy", "ما قدرتش أقرا فلوسي"); renderNow(); });
  }
  // Floosy's own daily rule: (this cycle's Essentials budget − spent before today) ÷ days left in the cycle.
  // Spend more today and every coming day's number drops by itself.
  function money() {
    var S = FIN.S, RL = FIN.RL; if (!S || !RL || !Array.isArray(S.tx)) return null;
    try {
      var rate = function (c) { return (S.rates && S.rates[c] != null) ? S.rates[c] : 1; };
      var aed = function (x) { return x.amount * (x.rate || rate(x.cur || "AED")); };
      var today = iso(new Date()), pd = RL.paydayOf(S), k = RL.periodOf(today, pd), first = RL.periodOf(RL.sinceOf(S), pd);
      var f = k < first ? 0 : RL.cycleInfo(S, k).f, R = RL.replay(S, rate);
      var end = new Date(+k.slice(0, 4), +k.slice(5, 7), pd), D = new Date(today + "T00:00:00");
      var daysLeft = Math.max(1, Math.round((end - D) / 864e5));
      var ess = S.tx.filter(function (x) { return x.type === "expense" && x.bucket === "essentials"; });
      var before = ess.filter(function (x) { return RL.periodOf(x.date, pd) === k && x.date < today; }).reduce(function (n, x) { return n + aed(x); }, 0);
      var spent = ess.filter(function (x) { return x.date === today; }).reduce(function (n, x) { return n + aed(x); }, 0);
      var pool = R.E * f - before, max = Math.max(0, pool / daysLeft), left = max - spent;
      var tomorrow = daysLeft > 1 ? Math.max(0, (pool - spent) / (daysLeft - 1)) : 0;
      var income = S.tx.filter(function (x) { return x.type === "income" && x.date === today; }).reduce(function (n, x) { return n + aed(x); }, 0);
      return { max: max, spent: spent, left: left, tomorrow: tomorrow, daysLeft: daysLeft, income: income, rate: rate };
    } catch (e) { return null; }
  }
  function finAdd(type, amount, cur, note, bucket) {
    var S = FIN.S; if (!S) return;
    var rate = function (c) { return (S.rates && S.rates[c] != null) ? S.rates[c] : 1; };
    var tx = { id: Math.random().toString(36).slice(2, 10), date: iso(new Date()), amount: amount, cur: cur, rate: rate(cur), note: note || "" };
    if (type === "expense") { tx.type = "expense"; tx.bucket = bucket || "essentials"; }
    else {
      tx.type = "income"; tx.kind = "side"; tx.cat = note || T("Side income", "دخل جانبي"); tx.sub = ""; tx.done = {}; tx.sad = +S.sadaqa || 0;
      tx.Efix = (S.essentials || []).filter(function (e) { return (e.cur || "AED") === cur && !(FIN.RL && FIN.RL.isDynamic(e)); }).reduce(function (n, e) { return n + (+e.amount || 0); }, 0);
    }
    var put = function (retry) {
      S.tx.push(tx);
      return fetch("/api/ideas?finance=data", { method: "PUT", headers: { "Content-Type": "application/json", "If-Match": FIN.rev }, body: JSON.stringify(S) }).then(function (r) {
        if (r.status === 409) return r.json().then(function (d) { FIN.rev = r.headers.get("X-Rev") || FIN.rev; FIN.S = S = d; if (retry) return put(false); throw new Error("conflict"); });
        if (!r.ok) { S.tx.pop(); throw new Error("save " + r.status); }
        FIN.rev = r.headers.get("X-Rev") || FIN.rev; FIN.last = tx.id;
      });
    };
    put(true).then(function () { note(type === "expense" ? T("Expense added to Floosy ✓", "المصروف اتضاف لفلوسي ✓") : T("Income added to Floosy ✓", "الدخل اتضاف لفلوسي ✓")); renderNow(); })
      .catch(function () { window.alert(T("Not saved in Floosy. Check the connection.", "ما اتحفظش في فلوسي. شوف النت.")); renderNow(); });
  }
  function finUndo() {
    var S = FIN.S, id = FIN.last; if (!S || !id) return;
    var keep = S.tx; S.tx = S.tx.filter(function (x) { return x.id !== id; });
    fetch("/api/ideas?finance=data", { method: "PUT", headers: { "Content-Type": "application/json", "If-Match": FIN.rev }, body: JSON.stringify(S) }).then(function (r) {
      if (!r.ok) { S.tx = keep; throw new Error("x"); } FIN.rev = r.headers.get("X-Rev") || FIN.rev; FIN.last = null; note(T("Undone", "اتلغى")); renderNow();
    }).catch(function () { finLoad(); });
  }
  function clientsLoad() {
    if (LOCAL || CLIENTS) return;
    fetch("/api/clients", { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { CLIENTS = d && Array.isArray(d.clients) ? d.clients.map(function (c) { return { id: c.id, name: c.name }; }) : []; renderNow(); }).catch(function () {});
  }
  // what is on now and in the next 2 hours, from Today (with today's own changes), prayers and meetings
  function nowItems() {
    var dow = todayDow, o = W.dates && W.dates[iso(new Date())], rows = o ? o.myday.concat(o.work) : W.myday.filter(function (x) { return !x.on || x.on.indexOf(tpl(dow)) > -1; }).concat(W.days[tpl(dow)] || []);
    if (iso(new Date()) < PLAN_START) rows = [];   // the plan starts Thu 26 Nov: only prayers and meetings before
    var list = rows.filter(function (x) { return x.from && x.to; }).map(function (x) { return { from: mins(x.from), to: mins(x.to), title: x.text || T(x.en, x.ar), cat: catOf(x), items: x.items, id: x.id }; });
    prayers(dow).forEach(function (p) { list.push({ from: p.from, to: p.to, title: "🕌 " + T(p.en, p.ar) + " · " + T("iqama ", "الإقامة ") + ap(p.iq), cat: "deen", pray: p }); });
    meetings(dow).forEach(function (m) { list.push({ from: m.from, to: m.to, title: (m.kind === "prep" ? "📝 " : "🤝 ") + T(m.en, m.ar), cat: catOf(m) }); });
    list.sort(function (a, b) { return a.from - b.from; });
    return list;
  }
  /* Drawn art for the Now cards: a masjid under the sky of the hour, and a coin stack with a note */
  function masjidArt(phase) {
    var stars = phase === "night" || phase === "dusk" ? [[18, 14], [44, 26], [70, 10], [128, 18], [150, 34], [104, 30], [30, 40]].map(function (s, i) { return '<circle cx="' + s[0] + '" cy="' + s[1] + '" r="' + (i % 3 ? 0.9 : 1.4) + '" class="ms__star" style="animation-delay:' + (i * 0.4) + 's"/>'; }).join("") : "";
    var orb = phase === "night" ? '<circle cx="140" cy="22" r="9" fill="#F4EDE0"/><circle cx="144" cy="19" r="8" fill="url(#msSky)"/>' : phase === "dusk" || phase === "dawn" ? '<circle cx="' + (phase === "dawn" ? 22 : 140) + '" cy="78" r="14" fill="url(#msSun)" opacity=".95"/>' : '<circle cx="' + (phase === "gold" ? 130 : 84) + '" cy="' + (phase === "gold" ? 34 : 18) + '" r="10" fill="url(#msSun)"/>';
    return '<svg class="ms ms--' + phase + '" viewBox="0 0 170 100" aria-hidden="true"><defs>' +
      '<linearGradient id="msSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="ms__s1"/><stop offset="1" class="ms__s2"/></linearGradient>' +
      '<radialGradient id="msSun"><stop offset="0" stop-color="#FFF3C4"/><stop offset=".6" stop-color="#F9B233"/><stop offset="1" stop-color="#F9B233" stop-opacity="0"/></radialGradient>' +
      '<linearGradient id="msWall" x1="0" x2="1"><stop offset="0" stop-color="#FFFDF7"/><stop offset=".6" stop-color="#EFE6D3"/><stop offset="1" stop-color="#CDBF9F"/></linearGradient>' +
      '<radialGradient id="msDome" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#FFE9A8"/><stop offset=".45" stop-color="#E2A93B"/><stop offset="1" stop-color="#8A5A12"/></radialGradient>' +
      '<radialGradient id="msDome2" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#9FE3CB"/><stop offset=".5" stop-color="#2F9C7A"/><stop offset="1" stop-color="#155744"/></radialGradient>' +
      '<linearGradient id="msGround" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d9c9a3"/><stop offset="1" stop-color="#a99566"/></linearGradient></defs>' +
      '<rect width="170" height="100" fill="url(#msSky)"/>' + stars + orb +
      '<path d="M0 86 Q85 78 170 86 V100 H0Z" fill="url(#msGround)"/>' +
      '<ellipse cx="85" cy="90" rx="62" ry="5" fill="#000" opacity=".22"/>' +
      // minarets
      [30, 140].map(function (x) { return '<g><rect x="' + (x - 5) + '" y="30" width="10" height="58" fill="url(#msWall)"/><rect x="' + (x - 7) + '" y="44" width="14" height="3" rx="1" fill="#CDBF9F"/><rect x="' + (x - 7) + '" y="62" width="14" height="3" rx="1" fill="#CDBF9F"/><path d="M' + (x - 6) + ' 30 Q' + x + ' 14 ' + (x + 6) + ' 30Z" fill="url(#msDome2)"/><line x1="' + x + '" y1="10" x2="' + x + '" y2="17" stroke="#E2A93B" stroke-width="1.2"/><rect x="' + (x - 1.5) + '" y="36" width="3" height="5" rx="1.5" class="ms__win"/></g>'; }).join("") +
      // body, side domes, main dome
      '<rect x="44" y="56" width="82" height="32" rx="2" fill="url(#msWall)"/>' +
      '<path d="M48 56 Q58 40 68 56Z" fill="url(#msDome2)"/><path d="M102 56 Q112 40 122 56Z" fill="url(#msDome2)"/>' +
      '<rect x="60" y="48" width="50" height="10" fill="url(#msWall)"/>' +
      '<path d="M58 49 C58 26 74 18 85 10 C96 18 112 26 112 49Z" fill="url(#msDome)"/>' +
      '<path d="M66 44 C66 30 76 22 83 16" stroke="#FFF6D8" stroke-width="2" fill="none" opacity=".7" stroke-linecap="round"/>' +
      '<path d="M85 2 a4 4 0 1 0 3 7 a3.2 3.2 0 1 1 -3 -7z" fill="#E2A93B"/><line x1="85" y1="9" x2="85" y2="12" stroke="#E2A93B" stroke-width="1.2"/>' +
      // door and windows (lit at night)
      '<path d="M78 88 V74 Q85 64 92 74 V88Z" fill="#6B4A1E"/>' +
      [54, 66, 104, 116].map(function (x) { return '<path d="M' + (x - 3) + ' 80 V70 Q' + x + ' 65 ' + (x + 3) + ' 70 V80Z" class="ms__win"/>'; }).join("") + "</svg>";
  }
  function moneyArt(neg) {
    var coin = function (y, i) { return '<g transform="translate(0 ' + y + ')"><ellipse cx="38" cy="6" rx="26" ry="8" fill="#8A5A12"/><rect x="12" y="0" width="52" height="6" fill="url(#mnEdge)"/><ellipse cx="38" cy="0" rx="26" ry="8" fill="url(#mnFace)"/>' + (i === 0 ? '<ellipse cx="38" cy="0" rx="17" ry="5" fill="none" stroke="#FFF1B8" stroke-width="1.2" opacity=".8"/><text x="38" y="2.6" text-anchor="middle" font-size="7.5" font-weight="800" fill="#8A5A12">Đ</text>' : "") + "</g>"; };
    return '<svg class="mn' + (neg ? " is-neg" : "") + '" viewBox="0 0 110 90" aria-hidden="true"><defs>' +
      '<linearGradient id="mnEdge" x1="0" x2="1"><stop offset="0" stop-color="#B07A1C"/><stop offset=".4" stop-color="#F6CF62"/><stop offset="1" stop-color="#9A6614"/></linearGradient>' +
      '<radialGradient id="mnFace" cx=".35" cy=".3" r=".9"><stop offset="0" stop-color="#FFF4C2"/><stop offset=".5" stop-color="#F4C24A"/><stop offset="1" stop-color="#C08A22"/></radialGradient>' +
      '<linearGradient id="mnNote" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9BE3C2"/><stop offset="1" stop-color="#2F9C7A"/></linearGradient></defs>' +
      '<ellipse cx="55" cy="84" rx="44" ry="5" fill="#000" opacity=".2"/>' +
      '<g class="mn__note" transform="translate(44 18) rotate(-14)"><rect width="58" height="32" rx="4" fill="url(#mnNote)" stroke="#1d6f56" stroke-width="1"/><rect x="5" y="5" width="48" height="22" rx="3" fill="none" stroke="#E9FFF4" stroke-width="1" opacity=".7"/><circle cx="29" cy="16" r="7" fill="#E9FFF4" opacity=".85"/><text x="29" y="19.5" text-anchor="middle" font-size="9" font-weight="800" fill="#1d6f56">Đ</text></g>' +
      '<g transform="translate(0 30)">' + [42, 34, 26, 18, 10].map(function (y, i) { return coin(y, 4 - i === 0 ? 0 : 1); }).join("") + "</g>" +
      '<g class="mn__coin" transform="translate(64 2)"><ellipse cx="14" cy="14" rx="12" ry="12" fill="url(#mnEdge)"/><ellipse cx="13" cy="13" rx="10.5" ry="10.5" fill="url(#mnFace)"/><text x="13" y="16.5" text-anchor="middle" font-size="10" font-weight="800" fill="#8A5A12">Đ</text></g></svg>';
  }
  /* Reminders: "remind me in X". Kept with the week (so every open device rings), checked every second. */
  function rems() { if (!Array.isArray(W.reminders)) W.reminders = []; return W.reminders; }
  function leftTxt(ms) { var s0 = Math.max(0, Math.round(ms / 1000)), h = Math.floor(s0 / 3600), mm = Math.floor(s0 % 3600 / 60), ss = s0 % 60; return (h ? h + ":" + ("0" + mm).slice(-2) : mm) + ":" + ("0" + ss).slice(-2); }
  function remHtml() {
    var list = rems().slice().sort(function (a, b) { return a.at - b.at; });
    var q = [[5, "5 min", "٥ د"], [15, "15 min", "١٥ د"], [30, "30 min", "٣٠ د"], [60, "1 h", "ساعة"], [120, "2 h", "ساعتين"]];
    return '<section class="nw nw--rem"><div class="nw__k">⏰ ' + esc(T("Remind me", "فكّرني")) + "</div>" +
      '<form class="nw__form rem__form" data-rem><input name="text" type="text" maxlength="120" placeholder="' + esc(T("What? (e.g. call Sara)", "بإيه؟ (مثلاً كلّم سارة)")) + '">' +
      '<div class="rem__q">' + q.map(function (x) { return '<button type="button" class="btn btn--ghost btn--sm" data-rem-in="' + x[0] + '">' + esc(T("in " + x[1], "بعد " + x[2])) + "</button>"; }).join("") + "</div>" +
      '<div class="rem__c"><input name="h" type="number" min="0" max="72" placeholder="' + esc(T("hours", "ساعات")) + '"><input name="m" type="number" min="0" max="59" placeholder="' + esc(T("min", "دقايق")) + '"><button class="btn btn--primary btn--sm" type="submit">' + esc(T("Set", "اضبط")) + "</button></div></form>" +
      (list.length ? '<ul class="rem__list">' + list.map(function (r) {
        var due = r.at <= Date.now(), d = new Date(r.at);
        return '<li class="' + (due ? "is-due" : "") + '"><span>' + esc(r.text || T("Reminder", "تذكير")) + '</span><b data-rem-left="' + r.at + '">' + (due ? "⏰" : leftTxt(r.at - Date.now())) + "</b><small>" + esc(ap(d.getHours() * 60 + d.getMinutes())) + '</small><button type="button" class="nt__x" data-rem-del="' + r.id + '" aria-label="' + esc(T("Delete", "امسح")) + '">✕</button></li>';
      }).join("") + "</ul>" : '<p class="muted nw__hint">' + esc(T("Nothing set.", "مفيش تذكيرات.")) + "</p>") + "</section>";
  }
  function remAdd(text, min) {
    if (!(min > 0)) return;
    rems().push({ id: uid(), text: String(text || "").trim().slice(0, 120), at: Date.now() + Math.round(min * 60000) });
    try { if (window.Notification && Notification.permission === "default") Notification.requestPermission(); } catch (e) {}
    sfx("pop"); save();
    note(T("I will remind you in ", "هفكّرك بعد ") + (min >= 60 ? Math.floor(min / 60) + T(" h", " س") + (min % 60 ? " " + Math.round(min % 60) + T(" min", " د") : "") : Math.round(min) + T(" min", " دقيقة")));
  }
  var remShown = {};
  function remTick() {
    if (!W) return;
    var now = Date.now();
    rems().forEach(function (r) {
      if (r.at > now || remShown[r.id]) return;
      remShown[r.id] = 1;
      tone([{ f: 880, d: 0.25, t: 0, v: 0.2 }, { f: 1175, d: 0.25, t: 0.25, v: 0.2 }, { f: 880, d: 0.25, t: 0.6, v: 0.2 }, { f: 1175, d: 0.5, t: 0.85, v: 0.2 }]);
      try { if (window.Notification && Notification.permission === "granted") new Notification("⏰ " + (r.text || T("Reminder", "تذكير")), { tag: "rem" + r.id, requireInteraction: true }); } catch (e) {}
      var t0 = document.createElement("div"); t0.className = "rem-toast";
      t0.innerHTML = "<b>⏰ " + esc(r.text || T("Reminder", "تذكير")) + '</b><span><button type="button" class="btn btn--ghost btn--sm" data-rem-snooze>' + esc(T("10 min more", "١٠ دقايق كمان")) + '</button><button type="button" class="btn btn--primary btn--sm" data-rem-done>' + esc(T("Done", "تمام")) + "</button></span>";
      t0.addEventListener("click", function (e) {
        var sn = e.target.closest("[data-rem-snooze]"), dn = e.target.closest("[data-rem-done]"); if (!sn && !dn) return;
        var it = rems().filter(function (x) { return x.id === r.id; })[0];
        if (it && sn) { it.at = Date.now() + 10 * 60000; delete remShown[r.id]; }
        if (dn) W.reminders = rems().filter(function (x) { return x.id !== r.id; });
        t0.remove(); save();
      });
      document.body.appendChild(t0);
    });
    if (nowHost) [].forEach.call(nowHost.querySelectorAll("[data-rem-left]"), function (el) { var at = +el.getAttribute("data-rem-left"); el.textContent = at <= now ? "⏰" : leftTxt(at - now); });
  }

  /* Archive: 3D folders of files, stored on the site (api/_lib/archive.js). */
  var ARC = { folders: null, files: [], err: "", open: null, busy: "" };
  var ARC_COLORS = ["#F9B233", "#4F7CFF", "#3AA682", "#FF6B5B", "#B48EE8", "#14213D"];
  var ARC_API = "/api/ideas?archive=";
  function arcLoad() {
    fetch(ARC_API + "list", { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
      .then(function (d) { ARC.folders = d.folders; ARC.files = d.files; ARC.err = ""; renderNow(); arcModalDraw(); })
      .catch(function () { ARC.err = LOCAL ? T("The archive works on the live site.", "الأرشيف شغال على الموقع نفسه.") : T("Could not load the archive.", "ما قدرتش أحمّل الأرشيف."); ARC.folders = ARC.folders || []; renderNow(); });
  }
  function arcCall(method, what, body) {
    return fetch(ARC_API + what, { method: method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || r.status); return d; }); });
  }
  function fmtSize(n) { n = +n || 0; return n < 1024 ? n + " B" : n < 1048576 ? Math.round(n / 1024) + " KB" : (n / 1048576).toFixed(1) + " MB"; }
  function fileIco(t, name) {
    t = t || ""; name = name || "";
    if (/^image\//.test(t)) return "🖼️"; if (/pdf/.test(t)) return "📕"; if (/^audio\//.test(t)) return "🎵"; if (/^video\//.test(t)) return "🎬";
    if (/sheet|excel|csv/.test(t) || /\.(xlsx?|csv)$/i.test(name)) return "📊";
    if (/presentation|powerpoint|keynote/.test(t) || /\.(pptx?|key)$/i.test(name)) return "📽️";
    if (/word|document/.test(t) || /\.docx?$/i.test(name)) return "📝";
    if (/zip|compressed/.test(t)) return "🗜️"; if (/^text\//.test(t)) return "📄"; return "📎";
  }
  function folderSvg(c) { return '<span class="af3" style="--fc:' + (c || "#F9B233") + '"><i class="af3__back"></i><i class="af3__paper"></i><i class="af3__paper af3__paper--2"></i><i class="af3__front"></i></span>'; }
  function arcHtml() {
    if (ARC.folders == null) { ARC.folders = []; setTimeout(arcLoad, 0); }
    var F = ARC.folders || [];
    return '<section class="nw nw--arc"><div class="nw__k">🗄️ ' + esc(T("Archive", "الأرشيف")) + '<span class="fl__ctl"><button type="button" class="btn btn--ghost btn--sm" data-arc-new>＋ ' + esc(T("Folder", "فولدر")) + "</button></span></div>" +
      (ARC.err ? '<p class="muted nw__hint">' + esc(ARC.err) + "</p>" : "") +
      '<div class="arc__grid">' + F.map(function (f) {
        return '<button type="button" class="arc__f" data-arc-open="' + f.id + '" data-arc-drop="' + f.id + '" title="' + esc(T("Open · drop files here to upload", "افتح · ارمي ملفات هنا ترفعها")) + '">' + folderSvg(f.color) +
          "<b>" + esc(f.name) + "</b><small>" + f.count + " · " + fmtSize(f.size) + "</small></button>";
      }).join("") + "</div>" + (F.length || ARC.err ? "" : '<p class="muted nw__hint">' + esc(T("Make your first folder, then drop files on it.", "اعمل أول فولدر، وبعدين ارمي الملفات عليه.")) + "</p>") +
      (ARC.busy ? '<p class="arc__busy">⏳ ' + esc(ARC.busy) + "</p>" : "") + "</section>";
  }
  function arcUpload(folderId, files) {
    files = [].slice.call(files || []); if (!files.length || !folderId) return;
    var LIM = 25 * 1048576, big = files.filter(function (f) { return f.size > LIM; });
    if (big.length) { window.alert(T("Too big (max 25 MB): ", "كبير أوي (أقصى حاجة 25 ميجا): ") + big.map(function (f) { return f.name; }).join(", ")); files = files.filter(function (f) { return f.size <= LIM; }); }
    var i = 0, PIECE = 2.5 * 1048576;
    var next = function () {
      if (i >= files.length) { ARC.busy = ""; sfx("coin"); return arcLoad(); }
      var f = files[i++], up = (uid() + uid() + Date.now().toString(36) + "xxxxxxxxxxxxxxxx").replace(/[^\w-]/g, "").slice(0, 40), n = Math.max(1, Math.ceil(f.size / PIECE)), k = 0;
      var piece = function () {
        ARC.busy = T("Uploading ", "برفع ") + f.name + " (" + (k + 1) + "/" + n + ")"; renderNow(); arcModalDraw();
        var rd = new FileReader();
        rd.onload = function () {
          var b64 = String(rd.result).split(",")[1] || "";
          arcCall("POST", "upload", { upload_id: up, index: k, data_base64: b64 }).then(function () {
            k++; if (k < n) return piece();
            return arcCall("POST", "file", { upload_id: up, folder_id: folderId, name: f.name, type: f.type }).then(next);
          }).catch(function (e) { ARC.busy = ""; window.alert(f.name + ": " + e.message); arcLoad(); });
        };
        rd.readAsDataURL(f.slice(k * PIECE, (k + 1) * PIECE));
      };
      piece();
    };
    next();
  }
  function saveBlob(u, name) { var a = document.createElement("a"); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); }
  function arcGet(file, download) {
    var url = ARC_API + "get&id=" + file.id;
    if (file.size <= 4 * 1048576) { if (download) saveBlob(url + "&dl=1", file.name); else window.open(url, "_blank", "noopener"); return; }
    ARC.busy = T("Downloading ", "بنزّل ") + file.name; arcModalDraw();
    fetch(url + "&info=1").then(function (r) { return r.json(); }).then(function (inf) {
      var parts = [], k = 0;
      var step = function () {
        if (k >= inf.parts) {
          var u = URL.createObjectURL(new Blob(parts, { type: inf.type }));
          if (download || !/^(image|application\/pdf|video|audio)/.test(inf.type)) saveBlob(u, file.name); else window.open(u, "_blank", "noopener");
          ARC.busy = ""; arcModalDraw(); setTimeout(function () { URL.revokeObjectURL(u); }, 60000); return;
        }
        fetch(url + "&part=" + k).then(function (r) { return r.arrayBuffer(); }).then(function (b) { parts.push(b); k++; step(); });
      };
      step();
    }).catch(function () { ARC.busy = ""; arcModalDraw(); });
  }
  // the open folder: a window over the page (outside the board, so the board can redraw under it)
  function arcModalDraw() {
    var M = document.getElementById("arcModal");
    var f = ARC.open && (ARC.folders || []).filter(function (x) { return x.id === ARC.open; })[0];
    if (!f) { if (M) M.remove(); return; }
    if (!M) {
      M = document.createElement("div"); M.id = "arcModal"; M.className = "arcm"; document.body.appendChild(M);
      M.addEventListener("click", arcModalClick); M.addEventListener("change", arcModalChange);
      M.addEventListener("dragover", function (e) { e.preventDefault(); M.classList.add("is-drop"); });
      M.addEventListener("dragleave", function (e) { if (e.target === M) M.classList.remove("is-drop"); });
      M.addEventListener("drop", function (e) { e.preventDefault(); M.classList.remove("is-drop"); arcUpload(ARC.open, e.dataTransfer.files); });
    }
    var files = ARC.files.filter(function (x) { return x.folder_id === f.id; });
    M.innerHTML = '<div class="arcm__box" style="--fc:' + (f.color || "#F9B233") + '"><div class="arcm__head">' + folderSvg(f.color) + "<h3>" + esc(f.name) + "</h3><small>" + files.length + " · " + fmtSize(f.size) + "</small>" +
      '<span class="arcm__acts"><span class="arcm__colors">' + ARC_COLORS.map(function (c) { return '<button type="button" class="bt__c' + (c === f.color ? " is-on" : "") + '" style="--c:' + c + '" data-arc-color="' + c + '"></button>'; }).join("") + "</span>" +
      '<button type="button" class="btn btn--ghost btn--sm" data-arc-rename>✏️ ' + esc(T("Rename", "غيّر الاسم")) + '</button><button type="button" class="btn btn--ghost btn--sm" data-arc-delfolder>🗑 ' + esc(T("Delete folder", "امسح الفولدر")) + '</button><button type="button" class="btn btn--ghost btn--sm" data-arc-close>✕</button></span></div>' +
      '<label class="arcm__drop"><input type="file" multiple hidden data-arc-files>⬆️ ' + esc(T("Upload files (or drop them here) · up to 25 MB each", "ارفع ملفات (أو ارميها هنا) · لحد 25 ميجا للملف")) + "</label>" +
      (ARC.busy ? '<p class="arc__busy">⏳ ' + esc(ARC.busy) + "</p>" : "") +
      '<ul class="arcm__list">' + (files.length ? files.map(function (x) {
        return '<li data-arc-file="' + x.id + '"><span class="arcm__ico">' + fileIco(x.type, x.name) + '</span><button type="button" class="arcm__name" data-arc-view title="' + esc(T("Open", "افتح")) + '">' + esc(x.name) + "</button><small>" + fmtSize(x.size) + " · " + esc(new Date(x.created_at).toLocaleDateString()) + "</small>" +
          '<select data-arc-move aria-label="' + esc(T("Move to", "انقل لـ")) + '"><option value="">' + esc(T("Move…", "انقل…")) + "</option>" + ARC.folders.filter(function (o) { return o.id !== f.id; }).map(function (o) { return '<option value="' + o.id + '">' + esc(o.name) + "</option>"; }).join("") + "</select>" +
          '<button type="button" class="btn btn--ghost btn--sm" data-arc-dl title="' + esc(T("Download", "نزّل")) + '">⬇️</button><button type="button" class="btn btn--ghost btn--sm" data-arc-fren title="' + esc(T("Rename", "غيّر الاسم")) + '">✏️</button><button type="button" class="btn btn--ghost btn--sm" data-arc-fdel title="' + esc(T("Delete", "امسح")) + '">🗑</button></li>';
      }).join("") : '<li class="muted">' + esc(T("Empty folder.", "الفولدر فاضي.")) + "</li>") + "</ul></div>";
  }
  function arcModalClick(e) {
    var t = e.target, M = document.getElementById("arcModal"), f = (ARC.folders || []).filter(function (x) { return x.id === ARC.open; })[0]; if (!f) return;
    if (t === M || t.closest("[data-arc-close]")) { ARC.open = null; return arcModalDraw(); }
    var c = t.closest("[data-arc-color]"); if (c) { arcCall("PATCH", "folder&id=" + f.id, { color: c.getAttribute("data-arc-color") }).then(arcLoad); return; }
    if (t.closest("[data-arc-rename]")) { var nm = window.prompt(T("Folder name", "اسم الفولدر"), f.name); if (nm && nm.trim()) arcCall("PATCH", "folder&id=" + f.id, { name: nm.trim() }).then(arcLoad); return; }
    if (t.closest("[data-arc-delfolder]")) {
      if (!window.confirm(T('Delete the folder "' + f.name + '" and its ' + f.count + " files? This cannot be undone.", 'تمسح فولدر "' + f.name + '" و' + f.count + " ملف جواه؟ مش هتقدر ترجّعهم."))) return;
      arcCall("DELETE", "folder&id=" + f.id).then(function () { ARC.open = null; arcModalDraw(); arcLoad(); }); return;
    }
    var li = t.closest("[data-arc-file]"); if (!li) return;
    var file = ARC.files.filter(function (x) { return x.id === +li.getAttribute("data-arc-file"); })[0]; if (!file) return;
    if (t.closest("[data-arc-view]")) return arcGet(file, false);
    if (t.closest("[data-arc-dl]")) return arcGet(file, true);
    if (t.closest("[data-arc-fren]")) { var n2 = window.prompt(T("File name", "اسم الملف"), file.name); if (n2 && n2.trim()) arcCall("PATCH", "file&id=" + file.id, { name: n2.trim() }).then(arcLoad); return; }
    if (t.closest("[data-arc-fdel]")) { if (!window.confirm(T('Delete "' + file.name + '"? This cannot be undone.', 'تمسح "' + file.name + '"؟ مش هتقدر ترجّعه.'))) return; arcCall("DELETE", "file&id=" + file.id).then(arcLoad); }
  }
  function arcModalChange(e) {
    var t = e.target;
    if (t.matches("[data-arc-files]")) { arcUpload(ARC.open, t.files); t.value = ""; return; }
    if (t.matches("[data-arc-move]") && t.value) { var li = t.closest("[data-arc-file]"); arcCall("PATCH", "file&id=" + li.getAttribute("data-arc-file"), { folder_id: +t.value }).then(arcLoad); }
  }
  // drop files from the computer straight onto a folder on the board
  if (nowHost) {
    nowHost.addEventListener("dragover", function (e) { var f = e.target.closest && e.target.closest("[data-arc-drop]"); if (f) { e.preventDefault(); f.classList.add("is-drop"); } });
    nowHost.addEventListener("dragleave", function (e) { var f = e.target.closest && e.target.closest("[data-arc-drop]"); if (f) f.classList.remove("is-drop"); });
    nowHost.addEventListener("drop", function (e) { var f = e.target.closest && e.target.closest("[data-arc-drop]"); if (!f) return; e.preventDefault(); f.classList.remove("is-drop"); arcUpload(+f.getAttribute("data-arc-drop"), e.dataTransfer.files); });
  }
  function renderNow() {
    if (!nowHost || !W) return;
    if (nbDrag || tabDrag || nowHost.querySelector(".nt__text:focus") || nowHost.querySelector(".sndp :focus") || nowHost.querySelector(".nw__form :focus") || nowHost.querySelector("[contenteditable='true']")) return;   // not under a drag or the typing
    var now = new Date(), m = now.getHours() * 60 + now.getMinutes(), sec = now.getSeconds();
    var P = prayers(todayDow), next = P.filter(function (p) { return p.at > m; })[0] || null, inPray = P.filter(function (p) { return m >= p.from && m < p.to; })[0];
    var items = nowItems(), cur = items.filter(function (x) { return m >= x.from && m < x.to; }), soon = items.filter(function (x) { return x.from > m && x.from < m + 120; });
    var mainNow = cur.filter(function (x) { return !x.pray; })[0] || cur[0];
    var leftOf = function (x) { return x.to - m; };
    // 1) prayer
    var cd = next ? next.at * 60 - (m * 60 + sec) : 0, cdh = Math.floor(cd / 3600), cdm = Math.floor(cd % 3600 / 60), cds = cd % 60;
    var lastP = P.filter(function (p) { return p.at <= m; }).pop();
    var phase = !lastP ? "night" : lastP.en === "Fajr" ? (m - lastP.at < 80 ? "dawn" : "day") : lastP.en === "Dhuhr" ? "day" : lastP.en === "Asr" ? "gold" : lastP.en === "Maghrib" ? "dusk" : "night";
    var prayHtml = '<section class="nw nw--pray"><div class="nw__k">🕌 ' + esc(T("Prayer", "الصلاة")) + '</div><div class="nw__scene">' + masjidArt(phase) + "</div>" +
      (inPray ? '<div class="nw__big">' + esc(T(inPray.en + " now: go to the masjid", inPray.ar + " دلوقتي: روح المسجد")) + '</div><div class="nw__sub">' + esc(T("iqama ", "الإقامة ") + ap(inPray.iq)) + "</div>"
        : next ? '<div class="nw__big">' + esc(T(next.en, next.ar)) + ' <span class="nw__cd" dir="ltr">' + (cdh ? cdh + ":" : "") + ("0" + cdm).slice(-2) + ":" + ("0" + cds).slice(-2) + "</span></div>" +
          '<div class="nw__sub">' + esc(T("adhan ", "الأذان ") + ap(next.at) + " · " + T("iqama ", "الإقامة ") + ap(next.iq) + " · " + T("leave at ", "اتحرك ") + ap(next.from)) + "</div>"
        : '<div class="nw__big">' + esc(T("Isha is done. Fajr tomorrow", "خلصت العشا. الفجر بكرة")) + "</div>") +
      '<div class="nw__times">' + P.map(function (p) { return '<span class="' + (p === next ? "is-next" : m >= p.to ? "is-past" : "") + '"><b>' + esc(T(p.en, p.ar)) + "</b> " + esc(ap(p.at)) + "</span>"; }).join("") + "</div></section>";
    // 2) now: the block you are in
    var doHtml = '<section class="nw nw--do"><div class="nw__k">▶️ ' + esc(T("Now", "دلوقتي")) + "</div>" +
      (mainNow ? '<div class="nw__big" style="--cat:' + (CAT[mainNow.cat] || CAT.product).c + '"><i class="nw__dot"></i>' + esc(mainNow.title) + "</div>" +
        '<div class="nw__bar"><i data-now-bar style="width:' + Math.round((m - mainNow.from) / Math.max(1, mainNow.to - mainNow.from) * 100) + '%"></i></div>' +
        '<div class="nw__sub">' + esc(ap(mainNow.from) + " → " + ap(mainNow.to) + " · " + T(leftOf(mainNow) + " min left", "فاضل " + leftOf(mainNow) + " دقيقة")) + "</div>" +
        (Array.isArray(mainNow.items) && mainNow.items.length ? '<ul class="nw__items">' + mainNow.items.map(function (y) { return "<li>" + esc(T(y.en, y.ar)) + (y.est ? " <em>" + esc(howLong(0, y.est)) + "</em>" : "") + "</li>"; }).join("") + "</ul>" : "")
        : '<div class="nw__big">' + esc(T("Nothing planned right now", "مفيش حاجة متخططة دلوقتي")) + "</div>") + "</section>";
    // the day as cards standing on a 3D board: now in the middle, the next 2 hours lit, later dimmed;
    // it moves one card at a time (arrows, wheel, swipe) and comes back to now by itself
    var flowItems = items.filter(function (x) { return x.to > m; });
    var flowHtml = '<section class="nw nw--flow"><div class="nw__k">🧭 ' + esc(T("Now and the next 2 hours", "دلوقتي والساعتين الجايين")) +
      '<span class="fl__ctl"><button type="button" class="btn btn--ghost btn--sm" data-fl-step="-1" aria-label="' + esc(T("Previous", "اللي قبله")) + '">◀</button><button type="button" class="btn btn--ghost btn--sm" data-fl-now>' + esc(T("Now", "دلوقتي")) + '</button><button type="button" class="btn btn--ghost btn--sm" data-fl-step="1" aria-label="' + esc(T("Next", "اللي بعده")) + '">▶</button></span></div>' +
      '<div class="fl"><div class="fl__floor" aria-hidden="true"></div><div class="fl__track" tabindex="0">' + (flowItems.length ? flowItems.map(function (x, i) {
        var c = CAT[x.cat] || CAT.product, isNow = m >= x.from && m < x.to, soon = !isNow && x.from < m + 120, inMin = x.from - m;
        var tag = isNow ? T("NOW", "دلوقتي") : soon ? T("in " + (inMin >= 60 ? Math.floor(inMin / 60) + " h " + (inMin % 60 ? inMin % 60 + " min" : "") : inMin + " min"), "بعد " + (inMin >= 60 ? Math.floor(inMin / 60) + " س " + (inMin % 60 ? inMin % 60 + " د" : "") : inMin + " دقيقة")) : T("later", "بعدين");
        return '<article class="fl__card' + (isNow ? " is-now" : soon ? " is-soon" : " is-later") + '" style="--cat:' + c.c + '" data-fl="' + i + '"' + (isNow ? " data-fl-current" : "") + ">" +
          '<div class="fl__top"><span class="fl__ico">' + c.ico + '</span><span class="fl__tag">' + esc(tag) + "</span></div>" +
          '<div class="fl__time" dir="ltr">' + esc(ap(x.from)) + "<small> → " + esc(ap(x.to)) + "</small></div>" +
          '<div class="fl__title">' + esc(x.title) + "</div>" +
          '<div class="fl__foot"><span>⏱ ' + esc(howLong(x.from, x.to)) + "</span>" + (isNow ? '<i class="fl__prog"><b style="width:' + Math.round((m - x.from) / Math.max(1, x.to - x.from) * 100) + '%"></b></i>' : "") + "</div></article>";
      }).join("") : '<p class="muted">' + esc(T("The day is done.", "اليوم خلص.")) + "</p>") + "</div></div></section>";
    // 3) money
    var mo = money(), cs = function (n) { return (n < 0 ? "−" : "") + Math.round(Math.abs(n)).toLocaleString() + " Đ"; };
    var moneyHtml = '<section class="nw nw--money"><div class="nw__k">💰 ' + esc(T("Money today", "فلوس النهارده")) + ' <a href="/finance" class="nw__link">' + esc(T("Open Floosy ↗", "افتح فلوسي ↗")) + "</a></div>" +
      (LOCAL ? '<div class="nw__left"><span class="nw__money-art">' + moneyArt(false) + '</span><p class="muted">' + esc(T("Floosy works on the live site.", "فلوسي شغالة على الموقع نفسه.")) + "</p></div>" : !mo ? '<p class="muted">' + esc(FIN.err || T("Loading Floosy…", "بحمّل فلوسي…")) + "</p>" :
        '<div class="nw__left ' + (mo.left < 0 ? "is-neg" : mo.left < mo.max * 0.25 ? "is-low" : "") + '"><span class="nw__money-art">' + moneyArt(mo.left < 0) + "</span><small>" + esc(T("Left to spend today", "فاضل تصرف النهارده")) + "</small><strong dir=\"ltr\">" + esc(cs(mo.left)) + "</strong>" +
          "<em>" + esc(T("max today ", "أقصى النهارده ") + cs(mo.max) + " · " + T("spent ", "اتصرف ") + cs(mo.spent) + (mo.income ? " · " + T("in ", "دخل ") + cs(mo.income) : "")) + "</em>" +
          (mo.left < 0 ? '<em class="nw__warn">⚠️ ' + esc(T("Over by " + cs(-mo.left) + ": it comes out of the next " + (mo.daysLeft - 1) + " days. Tomorrow's max is now " + cs(mo.tomorrow) + ".", "زيادة " + cs(-mo.left) + ": هتتخصم من الـ" + (mo.daysLeft - 1) + " يوم الجايين. أقصى بكرة بقى " + cs(mo.tomorrow) + ".")) + "</em>"
            : '<em>' + esc(T("If you stop here, tomorrow's max is ", "لو وقفت هنا، أقصى بكرة ") + cs(mo.tomorrow)) + "</em>") + "</div>" +
        '<form class="nw__form" data-money><div class="tp__tabs"><button type="button" data-mt="expense" class="' + (FIN.mt !== "income" ? "is-on" : "") + '">− ' + esc(T("Expense", "مصروف")) + '</button><button type="button" data-mt="income" class="' + (FIN.mt === "income" ? "is-on" : "") + '">+ ' + esc(T("Income", "دخل")) + "</button></div>" +
          '<input name="amount" type="number" inputmode="decimal" min="0" step="any" placeholder="' + esc(T("Amount", "المبلغ")) + '" required>' +
          '<select name="cur">' + ["AED", "EGP", "USD", "EUR", "SAR"].filter(function (c) { return c === "AED" || (FIN.S.rates && FIN.S.rates[c] != null); }).map(function (c) { return "<option>" + c + "</option>"; }).join("") + "</select>" +
          (FIN.mt !== "income" ? '<select name="bucket"><option value="essentials">' + esc(T("🍞 Daily / essentials", "🍞 يومي / أساسيات")) + '</option><option value="reward">' + esc(T("🎉 Fun money", "🎉 فلوس حرّة")) + "</option></select>" : "") +
          '<input name="note" type="text" maxlength="80" placeholder="' + esc(T("What for? (optional)", "على إيه؟ (اختياري)")) + '">' +
          '<button class="btn btn--primary btn--sm" type="submit">' + esc(FIN.mt === "income" ? T("Add income", "ضيف دخل") : T("Add expense", "ضيف مصروف")) + "</button>" +
          (FIN.last ? '<button type="button" class="btn btn--ghost btn--sm" data-fin-undo>↶ ' + esc(T("Undo", "تراجع")) + "</button>" : "") + "</form>") + "</section>";
    // 4) quick meeting
    var tz = ""; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (e) {}
    var meetHtml = '<section class="nw nw--meet"><div class="nw__k">🤝 ' + esc(T("Quick meeting", "ميعاد سريع")) + "</div>" +
      (LOCAL ? '<p class="muted">' + esc(T("Meetings are added on the live site.", "المواعيد بتتضاف على الموقع نفسه.")) + "</p>" :
        '<form class="nw__form" data-meetnow><select name="client" required><option value="">' + esc(CLIENTS ? T("Client…", "العميل…") : T("Loading clients…", "بحمّل العملاء…")) + "</option>" + (CLIENTS || []).map(function (c) { return '<option value="' + c.id + '">' + esc(c.name) + "</option>"; }).join("") + "</select>" +
        '<input name="date" type="date" value="' + iso(new Date()) + '" required><input name="time" type="time" required><select name="dur"><option value="30">30 min</option><option value="45">45 min</option><option value="60" selected>1 h</option><option value="90">1 h 30</option></select>' +
        '<input name="topic" type="text" maxlength="120" placeholder="' + esc(T("Topic (optional)", "الموضوع (اختياري)")) + '"><button class="btn btn--primary btn--sm" type="submit">' + esc(T("Add meeting", "ضيف الميعاد")) + "</button></form>" +
        '<p class="muted nw__hint">' + esc(T("It goes to that client's page, into Today/Tomorrow with 30 min of prep, and to Google Calendar.", "بيروح لصفحة العميل، وللنهارده/بكرة ومعاه نص ساعة تحضير، ولجوجل كالندر.")) + "</p>") + "</section>";
    // 5) the board (whiteboard: notes, text, pen, shapes, eraser, Pomodoro timers)
    var page = nowHost.getAttribute("data-layout") === "page";
    var notesHtml = page ? "" : boardHtml(false);
    var calHtml = page ? calDay(items, m) : "";
    var fl = nowHost.querySelector(page ? ".cl" : ".fl__track"), keepScroll = fl ? (page ? fl.scrollTop : fl.scrollLeft) : null;
    if (page) {
      // one full-screen board: the day's cards (prayer, now, today, money, meeting) sit on it with the
      // notes, drawings and Pomodoros; drag a card by its title, zoom and pan like the rest
      var WG = boardWidgets(), wcard = function (k, html) { var g = WG[k]; if (g.hidden) return ""; return '<div class="bw bw--' + k + (g.locked ? " is-locked" : "") + '" data-w="' + k + '" style="left:' + g.x + "px;top:" + g.y + "px;width:" + g.w + "px;z-index:" + (g.z || 0) + '">' + html +
        '<button type="button" class="bw__hide" data-whide="' + k + '" title="' + esc(T("Hide this card (bring it back from 🧩 Cards)", "اخفي الكارت (ترجّعه من 🧩 الكروت)")) + '">✕</button>' +
        '<button type="button" class="bw__lock" data-wlock="' + k + '" title="' + esc(g.locked ? T("Locked: tap to unlock", "مقفول: دوس تفتحه") : T("Lock in place", "اقفله مكانه")) + '">' + (g.locked ? "🔒" : "🔓") + "</button></div>"; };
      var head = '<h2>⏱️ ' + esc(T("Now", "دلوقتي")) + ' <small class="muted" data-now-clock>' + esc(ap(m)) + '</small></h2><span class="nwp__nav"><a class="btn btn--ghost btn--sm" href="/time">⏱ ' + esc(T("Time", "الوقت")) + '</a><a class="btn btn--ghost btn--sm" href="/admin">← ' + esc(T("Home", "الرئيسية")) + "</a></span>";
      var hiddenW = Object.keys(WG).filter(function (k) { return WG[k].hidden; }), WNAMES = { pray: T("🕌 Prayer", "🕌 الصلاة"), rem: T("⏰ Remind me", "⏰ فكّرني"), arc: T("🗄️ Archive", "🗄️ الأرشيف"), do: T("▶️ Now", "▶️ دلوقتي"), cal: T("📅 Today", "📅 النهارده"), money: T("💰 Money", "💰 الفلوس"), meet: T("🤝 Meeting", "🤝 ميعاد") };
      if (isMainTab()) head += '<span class="wcards"><button type="button" class="btn btn--ghost btn--sm" data-wcards>🧩 ' + esc(T("Cards", "الكروت")) + (hiddenW.length ? " (" + hiddenW.length + ")" : "") + "</button>" +
        (cardsOpen ? '<span class="wcards__menu">' + (hiddenW.length ? hiddenW.map(function (k) { return '<button type="button" data-wshow="' + k + '">＋ ' + esc(WNAMES[k] || k) + "</button>"; }).join("") : '<em>' + esc(T("All cards are showing.", "كل الكروت ظاهرة.")) + "</em>") + "</span>" : "") + "</span>";
      head += '<a class="btn btn--ghost btn--sm nw__notion" href="https://app.notion.com/p/awasisai/Workstation-75dde5a5cb184f0abc1aab133d9deb59" target="_blank" rel="noopener">📓 Notion</a>' +
        '<button type="button" class="btn btn--ghost btn--sm" data-theme-tg title="' + esc(T("Light / dark", "فاتح / غامق")) + '">' + (document.documentElement.getAttribute("data-theme") === "light" ? "🌙" : "☀️") + "</button>" +
        '<button type="button" class="btn btn--ghost btn--sm" data-snd title="' + esc(T("Sounds", "الأصوات")) + '">' + (SFX ? "🔊" : "🔇") + "</button>" +
        (sndOpen ? '<div class="sndp nw__form"><label class="al-on"><input type="checkbox" data-sfx-on' + (SFX ? " checked" : "") + "> 🔊 " + esc(T("Sound effects (clicks, coins, notes)", "مؤثرات صوتية (كليك، فلوس، نوتس)")) + "</label>" + alertBar() + "</div>" : "");
      nowHost.innerHTML = boardHtml("full", isMainTab() ? wcard("pray", prayHtml) + wcard("rem", remHtml()) + wcard("arc", arcHtml()) + wcard("do", doHtml) + wcard("cal", calHtml) + wcard("money", moneyHtml) + wcard("meet", meetHtml) : "", head);
      setTimeout(selBar, 0);
      return calSetup(keepScroll);
    }
    nowHost.innerHTML = '<div class="card__head week__head"><h2>⏱️ ' + esc(T("Now", "دلوقتي")) + ' <small class="muted" data-now-clock>' + esc(ap(m)) + '</small></h2><span class="muted week__status">' + esc(status) + "</span></div>" +
      '<div class="nw__grid">' + prayHtml + doHtml + "</div>" + flowHtml + '<div class="nw__grid">' + moneyHtml + meetHtml + "</div>" + notesHtml;
    // back to where the cards were, or to now if you have not moved them for a while
    flowSetup(keepScroll);
  }
  var NBS = (function () { try { return JSON.parse(localStorage.getItem("now.board") || "null") || {}; } catch (e) { return {}; } })();
  if (NBS.z > 0) NBS = { main: NBS };   // one view before tabs → the Now tab's view
  var NB = NBS.main || {};
  if (!(NB.z > 0)) NB = { x: 0, y: 0, z: 1 };
  var ZMIN = 0.08, ZMAX = 8;
  function nbSave() { try { NBS[W && W.board && W.board.cur || "main"] = NB; localStorage.setItem("now.board", JSON.stringify(NBS)); } catch (e) {} }
  function nbApply() { var pl = nowHost.querySelector(".nb__plane"); if (pl) pl.style.transform = "translate(" + NB.x + "px," + NB.y + "px) scale(" + NB.z + ")"; var f = nowHost.querySelector("[data-nb-fit]"); if (f) f.textContent = Math.round(NB.z * 100) + "%"; }
  // auto arrange: the day's cards back in their three columns, notes/timers/text in a neat grid to
  // the right, drawings kept together under them; then zoom to fit the screen (undo brings it back)
  function bArrange() {
    var B = board(), R = boardRoot(); bSnap();
    if (isMainTab()) { var old = R.widgets || {}; R.widgets = JSON.parse(JSON.stringify(WDEF)); R.widgetsV = 3; Object.keys(old).forEach(function (k) { if (old[k] && old[k].locked) R.widgets[k] = old[k]; }); }
    var X0 = isMainTab() ? 1210 : 20, COLS = 3, GAP = 24, x = X0, y = 20, rowH = 0, col = 0, maxX = X0;
    var size = function (it) { var el = nowHost.querySelector('.nb__plane [data-item="' + it.id + '"]'); return el ? [el.offsetWidth || 220, el.offsetHeight || 180] : [220, 180]; };
    B.items.filter(function (it) { return !it.locked && /^(note|timer|text)$/.test(it.type); }).sort(function (a, b) { return (a.type === "timer") - (b.type === "timer") || a.y - b.y || a.x - b.x; }).forEach(function (it) {
      var sz = size(it);
      if (col === COLS) { col = 0; x = X0; y += rowH + GAP; rowH = 0; }
      it.x = x; it.y = y; x += Math.max(sz[0], 200) + GAP; maxX = Math.max(maxX, x); rowH = Math.max(rowH, sz[1]); col++;
    });
    var inkTop = y + rowH + (rowH ? GAP * 2 : 0);
    var ink = B.items.filter(function (it) { return !it.locked && /^(path|rect|ellipse|arrow)$/.test(it.type); });
    if (ink.length) {
      var minX = 1e9, minY = 1e9;
      ink.forEach(function (it) {
        var xs = [it.x], ys = [it.y];
        if (it.pts) it.pts.forEach(function (q) { xs.push(it.x + q[0]); ys.push(it.y + q[1]); }); else { xs.push(it.x + (it.dx || 0)); ys.push(it.y + (it.dy || 0)); }
        minX = Math.min(minX, Math.min.apply(null, xs)); minY = Math.min(minY, Math.min.apply(null, ys));
      });
      var sx = X0 - minX, sy = inkTop - minY; ink.forEach(function (it) { it.x += sx; it.y += sy; });
    }
    save(); renderNow(); if (isMainTab()) { stackCol3(); save(); } setTimeout(nbFit, 30);
  }
  /* Export the open page as an image or a PDF: everything on it is drawn onto a canvas from the
     page itself (boxes, colours, every word where it sits, the ink, the drawings), so it looks like
     the board and works in Safari on iPad too. */
  function bExport(fmt) {
    var v = nowHost.querySelector("[data-nb]"), pl = v && v.querySelector(".nb__plane"); if (!pl) return;
    var vr = v.getBoundingClientRect(), toP = function (r) { return { x: (r.left - vr.left - NB.x) / NB.z, y: (r.top - vr.top - NB.y) / NB.z, w: r.width / NB.z, h: r.height / NB.z }; };
    var parts = [].slice.call(pl.children).filter(function (el) { return !el.classList.contains("nb__ink"); });
    var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, grow = function (b) { if (!b.w && !b.h) return; x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h); };
    parts.forEach(function (el) { grow(toP(el.getBoundingClientRect())); });
    [].forEach.call(pl.querySelectorAll(".nb__ink [data-item]"), function (el) { grow(toP(el.getBoundingClientRect())); });
    if (x1 < x0) { note(T("This page is empty.", "الصفحة دي فاضية.")); return; }
    var PAD = 40; x0 -= PAD; y0 -= PAD; x1 += PAD; y1 += PAD;
    var W0 = x1 - x0, H0 = y1 - y0, S = Math.min(3, Math.sqrt(15e6 / (W0 * H0)));
    var cv = document.createElement("canvas"); cv.width = Math.round(W0 * S); cv.height = Math.round(H0 * S);
    var c = cv.getContext("2d");
    // the svg pictures (masjid, coins) as images first
    var arts = [].slice.call(pl.querySelectorAll(".bw svg"));
    Promise.all(arts.map(function (svg) {
      return new Promise(function (ok) {
        var cl = svg.cloneNode(true), src = svg.querySelectorAll("*"), dst = cl.querySelectorAll("*");
        for (var i = 0; i < src.length; i++) { var cs0 = getComputedStyle(src[i]); if (src[i].tagName === "stop") dst[i].setAttribute("stop-color", cs0.stopColor); else if (src[i].getAttribute("class")) { dst[i].setAttribute("fill", cs0.fill); dst[i].setAttribute("opacity", cs0.opacity); } }
        cl.setAttribute("xmlns", "http://www.w3.org/2000/svg"); var b = svg.getBoundingClientRect(); cl.setAttribute("width", b.width); cl.setAttribute("height", b.height);
        var im = new Image(); im.onload = function () { ok({ svg: svg, im: im }); }; im.onerror = function () { ok(null); };
        im.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(new XMLSerializer().serializeToString(cl));
      });
    })).then(function (imgs) {
      var IM = new Map(); imgs.forEach(function (q) { if (q) IM.set(q.svg, q.im); });
      draw(true);
      var done = function (blob) {
        var name = (board().name || "board").replace(/[^\w؀-ۿ -]+/g, "").trim() + " " + iso(new Date());
        if (fmt === "pdf") blob = pdfFromJpeg(cv, W0 * 0.75, H0 * 0.75);
        var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name + "." + fmt; document.body.appendChild(a); a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000); sfx("page");
      };
      try { cv.toBlob(function (b) { done(b); }, "image/png"); }
      catch (err) { IM = new Map(); draw(false); cv.toBlob(function (b) { done(b); }, "image/png"); }   // a browser that will not mix svg pictures in
      function col(cs, prop) { var v0 = cs[prop]; return v0 && !/rgba\(0, 0, 0, 0\)|transparent/.test(v0) ? v0 : null; }
      function firstGrad(bg) { var m = (bg || "").match(/rgba?\([^)]+\)|#[0-9a-fA-F]{3,8}/g) || []; for (var i = 0; i < m.length; i++) if (!/rgba\([^)]*,\s*0(\.0+)?\)/.test(m[i])) return m[i]; return null; }
      function rr(x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
      function box(el, alpha) {
        var cs = getComputedStyle(el); if (cs.display === "none" || cs.visibility === "hidden") return;
        if (el.matches(".bt, .nb__hint, .nt__bar .nt__c, script")) return;
        alpha *= +cs.opacity || 1;
        if (el.tagName === "svg") { var im = IM.get(el); if (im) { var b0 = toP(el.getBoundingClientRect()); c.globalAlpha = alpha; c.drawImage(im, b0.x, b0.y, b0.w, b0.h); } return; }
        var b = toP(el.getBoundingClientRect()), fill = col(cs, "backgroundColor") || firstGrad(cs.backgroundImage), rad = parseFloat(cs.borderTopLeftRadius) || 0;
        if (fill && b.w > 1 && b.h > 1) {
          c.globalAlpha = alpha; c.save();
          if (cs.boxShadow && cs.boxShadow !== "none" && b.w > 60) { c.shadowColor = "rgba(0,0,0,.35)"; c.shadowBlur = 18 * S; c.shadowOffsetY = 8 * S; }
          c.fillStyle = fill; rr(b.x, b.y, b.w, b.h, rad); c.fill(); c.restore();
        }
        var bl = parseFloat(cs.borderLeftWidth) || 0; if (bl >= 2 && col(cs, "borderLeftColor")) { c.globalAlpha = alpha; c.fillStyle = cs.borderLeftColor; c.fillRect(b.x, b.y, bl, b.h); }
        if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") { textLines(el.value || "", b, cs, alpha); return; }
        var clip = cs.overflowX !== "visible" || cs.overflowY !== "visible";   // a scrolled box shows only what is inside it
        if (clip) { c.save(); rr(b.x, b.y, b.w, b.h, rad); c.clip(); }
        [].forEach.call(el.childNodes, function (n) {
          if (n.nodeType === 3) { if (n.nodeValue.trim()) words(n, cs, alpha); }
          else if (n.nodeType === 1) box(n, alpha);
        });
        if (clip) c.restore();
      }
      function font(cs) { return cs.fontStyle + " " + cs.fontWeight + " " + cs.fontSize + " " + cs.fontFamily; }
      function words(n, cs, alpha) {
        c.globalAlpha = alpha; c.fillStyle = cs.color; c.font = font(cs); c.textBaseline = "alphabetic"; c.direction = cs.direction || "ltr"; c.textAlign = "left";
        var fs = parseFloat(cs.fontSize), txt = n.nodeValue, re = /\S+/g, m, rg = document.createRange();
        if (cs.textTransform === "uppercase") txt = txt.toUpperCase();
        while ((m = re.exec(n.nodeValue))) {
          rg.setStart(n, m.index); rg.setEnd(n, m.index + m[0].length);
          var rs = rg.getClientRects(); if (!rs.length) continue;
          var b = toP(rs[0]); if (b.w < 0.5) continue;
          c.fillText(txt.substr(m.index, m[0].length), b.x, b.y + (b.h - fs) / 2 + fs * 0.82, b.w + 2);
        }
      }
      function textLines(val, b, cs, alpha) {
        c.globalAlpha = alpha; c.fillStyle = cs.color; c.font = font(cs); c.textBaseline = "top";
        var fs = parseFloat(cs.fontSize), lh = parseFloat(cs.lineHeight) || fs * 1.35, padL = parseFloat(cs.paddingLeft) || 0, padT = parseFloat(cs.paddingTop) || 0, maxW = b.w - padL * 2, y = b.y + padT;
        String(val).split("\n").forEach(function (para) {
          var line = ""; para.split(/(\s+)/).forEach(function (w) { var t = line + w; if (c.measureText(t).width > maxW && line) { if (y + lh <= b.y + b.h) c.fillText(line, b.x + padL, y); y += lh; line = w.trimStart(); } else line = t; });
          if (y + lh <= b.y + b.h + 2) c.fillText(line, b.x + padL, y); y += lh;
        });
      }
      function draw(withArt) {
        if (!withArt) IM = new Map();
        c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1;
        var g = c.createLinearGradient(0, 0, 0, cv.height); g.addColorStop(0, "#13203f"); g.addColorStop(1, "#0e1832"); c.fillStyle = g; c.fillRect(0, 0, cv.width, cv.height);
        c.setTransform(S, 0, 0, S, -x0 * S, -y0 * S);
        c.fillStyle = "rgba(244,237,224,.16)"; for (var gx = Math.ceil(x0 / 22) * 22; gx < x1; gx += 22) for (var gy = Math.ceil(y0 / 22) * 22; gy < y1; gy += 22) c.fillRect(gx - 0.75, gy - 0.75, 1.5, 1.5);
        // ink under the cards (highlighter lowest), then cards / notes / text / timers by their z
        var its = board().items.filter(function (x) { return /^(path|rect|ellipse|arrow)$/.test(x.type); }).sort(function (a, b) { return (a.z || 0) - (b.z || 0); });
        its.forEach(function (it) {
          var el = pl.querySelector('.nb__ink [data-item="' + it.id + '"]'); if (!el) return;
          var d = el.getAttribute("d"), cs = getComputedStyle(el); c.save(); c.globalAlpha = +cs.opacity * (parseFloat(cs.strokeOpacity) || 1);
          if (el.tagName === "path") { c.translate(it.x, it.y); var P = new Path2D(d);
            if (el.classList.contains("bi--fill")) { c.fillStyle = it.color; c.fill(P); } else { c.strokeStyle = it.color; c.lineWidth = +el.getAttribute("stroke-width"); c.lineCap = "round"; c.lineJoin = "round"; c.stroke(P); } }
          else { c.strokeStyle = it.color; c.lineWidth = it.w || 3; c.beginPath();
            if (it.type === "rect") rr(Math.min(it.x, it.x + it.dx), Math.min(it.y, it.y + it.dy), Math.abs(it.dx), Math.abs(it.dy), 10);
            else c.ellipse(it.x + it.dx / 2, it.y + it.dy / 2, Math.abs(it.dx / 2), Math.abs(it.dy / 2), 0, 0, Math.PI * 2);
            c.stroke(); }
          c.restore();
        });
        parts.slice().sort(function (a, b) { return (parseInt(a.style.zIndex) || 0) - (parseInt(b.style.zIndex) || 0); }).forEach(function (el) { box(el, 1); });
      }
    });
  }
  // a one-page PDF holding the board as a JPEG (no library needed)
  function pdfFromJpeg(cv, pw, ph) {
    var b64 = cv.toDataURL("image/jpeg", 0.92).split(",")[1], bin = atob(b64), img = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) img[i] = bin.charCodeAt(i);
    var enc = function (t) { var u = new Uint8Array(t.length); for (var k = 0; k < t.length; k++) u[k] = t.charCodeAt(k) & 255; return u; };
    var W = pw.toFixed(2), H = ph.toFixed(2), content = "q " + W + " 0 0 " + H + " 0 0 cm /Im0 Do Q";
    var chunks = [], off = [], len = 0, push = function (u) { chunks.push(u); len += u.length; };
    push(enc("%PDF-1.4\n"));
    var obj = function (n, body) { off[n] = len; push(enc(n + " 0 obj\n" + body + "\nendobj\n")); };
    obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
    obj(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
    obj(3, "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + W + " " + H + "] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>");
    off[4] = len; push(enc("4 0 obj\n<< /Type /XObject /Subtype /Image /Width " + cv.width + " /Height " + cv.height + " /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " + img.length + " >>\nstream\n")); push(img); push(enc("\nendstream\nendobj\n"));
    obj(5, "<< /Length " + content.length + " >>\nstream\n" + content + "\nendstream");
    var xref = len, x = "xref\n0 6\n0000000000 65535 f \n"; for (var n = 1; n <= 5; n++) x += ("000000000" + off[n]).slice(-10) + " 00000 n \n";
    push(enc(x + "trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n" + xref + "\n%%EOF"));
    return new Blob(chunks, { type: "application/pdf" });
  }
  // fit everything on the board (cards, notes, drawings, timers) to the screen
  function nbFit() {
    var v = nowHost.querySelector("[data-nb]"), pl = v && v.querySelector(".nb__plane"); if (!pl) return;
    var vr = v.getBoundingClientRect(), x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    [].forEach.call(pl.querySelectorAll(".bw, .nt, .btx, .pm3, .nb__ink [data-item]"), function (el) {
      var r = el.getBoundingClientRect(); if (!r.width) return;
      x0 = Math.min(x0, r.left); y0 = Math.min(y0, r.top); x1 = Math.max(x1, r.right); y1 = Math.max(y1, r.bottom);
    });
    if (x1 < x0) { NB = { x: 0, y: 0, z: 1 }; nbApply(); return nbSave(); }
    // back to plane units, then scale to fit with a margin (and room for the toolbar at the bottom)
    var px0 = (x0 - vr.left - NB.x) / NB.z, py0 = (y0 - vr.top - NB.y) / NB.z, pw = (x1 - x0) / NB.z, ph = (y1 - y0) / NB.z;
    var z = Math.max(ZMIN, Math.min(1.2, Math.min((vr.width - 40) / pw, (vr.height - 90) / ph)));
    NB = { z: z, x: Math.round((vr.width - pw * z) / 2 - px0 * z), y: Math.round(20 - py0 * z) };
    nbGlide(); nbApply(); nbSave();
  }
  function nbZoom(f, cx, cy, live) {
    var z = Math.max(ZMIN, Math.min(ZMAX, NB.z * f)), k = z / NB.z;
    NB.x = cx - (cx - NB.x) * k; NB.y = cy - (cy - NB.y) * k; NB.z = z;
    if (!live) nbGlide(); nbApply(); if (!live) nbSave();
  }
  function nbGlide() { var pl = nowHost.querySelector(".nb__plane"); if (!pl) return; pl.classList.add("is-glide"); clearTimeout(nbGlide.t); nbGlide.t = setTimeout(function () { pl.classList.remove("is-glide"); }, 260); }
  /* The day standing in 3D, like a Google Calendar day: blocks by their real time, hours down
     the side, a red line for now, the next 2 hours lit. It moves 30 minutes per wheel notch,
     arrow key or button, and goes back to now by itself after 20 seconds. */
  var CAL_PX = 2.2, calMoved = 0, calLock = 0, calStart = 0;
  function calDay(items, m) {
    var evs = items.filter(function (x) { return x.to > x.from; });
    var d0 = Math.floor(Math.min(evs.length ? evs[0].from : m, m - 60) / 60) * 60, d1 = Math.ceil(Math.max.apply(null, evs.map(function (x) { return x.to; }).concat([m + 180])) / 60) * 60;
    d0 = Math.max(0, d0); d1 = Math.min(1440, d1); calStart = d0;
    var Y = function (t) { return ((t - d0) * CAL_PX).toFixed(1); };
    // side by side when blocks overlap (a prayer inside a work block, a meeting)
    var lanes = [], cluster = [], clEnd = -1, out = [];
    var flush = function () { var n = cluster.reduce(function (a, e) { return Math.max(a, e.lane + 1); }, 1); cluster.forEach(function (e) { e.n = n; }); cluster = []; lanes = []; };
    evs.slice().sort(function (a, b) { return a.from - b.from || b.to - a.to; }).forEach(function (e) {
      if (e.from >= clEnd) { flush(); clEnd = -1; }
      var l = 0; while (lanes[l] > e.from) l++; lanes[l] = e.to;
      var o = { e: e, lane: l }; cluster.push(o); out.push(o); clEnd = Math.max(clEnd, e.to);
    });
    flush();
    var hours = ""; for (var h = d0; h <= d1; h += 60) hours += '<div class="cl__hr" style="top:' + Y(h) + 'px"><span>' + esc(ap(h).replace(":00", "")) + "</span></div>";
    var snaps = ""; for (var t = d0; t < d1; t += 30) snaps += '<i class="cl__snap" style="top:' + Y(t) + 'px"></i>';
    var evHtml = out.map(function (o) {
      var e = o.e, c = CAT[e.cat] || CAT.product, isNow = m >= e.from && m < e.to, past = e.to <= m, soon = !isNow && !past && e.from < m + 120;
      var h = Math.max(22, (e.to - e.from) * CAL_PX - 3), w = 100 / o.n;
      return '<div class="cl__ev ' + (isNow ? "is-now" : past ? "is-past" : soon ? "is-soon" : "is-later") + (h < 44 ? " is-short" : "") + '" style="--cat:' + c.c + ";top:" + Y(e.from) + "px;height:" + h.toFixed(1) + "px;left:calc(" + (o.lane * w) + "% + 2px);width:calc(" + w + '% - 4px)">' +
        '<b dir="ltr">' + esc(ap(e.from)) + " – " + esc(ap(e.to)) + "</b><span>" + (/^[\u0000-\u024F\u0600-\u06FF]/.test(e.title) ? c.ico + " " : "") + esc(e.title) + "</span>" +
        (isNow ? '<i class="cl__prog"><em style="width:' + Math.round((m - e.from) / Math.max(1, e.to - e.from) * 100) + '%"></em></i>' : "") + "</div>";
    }).join("");
    return '<section class="nw nw--cal"><div class="nw__k">📅 ' + esc(T("Today", "النهارده")) + " · " + esc(T("now and the next 2 hours", "دلوقتي والساعتين الجايين")) +
      '<span class="fl__ctl"><button type="button" class="btn btn--ghost btn--sm" data-cl-step="-1" aria-label="' + esc(T("Earlier", "قبل")) + '">▲</button><button type="button" class="btn btn--ghost btn--sm" data-cl-now>' + esc(T("Now", "دلوقتي")) + '</button><button type="button" class="btn btn--ghost btn--sm" data-cl-step="1" aria-label="' + esc(T("Later", "بعد")) + '">▼</button></span></div>' +
      '<div class="cl" tabindex="0"><div class="cl__plane" style="height:' + ((d1 - d0) * CAL_PX).toFixed(0) + 'px">' + hours + snaps +
        '<div class="cl__win" style="top:' + Y(m) + "px;height:" + (120 * CAL_PX).toFixed(0) + 'px"><span>' + esc(T("next 2 h", "الساعتين الجايين")) + "</span></div>" +
        '<div class="cl__lanes">' + evHtml + "</div>" +
        '<div class="cl__now" style="top:' + Y(m) + 'px"><span>' + esc(ap(m)) + "</span></div></div></div>" +
      '<div class="wb__tray" aria-hidden="true"><i style="--mk:#FF6B5B"></i><i style="--mk:#4F7CFF"></i><i style="--mk:#3AA682"></i><b></b></div></section>';
  }
  function calSetup(keep) {
    var cl = nowHost.querySelector(".cl"); if (!cl) return;
    var now = new Date(), m = now.getHours() * 60 + now.getMinutes();
    cl.style.scrollBehavior = "auto";   // a redraw lands in place, no slide up from 5 AM
    if (keep != null && Date.now() - calMoved < 20000) cl.scrollTop = keep;
    else cl.scrollTop = Math.max(0, (m - calStart) * CAL_PX - 50);
    cl.style.scrollBehavior = "";
    // drawn while the page was still hidden: centre on now once it can scroll
    if (keep == null) (function retry(n) {
      var want = Math.max(0, (m - calStart) * CAL_PX - 50);
      if (!cl.isConnected || calMoved || Math.abs(cl.scrollTop - want) < 4 || n > 20) return;
      if (cl.clientHeight) { cl.style.scrollBehavior = "auto"; cl.scrollTop = want; cl.style.scrollBehavior = ""; }
      setTimeout(function () { retry(n + 1); }, 150);
    })(0);
    cl.addEventListener("wheel", function () { calMoved = Date.now(); }, { passive: true });
    cl.addEventListener("keydown", function (e) { if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); calMoved = Date.now(); cl.scrollBy({ top: (e.key === "ArrowDown" ? 1 : -1) * 30 * CAL_PX, behavior: "smooth" }); } });
    cl.addEventListener("pointerdown", function () { calMoved = Date.now(); });
    cl.addEventListener("touchmove", function () { calMoved = Date.now(); }, { passive: true });
  }
  var flowMoved = 0, flowLock = 0;
  function flowApply() {
    var tr = nowHost.querySelector(".fl__track"); if (!tr) return;
    var mid = tr.scrollLeft + tr.clientWidth / 2;
    [].forEach.call(tr.children, function (c) {
      if (!c.classList || !c.classList.contains("fl__card")) return;
      var d = (c.offsetLeft + c.offsetWidth / 2 - mid) / (c.offsetWidth + 16), a = Math.max(-3, Math.min(3, d));
      c.style.transform = "perspective(900px) translateZ(" + (-Math.abs(a) * 70) + "px) rotateY(" + (-a * 28) + "deg) scale(" + (1 - Math.min(0.25, Math.abs(a) * 0.08)) + ")";
      c.style.zIndex = String(10 - Math.round(Math.abs(a)));
      c.style.opacity = String(Math.max(0.35, 1 - Math.abs(a) * 0.18));
    });
  }
  function flowTo(card, smooth) {
    var tr = nowHost.querySelector(".fl__track"); if (!tr || !card) return;
    tr.scrollTo({ left: card.offsetLeft + card.offsetWidth / 2 - tr.clientWidth / 2, behavior: smooth ? "smooth" : "auto" });
  }
  function flowSetup(keep) {
    var tr = nowHost.querySelector(".fl__track"); if (!tr) return;
    if (keep != null && Date.now() - flowMoved < 20000) tr.scrollLeft = keep;
    else flowTo(tr.querySelector("[data-fl-current]") || tr.querySelector(".fl__card"), false);
    flowApply();
    tr.addEventListener("scroll", function () { flowApply(); }, { passive: true });
    // the wheel moves exactly one card per notch
    tr.addEventListener("wheel", function (e) {
      if (Math.abs(e.deltaY) < Math.abs(e.deltaX) && Math.abs(e.deltaX) < 4) return;
      e.preventDefault(); if (Date.now() - flowLock < 320) return; flowLock = Date.now();
      flowStep((e.deltaY || e.deltaX) > 0 ? 1 : -1);
    }, { passive: false });
    tr.addEventListener("keydown", function (e) { if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); flowStep(e.key === "ArrowRight" ? 1 : -1); } });
    tr.addEventListener("pointerdown", function () { flowMoved = Date.now(); });
  }
  function flowStep(dir) {
    var tr = nowHost.querySelector(".fl__track"); if (!tr) return;
    flowMoved = Date.now();
    var mid = tr.scrollLeft + tr.clientWidth / 2, cards = [].slice.call(tr.querySelectorAll(".fl__card")), best = 0, bd = 1e9;
    cards.forEach(function (c, i) { var d = Math.abs(c.offsetLeft + c.offsetWidth / 2 - mid); if (d < bd) { bd = d; best = i; } });
    flowTo(cards[Math.max(0, Math.min(cards.length - 1, best + dir))], true);
  }
  // every second: the clock, the prayer countdown and the progress bars, without redrawing
  var nowMin = -1;
  function tickNow() {
    if (!nowHost || !W) return;
    boardTick(); remTick();
    var now = new Date(), m = now.getHours() * 60 + now.getMinutes();
    if (m !== nowMin) { nowMin = m; return renderNow(); }
    var cdEl = nowHost.querySelector(".nw__cd"); if (!cdEl) return;
    var next = prayers(todayDow).filter(function (p) { return p.at > m; })[0]; if (!next) return;
    var cd = next.at * 60 - (m * 60 + now.getSeconds()), h = Math.floor(cd / 3600), mm = Math.floor(cd % 3600 / 60), ss = cd % 60;
    cdEl.textContent = (h ? h + ":" : "") + ("0" + mm).slice(-2) + ":" + ("0" + ss).slice(-2);
  }
  /* ================= the board (Miro-like whiteboard on /now) =================
     One list of items in W.board.items, saved with the week: sticky notes, text, pen ink, shapes
     (box, circle, arrow) and 3D Pomodoro timers. Every item has x, y on the board; ink points and
     shape sizes are relative to that, so moving is just x, y. Tools: select/move (V), note (N),
     text (T), pen (P), box (R), circle (O), arrow (A), eraser (E), timer; Delete removes what is
     selected, ⌘/Ctrl+Z undoes, drag the empty board to move around, ⌘/Ctrl + wheel to zoom. */
  var BT = { tool: "select", color: "#FF6B5B", width: 3, sel: null, pen: (function () { try { return localStorage.getItem("now.pen") || "fountain"; } catch (e) { return "fountain"; } })() };
  var PENS = [["fountain", "🖋️", "Fountain pen", "قلم حبر"], ["ball", "🖊️", "Ballpoint", "قلم جاف"], ["brush", "🖌️", "Brush pen", "قلم فرشاة"], ["hl", "🖍️", "Highlighter", "هايلايتر"]];
  var BCOLORS = ["#14213D", "#FF6B5B", "#3AA682", "#4F7CFF", "#F9B233", "#B48EE8", "#F4EDE0"];
  var BTOOLS = [["select", "🖐️", "V", "Select and move"], ["note", "🗒️", "N", "Sticky note"], ["text", "🔤", "T", "Text"], ["pen", "✏️", "P", "Pen"],
    ["rect", "▭", "R", "Box"], ["ellipse", "◯", "O", "Circle"], ["arrow", "↗", "A", "Arrow"], ["eraser", "🧽", "E", "Eraser"]];
  var undoStack = [];
  // the board has tabs (pages): the first, "Now", carries the day's cards; the others are blank pages
  function boardRoot() {
    if (!W.board) W.board = {};
    if (!Array.isArray(W.board.tabs)) {
      var items = Array.isArray(W.board.items) ? W.board.items : [];
      if (!Array.isArray(W.board.items)) (W.notes || []).forEach(function (n, i) { items.push({ id: n.id, type: "note", x: n.x != null ? n.x : 24 + (i % 4) * 220, y: n.y != null ? n.y : 24 + Math.floor(i / 4) * 200, color: n.color || NOTE_COLORS[0], text: n.text || "", z: n.z || 1 }); });
      delete W.notes; delete W.board.items;
      W.board.tabs = [{ id: "main", name: "Now", items: items }]; W.board.cur = "main";
    }
    return W.board;
  }
  function board() { var R = boardRoot(); return R.tabs.filter(function (t) { return t.id === R.cur; })[0] || R.tabs[0]; }
  function isMainTab() { return board().id === "main"; }
  // three columns: the masjid | today's whiteboard | now, money, meeting; notes to the right
  var WDEF = { rem: { x: 20, y: 380, w: 340 }, arc: { x: 20, y: 640, w: 340 }, pray: { x: 20, y: 20, w: 340 }, cal: { x: 390, y: 20, w: 380 }, do: { x: 800, y: 20, w: 380 }, money: { x: 800, y: 300, w: 380 }, meet: { x: 800, y: 660, w: 380 } };
  // stack the third column by the cards' real heights so none covers another
  function stackCol3() {
    var R = boardRoot();
    [["pray", "rem", "arc"], ["do", "money", "meet"]].forEach(function (col) {
      var y = 20;
      col.forEach(function (k) {
        var el = nowHost.querySelector('[data-w="' + k + '"]'), g = R.widgets[k]; if (!el || !g || g.hidden) return;
        if (g.locked) { y = Math.max(y, g.y + el.offsetHeight + 24); return; }
        g.x = WDEF[k].x; g.y = y; el.style.left = g.x + "px"; el.style.top = y + "px"; y += el.offsetHeight + 24;
      });
    });
  }
  function boardWidgets() {
    var B = boardRoot(), mainT = B.tabs.filter(function (t) { return t.id === "main"; })[0] || B.tabs[0];
    if (!B.widgets || B.widgetsV !== 3) {
      var had = B.widgetsV === 2 ? 0 : B.widgets ? 380 : 1210; B.widgets = JSON.parse(JSON.stringify(WDEF)); B.widgetsV = 3;
      mainT.items.forEach(function (it) { it.x = (it.x || 0) + had; });
      setTimeout(function () { if (isMainTab()) { stackCol3(); bsave(); } }, 60);   // keep the notes clear of the cards
      setTimeout(function () { nbFit(); bsave(); }, 80);                 // and show all of it the first time
    }
    var added = false;
    Object.keys(WDEF).forEach(function (k) { if (!B.widgets[k]) { B.widgets[k] = JSON.parse(JSON.stringify(WDEF[k])); added = true; } });
    if (added) setTimeout(function () { if (isMainTab()) { stackCol3(); bsave(); } }, 80);   // a new card: make room for it
    return B.widgets;
  }
  function bSnap() { undoStack.push(JSON.stringify(board().items)); if (undoStack.length > 50) undoStack.shift(); }
  function bUndo() { if (!undoStack.length) return; board().items = JSON.parse(undoStack.pop()); BT.sel = null; bsave(); renderNow(); }
  function bTop() { var B = board(), w = isMainTab() ? boardRoot().widgets || {} : {}; return Object.keys(w).reduce(function (a, k) { return Math.max(a, w[k].z || 0); }, B.items.reduce(function (a, x) { return Math.max(a, x.z || 1); }, 1)) + 1; }
  function bItem(id) { return board().items.filter(function (x) { return x.id === id; })[0]; }
  function bDel(id) { board().items = board().items.filter(function (x) { return x.id !== id; }); if (BT.sel === id) BT.sel = null; }
  function arrowD(it) {
    var x2 = it.dx, y2 = it.dy, a = Math.atan2(y2, x2), L = Math.max(10, 4 * (it.w || 3) + 6);
    var p = function (ang) { return (x2 - L * Math.cos(a + ang)).toFixed(1) + " " + (y2 - L * Math.sin(a + ang)).toFixed(1); };
    return "M0 0 L" + x2.toFixed(1) + " " + y2.toFixed(1) + " M" + p(0.45) + " L" + x2.toFixed(1) + " " + y2.toFixed(1) + " L" + p(-0.45);
  }
  function smoothD(pts) {
    if (pts.length < 3) return pts.map(function (q, i) { return (i ? "L" : "M") + q[0] + " " + q[1]; }).join(" ") + (pts.length === 1 ? " l0.01 0" : "");
    var d = "M" + pts[0][0] + " " + pts[0][1];
    for (var i = 1; i < pts.length - 1; i++) d += " Q" + pts[i][0] + " " + pts[i][1] + " " + ((pts[i][0] + pts[i + 1][0]) / 2).toFixed(1) + " " + ((pts[i][1] + pts[i + 1][1]) / 2).toFixed(1);
    var l = pts[pts.length - 1]; return d + " L" + l[0] + " " + l[1];
  }
  function inkOutline(pts, w, k) {
    k = k || 1.3;
    var n = pts.length, L = [], R = [], ps = [];
    for (var i = 0; i < n; i++) {   // ease the pressure so the line does not wobble
      var pr = pts[i][2] != null ? pts[i][2] : 0.5; ps.push(i ? ps[i - 1] * 0.6 + pr * 0.4 : pr);
    }
    for (var j = 0; j < n; j++) {
      var a = pts[Math.max(0, j - 1)], b = pts[Math.min(n - 1, j + 1)], dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
      var taper = Math.min(1, (j + 1) / 4, (n - j) / 3), r = Math.max(0.4, w * (0.35 + k * ps[j]) / 2 * (0.55 + 0.45 * taper));
      L.push([pts[j][0] - dy / len * r, pts[j][1] + dx / len * r]); R.push([pts[j][0] + dy / len * r, pts[j][1] - dx / len * r]);
    }
    var f = function (q) { return q[0].toFixed(1) + " " + q[1].toFixed(1); }, rEnd = Math.max(0.4, w * (0.35 + k * ps[n - 1]) / 4);
    var side = function (P) { var d = ""; for (var k = 1; k < P.length - 1; k++) d += " Q" + f(P[k]) + " " + f([(P[k][0] + P[k + 1][0]) / 2, (P[k][1] + P[k + 1][1]) / 2]); return d + " L" + f(P[P.length - 1]); };
    var Rr = R.slice().reverse();
    return "M" + f(L[0]) + side(L) + " A" + rEnd.toFixed(1) + " " + rEnd.toFixed(1) + " 0 0 1 " + f(Rr[0]) + side(Rr) + " A" + rEnd.toFixed(1) + " " + rEnd.toFixed(1) + " 0 0 1 " + f(L[0]) + "Z";
  }
  function inkSvg(it) {
    var sel = (BT.sel === it.id ? " is-sel" : "") + (it.locked ? " is-locked" : ""), tr = ' transform="translate(' + it.x + " " + it.y + ')"', st = ' stroke="' + it.color + '" stroke-width="' + (it.w || 3) + '"';
    if (it.type === "path") {
      var pts = it.pts || [], pen = it.pen || (pts[0] && pts[0].length > 2 ? "fountain" : "ball");
      if (pen === "hl") return '<path data-item="' + it.id + '" class="bi bi--hl' + sel + '"' + tr + ' stroke="' + it.color + '" stroke-width="' + ((it.w || 3) * 5 + 6) + '" d="' + smoothD(pts) + '"/>';
      if ((pen === "fountain" || pen === "brush") && pts.length > 1) return '<path data-item="' + it.id + '" class="bi bi--fill' + sel + '"' + tr + ' style="fill:' + it.color + '" d="' + inkOutline(pts, (it.w || 3) * (pen === "brush" ? 2.6 : 1), pen === "brush" ? 1.9 : 1.3) + '"/>';
      return '<path data-item="' + it.id + '" class="bi' + sel + '"' + tr + st + ' d="' + smoothD(pts) + '"/>';
    }
    if (it.type === "rect") return '<rect data-item="' + it.id + '" class="bi bi--shape' + sel + '"' + st + ' x="' + Math.min(it.x, it.x + it.dx) + '" y="' + Math.min(it.y, it.y + it.dy) + '" width="' + Math.abs(it.dx) + '" height="' + Math.abs(it.dy) + '" rx="10"/>';
    if (it.type === "ellipse") return '<ellipse data-item="' + it.id + '" class="bi bi--shape' + sel + '"' + st + ' cx="' + (it.x + it.dx / 2) + '" cy="' + (it.y + it.dy / 2) + '" rx="' + Math.abs(it.dx / 2) + '" ry="' + Math.abs(it.dy / 2) + '"/>';
    if (it.type === "arrow") return '<path data-item="' + it.id + '" class="bi' + sel + '"' + tr + st + ' d="' + arrowD(it) + '"/>';
    return "";
  }
  function pmLeft(it) { return it.running ? Math.max(0, Math.round((it.endAt - Date.now()) / 1000)) : (it.left != null ? it.left : it.len[it.mode] * 60); }
  function pmFace(it) {
    var s = pmLeft(it), mm = ("0" + Math.floor(s / 60)).slice(-2), ss = ("0" + (s % 60)).slice(-2), tot = it.len[it.mode] * 60, pct = Math.round((1 - s / tot) * 100);
    var dig = function (str) { return str.split("").map(function (c) { return '<b class="pm3__d">' + c + "</b>"; }).join(""); };
    return '<div class="pm3__ring" style="--p:' + pct + '"><div class="pm3__digits" dir="ltr">' + dig(mm) + '<i class="pm3__colon">:</i>' + dig(ss) + "</div></div>";
  }
  function itemHtml(it) {
    var sel = (BT.sel === it.id ? " is-sel" : "") + (it.locked ? " is-locked" : ""), pos = "left:" + it.x + "px;top:" + it.y + "px;z-index:" + (it.z || 1);
    if (it.type === "note") return '<div class="nt bi-h' + sel + '" data-item="' + it.id + '" style="--nc:' + (it.color || NOTE_COLORS[0]) + ";" + pos + (it.w ? ";width:" + it.w + "px" : "") + (it.h ? ";height:" + it.h + "px" : "") + '"><i class="nt__rs" data-resize aria-label="' + esc(T("Resize", "غيّر المقاس")) + '"></i><div class="nt__bar" data-drag>' +
      NOTE_COLORS.map(function (c) { return '<button type="button" class="nt__c' + (c === it.color ? " is-on" : "") + '" style="--c:' + c + '" data-note-color="' + c + '" aria-label="' + esc(T("Colour", "لون")) + '"></button>'; }).join("") +
      '<button type="button" class="nt__x" data-item-del aria-label="' + esc(T("Delete", "امسح")) + '">✕</button></div><textarea class="nt__text" rows="5" placeholder="' + esc(T("Write…", "اكتب…")) + '">' + esc(it.text || "") + "</textarea></div>";
    if (it.type === "text") return '<div class="btx bi-h' + sel + '" data-item="' + it.id + '" style="' + pos + ";color:" + it.color + ";font-size:" + (it.size || 22) + 'px" spellcheck="false">' + esc(it.text || "") + "</div>";
    if (it.type === "timer") {
      var mode = { focus: T("Focus", "تركيز"), short: T("Short break", "بريك قصير"), long: T("Long break", "بريك طويل") }[it.mode];
      return '<div class="pm3 bi-h' + sel + (it.running ? " is-run" : "") + " is-" + it.mode + '" data-item="' + it.id + '" style="' + pos + '"><div class="pm3__bar" data-drag><span>🍅 ' + esc(mode) + (it.cycles ? " · ✓" + it.cycles : "") + '</span><button type="button" class="nt__x" data-item-del aria-label="' + esc(T("Delete", "امسح")) + '">✕</button></div>' +
        '<div class="pm3__face" data-pm-face>' + pmFace(it) + "</div>" +
        '<div class="pm3__modes">' + ["focus", "short", "long"].map(function (k) { return '<button type="button" data-pm-mode="' + k + '" class="' + (it.mode === k ? "is-on" : "") + '">' + it.len[k] + "</button>"; }).join("") + "</div>" +
        '<div class="pm3__acts"><button type="button" class="pm3__go" data-pm-go>' + (it.running ? "⏸" : "▶") + '</button><button type="button" data-pm-reset aria-label="' + esc(T("Reset", "من الأول")) + '">↺</button><button type="button" data-pm-sound class="' + (it.sound ? "is-on" : "") + '" aria-label="' + esc(T("Sound", "صوت")) + '">' + (it.sound ? "🔔" : "🔕") + "</button></div></div>";
    }
    return "";
  }
  function tabsHtml() {
    var R = boardRoot();
    return '<div class="btabs" data-btabs>' + R.tabs.map(function (t) {
      return '<span class="btab' + (t.id === R.cur ? " is-on" : "") + '" data-tab="' + t.id + '" title="' + esc(T("Tap to open · double tap to rename · drag to move", "دوس تفتح · دوس مرتين تغيّر الاسم · اسحب ترتّب")) + '"><b>' + esc(t.name) + "</b>" + (t.id !== "main" ? '<i data-tab-del aria-label="' + esc(T("Delete page", "امسح الصفحة")) + '">×</i>' : "") + "</span>";
    }).join("") + '<button type="button" class="btab btab--add" data-tab-add aria-label="' + esc(T("New page", "صفحة جديدة")) + '">＋</button></div>';
  }
  var tabDrag = null, tabTap = null, cardsOpen = false;
  function bLockToggle() {
    var it = BT.sel && bItem(BT.sel);
    if (!it) { note(T("Select something first, then press Lock.", "اختار حاجة الأول وبعدين دوس قفل.")); return; }
    it.locked = !it.locked; bsave(); renderNow(); bSelect(it.id);
    note(it.locked ? T("Locked in place 🔒", "اتقفل مكانه 🔒") : T("Unlocked 🔓", "اتفتح 🔓"));
  }
  function tabGo(id) {
    var R = boardRoot(); if (R.cur === id) return;
    nbSave(); R.cur = id; NB = NBS[id] || { x: 0, y: 0, z: 1 }; if (!(NB.z > 0)) NB = { x: 0, y: 0, z: 1 };
    undoStack.length = 0; BT.sel = null; bsave(); renderNow();
  }
  function boardHtml(tall, widgets, head) {
    var B = board(), ink = B.items.filter(function (x) { return /^(path|rect|ellipse|arrow)$/.test(x.type); }), boxes = B.items.filter(function (x) { return /^(note|text|timer)$/.test(x.type); });
    var tools = BTOOLS.map(function (t) { return '<button type="button" class="bt__t' + (BT.tool === t[0] ? " is-on" : "") + '" data-tool="' + t[0] + '" title="' + esc(T(t[3], t[3])) + " (" + t[2] + ')">' + t[1] + "</button>"; }).join("");
    var colors = BCOLORS.map(function (c) { return '<button type="button" class="bt__c' + (BT.color === c ? " is-on" : "") + '" style="--c:' + c + '" data-bcolor="' + c + '" aria-label="' + esc(T("Colour", "لون")) + '"></button>'; }).join("");
    var widths = [2, 4, 8].map(function (w) { return '<button type="button" class="bt__w' + (BT.width === w ? " is-on" : "") + '" data-bwidth="' + w + '" aria-label="' + w + '"><i style="width:' + (w + 4) + "px;height:" + (w + 4) + 'px"></i></button>'; }).join("");
    return '<section class="nw nw--notes' + (tall === "full" ? " nw--full" : "") + '"><div class="nw__k">' + (head || "🗒️ " + esc(T("Board", "البورد"))) +
      '<span class="nb__tools"><button type="button" class="btn btn--ghost btn--sm" data-b-export="png" title="' + esc(T("Save this page as an image", "احفظ الصفحة دي صورة")) + '">🖼️ PNG</button><button type="button" class="btn btn--ghost btn--sm" data-b-export="pdf" title="' + esc(T("Save this page as a PDF", "احفظ الصفحة دي PDF")) + '">📄 PDF</button><button type="button" class="btn btn--ghost btn--sm" data-bclear title="' + esc(T("Delete everything on this page", "امسح كل اللي في الصفحة دي")) + '">🧹 ' + esc(T("Clear page", "امسح الصفحة")) + '</button><button type="button" class="btn btn--ghost btn--sm" data-block title="' + esc(T("Lock / unlock the selected item (L)", "اقفل / افتح الحاجة المختارة (L)")) + '">🔒 ' + esc(T("Lock", "قفل")) + '</button><button type="button" class="btn btn--ghost btn--sm" data-b-arrange title="' + esc(T("Tidy everything and fit it to the screen", "رتّب كل حاجة وخليها على قد الشاشة")) + '">✨ ' + esc(T("Auto arrange", "رتّب")) + '</button><button type="button" class="btn btn--ghost btn--sm" data-pm-add>⏱️ ' + esc(T("Pomodoro", "بومودورو")) + '</button><button type="button" class="btn btn--ghost btn--sm" data-bundo title="⌘/Ctrl+Z">↶</button><button type="button" class="btn btn--ghost btn--sm" data-bdel title="Delete">🗑</button><button type="button" class="btn btn--ghost btn--sm" data-nb-zoom="-1">−</button><button type="button" class="btn btn--ghost btn--sm" data-nb-fit>' + Math.round(NB.z * 100) + '%</button><button type="button" class="btn btn--ghost btn--sm" data-nb-zoom="1">+</button></span></div>' +
      '<div class="nb' + (tall === "full" ? " nb--full" : tall ? " nb--tall" : "") + '" data-nb data-tool="' + BT.tool + '" tabindex="0">' +
        '<div class="bt"><div class="bt__g">' + tools + '</div><div class="bt__g bt__pens">' + PENS.map(function (q) { return '<button type="button" class="bt__t' + (BT.pen === q[0] ? " is-on" : "") + '" data-pen="' + q[0] + '" title="' + esc(T(q[2], q[3])) + '">' + q[1] + "</button>"; }).join("") + '</div><div class="bt__g">' + colors + '</div><div class="bt__g">' + widths + "</div></div>" +
        '<div class="nb__plane" style="transform:translate(' + NB.x + "px," + NB.y + "px) scale(" + NB.z + ')">' +
          (widgets || "") + '<svg class="nb__ink" width="1" height="1" overflow="visible">' + ink.map(inkSvg).join("") + "</svg>" +
          boxes.map(itemHtml).join("") +
        '</div><i class="nb__eraser" hidden></i>' + (tall === "full" ? tabsHtml() : "") + '<p class="nb__hint">' + esc(T("V select · N note · T text · P pen · R box · O circle · A arrow · E eraser · ⌘Z undo · ⌘/Ctrl + wheel zoom", "V تحديد · N نوت · T كلام · P قلم · R مربع · O دايرة · A سهم · E أستيكة · ⌘Z تراجع · ⌘/Ctrl + العجلة زوم")) + "</p></div></section>";
  }
  // every second: the timers' faces; at zero, the sound and the next round
  function boardTick() {
    if (!W || !W.board || !W.board.tabs) return;
    W.board.tabs.forEach(function (tb) { tb.items.forEach(function (it) {
      if (it.type !== "timer") return;
      if (it.running && Date.now() >= it.endAt) {
        it.running = false; it.endAt = null;
        if (it.mode === "focus") { it.cycles = (it.cycles || 0) + 1; it.mode = it.cycles % 4 === 0 ? "long" : "short"; } else it.mode = "focus";
        it.left = it.len[it.mode] * 60;
        if (it.sound) { tone([{ f: 784, d: 0.5, t: 0 }, { f: 988, d: 0.5, t: 0.35 }, { f: 1175, d: 0.9, t: 0.7 }]); }
        try { if (window.Notification && Notification.permission === "granted") new Notification("🍅 " + (it.mode === "focus" ? T("Break is over: focus", "البريك خلص: ركّز") : T("Focus done: take a break", "خلصت التركيز: خد بريك"))); } catch (e) {}
        bsave(); var el0 = nowHost && nowHost.querySelector('[data-item="' + it.id + '"]'); if (el0) el0.outerHTML = itemHtml(it);
        return;
      }
      var el = nowHost && nowHost.querySelector('[data-item="' + it.id + '"] [data-pm-face]'); if (el) el.innerHTML = pmFace(it);
    }); });
  }
  function bPoint(e) { var v = nowHost.querySelector("[data-nb]").getBoundingClientRect(); return [Math.round((e.clientX - v.left - NB.x) / NB.z), Math.round((e.clientY - v.top - NB.y) / NB.z)]; }
  var inkRaf = {};
  function bRedrawSoon(it) { if (inkRaf[it.id]) return; inkRaf[it.id] = requestAnimationFrame(function () { inkRaf[it.id] = 0; bRedrawInk(it); }); }
  function bRedrawInk(it) {
    var el = nowHost.querySelector('.nb__ink [data-item="' + it.id + '"]'), svg = nowHost.querySelector(".nb__ink");
    if (!svg) return;
    var tmp = document.createElementNS("http://www.w3.org/2000/svg", "svg"); tmp.innerHTML = inkSvg(it);
    var fresh = tmp.firstChild; if (!fresh) return;
    if (el) svg.replaceChild(fresh, el); else svg.appendChild(fresh);
  }
  function bSetTool(t) { BT.tool = t; var v = nowHost.querySelector("[data-nb]"); if (v) v.setAttribute("data-tool", t); [].forEach.call(nowHost.querySelectorAll("[data-tool]"), function (b) { if (b.classList.contains("bt__t")) b.classList.toggle("is-on", b.getAttribute("data-tool") === t); }); }
  function bSelect(id) {
    BT.sel = id; [].forEach.call(nowHost.querySelectorAll(".nb [data-item]"), function (el) { el.classList.toggle("is-sel", el.getAttribute("data-item") === id); });
    selBar();
  }
  // a small bar over the selected item: edit, duplicate, lock, delete
  function selBar() {
    var old = nowHost.querySelector(".bsel"); if (old) old.remove();
    var it = BT.sel && bItem(BT.sel), pl = nowHost.querySelector(".nb__plane"), el = it && pl && pl.querySelector('[data-item="' + it.id + '"]'); if (!el) return;
    var v = nowHost.querySelector("[data-nb]").getBoundingClientRect(), r = el.getBoundingClientRect();
    var x = (r.left - v.left - NB.x) / NB.z, y = (r.top - v.top - NB.y) / NB.z;
    var bar = document.createElement("div"); bar.className = "bsel"; bar.style.left = Math.round(x) + "px"; bar.style.top = Math.round(y - 44 / NB.z) + "px"; bar.style.transform = "scale(" + (1 / NB.z) + ")";
    var canEdit = it.type === "note" || it.type === "text";
    bar.innerHTML = (canEdit ? '<button type="button" data-bs="edit" title="' + esc(T("Edit", "عدّل")) + '">✏️</button>' : "") +
      '<button type="button" data-bs="dup" title="' + esc(T("Duplicate", "نسخة")) + '">📄</button>' +
      '<button type="button" data-bs="lock" title="' + esc(it.locked ? T("Unlock", "افتح") : T("Lock", "اقفل")) + '">' + (it.locked ? "🔒" : "🔓") + "</button>" +
      '<button type="button" data-bs="del" title="' + esc(T("Delete", "امسح")) + '">🗑</button>';
    pl.appendChild(bar);
  }
  function selAct(k) {
    var it = BT.sel && bItem(BT.sel); if (!it) return;
    var el = nowHost.querySelector('.nb__plane [data-item="' + it.id + '"]');
    if (k === "edit") { if (it.type === "note" && el) el.querySelector(".nt__text").focus(); else if (it.type === "text" && el) bEditText(el); return; }
    if (k === "dup") { bSnap(); var c = JSON.parse(JSON.stringify(it)); c.id = uid(); c.x += 28; c.y += 28; c.locked = false; c.z = bTop(); if (c.type === "timer") { c.running = false; c.endAt = null; } board().items.push(c); bsave(); sfx("pop"); renderNow(); return bSelect(c.id); }
    if (k === "lock") return bLockToggle();
    if (k === "del") {
      if (it.locked) return note(T("It is locked: unlock it first.", "دي مقفولة: افتحها الأول."));
      bSnap(); bDel(it.id); bsave(); renderNow(); note(T("Deleted · ⌘Z / ↶ brings it back", "اتمسحت · ⌘Z أو ↶ ترجّعها"));
    }
  }
  function bEditText(el) { el.setAttribute("contenteditable", "true"); el.focus(); var r = document.createRange(); r.selectNodeContents(el); r.collapse(false); var s2 = window.getSelection(); s2.removeAllRanges(); s2.addRange(r); }
  var nbDrag = null;
  if (nowHost) {
    nowHost.addEventListener("click", function (e) {
      var t = e.target, b;
      if (t.closest("[data-snd]")) { sndOpen = !sndOpen; return renderNow(); }
      if ((b = t.closest("[data-rem-in]"))) { var rf = b.closest("form"); remAdd(rf.elements.text.value, +b.getAttribute("data-rem-in")); rf.reset(); if (document.activeElement) document.activeElement.blur(); return renderNow(); }
      if ((b = t.closest("[data-rem-del]"))) { var rid = b.getAttribute("data-rem-del"); W.reminders = rems().filter(function (x) { return x.id !== rid; }); save(); return; }
      if (t.closest("[data-arc-new]")) { var fn = window.prompt(T("New folder name", "اسم الفولدر الجديد"), ""); if (fn && fn.trim()) arcCall("POST", "folder", { name: fn.trim(), color: ARC_COLORS[(ARC.folders || []).length % ARC_COLORS.length] }).then(function () { sfx("pop"); arcLoad(); }).catch(function (x) { window.alert(x.message); }); return; }
      if ((b = t.closest("[data-arc-open]"))) { ARC.open = +b.getAttribute("data-arc-open"); return arcModalDraw(); }
      if (t.closest("[data-theme-tg]")) {
        var th = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
        if (window.Theme) Theme.apply(th); else { document.documentElement.setAttribute("data-theme", th); try { localStorage.setItem("tools-theme", th); } catch (x) {} }
        return renderNow();
      }
      if ((b = t.closest("[data-wlock]"))) { var wl = boardWidgets()[b.getAttribute("data-wlock")]; wl.locked = !wl.locked; bsave(); return renderNow(); }
      if (t.closest("[data-block]")) return bLockToggle();
      if ((b = t.closest("[data-bs]"))) return selAct(b.getAttribute("data-bs"));
      if (t.closest("[data-bclear]")) {
        var all = board().items, keep = all.filter(function (x) { return x.locked; }), gone = all.length - keep.length;
        if (!gone) return note(T("Nothing to clear here.", "مفيش حاجة تتمسح هنا."));
        if (!window.confirm(T("Delete all " + gone + " items on \"" + board().name + "\"?" + (keep.length ? " (" + keep.length + " locked stay.)" : "") + " You can undo with ⌘Z / ↶ until you leave the page.", "تمسح كل الـ" + gone + " حاجة في \"" + board().name + "\"؟" + (keep.length ? " (" + keep.length + " مقفولين هيفضلوا.)" : "") + " تقدر ترجّعهم بـ ⌘Z أو ↶ طول ما الصفحة مفتوحة."))) return;
        bSnap(); board().items = keep; BT.sel = null; bsave(); sfx("spend"); return renderNow();
      }
      if ((b = t.closest("[data-whide]"))) { var wh = boardWidgets()[b.getAttribute("data-whide")]; if (wh.locked) return note(T("It is locked: unlock it first.", "دي مقفولة: افتحها الأول.")); wh.hidden = true; bsave(); return renderNow(); }
      if (t.closest("[data-wcards]")) { cardsOpen = !cardsOpen; return renderNow(); }
      if ((b = t.closest("[data-wshow]"))) { boardWidgets()[b.getAttribute("data-wshow")].hidden = false; bsave(); renderNow(); return stackCol3(); }
      if (t.closest("[data-al-test]")) { playAlert(); return; }
      if ((b = t.closest("[data-b-export]"))) return bExport(b.getAttribute("data-b-export"));
      if (t.closest("[data-tab-add]")) {
        var nm = window.prompt(T("Name of the new page", "اسم الصفحة الجديدة"), T("Page ", "صفحة ") + boardRoot().tabs.length); if (nm == null) return;
        var R0 = boardRoot(), nt = { id: uid(), name: (nm.trim() || T("Page", "صفحة")).slice(0, 40), items: [] }; R0.tabs.push(nt); sfx("page"); return tabGo(nt.id);
      }
      if ((b = t.closest("[data-tab-del]"))) {
        var tid = b.closest("[data-tab]").getAttribute("data-tab"), R1 = boardRoot(), tb = R1.tabs.filter(function (x) { return x.id === tid; })[0]; if (!tb) return;
        if (!window.confirm(T("Delete the page \"" + tb.name + "\" and everything on it (" + tb.items.length + " items)? This cannot be undone.", "تمسح صفحة \"" + tb.name + "\" وكل اللي عليها (" + tb.items.length + " حاجة)؟ مش هتقدر ترجّعها."))) return;
        R1.tabs = R1.tabs.filter(function (x) { return x.id !== tid; }); delete NBS[tid];
        if (R1.cur === tid) { R1.cur = "main"; NB = NBS.main || { x: 0, y: 0, z: 1 }; undoStack.length = 0; }
        bsave(); return renderNow();
      }
      if ((b = t.closest("[data-tab]"))) {
        var now0 = Date.now(), id0 = b.getAttribute("data-tab");
        if (tabTap && tabTap.id === id0 && now0 - tabTap.t < 400) {   // double tap / double click: rename
          tabTap = null; var tb2 = boardRoot().tabs.filter(function (x) { return x.id === id0; })[0];
          var nn = window.prompt(T("Rename this page", "غيّر اسم الصفحة"), tb2.name); if (nn != null && nn.trim()) { tb2.name = nn.trim().slice(0, 40); bsave(); renderNow(); }
          return;
        }
        tabTap = { id: id0, t: now0 }; if (id0 !== boardRoot().cur) sfx("page"); return tabGo(id0);
      }
      if ((b = t.closest("[data-mt]"))) { FIN.mt = b.getAttribute("data-mt"); if (document.activeElement) document.activeElement.blur(); return renderNow(); }
      if (t.closest("[data-fin-undo]")) return finUndo();
      if ((b = t.closest("[data-fl-step]"))) return flowStep(+b.getAttribute("data-fl-step"));
      if ((b = t.closest("[data-cl-step]"))) { var clx = nowHost.querySelector(".cl"); calMoved = Date.now(); if (clx) clx.scrollBy({ top: +b.getAttribute("data-cl-step") * 30 * CAL_PX, behavior: "smooth" }); return; }
      if (t.closest("[data-cl-now]")) { var cly = nowHost.querySelector(".cl"), nn = new Date(); calMoved = 0; if (cly) cly.scrollTo({ top: Math.max(0, (nn.getHours() * 60 + nn.getMinutes() - calStart) * CAL_PX - 50), behavior: "smooth" }); return; }
      if (t.closest("[data-fl-now]")) { flowMoved = 0; return flowTo(nowHost.querySelector("[data-fl-current]") || nowHost.querySelector(".fl__card"), true); }
      if ((b = t.closest("[data-nb-zoom]"))) { var v = nowHost.querySelector("[data-nb]").getBoundingClientRect(); return nbZoom(+b.getAttribute("data-nb-zoom") > 0 ? 1.15 : 1 / 1.15, v.width / 2, v.height / 2); }
      if (t.closest("[data-nb-fit]")) return nbFit();
      if (t.closest("[data-b-arrange]")) return bArrange();
      if ((b = t.closest("[data-pen]"))) { BT.pen = b.getAttribute("data-pen"); try { localStorage.setItem("now.pen", BT.pen); } catch (x) {} [].forEach.call(nowHost.querySelectorAll("[data-pen]"), function (x) { x.classList.toggle("is-on", x === b); }); return bSetTool("pen"); }
      if ((b = t.closest(".bt__t"))) return bSetTool(b.getAttribute("data-tool"));
      if ((b = t.closest("[data-bcolor]"))) {
        BT.color = b.getAttribute("data-bcolor"); [].forEach.call(nowHost.querySelectorAll(".bt__c"), function (x) { x.classList.toggle("is-on", x === b); });
        var sc = BT.sel && bItem(BT.sel); if (sc && /^(path|rect|ellipse|arrow|text)$/.test(sc.type)) { bSnap(); sc.color = BT.color; bsave(); renderNow(); }
        return;
      }
      if ((b = t.closest("[data-bwidth]"))) {
        BT.width = +b.getAttribute("data-bwidth"); [].forEach.call(nowHost.querySelectorAll(".bt__w"), function (x) { x.classList.toggle("is-on", x === b); });
        var sw = BT.sel && bItem(BT.sel); if (sw && /^(path|rect|ellipse|arrow)$/.test(sw.type)) { bSnap(); sw.w = BT.width; bsave(); bRedrawInk(sw); }
        if (sw && sw.type === "text") { bSnap(); sw.size = { 2: 16, 4: 22, 8: 34 }[BT.width]; bsave(); renderNow(); }
        return;
      }
      if (t.closest("[data-bundo]")) return bUndo();
      if (t.closest("[data-bdel]")) { var sl = BT.sel && bItem(BT.sel); if (sl && sl.locked) { note(T("It is locked: unlock it first.", "دي مقفولة: افتحها الأول.")); return; } if (BT.sel) { bSnap(); bDel(BT.sel); bsave(); renderNow(); } return; }
      if (t.closest("[data-pm-add]")) {
        var vb = nowHost.querySelector("[data-nb]").getBoundingClientRect(); bSnap();
        sfx("pop"); board().items.push({ id: uid(), type: "timer", x: Math.round((vb.width / 2 - 120 - NB.x) / NB.z), y: Math.round((vb.height / 2 - 130 - NB.y) / NB.z), z: bTop(), mode: "focus", len: { focus: 25, short: 5, long: 15 }, left: null, running: false, sound: true, cycles: 0 });
        bsave(); renderNow();
        try { if (window.Notification && Notification.permission === "default") Notification.requestPermission(); } catch (x) {}
        return;
      }
      var el = t.closest("[data-item]"); if (!el) return;
      var it = bItem(el.getAttribute("data-item")); if (!it) return;
      if (t.closest("[data-item-del]")) { if (it.locked) { note(T("It is locked: unlock it first.", "دي مقفولة: افتحها الأول.")); return; } if (it.type === "note" && it.text && !window.confirm(T("Delete this note?", "تمسح النوت دي؟"))) return; bSnap(); bDel(it.id); bsave(); el.remove(); return; }
      if ((b = t.closest("[data-note-color]"))) { bSnap(); it.color = b.getAttribute("data-note-color"); el.style.setProperty("--nc", it.color); [].forEach.call(el.querySelectorAll(".nt__c"), function (x) { x.classList.toggle("is-on", x === b); }); return bsave(); }
      if (it.type === "timer") {
        if (t.closest("[data-pm-go]")) {
          if (it.running) { it.left = pmLeft(it); it.running = false; it.endAt = null; }
          else { it.endAt = Date.now() + pmLeft(it) * 1000; it.running = true; tone([{ f: 660, d: 0.12, t: 0, v: 0.12 }]); }
          bsave(); el.outerHTML = itemHtml(it); return;
        }
        if (t.closest("[data-pm-reset]")) { it.running = false; it.endAt = null; it.left = it.len[it.mode] * 60; bsave(); el.outerHTML = itemHtml(it); return; }
        if ((b = t.closest("[data-pm-mode]"))) { it.mode = b.getAttribute("data-pm-mode"); it.running = false; it.endAt = null; it.left = it.len[it.mode] * 60; bsave(); el.outerHTML = itemHtml(it); return; }
        if (t.closest("[data-pm-sound]")) { it.sound = !it.sound; bsave(); el.outerHTML = itemHtml(it); return; }
      }
    });
    function boardDouble(e) {
      var v = e.target.closest("[data-nb]"); if (!v) return;
      var tx = e.target.closest(".btx"); if (tx) return bEditText(tx);
      if (e.target.closest("[data-item], .bt, [data-w]")) return;
      var p = bPoint(e); bSnap();
      var n = { id: uid(), type: "note", text: "", color: NOTE_COLORS[board().items.length % NOTE_COLORS.length], x: p[0] - 20, y: p[1] - 20, z: bTop() };
      board().items.push(n); bsave(); sfx("pop"); renderNow();
      var ta = nowHost.querySelector('[data-item="' + n.id + '"] .nt__text'); if (ta) ta.focus();
    }
    nowHost.addEventListener("dblclick", boardDouble);
    nowHost.addEventListener("change", function (e) {
      if (e.target.matches("[data-sfx-on]")) { SFX = e.target.checked; try { localStorage.setItem("now.sfx", SFX ? "on" : "off"); } catch (x) {} sfx("click"); return renderNow(); }
      if (e.target.closest(".sndp")) { alChange(e); renderNow(); }
    });
    // a soft 3D click on every button
    nowHost.addEventListener("pointerdown", function (e) { if (e.target.closest("button, a.btn, [data-tab], select, .pm3 button")) sfx("click"); }, true);
    // drag a tab along the strip to reorder the pages
    nowHost.addEventListener("pointerdown", function (e) {
      var tb = e.target.closest("[data-tab]"); if (!tb || e.target.closest("[data-tab-del]")) return;
      tabDrag = { id: tb.getAttribute("data-tab"), el: tb, sx: e.clientX, on: false };
    });
    window.addEventListener("pointermove", function (e) {
      if (!tabDrag) return;
      if (!tabDrag.on && Math.abs(e.clientX - tabDrag.sx) > 8) { tabDrag.on = true; tabDrag.el.classList.add("is-drag"); try { tabDrag.el.setPointerCapture(e.pointerId); } catch (x) {} }
      if (!tabDrag.on) return;
      tabDrag.el.style.transform = "translateX(" + (e.clientX - tabDrag.sx) + "px)";
      var over = document.elementFromPoint(e.clientX, e.clientY), ot = over && over.closest && over.closest("[data-tab]");
      [].forEach.call(nowHost.querySelectorAll("[data-tab]"), function (x) { x.classList.toggle("is-over", x === ot && x !== tabDrag.el); });
    });
    window.addEventListener("pointerup", function (e) {
      if (!tabDrag) return; var d = tabDrag; tabDrag = null; if (!d.on) return;
      tabTap = null;
      var over = document.elementFromPoint(e.clientX, e.clientY), ot = over && over.closest && over.closest("[data-tab]"), R = boardRoot();
      if (ot && ot.getAttribute("data-tab") !== d.id) {
        var from = R.tabs.findIndex(function (x) { return x.id === d.id; }), to = R.tabs.findIndex(function (x) { return x.id === ot.getAttribute("data-tab"); });
        var mv = R.tabs.splice(from, 1)[0]; R.tabs.splice(to, 0, mv); bsave(); sfx("page");
      }
      renderNow();
      // the click that follows a drag must not open the tab
      setTimeout(function () { tabTap = null; }, 0);
    });
    nowHost.addEventListener("input", function (e) {
      var el = e.target.closest("[data-item]"); if (!el) return;
      var it = bItem(el.getAttribute("data-item")); if (!it) return;
      if (e.target.classList.contains("nt__text")) it.text = e.target.value.slice(0, 2000);
      else if (el.classList.contains("btx")) it.text = el.innerText.slice(0, 2000);
      clearTimeout(noteTimer); noteTimer = setTimeout(save, 600);
    });
    nowHost.addEventListener("focusout", function (e) {
      var tx = e.target.closest && e.target.closest(".btx"); if (!tx) return;
      tx.removeAttribute("contenteditable");
      var it = bItem(tx.getAttribute("data-item")); if (it && !String(it.text || "").trim()) { bDel(it.id); tx.remove(); }
      bsave();
    });
    var wheelZ = { f: 1, x: 0, y: 0, px: 0, py: 0, raf: 0, t: 0 };
    nowHost.addEventListener("wheel", function (e) {
      var v = e.target.closest("[data-nb]"); if (!v) return;
      if (e.target.closest(".nt__text, .cl") && !e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      var r = v.getBoundingClientRect();
      var dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY, dx = e.deltaMode === 1 ? e.deltaX * 16 : e.deltaX;
      if (e.ctrlKey || e.metaKey) { wheelZ.f *= Math.exp(-Math.max(-60, Math.min(60, dy)) * 0.006); wheelZ.x = e.clientX - r.left; wheelZ.y = e.clientY - r.top; }
      else { wheelZ.px -= dx; wheelZ.py -= dy; }
      if (!wheelZ.raf) wheelZ.raf = requestAnimationFrame(function () {
        wheelZ.raf = 0; NB.x += wheelZ.px; NB.y += wheelZ.py; wheelZ.px = wheelZ.py = 0;
        if (wheelZ.f !== 1) { var f0 = wheelZ.f; wheelZ.f = 1; nbZoom(f0, wheelZ.x, wheelZ.y, true); } else nbApply();
        clearTimeout(wheelZ.t); wheelZ.t = setTimeout(nbSave, 300);
      });
    }, { passive: false });
    var ERASE_R = 12;
    function eraseAt(e) {
      var seen = {};
      [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7], [0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5]].forEach(function (o) {
        var hit = document.elementFromPoint(e.clientX + o[0] * ERASE_R, e.clientY + o[1] * ERASE_R), el = hit && hit.closest && hit.closest("[data-item]"); if (!el) return;
        var id = el.getAttribute("data-item"); if (seen[id]) return; seen[id] = 1;
        var it = bItem(id); if (!it || it.locked || !/^(path|rect|ellipse|arrow|text)$/.test(it.type)) return;
        bDel(it.id); el.remove(); if (nbDrag) nbDrag.hit = true;
      });
    }
    // the eraser's ring follows the mouse / Pencil
    nowHost.addEventListener("pointermove", function (e) {
      var v = e.target.closest && e.target.closest("[data-nb]"), ring = nowHost.querySelector(".nb__eraser"); if (!ring) return;
      if (!v || BT.tool !== "eraser" || e.pointerType === "touch") { ring.hidden = true; return; }
      var r = v.getBoundingClientRect(); ring.hidden = false; ring.style.transform = "translate(" + (e.clientX - r.left - ERASE_R) + "px," + (e.clientY - r.top - ERASE_R) + "px)";
    });
    nowHost.addEventListener("pointerleave", function () { var ring = nowHost.querySelector(".nb__eraser"); if (ring) ring.hidden = true; });
    /* Pointer input for mouse, finger and Apple Pencil.
       Once a Pencil has touched the board, the Pencil draws (even with the hand tool) and fingers move
       things: one finger pans or drags, two fingers pinch-zoom; a palm resting while the Pencil is down
       is ignored. Without a Pencil, a finger uses the chosen tool like the mouse. Double tap = new note. */
    // on an iPad (a touch screen), only the Pencil writes; a finger only pans, zooms and drags, from the start
    var IPAD = (navigator.maxTouchPoints > 1 && /iPad|Macintosh/.test(navigator.userAgent)) || (window.matchMedia && matchMedia("(pointer: coarse)").matches);
    var TOUCH = {}, penSeen = !!IPAD, penDown = false, pinch = null, lastTap = null;
    function dropDrag() {   // a second finger landed: undo what the first one started
      var d = nbDrag; if (!d) return; nbDrag = null;
      if (d.kind === "pen" || d.kind === "shape") { bDel(d.it.id); var g = nowHost.querySelector('.nb__ink [data-item="' + d.it.id + '"]'); if (g) g.remove(); undoStack.pop(); }
      else if (d.kind === "move") { d.it.x = d.x0; d.it.y = d.y0; d.el.style.left = d.x0 + "px"; d.el.style.top = d.y0 + "px"; if (!/^(note|text|timer)$/.test(d.it.type)) bRedrawInk(d.it); undoStack.pop(); }
      else if (d.kind === "wmove") { d.g.x = d.x0; d.g.y = d.y0; d.el.style.left = d.x0 + "px"; d.el.style.top = d.y0 + "px"; }
      else if (d.kind === "pan" && d.v) d.v.classList.remove("is-pan");
      else if (d.kind === "erase") { if (d.hit) bsave(); else undoStack.pop(); }
    }
    function pinchState(v) {
      var ids = Object.keys(TOUCH), a = TOUCH[ids[0]], b = TOUCH[ids[1]], r = v.getBoundingClientRect();
      return { d: Math.max(10, Math.hypot(a.x - b.x, a.y - b.y)), mx: (a.x + b.x) / 2 - r.left, my: (a.y + b.y) / 2 - r.top };
    }
    nowHost.addEventListener("pointerdown", function (e) {
      var v = e.target.closest("[data-nb]"); if (!v) return;
      var kind = e.pointerType || "mouse", b;
      if (kind === "mouse" && e.button !== 0) return;
      if (kind === "pen") { penSeen = true; penDown = true; }
      if (kind === "touch") {
        if (penDown) { e.preventDefault(); return; }   // palm while writing
        TOUCH[e.pointerId] = { x: e.clientX, y: e.clientY };
        var n = Object.keys(TOUCH).length;
        if (n === 2) { dropDrag(); var ps = pinchState(v); pinch = { v: v, d0: ps.d, mx0: ps.mx, my0: ps.my, z0: NB.z, x0: NB.x, y0: NB.y }; try { v.setPointerCapture(e.pointerId); } catch (x) {} e.preventDefault(); return; }
        if (n > 2) { e.preventDefault(); return; }
      }
      if (e.target.closest("button, input, select, a, label, .bt, .btabs, .sndp, .bsel, [contenteditable='true']")) return;
      if (kind === "pen") e.preventDefault();   // no text selection or callout from the Pencil
      var penWrites = kind === "pen" && /^(select|pen)$/.test(BT.tool);
      var ta = e.target.tagName === "TEXTAREA" ? e.target : null;
      if (penWrites) ta = null;
      if (ta && document.activeElement === ta) return;   // already writing in it
      var wEl = penWrites || /^(eraser|rect|ellipse|arrow)$/.test(BT.tool) && kind !== "touch" ? null : e.target.closest("[data-w]");
      if (wEl) {
        var wg0 = boardWidgets()[wEl.getAttribute("data-w")];
        if (!wg0.locked && !(kind === "touch" && e.target.closest(".cl"))) {
          var wg = wg0;
          wg.z = bTop(); wEl.style.zIndex = wg.z;
          nbDrag = { kind: "wmove", pid: e.pointerId, g: wg, el: wEl, sx: e.clientX, sy: e.clientY, x0: wg.x, y0: wg.y, moved: false };
          try { v.setPointerCapture(e.pointerId); } catch (x) {}
          e.preventDefault(); return;
        }
        // a locked card: the calendar still scrolls, a finger or mouse pans the board
        if (kind === "touch" && e.target.closest(".cl")) return;
        nbDrag = { kind: "pan", pid: e.pointerId, ptype: kind, v: v, sx: e.clientX, sy: e.clientY, x0: NB.x, y0: NB.y, moved: false };
        try { v.setPointerCapture(e.pointerId); } catch (x) {}
        e.preventDefault(); return;
      }
      var tool = BT.tool, p = bPoint(e), el = penWrites ? null : e.target.closest("[data-item]"), it;
      if ((b = e.target.closest("[data-resize]")) && kind !== "pen") {   // resize a note from its corner
        var rit = bItem(b.closest("[data-item]").getAttribute("data-item")), rel = b.closest("[data-item]");
        if (rit && !rit.locked) { bSnap(); nbDrag = { kind: "resize", pid: e.pointerId, it: rit, el: rel, sx: e.clientX, sy: e.clientY, w0: rel.offsetWidth, h0: rel.offsetHeight, moved: true }; try { v.setPointerCapture(e.pointerId); } catch (x) {} e.preventDefault(); return; }
      }
      if (kind === "pen" && tool === "select") tool = "pen";                                        // the Pencil writes
      if (kind === "touch" && penSeen && /^(pen|rect|ellipse|arrow|eraser)$/.test(tool)) tool = "select";   // fingers move
      if (tool === "select") {
        if (el) {
          it = bItem(el.getAttribute("data-item")); if (!it) return;
          bSelect(it.id);
          if (it.locked) nbDrag = { kind: "pan", pid: e.pointerId, ptype: kind, v: v, ta: ta, sx: e.clientX, sy: e.clientY, x0: NB.x, y0: NB.y, moved: false };
          else { bSnap(); it.z = bTop(); el.style.zIndex = it.z; nbDrag = { kind: "move", pid: e.pointerId, ptype: kind, it: it, el: el, ta: ta, sx: e.clientX, sy: e.clientY, x0: it.x, y0: it.y, moved: false }; }
        } else { bSelect(null); nbDrag = { kind: "pan", pid: e.pointerId, ptype: kind, v: v, sx: e.clientX, sy: e.clientY, x0: NB.x, y0: NB.y, moved: false }; v.classList.add("is-pan"); }
      } else if (tool === "note" || tool === "text") {
        bSnap();
        it = tool === "note" ? { id: uid(), type: "note", text: "", color: NOTE_COLORS[board().items.length % NOTE_COLORS.length], x: p[0] - 20, y: p[1] - 20, z: bTop() }
          : { id: uid(), type: "text", text: "", color: BT.color, size: { 2: 16, 4: 22, 8: 34 }[BT.width] || 22, x: p[0], y: p[1] - 14, z: bTop() };
        board().items.push(it); bsave(); sfx("pop"); bSetTool("select"); renderNow(); bSelect(it.id);
        var nel = nowHost.querySelector('[data-item="' + it.id + '"]');
        if (nel) { if (it.type === "note") nel.querySelector(".nt__text").focus(); else bEditText(nel); }
        e.preventDefault(); return;
      } else if (tool === "pen") {
        var pressureOn = BT.pen === "fountain" || BT.pen === "brush";
        bSnap(); it = { id: uid(), type: "path", pen: BT.pen, x: p[0], y: p[1], pts: [pressureOn ? [0, 0, kind === "pen" ? +(e.pressure || 0.5).toFixed(2) : 0.5] : [0, 0]], color: BT.color, w: BT.width, z: BT.pen === "hl" ? 0 : 1 };
        board().items.push(it); bRedrawInk(it); nbDrag = { kind: "pen", pid: e.pointerId, ptype: kind, it: it, pr: pressureOn };
      } else if (/^(rect|ellipse|arrow)$/.test(tool)) {
        bSnap(); it = { id: uid(), type: tool, x: p[0], y: p[1], dx: 0, dy: 0, color: BT.color, w: BT.width, z: 1 };
        board().items.push(it); bRedrawInk(it); nbDrag = { kind: "shape", pid: e.pointerId, it: it };
      } else if (tool === "eraser") { bSnap(); nbDrag = { kind: "erase", pid: e.pointerId, hit: false }; eraseAt(e); }
      try { v.setPointerCapture(e.pointerId); } catch (x) {}
      e.preventDefault();
    });
    nowHost.addEventListener("pointermove", function (e) {
      if (e.pointerType === "touch" && TOUCH[e.pointerId]) {
        TOUCH[e.pointerId] = { x: e.clientX, y: e.clientY };
        if (pinch && Object.keys(TOUCH).length >= 2) {
          var ps = pinchState(pinch.v), z = Math.max(ZMIN, Math.min(ZMAX, pinch.z0 * ps.d / pinch.d0));
          var px = (pinch.mx0 - pinch.x0) / pinch.z0, py = (pinch.my0 - pinch.y0) / pinch.z0;   // the board point under the fingers
          NB.z = z; NB.x = ps.mx - px * z; NB.y = ps.my - py * z; nbApply(); return;
        }
      }
      if (!nbDrag) return;
      var d = nbDrag, it = d.it;
      if (d.pid != null && e.pointerId !== d.pid) return;
      if (d.kind === "resize") {
        it.w = Math.max(140, Math.round(d.w0 + (e.clientX - d.sx) / NB.z)); it.h = Math.max(110, Math.round(d.h0 + (e.clientY - d.sy) / NB.z));
        d.el.style.width = it.w + "px"; d.el.style.height = it.h + "px"; return;
      }
      if (d.kind === "wmove") {
        var wx = (e.clientX - d.sx) / NB.z, wy = (e.clientY - d.sy) / NB.z; if (Math.abs(wx) + Math.abs(wy) > 2) d.moved = true;
        d.g.x = Math.round(d.x0 + wx); d.g.y = Math.round(d.y0 + wy); d.el.style.left = d.g.x + "px"; d.el.style.top = d.g.y + "px"; return;
      }
      if (d.kind === "move") {
        var dx = (e.clientX - d.sx) / NB.z, dy = (e.clientY - d.sy) / NB.z; if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
        if (!d.moved) return;
        it.x = Math.round(d.x0 + dx); it.y = Math.round(d.y0 + dy);
        if (/^(note|text|timer)$/.test(it.type)) { d.el.style.left = it.x + "px"; d.el.style.top = it.y + "px"; } else bRedrawInk(it);
      } else if (d.kind === "pan") { if (Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy) > 4) d.moved = true; NB.x = d.x0 + e.clientX - d.sx; NB.y = d.y0 + e.clientY - d.sy; nbApply(); }
      else if (d.kind === "pen") {
        // every sample the Pencil gave since the last frame (up to 240 a second), with its pressure
        var evs = e.getCoalescedEvents ? e.getCoalescedEvents() : null; if (!evs || !evs.length) evs = [e];
        var added = false, minGap = d.ptype === "pen" ? 0.8 : 1.5;
        evs.forEach(function (ce) {
          var pp = bPoint(ce), last = it.pts[it.pts.length - 1], q = [pp[0] - it.x, pp[1] - it.y];
          if (Math.hypot(q[0] - last[0], q[1] - last[1]) * NB.z >= minGap) {
            if (d.pr) {   // a mouse has no pressure: speed thins the line a little, like ink
              var sp = d.ptype === "pen" ? null : Math.min(1, Math.hypot(q[0] - last[0], q[1] - last[1]) * NB.z / 30);
              q.push(+(d.ptype === "pen" ? (ce.pressure || 0.5) : 0.62 - sp * 0.3).toFixed(2));
            }
            it.pts.push(q); added = true;
          }
        });
        if (added) bRedrawSoon(it);
      } else if (d.kind === "shape") { var p2 = bPoint(e); it.dx = p2[0] - it.x; it.dy = p2[1] - it.y; bRedrawSoon(it); }
      else if (d.kind === "erase") eraseAt(e);
    });
    var nbUp = function (e) {
      if (e && e.pointerId != null) {
        if (e.pointerType === "pen") penDown = false;
        if (TOUCH[e.pointerId]) { delete TOUCH[e.pointerId]; if (pinch && Object.keys(TOUCH).length < 2) { pinch = null; nbSave(); return; } }
        if (nbDrag && nbDrag.pid != null && e.pointerId !== nbDrag.pid) return;
      } else { TOUCH = {}; pinch = null; penDown = false; }
      if (!nbDrag) return;
      var d = nbDrag; nbDrag = null;
      // a tap that did not move: two quick taps in the same spot = a double click (new note, edit text)
      if (e && e.type === "pointerup" && (d.kind === "pan" || d.kind === "move") && !d.moved && d.ptype && d.ptype !== "mouse") {
        var now = Date.now();
        if (lastTap && now - lastTap.t < 350 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 30) {
          lastTap = null; if (d.kind === "pan") d.v.classList.remove("is-pan"); else undoStack.pop();
          var hit = document.elementFromPoint(e.clientX, e.clientY);
          if (hit) boardDouble({ target: hit, clientX: e.clientX, clientY: e.clientY });
          return;
        }
        lastTap = { t: now, x: e.clientX, y: e.clientY };
      }
      if (d.ta && !d.moved) { try { d.ta.focus(); } catch (x) {} }
      if (d.kind === "wmove" || d.kind === "resize") { bsave(); return; }
      if (d.kind === "move") { if (!d.moved) undoStack.pop(); else bsave(); }
      else if (d.kind === "pan") { d.v.classList.remove("is-pan"); nbSave(); }
      else if (d.kind === "pen") { cancelAnimationFrame(inkRaf[d.it.id]); inkRaf[d.it.id] = 0; if (d.it.pts.length >= 2) bRedrawInk(d.it); if (d.it.pts.length < 2) { bDel(d.it.id); var g = nowHost.querySelector('.nb__ink [data-item="' + d.it.id + '"]'); if (g) g.remove(); undoStack.pop(); } else bsave(); }
      else if (d.kind === "shape") { if (Math.abs(d.it.dx) + Math.abs(d.it.dy) < 8) { bDel(d.it.id); var g2 = nowHost.querySelector('.nb__ink [data-item="' + d.it.id + '"]'); if (g2) g2.remove(); undoStack.pop(); } else bsave(); }
      else if (d.kind === "erase") { if (d.hit) bsave(); else undoStack.pop(); }
    };
    nowHost.addEventListener("pointerup", nbUp); nowHost.addEventListener("pointercancel", nbUp);
    window.addEventListener("pointerup", nbUp); window.addEventListener("pointercancel", nbUp); window.addEventListener("blur", function () { nbUp(null); });
    // iPad Safari: no page pinch / long-press menu on the board
    nowHost.addEventListener("gesturestart", function (e) { if (e.target.closest && e.target.closest("[data-nb]")) e.preventDefault(); });
    nowHost.addEventListener("contextmenu", function (e) { if (e.target.closest("[data-nb]") && !e.target.closest("textarea, input, [contenteditable='true']")) e.preventDefault(); });
    // keyboard: tools, delete, undo (not while typing)
    document.addEventListener("keydown", function (e) {
      if (!nowHost.querySelector("[data-nb]")) return;
      var a = document.activeElement, typing = a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable);
      if (typing) { if (e.key === "Escape") a.blur(); return; }
      if ((e.metaKey || e.ctrlKey) && (e.key === "z" || e.key === "Z")) { e.preventDefault(); return bUndo(); }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (String(e.key).toLowerCase() === "l") return bLockToggle();
      if ((e.key === "Delete" || e.key === "Backspace") && BT.sel) { e.preventDefault(); var lk = bItem(BT.sel); if (lk && lk.locked) return note(T("It is locked: unlock it first.", "دي مقفولة: افتحها الأول.")); bSnap(); bDel(BT.sel); bsave(); return renderNow(); }
      if (e.key === "Escape") { bSelect(null); return bSetTool("select"); }
      var map = { v: "select", n: "note", t: "text", p: "pen", r: "rect", o: "ellipse", a: "arrow", e: "eraser" }, k = map[String(e.key).toLowerCase()];
      if (k) bSetTool(k);
    });
    nowHost.addEventListener("submit", function (e) {
      var f = e.target; e.preventDefault();
      if (f.matches("[data-rem]")) {
        e.preventDefault();
        var mins0 = (+f.elements.h.value || 0) * 60 + (+f.elements.m.value || 0);
        if (!(mins0 > 0)) { note(T("Write hours or minutes.", "اكتب ساعات أو دقايق.")); return; }
        remAdd(f.elements.text.value, mins0); f.reset(); if (document.activeElement) document.activeElement.blur(); return renderNow();
      }
      if (f.matches("[data-money]")) {
        var amt = +String(f.elements.amount.value).replace(",", "."); if (!(amt > 0)) return;
        sfx(FIN.mt === "income" ? "coin" : "spend");
        finAdd(FIN.mt === "income" ? "income" : "expense", amt, f.elements.cur.value, f.elements.note.value.trim(), f.elements.bucket ? f.elements.bucket.value : "essentials");
        return;
      }
      if (f.matches("[data-meetnow]")) {
        var tz2 = ""; try { tz2 = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (x) {}
        var body = { client_id: +f.elements.client.value, local: f.elements.date.value + "T" + f.elements.time.value, timezone: tz2, duration_min: +f.elements.dur.value, topic: f.elements.topic.value.trim() };
        if (!body.client_id || !f.elements.time.value) return;
        fetch("/api/sessions?resource=meetings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
          .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
          .then(function (x) {
            if (!x.ok) { window.alert((x.d && x.d.error) || T("The meeting was not added.", "الميعاد ما اتضافش.")); return; }
            note(T("Meeting added ✓", "الميعاد اتضاف ✓")); f.reset(); loadMeetings(); setTimeout(gcSync, 1500);
          }).catch(function () { window.alert(T("No connection", "مفيش نت")); });
      }
    });
  }

  function placeCard() {
    var tp = document.querySelector('.tabpanel[data-tabpanel="today"]'), wp = document.querySelector('.tabpanel[data-tabpanel="week"]');
    var want = tp && !tp.hidden ? "today" : "week", box = want === "today" ? tp : wp;
    if (!box) return;
    // in Today: under the prayer times, above everything else
    if (want === "today" && host.parentNode !== box) { var pr = box.querySelector(".today-prayers"); box.insertBefore(host, pr ? pr.nextSibling : box.firstChild); }
    if (want === "week" && host.parentNode !== box) box.appendChild(host);
    if (want !== mode) { mode = want; viewOff = 0; editing = null; if (W) render(); }
  }
  ["today", "week"].forEach(function (n) {
    var el = document.querySelector('.tabpanel[data-tabpanel="' + n + '"]');
    if (el && window.MutationObserver) new MutationObserver(placeCard).observe(el, { attributes: true, attributeFilter: ["hidden"] });
  });
  placeCard();

  load(function () {
    if (moved) { moved = false; save(); }
    render(); loadMeetings();
    window.MyWeek.ready = true;
    try { window.dispatchEvent(new CustomEvent("myweek:ready")); } catch (e) {}
    setInterval(function () { if (!editing && !drag) render(); checkAlert(); }, 20000);
    gcStatus();
    if (nowHost) {
      renderNow(); finLoad(); clientsLoad();
      setInterval(function () { var np = document.querySelector('.tabpanel[data-tabpanel="now"]'); if (!np || !np.hidden) tickNow(); }, 1000);
      setInterval(finLoad, 5 * 60000);
    }
    setInterval(function () { gcEvents(); gcSync(); }, 10 * 60000);
    try {
      var gq = new URLSearchParams(location.search).get("gcal");
      if (gq) { note(gq === "ok" ? T("Google Calendar connected ✓", "جوجل كالندر اتربط ✓") : T("Google Calendar was not connected (" + gq + ")", "جوجل كالندر ما اتربطش (" + gq + ")")); history.replaceState(null, "", location.pathname); }
    } catch (e) {}
    checkAlert();
    setInterval(loadMeetings, 10 * 60000);
  });
})();
