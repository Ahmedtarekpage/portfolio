/* My week, on /time.

   The weekly routine used to sit in the product desk as "Today's blocks". It is
   a plan for the owner's whole life, not for one product, so it lives here:

     - a strip of seven days, each labelled with what that day is FOR
     - the chosen day's list, drawn as tickets (same look the desk had)
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
  var doc = {}, rev = "", W = null, saveTimer = null, status = "";
  var todayDow = new Date().getDay(), sel = todayDow, editing = null, drag = null;

  // Saturday first: the week starts with the fix day
  var ORDER = [6, 0, 1, 2, 3, 4, 5];
  var DAY = {
    6: { en: "Sat", ar: "السبت", ico: "🛠️", fen: "Fix", far: "تصليح", len: "Solve the problems in your products", lar: "حل مشاكل المنتجات" },
    0: { en: "Sun", ar: "الأحد", ico: "🤝", fen: "Sell", far: "بيع", len: "Selling and follow-up only: current clients, then new ones", lar: "بيع ومتابعة بس: العملاء الحاليين وبعدهم الجدد" },
    1: { en: "Mon", ar: "الاثنين", ico: "✍️", fen: "Build · Write", far: "بناء · كتابة", len: "Build the product; every 3rd week write the scripts", lar: "بناء المنتج؛ وكل تالت أسبوع كتابة السكريبتات" },
    2: { en: "Tue", ar: "الثلاثاء", ico: "🎥", fen: "Shoot", far: "تصوير", len: "Film the week's 6 videos in one sitting", lar: "تصوير 6 فيديوهات الأسبوع في قعدة واحدة" },
    3: { en: "Wed", ar: "الأربعاء", ico: "🎙️", fen: "Edit · Search", far: "مونتاج · بحث", len: "Voice-over, montage, scheduling, then one search page", lar: "تعليق صوتي ومونتاج وجدولة، وبعدها صفحة بحث واحدة" },
    4: { en: "Thu", ar: "الخميس", ico: "🌊", fen: "Close · Life", far: "قفل · حياتي", len: "Company posts with AI, money check, your life and next week", lar: "بوستات الشركات بالذكاء الاصطناعي، الفلوس، حياتك، والأسبوع الجاي" },
    5: { en: "Fri", ar: "الجمعة", ico: "🌿", fen: "Rest", far: "راحة", len: "Rest. Nothing is planned", lar: "راحة. مفيش حاجة متخططة" }
  };

  function uid() { return "w" + Math.random().toString(36).slice(2, 9); }
  function it(from, to, en, ar, more) {
    var o = { id: uid(), from: from, to: to, en: en, ar: ar };
    if (more) for (var k in more) o[k] = more[k];
    return o;
  }
  function seed() {
    var cmt = function () { return it("18:00", "18:30", "Answer comments and messages on today's posts", "رد على التعليقات والرسايل على بوستات النهارده"); };
    var job = function () { return it("08:00", "09:00", "🎯 5 job applications, each one fitted to the role", "🎯 5 تقديمات وظايف، كل واحد متظبط على الوظيفة"); };
    return { v: 1, jobs: { daily: 5, log: {} }, days: {
      6: [
        job(),
        it("09:00", "13:45", "🔴 Fix the queue, top first. Screen recording on", "🔴 صلّح الطابور من فوق. تسجيل الشاشة شغال"),
        it("13:45", "14:30", "Test on the live site, take the after screenshot", "جرّب على الموقع الحقيقي وخد سكرين بعد التصليح"),
        it("14:30", "15:00", "Write the story of the week: what was broken, how you fixed it", "اكتب حكاية الأسبوع: إيه اللي كان بايظ وصلّحته إزاي")
      ],
      0: [
        job(),
        it("09:00", "10:00", "Inbox: answer everything from Friday and Saturday", "رد على كل رسايل الجمعة والسبت"),
        it("10:00", "11:30", "🇦🇪 Follow up with current UAE clients (calls, WhatsApp)", "🇦🇪 متابعة عملاء الإمارات الحاليين (مكالمات، واتساب)"),
        it("11:30", "13:00", "🇦🇪 New clients: messages + write cold emails (they send Tue 08:00)", "🇦🇪 عملاء جدد: رسايل + كتابة الإيميلات الباردة (بتتبعت الثلاثاء 8:00)"),
        it("17:00", "18:00", "🇪🇬 Follow up with paying GoBachaloria students (15:00 Cairo)", "🇪🇬 متابعة طلبة GoBachaloria الدافعين (3:00 القاهرة)"),
        it("18:00", "19:00", "🇪🇬 New clients: tried it, did not pay (16:00 Cairo)", "🇪🇬 عملاء جدد: جرّبوا وما دفعوش (4:00 القاهرة)"),
        it("19:00", "19:30", "🇪🇬 New clients: parents and teachers, if time is left", "🇪🇬 عملاء جدد: أولياء أمور ومدرسين لو فضل وقت")
      ],
      1: [
        job(),
        it("09:00", "10:00", "Customers first: replies to Sunday's messages", "العملاء الأول: ردود على رسايل الأحد"),
        it("10:00", "14:30", "✍️ Script day: 18 video scripts (9 English, 9 Arabic) + 6 LinkedIn posts", "✍️ يوم السكريبتات: 18 سكريبت فيديو (9 إنجليزي، 9 عربي) + 6 بوستات LinkedIn", { every: 3, from0: "2026-11-30" }),
        it("10:00", "13:00", "Build GoBachaloria, screen recording on", "بناء GoBachaloria وتسجيل الشاشة شغال"),
        it("14:00", "17:00", "Build GoBachaloria, then one hour for Techmakerz", "بناء GoBachaloria وبعده ساعة لـTechmakerz"),
        cmt()
      ],
      2: [
        job(),
        it("08:00", "08:05", "Cold emails go out on their own (scheduled on Sunday)", "الإيميلات الباردة بتتبعت لوحدها (متجدولة من الأحد)"),
        it("09:00", "10:00", "Calls to new UAE businesses, answer email replies", "مكالمات لشركات جديدة في الإمارات ورد على الإيميلات"),
        it("10:00", "13:00", "🎥 Shoot 6 videos: 3 English, then 3 Arabic", "🎥 صوّر 6 فيديوهات: 3 إنجليزي وبعدهم 3 عربي"),
        it("14:00", "17:00", "Build GoBachaloria and Techmakerz", "بناء GoBachaloria وTechmakerz"),
        cmt()
      ],
      3: [
        job(),
        it("09:00", "10:00", "Customers first", "العملاء الأول"),
        it("10:00", "15:00", "🎙️ Voice-over, montage, schedule next week's 6 videos", "🎙️ تعليق صوتي، مونتاج، وجدولة 6 فيديوهات الأسبوع الجاي"),
        it("15:00", "17:00", "🔎 Search (Google + AI answers): one page that answers one real question", "🔎 البحث (جوجل + إجابات الذكاء الاصطناعي): صفحة واحدة بتجاوب سؤال حقيقي واحد"),
        cmt()
      ],
      4: [
        job(),
        it("09:00", "10:00", "Customers first", "العملاء الأول"),
        it("10:00", "12:30", "🤖 13 company posts with AI: GoBachaloria 5, Techmakerz 3, Ashrhly 3, Elhesab 2", "🤖 13 بوست للشركات بالذكاء الاصطناعي: GoBachaloria 5، Techmakerz 3، Ashrhly 3، Elhesab 2"),
        it("12:30", "13:00", "Read the week's numbers", "اقرا أرقام الأسبوع"),
        it("14:00", "15:00", "💰 Money check in Floosy", "💰 مراجعة الفلوس في Floosy"),
        it("15:00", "16:00", "🧭 Your life: look back, 3 personal goals, book English sessions", "🧭 حياتك: راجع الأسبوع، 3 أهداف شخصية، واحجز جلسات الإنجليزي"),
        it("16:00", "16:30", "Plan next week's work", "خطة شغل الأسبوع الجاي"),
        cmt()
      ],
      5: []
    } };
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
  function list() { if (!W.days[sel]) W.days[sel] = []; return W.days[sel]; }

  // an every-N row: is this one of its weeks, and if not, when is the next
  function turn(x) {
    if (!(x.every > 1) || !x.from0) return null;
    var a = new Date(x.from0 + "T00:00:00"), now = new Date(); now.setHours(0, 0, 0, 0);
    var day = new Date(now); day.setDate(day.getDate() + ((sel - day.getDay() + 7) % 7));
    var weeks = Math.floor((day - a) / 6048e5);
    var k = weeks < 0 ? 0 : Math.ceil(weeks / x.every) * x.every;
    var next = new Date(a); next.setDate(next.getDate() + k * 7);
    return { on: weeks >= 0 && weeks % x.every === 0, next: next };
  }

  /* ---------- storage ---------- */
  function adopt(d) {
    doc = d && typeof d === "object" && !Array.isArray(d) ? d : {};
    W = doc.week && doc.week.v === 1 && doc.week.days ? doc.week : seed();
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
  function row(x) {
    var now = new Date(), hm = ("0" + now.getHours()).slice(-2) + ":" + ("0" + now.getMinutes()).slice(-2);
    var tn = turn(x), off = tn && !tn.on;
    var live = sel === todayDow && !off && x.from && x.to && hm >= x.from && hm < x.to;
    var past = sel === todayDow && x.to && hm >= x.to;
    if (editing === x.id) {
      return '<li class="week-row is-edit" data-id="' + x.id + '"><form class="week-form">' +
        '<div class="week-form__time" dir="ltr"><input type="time" name="from" value="' + esc(x.from || "") + '" aria-label="' + esc(T("From", "من")) + '"><span>–</span><input type="time" name="to" value="' + esc(x.to || "") + '" aria-label="' + esc(T("To", "لحد")) + '"></div>' +
        '<input type="text" name="text" maxlength="140" value="' + esc(x.text || T(x.en, x.ar)) + '" placeholder="' + esc(T("What is this time for?", "الوقت ده لإيه؟")) + '" aria-label="' + esc(T("What the time is for", "الوقت ده لإيه")) + '">' +
        '<div class="week-form__acts"><button class="btn btn--primary btn--sm" type="submit">' + esc(T("Save", "احفظ")) + '</button><button class="btn btn--ghost btn--sm" type="button" data-cancel>' + esc(T("Cancel", "إلغاء")) + "</button></div></form></li>";
    }
    return '<li class="week-row' + (live ? " is-now" : "") + (past ? " is-past" : "") + (off ? " is-later" : "") + '" data-id="' + x.id + '">' +
      '<button type="button" class="week-row__grip" data-drag aria-label="' + esc(T("Drag to move", "اسحب عشان تنقل")) + '" title="' + esc(T("Drag to move", "اسحب عشان تنقل")) + '">⠿</button>' +
      '<b dir="ltr" class="tx' + tex(x.id) + '"><strong>' + esc(x.from || "--:--") + "</strong>" + (x.to ? "<small>→ " + esc(x.to) + "</small>" : "") + "</b>" +
      "<span>" + esc(x.text || T(x.en, x.ar)) +
        (tn ? ' <i class="week-row__turn">' + esc(tn.on ? T("this week", "الأسبوع ده") : T("next: ", "الجاي: ") + tn.next.toLocaleDateString(window.I18N && I18N.loc ? I18N.loc("en-GB") : "en-GB", { day: "numeric", month: "short" })) + "</i>" : "") + "</span>" +
      (live ? '<i class="badge">' + esc(T("now", "دلوقتي")) + "</i>" : "") +
      '<span class="week-row__acts"><button type="button" class="iconbtn" data-edit aria-label="' + esc(T("Edit", "عدّل")) + '" title="' + esc(T("Edit", "عدّل")) + '">✎</button>' +
      '<button type="button" class="iconbtn" data-del aria-label="' + esc(T("Delete", "امسح")) + '" title="' + esc(T("Delete", "امسح")) + '">✕</button></span></li>';
  }

  function render() {
    var d = DAY[sel], items = list();
    host.innerHTML =
      '<div class="card__head week__head"><h2>🗓️ ' + esc(T("My week", "أسبوعي")) + '</h2><span class="muted week__status">' + esc(status) + "</span></div>" +
      jobsCard() +
      '<p class="week__kicker">' + esc(T("What each day is for", "كل يوم معمول لإيه")) + "</p>" +
      '<div class="week-days" role="tablist">' + ORDER.map(function (n) {
        var x = DAY[n];
        return '<button type="button" role="tab" class="week-day' + (n === sel ? " is-on" : "") + (n === todayDow ? " is-today" : "") + '" data-day="' + n + '" aria-selected="' + (n === sel) + '">' +
          "<small>" + esc(T(x.en, x.ar)) + "</small><em>" + x.ico + "</em><b>" + esc(T(x.fen, x.far)) + "</b></button>";
      }).join("") + "</div>" +
      '<p class="week__for"><b>' + esc(T(d.en, d.ar)) + ":</b> " + esc(T(d.len, d.lar)) + "</p>" +
      (items.length ? '<ol class="week-list">' + items.map(row).join("") + "</ol>" : '<p class="muted week__empty">' + esc(T("Nothing planned for this day.", "مفيش حاجة متخططة لليوم ده.")) + "</p>") +
      '<div class="week__foot"><button type="button" class="btn btn--ghost btn--sm" data-add>+ ' + esc(T("Add a time", "ضيف وقت")) + "</button>" +
        '<span class="muted">' + esc(T("Drag ⠿ to reorder", "اسحب ⠿ عشان ترتّب")) + "</span></div>" +
      '<div class="week-post"><span class="week-chip week-chip--uae">🇦🇪 ' + esc(T("Post, UAE time: LinkedIn Wed Thu Fri 16:00 · Instagram Tue Wed Thu 09:00", "النشر بتوقيت الإمارات: LinkedIn الأربعاء والخميس والجمعة 4:00 · Instagram الثلاثاء والأربعاء والخميس 9:00")) + "</span>" +
        '<span class="week-chip week-chip--egy">🇪🇬 ' + esc(T("Post, Egypt time: TikTok Sat 13:00 · Sun 09:00 · Mon 13:00", "النشر بتوقيت مصر: TikTok السبت 1:00 · الأحد 9:00 · الاثنين 1:00")) + "</span></div>" +
      '<details class="week-pic"><summary>🖼️ ' + esc(T("The whole week as one picture", "الأسبوع كله في صورة واحدة")) + "</summary>" +
        '<a href="/assets/week/routine-waterfall-k7q2.png" target="_blank" rel="noopener"><img loading="lazy" src="/assets/week/routine-waterfall-k7q2.png" alt="' + esc(T("Weekly routine waterfall", "شلال الروتين الأسبوعي")) + '"></a>' +
        '<div class="week-pic__acts">' +
          '<a class="btn btn--primary btn--sm" href="/assets/week/routine-waterfall-k7q2.png" download="my-week.png">⬇ ' + esc(T("Download the week", "نزّل صورة الأسبوع")) + "</a>" +
          '<a class="btn btn--ghost btn--sm" href="/assets/week/monday-script-day-k7q2.png" download="monday-script-day.png">⬇ ' + esc(T("Monday: script day", "الاثنين: يوم السكريبتات")) + "</a>" +
          '<a class="btn btn--ghost btn--sm" href="/assets/week/thursday-close-week-k7q2.png" download="thursday-close-week.png">⬇ ' + esc(T("Thursday: close the week", "الخميس: قفل الأسبوع")) + "</a>" +
        "</div></details>";
  }

  /* ---------- actions ---------- */
  host.addEventListener("click", function (e) {
    var t = e.target, b;
    if ((b = t.closest("[data-day]"))) { sel = +b.getAttribute("data-day"); editing = null; return render(); }
    if ((b = t.closest("[data-jobs]"))) {
      var jj = jobs(); W.jobs.log[jj.key] = Math.max(0, jj.today + (+b.getAttribute("data-jobs"))); save(); return render();
    }
    if (t.closest("[data-jobs-target]")) {
      var v = window.prompt(T("How many job applications a day?", "كام تقديم وظيفة في اليوم؟"), String(jobs().daily)), nn = Math.round(+v);
      if (v !== null && nn >= 1 && nn <= 200) { W.jobs.daily = nn; save(); render(); }
      return;
    }
    if (t.closest("[data-add]")) {
      var last = list()[list().length - 1], from = last && last.to ? last.to : "09:00";
      var h = Math.min(23, +from.slice(0, 2) + 1), x = { id: uid(), from: from, to: ("0" + h).slice(-2) + from.slice(2), text: "" };
      list().push(x); editing = x.id; render();
      var inp = host.querySelector('.week-form input[name="text"]'); if (inp) inp.focus();
      return;
    }
    var li = t.closest(".week-row"); if (!li) return;
    var id = li.getAttribute("data-id");
    if (t.closest("[data-edit]")) { editing = id; render(); var i2 = host.querySelector('.week-form input[name="text"]'); if (i2) i2.focus(); return; }
    if (t.closest("[data-cancel]")) {
      var cur = list().filter(function (x) { return x.id === id; })[0];
      if (cur && !cur.text && !cur.en) W.days[sel] = list().filter(function (x) { return x.id !== id; });   // a new row never filled in
      editing = null; return render();
    }
    if (t.closest("[data-del]")) {
      if (!window.confirm(T("Delete this time from your week?", "تمسح الوقت ده من أسبوعك؟"))) return;
      W.days[sel] = list().filter(function (x) { return x.id !== id; });
      save(); render();
    }
  });
  host.addEventListener("submit", function (e) {
    var f = e.target.closest(".week-form"); if (!f) return;
    e.preventDefault();
    var id = f.closest(".week-row").getAttribute("data-id"), x = list().filter(function (y) { return y.id === id; })[0];
    if (!x) return;
    var text = f.elements.text.value.trim();
    if (!text) { f.elements.text.focus(); return; }
    x.from = f.elements.from.value; x.to = f.elements.to.value;
    if (text !== T(x.en, x.ar)) x.text = text;
    editing = null; save(); render();
  });

  // drag a row by its handle (mouse, pen or finger)
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
    var ids = [].map.call(drag.ol.children, function (li) { return li.getAttribute("data-id"); }), by = {};
    list().forEach(function (x) { by[x.id] = x; });
    W.days[sel] = ids.map(function (id) { return by[id]; }).filter(Boolean);
    drag = null; save(); render();
  }
  host.addEventListener("pointerup", drop);
  host.addEventListener("pointercancel", drop);

  load(function () { render(); setInterval(function () { if (!editing && !drag) render(); }, 60000); });
})();
