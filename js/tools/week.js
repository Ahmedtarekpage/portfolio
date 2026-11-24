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
    if (x.kind === "meet" || x.kind === "prep") return "client";
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
  function save() {
    doc.week = W;
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
      (viewOff ? "" : alertBar()) +
      '<div class="today-bar"><span>' + esc(viewOff
        ? (ov ? T("✎ Tomorrow is planned, the week is as it was", "✎ بكرة متخطط، والأسبوع زي ما هو") : T("Tomorrow from My week. Change anything: it changes tomorrow only", "بكرة من أسبوعي. عدّل أي حاجة: بتتغير بكرة بس"))
        : (ov ? T("✎ Changed for today only, the week is as it was", "✎ متعدّل للنهارده بس، والأسبوع زي ما هو") : T("From My week. Change anything: it changes today only", "من أسبوعي. عدّل أي حاجة: بتتغير النهارده بس"))) + (doneN && !viewOff ? " · ✓ " + doneN : "") + "</span>" +
      (ov ? '<button type="button" class="btn btn--ghost btn--sm" data-reset-today>↺ ' + esc(T("Back to the week", "رجّعه زي الأسبوع")) + "</button>" : "") +
      '<button type="button" class="btn btn--ghost btn--sm" data-to-week>🗓️ ' + esc(T("Edit the week", "عدّل الأسبوع")) + "</button></div>";
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
  host.addEventListener("change", function (e) {
    var el = e.target;
    if (el.matches("[data-al-on]")) { AL.on = el.checked; alSave(); if (AL.on) { try { if (window.Notification && Notification.permission === "default") Notification.requestPermission(); } catch (x) {} } return render(); }
    if (el.matches("[data-al-before]")) { AL.before = Math.max(0, Math.min(60, Math.round(+el.value) || 0)); alSave(); return; }
    if (el.matches("[data-al-sound]")) { AL.sound = el.value; alSave(); return render(); }
    if (el.matches("[data-al-file]") && el.files && el.files[0]) {
      var f = el.files[0];
      if (f.size > 3 * 1024 * 1024) { window.alert(T("Please choose a file under 3 MB.", "اختار ملف أقل من 3 ميجا.")); return; }
      var rd = new FileReader();
      rd.onload = function () { try { localStorage.setItem("week.alert.file", rd.result); note(T("Saved: your adhan sound", "اتحفظ صوت الأذان بتاعك")); playAlert(); } catch (x) { window.alert(T("This browser could not keep the file; try a shorter one.", "المتصفح ما قدرش يحفظ الملف؛ جرّب واحد أقصر.")); } render(); };
      rd.readAsDataURL(f);
    }
  });
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
    checkAlert();
    setInterval(loadMeetings, 10 * 60000);
  });
})();
