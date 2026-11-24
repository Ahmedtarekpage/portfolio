/* Time-tracking page logic: passkey auth (shared with /admin), daily to-do list
   with a completion %, and quarterly category goals with a progress chart. */
(function () {
  "use strict";

  var $ = function (sel) { return document.querySelector(sel); };
  var state = {
    currentDate: todayISO(),
    quarters: [],
    selectedQuarterId: null,
    quarterDetail: null, // { quarter, categories }
    editingQuarterId: null,
    editingTaskId: null,
    selectingTasks: false, // Today tab's select mode, for deleting several tasks at once
    selectedTaskIds: {},   // id -> true while selecting
    dayTasks: [],          // the tasks of the day on screen, for "Add to Google Calendar"
    daysData: null,  // { quarterId, from, to, days: [{date,pct,done,total}], avg } for the Days tab
    quarterStats: null, // { byId: {id: {avg,tracked,days}}, avg, tracked } for the Quarters gallery
    daysFocus: null, // { quarterId, from, to, preset } — the week/range focused under the days chart
    // "all": the Days tab spans every quarter at once instead of one of them
    daysScope: (function () {
      try { return localStorage.getItem("time-days-scope") === "all" ? "all" : null; } catch (e) { return null; }
    })(),
    goalsView: (function () {
      try { return localStorage.getItem("time-goals-view") || "category"; } catch (e) { return "category"; }
    })(), // 'category' (grouped cards, always fully shown) or 'flat' (one drag-orderable list, goals can be hidden)
  };

  /* ---------------- helpers (same conventions as admin.js) ---------------- */

  function api(path, opts) {
    opts = opts || {};
    var init = {
      method: opts.method || "GET",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
    };
    if (opts.body !== undefined) init.body = JSON.stringify(opts.body);
    return fetch(path, init).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (data) {
        if (!r.ok) {
          if (r.status === 401 && path.indexOf("action=me") === -1) show("view-login");
          throw new Error(data.error || T("Request failed (" + r.status + ")", "الطلب فشل (" + r.status + ")"));
        }
        return data;
      });
    });
  }

  function show(id) {
    ["view-loading", "view-login", "view-setup", "view-app"].forEach(function (v) {
      var el = document.getElementById(v);
      if (el) el.hidden = v !== id;
    });
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function fmtDate(iso) {
    if (!iso) return "—";
    var d = new Date(String(iso).slice(0, 10) + "T00:00:00Z");
    return d.toLocaleDateString(I18N.loc("en-GB"), { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  }

  // day-tile grid only: no weekday text needed there since the Sat-Fri
  // column headers above the grid already convey it
  function fmtDayMonth(iso) {
    if (!iso) return "—";
    var d = new Date(String(iso).slice(0, 10) + "T00:00:00Z");
    return d.toLocaleDateString(I18N.loc("en-GB"), { day: "numeric", month: "short", timeZone: "UTC" });
  }

  function fmtH(n) {
    n = Number(n) || 0;
    return (Number.isInteger(n) ? n : n.toFixed(1)) + T("h", " س");
  }

  function todayISO() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function addDays(iso, n) {
    var d = new Date(iso + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }

  /* ---------------- remembered choices (per device, same "time-" keys as the theme/tab) ----------------
     Only view preferences live here — which quarter was open, which range was
     focused. Nothing that belongs to the data itself. */

  function remember(key, value) {
    try {
      if (value == null) localStorage.removeItem("time-" + key);
      else localStorage.setItem("time-" + key, typeof value === "string" ? value : JSON.stringify(value));
    } catch (e) {}
  }
  function recall(key, fallback) {
    try { var raw = localStorage.getItem("time-" + key); return raw == null ? fallback : raw; }
    catch (e) { return fallback; }
  }
  function recallJSON(key, fallback) {
    try { return JSON.parse(localStorage.getItem("time-" + key)) || fallback; }
    catch (e) { return fallback; }
  }

  var toastTimer, toastHideTimer;
  function toast(msg, isError) {
    var t = $("#toast");
    clearTimeout(toastTimer);
    clearTimeout(toastHideTimer);
    t.textContent = msg;
    t.className = "toast" + (isError ? " toast--error" : "");
    t.hidden = false;
    toastTimer = setTimeout(function () {
      // exit the same way it entered (fade + settle), instead of vanishing instantly
      t.classList.add("toast--leaving");
      toastHideTimer = setTimeout(function () { t.hidden = true; t.classList.remove("toast--leaving"); }, 200);
    }, 3500);
  }

  function busy(btn, on) {
    if (btn) btn.disabled = on;
  }

  function formData(form) {
    var out = {};
    new FormData(form).forEach(function (v, k) { if (typeof v === "string") out[k] = v.trim(); });
    return out;
  }

  /* ---------------- theme ----------------
     The toggle itself lives in js/tools/theme.js, shared with /admin and
     /dashboard. All this page adds is a redraw: the charts read their colours
     from CSS custom properties at render time, so they need re-rendering
     after the switch or they keep the old theme's palette. */

  window.Theme.onChange(function () {
    if (state.quarterDetail) renderQuarter(state.quarterDetail);
    if (state.quarterStats && !$("#quarterGalleryView").hidden) renderQuartersSummary();
    if (state.daysData && !document.querySelector('.tabpanel[data-tabpanel="days"]').hidden) {
      renderDaysFocus({ animateChart: false, tiles: false });
    }
  });

  /* ---------------- the Plan tab: the owner's own page, framed ----------------
     /plan is served behind the passkey and reads the same theme key, so the
     frame only has to be sized to its content and told when the theme flips. */

  function loadPlan() {
    var frame = $("#planFrame");
    if (!frame || frame.getAttribute("src")) return;
    frame.addEventListener("load", function () {
      var doc = frame.contentDocument;
      if (!doc) return;
      var fit = function () { frame.style.height = Math.max(400, doc.documentElement.scrollHeight) + "px"; };
      fit();
      if (window.ResizeObserver) new ResizeObserver(fit).observe(doc.documentElement);
      else setInterval(fit, 1000);
    });
    frame.src = frame.getAttribute("data-src");
  }

  window.Theme.onChange(function (theme) {
    var frame = $("#planFrame");
    var win = frame && frame.contentWindow;
    if (!win || !frame.contentDocument) return;
    frame.contentDocument.documentElement.setAttribute("data-theme", theme);
    if (typeof win.replan === "function") win.replan();
  });

  /* ---------------- tabs: Today / Quarter / Analytics ---------------- */

  function showTab(name) {
    // each tab has its own colours in time-3d.css
    document.documentElement.setAttribute("data-tab", name);
    document.querySelectorAll("#tabbar .tab").forEach(function (btn) {
      btn.classList.toggle("tab--active", btn.dataset.tab === name);
    });
    if (name === "plan") loadPlan();
    document.querySelectorAll(".tabpanel").forEach(function (panel) {
      var isTarget = panel.dataset.tabpanel === name;
      panel.hidden = !isTarget;
      if (isTarget && !reduceMotion) {
        panel.classList.remove("tabpanel--enter");
        void panel.offsetWidth; // restart the animation on repeat visits
        panel.classList.add("tabpanel--enter");
      }
    });
    try { localStorage.setItem("time-tab", name); } catch (e) {}
  }

  $("#tabbar").addEventListener("click", function (ev) {
    var btn = ev.target.closest(".tab");
    if (!btn) return;
    showTab(btn.dataset.tab);
    if (btn.dataset.tab === "focus") loadPomodoros();
    if (btn.dataset.tab === "days") loadDaysGallery();
    if (btn.dataset.tab === "ideas") loadIdeas();
    if (btn.dataset.tab === "quarter") restoreQuarterView();
  });

  /* ---------------- live countdown to the selected quarter's start/end ---------------- */

  var countdownTimer = null;
  var lastCountdownText = null;

  function setCountdownUnit(id, value) {
    var el = $("#" + id);
    var text = String(value).padStart(2, "0");
    if (el.textContent === text) return;
    el.textContent = text;
    if (!reduceMotion) {
      var unit = el.closest(".countdown__unit");
      unit.classList.remove("countdown__unit--tick");
      void unit.offsetWidth;
      unit.classList.add("countdown__unit--tick");
    }
  }

  function updateCountdown() {
    var box = $("#quarterCountdown");
    var q = state.quarterDetail && state.quarterDetail.quarter;
    if (!q) { box.hidden = true; lastCountdownText = null; return; }

    var now = new Date();
    var start = new Date(String(q.start_date).slice(0, 10) + "T00:00:00");
    var end = new Date(String(q.end_date).slice(0, 10) + "T23:59:59.999");

    box.hidden = false;
    if (now > end) {
      box.classList.add("countdown--ended");
      if (lastCountdownText !== "ended") {
        $("#countdownLabel").textContent = T("This quarter has ended", "ربع السنة ده خلص");
        $("#countdownSpent").textContent = "";
        $("#countdownBar").style.width = "100%";
        ["cdDays", "cdHours", "cdMinutes", "cdSeconds"].forEach(function (id) { $("#" + id).textContent = "00"; });
        lastCountdownText = "ended";
      }
      return;
    }

    box.classList.remove("countdown--ended");
    var target = now < start ? start : end;
    $("#countdownLabel").textContent = now < start ? T("Starts in", "هيبدأ بعد") : T("Time left in this quarter", "الوقت الباقي في ربع السنة ده");

    if (now < start) {
      $("#countdownSpent").textContent = "";
      $("#countdownBar").style.width = "0%";
    } else {
      var totalQuarterDays = Math.max(1, Math.round((end - start) / 86400000));
      var spentDays = Math.min(totalQuarterDays, Math.max(0, Math.floor((now - start) / 86400000)));
      var done = Math.min(1, Math.max(0, (now - start) / (end - start)));
      $("#countdownSpent").textContent = T("Day " + spentDays + " of " + totalQuarterDays + " · " + Math.round(done * 100) + "% gone", "اليوم " + spentDays + " من " + totalQuarterDays + " · " + Math.round(done * 100) + "% عدّى");
      $("#countdownBar").style.width = (done * 100).toFixed(2) + "%";
    }

    var totalSeconds = Math.max(0, Math.floor((target - now) / 1000));
    setCountdownUnit("cdDays", Math.floor(totalSeconds / 86400));
    setCountdownUnit("cdHours", Math.floor((totalSeconds % 86400) / 3600));
    setCountdownUnit("cdMinutes", Math.floor((totalSeconds % 3600) / 60));
    setCountdownUnit("cdSeconds", totalSeconds % 60);
    lastCountdownText = "ticking";
  }

  /* ---------------- live age + "$500K/yr by age <n>" deadline counters ---------------- */

  var BIRTH_DATE = new Date(1998, 4, 15, 0, 0, 0); // 15 May 1998
  var DEFAULT_GOAL_AGE = 34;

  function loadGoalAge() {
    try {
      var a = parseInt(localStorage.getItem("time-goal-age"), 10);
      if (a && a > 0 && a < 150) return a;
    } catch (e) {}
    return DEFAULT_GOAL_AGE;
  }
  function saveGoalAge(a) {
    try { localStorage.setItem("time-goal-age", String(a)); } catch (e) {}
  }

  var GOAL_DATE = new Date(BIRTH_DATE.getFullYear() + loadGoalAge(), 4, 15, 0, 0, 0); // that birthday

  // human "age" style diff (e.g. "28y 2mo 9d") — calendar-aware, not just total days/86400
  function calendarDiff(from, to) {
    var years = to.getFullYear() - from.getFullYear();
    var months = to.getMonth() - from.getMonth();
    var days = to.getDate() - from.getDate();
    var hours = to.getHours() - from.getHours();
    var minutes = to.getMinutes() - from.getMinutes();
    var seconds = to.getSeconds() - from.getSeconds();
    if (seconds < 0) { seconds += 60; minutes--; }
    if (minutes < 0) { minutes += 60; hours--; }
    if (hours < 0) { hours += 24; days--; }
    if (days < 0) { days += new Date(to.getFullYear(), to.getMonth(), 0).getDate(); months--; }
    if (months < 0) { months += 12; years--; }
    return { years: years, months: months, days: days, hours: hours, minutes: minutes, seconds: seconds };
  }

  function setCalendarUnits(prefix, diff) {
    setCountdownUnit(prefix + "Years", diff.years);
    setCountdownUnit(prefix + "Months", diff.months);
    setCountdownUnit(prefix + "Days", diff.days);
    setCountdownUnit(prefix + "Hours", diff.hours);
    setCountdownUnit(prefix + "Minutes", diff.minutes);
    setCountdownUnit(prefix + "Seconds", diff.seconds);
  }

  function updateLifeCounters() {
    var now = new Date();
    setCalendarUnits("age", calendarDiff(BIRTH_DATE, now));

    var goalBox = $("#goalCounter");
    if (now >= GOAL_DATE) {
      goalBox.classList.add("countdown--ended");
      ["goalYears", "goalMonths", "goalDays", "goalHours", "goalMinutes", "goalSeconds"].forEach(function (id) { $("#" + id).textContent = "00"; });
    } else {
      goalBox.classList.remove("countdown--ended");
      setCalendarUnits("goal", calendarDiff(now, GOAL_DATE));
    }
  }

  var goalAgeInput = $("#goalAgeInput");
  if (goalAgeInput) {
    goalAgeInput.value = GOAL_DATE.getFullYear() - BIRTH_DATE.getFullYear();
    goalAgeInput.addEventListener("change", function () {
      var a = parseInt(goalAgeInput.value, 10);
      var currentAge = GOAL_DATE.getFullYear() - BIRTH_DATE.getFullYear();
      if (!a || a <= 0 || a >= 150) { goalAgeInput.value = currentAge; return; }
      GOAL_DATE = new Date(BIRTH_DATE.getFullYear() + a, 4, 15, 0, 0, 0);
      saveGoalAge(a);
      updateLifeCounters();
      renderMilestones();
      updateNextMilestoneCounter();
      toast(T("Target age updated ✓", "السن المستهدف اتحدّث ✓"));
    });
  }

  function startCountdownTimer() {
    if (countdownTimer) return;
    function tick() { updateCountdown(); updateLifeCounters(); updateNextMilestoneCounter(); }
    tick();
    renderMilestones(); // date-level granularity only — no need to redraw every second
    countdownTimer = setInterval(tick, 1000);
  }

  /* ---------------- $500K/yr milestone ladder ----------------
     Halve the target down from $500K until ~$976 (9 halvings) — 10 values.

     The pace used to be a fixed five months a step counted from today, which
     ran years past the deadline above: ten steps took 50 months while the
     $500K-by-age-30 date was 18 months away. Owner, 2026-10-17: "this dates
     has to be depends on this year". So the steps are now spread evenly
     between today and that date, and the last one lands exactly on it. Change
     the age and every date moves with it.

     If the date has already gone by, there is nothing to spread, so the old
     five-month cadence carries the ladder forward instead. */

  var MILESTONE_HALVINGS = 9;
  var MILESTONE_TARGET = 500000;
  var MILESTONE_MONTHS_PER_DOUBLING = 5;

  function buildMilestones() {
    var values = [MILESTONE_TARGET];
    for (var i = 0; i < MILESTONE_HALVINGS; i++) values.unshift(values[0] / 2);

    var today = new Date(); today.setHours(0, 0, 0, 0);
    var deadline = new Date(GOAL_DATE.getFullYear(), GOAL_DATE.getMonth(), GOAL_DATE.getDate());
    var span = deadline - today;

    if (span <= 0) {
      return values.map(function (val, idx) {
        var monthsOut = (idx + 1) * MILESTONE_MONTHS_PER_DOUBLING;
        return { value: val, date: new Date(today.getFullYear(), today.getMonth() + monthsOut, today.getDate()) };
      });
    }

    var step = span / values.length;
    return values.map(function (val, idx) {
      // the last one is the deadline itself, to the day, not a rounded step
      var when = idx === values.length - 1 ? deadline : new Date(today.getTime() + step * (idx + 1));
      when.setHours(0, 0, 0, 0);
      return { value: val, date: when };
    });
  }

  // the line above the ladder, which has to say what the pace now is
  function milestonePaceLine() {
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var deadline = new Date(GOAL_DATE.getFullYear(), GOAL_DATE.getMonth(), GOAL_DATE.getDate());
    var age = GOAL_DATE.getFullYear() - BIRTH_DATE.getFullYear();
    if (deadline <= today) {
      return T("Halved down from $500K to ~$976, " + MILESTONE_HALVINGS + " steps. The age " + age +
        " date has gone by, so the ladder keeps a " + MILESTONE_MONTHS_PER_DOUBLING +
        "-month pace from today. Check one off once you've actually reached it.",
        "متقسّمة بالنص من $500K لحد ~$976، " + MILESTONE_HALVINGS + " خطوات. تاريخ سن " + age +
        " عدّى، فالسلّم ماشي بمعدل خطوة كل " + MILESTONE_MONTHS_PER_DOUBLING +
        " شهور من النهارده. علّم على الخطوة لما توصلها فعلاً.");
    }
    var weeks = Math.max(1, Math.round((deadline - today) / 604800000 / (MILESTONE_HALVINGS + 1)));
    var every = weeks >= 9 ? I18N.N(Math.round(weeks / 4.345), "month", "months", ["شهر", "شهرين", "شهور", "شهر"]) : I18N.N(weeks, "week", "weeks", ["أسبوع", "أسبوعين", "أسابيع", "أسبوع"]);
    var deadlineLabel = deadline.toLocaleDateString(I18N.loc("en-GB"), { day: "numeric", month: "short", year: "numeric" });
    return T("Halved down from $500K to ~$976 — doubling every " + every + ", " + MILESTONE_HALVINGS +
      " times in a row, the last landing on your " + age + "th birthday (" +
      deadlineLabel +
      "). Check one off once you've actually reached it.",
      "متقسّمة بالنص من $500K لحد ~$976 — بتتضاعف كل " + every + "، " + MILESTONE_HALVINGS +
      " مرات ورا بعض، وآخر واحدة في عيد ميلادك رقم " + age + " (" +
      deadlineLabel +
      "). علّم على الخطوة لما توصلها فعلاً.");
  }

  function fmtMoney(v) {
    return Math.round(v).toLocaleString("en-US");
  }

  var MS_UNIT_IDS = ["nextMsYears", "nextMsMonths", "nextMsDays", "nextMsHours", "nextMsMinutes", "nextMsSeconds"];

  // live countdown to whichever milestone is next in line (first unchecked one)
  function updateNextMilestoneCounter() {
    var box = $("#nextMilestoneCounter");
    var label = $("#nextMilestoneLabel");
    if (!box || !label) return;
    var now = new Date();
    var milestones = buildMilestones();
    var checked = loadMilestoneChecks();
    var next = milestones.find(function (_, i) { return !checked[i]; });
    if (!next) {
      box.classList.add("countdown--ended");
      label.textContent = T("🎉 All milestones reached!", "🎉 وصلت لكل المحطات!");
      MS_UNIT_IDS.forEach(function (id) { $("#" + id).textContent = "00"; });
      return;
    }
    box.classList.remove("countdown--ended");
    var nextIdx = milestones.indexOf(next);
    var reached = Number(loadMilestoneAmounts()[nextIdx]) || 0;
    var pct = next.value > 0 ? Math.min(100, Math.round((reached / next.value) * 100)) : 0;
    label.textContent = T("💰 Time left to hit $" + fmtMoney(next.value) + " (" + pct + "% there)", "💰 الوقت الباقي عشان توصل $" + fmtMoney(next.value) + " (وصلت " + pct + "%)");
    setCalendarUnits("nextMs", calendarDiff(now, next.date));
  }

  // manually-ticked "reached it" state per milestone — this is a personal
  // motivational checklist, not tied to any real income data, so a plain
  // per-device localStorage flag (same pattern as time-theme/time-tab) is enough
  function loadMilestoneChecks() {
    try {
      var raw = JSON.parse(localStorage.getItem("time-milestones-checked") || "[]");
      return Array.isArray(raw) ? raw : [];
    } catch (e) { return []; }
  }
  function saveMilestoneChecks(arr) {
    try { localStorage.setItem("time-milestones-checked", JSON.stringify(arr)); } catch (e) {}
  }

  // how much you've actually put toward EACH milestone individually — a
  // separate localStorage key/array from the checkboxes above (index-aligned,
  // same pattern), so it's purely additive and can't touch already-entered
  // checked state. The total above the list is just the sum of these.
  function loadMilestoneAmounts() {
    try {
      var raw = JSON.parse(localStorage.getItem("time-milestones-amounts") || "[]");
      return Array.isArray(raw) ? raw : [];
    } catch (e) { return []; }
  }
  function saveMilestoneAmounts(arr) {
    try { localStorage.setItem("time-milestones-amounts", JSON.stringify(arr)); } catch (e) {}
  }

  function renderMilestones() {
    var list = $("#milestoneList");
    if (!list) return;
    var milestones = buildMilestones();
    var checked = loadMilestoneChecks();
    var amounts = loadMilestoneAmounts();
    var paceEl = $("#milestonePace");
    if (paceEl) paceEl.textContent = milestonePaceLine();
    var nextIdx = milestones.findIndex(function (_, i) { return !checked[i]; });

    var total = amounts.reduce(function (sum, v) { return sum + (Number(v) || 0); }, 0);
    var totalEl = $("#milestoneTotalAmount");
    if (totalEl) totalEl.textContent = "$" + fmtMoney(total);

    list.innerHTML = milestones.map(function (m, i) {
      var isChecked = !!checked[i];
      var isNext = i === nextIdx;
      var cls = "milestone-row" + (isChecked ? " milestone-row--done" : "") + (isNext ? " milestone-row--next" : "");
      var prevVal = i === 0 ? 0 : milestones[i - 1].value;
      var dateLabel = m.date.toLocaleDateString(I18N.loc("en-GB"), { day: "numeric", month: "short", year: "numeric" });
      var rowAmount = Number(amounts[i]) || 0;
      var pct = m.value > 0 ? Math.min(100, Math.round((rowAmount / m.value) * 100)) : 0;
      return '<div class="' + cls + '" data-idx="' + i + '">' +
        '<input type="checkbox" class="task-row__check milestone-row__check"' + (isChecked ? " checked" : "") + ' aria-label="' + T("Mark $" + fmtMoney(m.value) + " reached", "علّم إنك وصلت $" + fmtMoney(m.value)) + '" />' +
        '<span class="milestone-row__body">' +
          '<span class="milestone-row__top">' +
            '<span class="milestone-row__amount">$' + fmtMoney(m.value) + '</span>' +
            '<span class="milestone-row__delta">+$' + fmtMoney(m.value - prevVal) + T(" to add", " زيادة") + '</span>' +
          '</span>' +
          '<span class="goal-row__nums milestone-row__reached">' +
            '<input type="number" class="goal-row__current milestone-row__amount-input" min="0" step="any" placeholder="0" value="' + (rowAmount || "") + '" />' +
            ' / $' + fmtMoney(m.value) + T(" reached", " وصلتلها") +
          '</span>' +
          '<span class="milestone-row__date">' + T("pace: by ", "المعدل: قبل ") + dateLabel + '</span>' +
          '<span class="milestone-row__progress">' +
            '<span class="milestone-row__bar"><span class="milestone-row__bar-fill' + (pct >= 100 ? ' milestone-row__bar-fill--done' : '') +
              '" style="width:' + pct + '%"></span></span>' +
            '<span class="milestone-row__pct">' + pct + '%</span>' +
          '</span>' +
        '</span></div>';
    }).join("");

    list.querySelectorAll(".milestone-row__check").forEach(function (box) {
      box.addEventListener("change", function () {
        var idx = Number(box.closest(".milestone-row").dataset.idx);
        var checks = loadMilestoneChecks();
        checks[idx] = box.checked;
        saveMilestoneChecks(checks);
        if (box.checked) {
          if (idx === milestones.length - 1) { playSuccessSound(); if (!reduceMotion) burstConfetti(30); }
          else playCheckSound();
        }
        renderMilestones();
        updateNextMilestoneCounter();
        loadGamification();
      });
    });

    // update just this row's bar/%/total in place — a full renderMilestones()
    // on every keystroke would recreate the input mid-typing and lose focus
    list.querySelectorAll(".milestone-row__amount-input").forEach(function (input) {
      input.addEventListener("input", function () {
        var row = input.closest(".milestone-row");
        var idx = Number(row.dataset.idx);
        var v = input.value === "" ? 0 : Number(input.value);
        if (!isFinite(v) || v < 0) return;
        var arr = loadMilestoneAmounts();
        arr[idx] = v;
        saveMilestoneAmounts(arr);

        var m = milestones[idx];
        var pct = m.value > 0 ? Math.min(100, Math.round((v / m.value) * 100)) : 0;
        var fill = row.querySelector(".milestone-row__bar-fill");
        fill.style.width = pct + "%";
        fill.classList.toggle("milestone-row__bar-fill--done", pct >= 100);
        row.querySelector(".milestone-row__pct").textContent = pct + "%";

        var total = arr.reduce(function (sum, x) { return sum + (Number(x) || 0); }, 0);
        var totalEl = $("#milestoneTotalAmount");
        if (totalEl) totalEl.textContent = "$" + fmtMoney(total);

        updateNextMilestoneCounter();
      });
    });
  }

  /* ---------------- pomodoro timer (default 25 focus / 5 short break / 15 long
     break, long break every 4th focus round) — click a button, name what you're
     focusing on, and it opens a fullscreen "work alone" screen; auto-advances
     through phases on its own unless paused, with a sound on every action. */

  var POMODORO_ROUNDS_UNTIL_LONG_BREAK = 4;

  function loadPomodoroDurations() {
    try {
      var raw = JSON.parse(localStorage.getItem("time-pomodoro-durations") || "{}");
      return {
        work: raw.work > 0 ? raw.work : 25,
        short: raw.short > 0 ? raw.short : 5,
        long: raw.long > 0 ? raw.long : 15,
      };
    } catch (e) { return { work: 25, short: 5, long: 15 }; }
  }
  function savePomodoroDurations(d) {
    try { localStorage.setItem("time-pomodoro-durations", JSON.stringify(d)); } catch (e) {}
  }

  function playPomodoroStartSound() { playTone(700, 950, 0.1, 0.12); }
  function playPomodoroPauseSound() { playTone(520, 380, 0.11, 0.1); }

  var pomodoroDurations = loadPomodoroDurations();
  var pomodoroPhase = "work"; // 'work' | 'short' | 'long'
  var pomodoroCompleted = 0; // completed focus rounds this session
  var pomodoroFocusText = "";
  var pomodoroRunning = false;
  var pomodoroEndAt = null; // epoch ms the current phase ends at, while running
  var pomodoroRemainingMs = pomodoroDurations.work * 60000; // authoritative time-left while paused
  var pomodoroTickTimer = null;

  function pomodoroPhaseMs(phase) {
    var mins = phase === "work" ? pomodoroDurations.work : phase === "long" ? pomodoroDurations.long : pomodoroDurations.short;
    return mins * 60000;
  }
  function pomodoroPhaseLabel(phase) {
    return phase === "work" ? T("Focus", "تركيز") : phase === "long" ? T("Long break", "راحة طويلة") : T("Short break", "راحة قصيرة");
  }

  function renderPomodoroTime(ms) {
    var totalSec = Math.max(0, Math.round(ms / 1000));
    var m = Math.floor(totalSec / 60), s = totalSec % 60;
    var text = (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s;
    $("#pomodoroTime").textContent = text;
    $("#pomodoroStatusTime").textContent = text;
  }

  function renderPomodoroDots() {
    var pos = pomodoroCompleted % POMODORO_ROUNDS_UNTIL_LONG_BREAK;
    var dots = "";
    for (var i = 0; i < POMODORO_ROUNDS_UNTIL_LONG_BREAK; i++) {
      dots += '<span class="pomodoro__dot' + (i < pos ? " pomodoro__dot--done" : "") + '"></span>';
    }
    $("#pomodoroDots").innerHTML = dots;
  }

  function renderPomodoroUI() {
    var label = pomodoroPhaseLabel(pomodoroPhase);
    $("#pomodoroPhaseLabel").textContent = label;
    $("#pomodoroStatusPhase").textContent = label;
    $("#pomodoroFocusLabel").textContent = pomodoroFocusText;
    $("#pomodoroStatusFocus").textContent = pomodoroFocusText;
    $("#pomodoroOverlay").classList.toggle("pomodoro-overlay--break", pomodoroPhase !== "work");
    $("#pomodoroOverlay").classList.toggle("pomodoro-overlay--running", pomodoroRunning && !reduceMotion);
    $("#btnPomodoroStart").hidden = pomodoroRunning;
    $("#btnPomodoroPause").hidden = !pomodoroRunning;
    renderPomodoroDots();
  }

  function renderPomodoroSettings() {
    $("#pomodoroWorkMin").value = pomodoroDurations.work;
    $("#pomodoroShortMin").value = pomodoroDurations.short;
    $("#pomodoroLongMin").value = pomodoroDurations.long;
  }

  // work -> (short or, every 4th round, long) -> work -> ...
  function pomodoroNextPhase() {
    if (pomodoroPhase === "work") {
      pomodoroCompleted++;
      pomodoroPhase = (pomodoroCompleted % POMODORO_ROUNDS_UNTIL_LONG_BREAK === 0) ? "long" : "short";
    } else {
      pomodoroPhase = "work";
    }
    pomodoroRemainingMs = pomodoroPhaseMs(pomodoroPhase);
  }

  function pomodoroTick() {
    var remaining = pomodoroEndAt - Date.now();
    if (remaining <= 0) { pomodoroAdvance(); return; }
    renderPomodoroTime(remaining);
  }

  // a phase's time ran out on its own — chime, move to the next phase, keep running
  function pomodoroAdvance() {
    playSuccessSound();
    pomodoroNextPhase();
    renderPomodoroTime(pomodoroRemainingMs);
    renderPomodoroUI();
    pomodoroEndAt = Date.now() + pomodoroRemainingMs;
    toast(T(pomodoroPhaseLabel(pomodoroPhase) + " time!", "وقت " + pomodoroPhaseLabel(pomodoroPhase) + "!"));
  }

  function pomodoroStart() {
    if (pomodoroRunning) return;
    pomodoroRunning = true;
    pomodoroEndAt = Date.now() + pomodoroRemainingMs;
    renderPomodoroUI();
    if (pomodoroTickTimer) clearInterval(pomodoroTickTimer);
    pomodoroTickTimer = setInterval(pomodoroTick, 250);
  }

  function pomodoroPause() {
    if (!pomodoroRunning) return;
    pomodoroRunning = false;
    pomodoroRemainingMs = Math.max(0, pomodoroEndAt - Date.now());
    clearInterval(pomodoroTickTimer);
    pomodoroTickTimer = null;
    renderPomodoroTime(pomodoroRemainingMs);
    renderPomodoroUI();
  }

  function pomodoroSkip() {
    var wasRunning = pomodoroRunning;
    if (wasRunning) { clearInterval(pomodoroTickTimer); pomodoroTickTimer = null; }
    pomodoroNextPhase();
    renderPomodoroTime(pomodoroRemainingMs);
    renderPomodoroUI();
    if (wasRunning) {
      pomodoroRunning = true;
      pomodoroEndAt = Date.now() + pomodoroRemainingMs;
      pomodoroTickTimer = setInterval(pomodoroTick, 250);
    }
  }

  // resets back to a fresh Focus round, without ending the session (focus text kept)
  function pomodoroResetPhase() {
    pomodoroPause();
    pomodoroPhase = "work";
    pomodoroCompleted = 0;
    pomodoroRemainingMs = pomodoroPhaseMs("work");
    renderPomodoroTime(pomodoroRemainingMs);
    renderPomodoroUI();
  }

  var pomodoroCloseTimer = null;

  function pomodoroOpenOverlay() {
    clearTimeout(pomodoroCloseTimer);
    var overlay = $("#pomodoroOverlay");
    overlay.classList.remove("pomodoro-overlay--leaving");
    overlay.hidden = false;
  }

  // fade out the same way it faded in, instead of vanishing instantly
  function pomodoroCloseOverlay() {
    var overlay = $("#pomodoroOverlay");
    overlay.classList.add("pomodoro-overlay--leaving");
    clearTimeout(pomodoroCloseTimer);
    pomodoroCloseTimer = setTimeout(function () {
      overlay.hidden = true;
      overlay.classList.remove("pomodoro-overlay--leaving");
    }, 160);
  }

  // click "Start focus session": name the focus, reset to a fresh round, open
  // the fullscreen screen, and start the timer immediately
  function pomodoroLaunch() {
    var text = $("#pomodoroFocusInput").value.trim();
    pomodoroFocusText = text || T("Focused work", "شغل بتركيز");
    pomodoroPhase = "work";
    pomodoroCompleted = 0;
    pomodoroRemainingMs = pomodoroPhaseMs("work");
    $("#pomodoroFocusInput").value = "";
    $("#pomodoroLauncher").hidden = true;
    $("#pomodoroStatus").hidden = false;
    renderPomodoroTime(pomodoroRemainingMs);
    renderPomodoroUI();
    pomodoroOpenOverlay();
    pomodoroStart();
    playPomodoroStartSound();
  }

  // fully stop and dismiss the session, back to the launcher
  function pomodoroEndSession() {
    pomodoroPause();
    pomodoroCloseOverlay();
    $("#pomodoroStatus").hidden = true;
    $("#pomodoroLauncher").hidden = false;
    playDeleteSound();
  }

  renderPomodoroSettings();
  renderPomodoroTime(pomodoroRemainingMs);
  renderPomodoroUI();

  $("#btnPomodoroLaunch").addEventListener("click", pomodoroLaunch);
  $("#pomodoroFocusInput").addEventListener("keydown", function (ev) {
    if (ev.key === "Enter") { ev.preventDefault(); pomodoroLaunch(); }
  });
  $("#btnPomodoroReopen").addEventListener("click", function () { pomodoroOpenOverlay(); playPomodoroStartSound(); });
  $("#btnPomodoroEnd").addEventListener("click", pomodoroEndSession);
  $("#btnPomodoroClose").addEventListener("click", function () { pomodoroCloseOverlay(); playPomodoroPauseSound(); });

  $("#btnPomodoroStart").addEventListener("click", function () { pomodoroStart(); playPomodoroStartSound(); });
  $("#btnPomodoroPause").addEventListener("click", function () { pomodoroPause(); playPomodoroPauseSound(); });
  $("#btnPomodoroSkip").addEventListener("click", function () { pomodoroSkip(); playPomodoroStartSound(); });
  $("#btnPomodoroReset").addEventListener("click", function () { pomodoroResetPhase(); playDeleteSound(); });

  [["pomodoroWorkMin", "work"], ["pomodoroShortMin", "short"], ["pomodoroLongMin", "long"]].forEach(function (pair) {
    var input = $("#" + pair[0]), key = pair[1];
    input.addEventListener("change", function () {
      var v = parseInt(input.value, 10);
      if (!v || v <= 0 || v > 300) { input.value = pomodoroDurations[key]; return; }
      pomodoroDurations[key] = v;
      savePomodoroDurations(pomodoroDurations);
      if (!pomodoroRunning && pomodoroPhase === key) {
        pomodoroRemainingMs = pomodoroPhaseMs(pomodoroPhase);
        renderPomodoroTime(pomodoroRemainingMs);
      }
      toast(T("Pomodoro durations updated ✓", "مدد البومودورو اتحدّثت ✓"));
    });
  });

  /* ---------------- auth ---------------- */

  function boot() {
    api("/api/auth?action=me").then(function (me) {
      if (me.authed) return initApp();
      show(me.hasCredentials ? "view-login" : "view-setup");
    }).catch(function (e) {
      show("view-login");
      showErr("#loginError", e.message);
    });
  }

  function showErr(sel, msg) {
    var el = $(sel);
    el.textContent = msg;
    el.hidden = !msg;
  }

  $("#btnLogin").addEventListener("click", function () {
    var btn = this;
    showErr("#loginError", "");
    busy(btn, true);
    api("/api/auth?action=login-options", { method: "POST", body: {} })
      .then(function (options) { return SimpleWebAuthnBrowser.startAuthentication({ optionsJSON: options }); })
      .then(function (response) { return api("/api/auth?action=login-verify", { method: "POST", body: { response: response } }); })
      .then(function () { if (window.Snap) Snap.ok("login"); initApp(); })
      // a second failed sign-in is recorded for the security log (js/tools/snap.js)
      .catch(function (e) { if (window.Snap) Snap.fail("login", e && e.name); if (e.name !== "NotAllowedError") showErr("#loginError", e.message || T("Sign-in failed", "الدخول فشل")); })
      .finally(function () { busy(btn, false); });
  });

  $("#btnSetup").addEventListener("click", function () {
    var btn = this;
    showErr("#setupError", "");
    busy(btn, true);
    api("/api/auth?action=register-options", { method: "POST", body: {} })
      .then(function (options) { return SimpleWebAuthnBrowser.startRegistration({ optionsJSON: options }); })
      .then(function (response) {
        return api("/api/auth?action=register-verify", { method: "POST", body: { response: response, label: "admin device" } });
      })
      .then(function () { toast(T("Passkey registered ✓", "مفتاح الدخول اتسجّل ✓")); initApp(); })
      .catch(function (e) {
        if (e.name === "InvalidStateError") showErr("#setupError", T("This device already holds the passkey — reload and sign in.", "الجهاز ده عليه مفتاح الدخول بالفعل — حمّل الصفحة تاني وادخل."));
        else if (e.name !== "NotAllowedError") showErr("#setupError", e.message || T("Setup failed", "الإعداد فشل"));
      })
      .finally(function () { busy(btn, false); });
  });

  $("#btnLogout").addEventListener("click", function () {
    api("/api/auth?action=logout", { method: "POST", body: {} }).then(function () { show("view-login"); });
  });

  /* ---------------- boot the app shell ---------------- */

  function initApp() {
    show("view-loading");
    $("#dayPicker").value = state.currentDate;
    var savedTab = (function () { try { return localStorage.getItem("time-tab"); } catch (e) { return null; } })();
    showTab(savedTab && document.querySelector('.tabpanel[data-tabpanel="' + savedTab + '"]') ? savedTab : "today");
    startCountdownTimer();
    Promise.all([loadQuarters(), loadDay(state.currentDate), loadHistory()])
      .then(function () {
        show("view-app");
        var activeTab = document.querySelector("#tabbar .tab--active");
        if (activeTab && activeTab.dataset.tab === "days") loadDaysGallery();
        if (activeTab && activeTab.dataset.tab === "ideas") loadIdeas();
        if (activeTab && activeTab.dataset.tab === "quarter") restoreQuarterView();
        // the focus list is loaded whenever a block is mid-run, whichever tab
        // is open, so the clock in the browser tab keeps counting
        if ((activeTab && activeTab.dataset.tab === "focus") || pomo.run) loadPomodoros();
        loadGamification();
      })
      .catch(function (e) { toast(e.message, true); show("view-app"); });
  }

  /* ---------------- today: to-do list ---------------- */

  $("#dayPicker").addEventListener("change", function () { loadDay(this.value || todayISO()); });
  $("#btnPrevDay").addEventListener("click", function () { loadDay(addDays(state.currentDate, -1)); });
  $("#btnNextDay").addEventListener("click", function () { loadDay(addDays(state.currentDate, 1)); });
  $("#btnToday").addEventListener("click", function () { loadDay(todayISO()); });

  function loadDay(date, opts) {
    opts = opts || {};
    if (date !== state.currentDate && state.editingTaskId) stopEditTask();
    if (date !== state.currentDate && state.selectingTasks) exitTaskSelect();
    state.currentDate = date;
    $("#dayPicker").value = date;
    // today or later: the server first puts the repeating events and the meetings on the day
    var tz = ""; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (e) {}
    var sync = date >= todayISO() && !opts.noSync ? "&sync=1&tz=" + encodeURIComponent(tz) : "";
    return api("/api/tasks?date=" + date + sync).then(function (data) {
      state.daySkips = data.skips || [];
      renderTasks(data.tasks, { animate: !opts.skipEnterAnimation });
      window.dispatchEvent(new CustomEvent("time:tasks", { detail: { date: date, tasks: data.tasks } }));
      renderTodayChart(date, data.tasks);
      if (opts.noPrayer) { renderPrayerBar(date); return; }
      // prayers fill themselves in: their half hour and the real adhan / iqama time
      return prayerSync(date, data.tasks).then(function (changed) {
        if (changed && state.currentDate === date) return loadDay(date, { skipEnterAnimation: true, noPrayer: true, noSync: true });
      });
    }).catch(function (e) { toast(e.message, true); });
  }

  // a completed task's timestamp, falling back to when it was created for
  // legacy rows completed before completed_at existed
  function taskCompletionTime(t) {
    return t.completed_at || t.created_at;
  }

  function renderTodayChart(date, tasks) {
    var box = $("#todayChart");
    var tip = $("#todayChartTip");
    var empty = $("#todayChartEmpty");
    if (!tasks.length) {
      box.innerHTML = "";
      tip.hidden = true;
      empty.hidden = false;
      return;
    }
    empty.hidden = true;

    var doneSorted = tasks.filter(function (t) { return t.done || t.half; })
      .sort(function (a, b) { return new Date(taskCompletionTime(a)) - new Date(taskCompletionTime(b)); });
    var running = 0;
    var points = doneSorted.map(function (t) {
      running += t.done ? 1 : 0.5;
      return { time: taskCompletionTime(t), title: t.title, cumulative: running };
    });

    window.renderDayChart(box, tip, points, { date: date, target: tasks.length, showNow: date === todayISO() });
  }

  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var audioCtx = null;
  function playCheckSound() {
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      if (!audioCtx) audioCtx = new Ctx();
      if (audioCtx.state === "suspended") audioCtx.resume();
      var t0 = audioCtx.currentTime;
      var osc = audioCtx.createOscillator();
      var gain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, t0);
      osc.frequency.exponentialRampToValueAtTime(1320, t0 + 0.1);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.18, t0 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.18);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.2);
    } catch (e) { /* Web Audio unavailable — fail silently */ }
  }

  // shared tone generator for the rest of the sound effects — a single
  // sine oscillator with an exponential attack/decay envelope
  function playTone(freqFrom, freqTo, duration, volume) {
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      if (!audioCtx) audioCtx = new Ctx();
      if (audioCtx.state === "suspended") audioCtx.resume();
      var t0 = audioCtx.currentTime;
      var osc = audioCtx.createOscillator();
      var gain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freqFrom, t0);
      if (freqTo !== freqFrom) osc.frequency.exponentialRampToValueAtTime(freqTo, t0 + duration * 0.6);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(volume, t0 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t0);
      osc.stop(t0 + duration + 0.02);
    } catch (e) { /* Web Audio unavailable — fail silently */ }
  }

  function playAddSound() { playTone(520, 760, 0.14, 0.13); }
  function playDeleteSound() { playTone(420, 260, 0.16, 0.12); }
  function playSuccessSound() {
    playTone(660, 660, 0.12, 0.15);
    setTimeout(function () { playTone(880, 880, 0.22, 0.17); }, 110);
  }
  function playStepSound() { playTone(600, 640, 0.07, 0.08); }
  function playLevelUpSound() {
    playTone(523, 523, 0.1, 0.16);
    setTimeout(function () { playTone(659, 659, 0.1, 0.16); }, 100);
    setTimeout(function () { playTone(784, 784, 0.3, 0.19); }, 200);
  }
  function playBadgeSound() { playTone(880, 1175, 0.2, 0.15); }

  function animateCount(el, to, suffix) {
    var from = parseInt(el.textContent, 10) || 0;
    if (reduceMotion || from === to) { el.textContent = to + suffix; return; }
    var start = null, duration = 450;
    function step(ts) {
      if (start == null) start = ts;
      var p = Math.min((ts - start) / duration, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(from + (to - from) * eased) + suffix;
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  // "14:05" in local time, for the done-at clock on a row
  function clockOf(iso) {
    var d = new Date(iso);
    return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  }

  /* ---------------- prayers and azkar fill themselves in (owner, 2026-11-21) ----------------
     Rules (the business logic, in short):
     1. Where you are: the phone's location, named by OpenStreetMap (free, no key) down to
        the neighbourhood. Times for that exact spot from AlAdhan (free, no key), which picks
        the official method of that country by itself. Offline → worked out on the phone
        (js/tools/prayer.js); no location → the last place, else your clock's capital.
     2. Iqama = adhan + the wait in that country's rule (no free API publishes mosque iqama
        times): UAE Fajr 20, Dhuhr 20, Asr 20, Maghrib 5, Isha 20. Editable, kept per country.
     3. Each prayer gets the half hour (on :00 or :30) that the iqama falls in:
        adhan 3:22 + 30 → iqama 3:52 → 3:30–4:00. The real adhan and iqama are written beside it.
     4. Friday: Dhuhr becomes Jumu'ah, a full hour from the half hour before the khutba
        (UAE khutba 12:45 since Jan 2026 → 12:30–1:30).
     5. Morning azkar right after the Fajr half hour; evening azkar right after Asr's
        (15 minutes each by default).
     6. Today and later days only — a past day is what it was. An existing task with the
        prayer's name is used (and timed); a missing one is added once. A prayer whose time
        you changed by hand is left alone. Done tasks are never touched. */
  var PRAYER_KEYS = ["fajr", "dhuhr", "asr", "maghrib", "isha"];
  var PRAYER_AR = { fajr: "الفجر", sunrise: "الشروق", dhuhr: "الظهر", asr: "العصر", maghrib: "المغرب", isha: "العشاء", jumuah: "الجمعة" };
  var PRAYER_EN = { fajr: "Fajr", sunrise: "Sunrise", dhuhr: "Dhuhr", asr: "Asr", maghrib: "Maghrib", isha: "Isha", jumuah: "Jumu'ah" };
  // the names the daily routine already uses, in either language
  var PRAYER_MATCH = {
    "prayer:fajr": /fajr|fajer|فجر/i, "prayer:dhuhr": /dohr|dhuhr|duhr|zuhr|dhur|ظهر|جمع/i, "prayer:asr": /\basr\b|عصر/i,
    "prayer:maghrib": /maghrib|magrib|مغرب/i, "prayer:isha": /isha|eshaa|عشاء|عشا/i,
    "azkar:morning": /(azkar|adhkar|athkar|أذكار|اذكار).*(sbah|sabah|morning|صباح)|(sbah|sabah|صباح).*(azkar|أذكار|اذكار)/i,
    "azkar:evening": /(azkar|adhkar|athkar|أذكار|اذكار).*(msaa|masaa|massa|evening|مساء)|(msaa|masaa|مساء).*(azkar|أذكار|اذكار)/i,
    "life:breakfast": /breakfast|فطار|إفطار/i, "life:nap": /\bnap\b|qailul|قيلول|قيلوله/i,
    "life:gym": /\bgym\b|workout|جيم|تمرين/i, "life:sleep": /\bsleep\b|نوم|أنام|انام/i,
  };
  var PRAYER_TITLE = {
    "prayer:fajr": "Pray Fajr on Time", "prayer:dhuhr": "Pray Dohr on Time", "prayer:asr": "Pray Asr on Time",
    "prayer:maghrib": "Pray Maghrib on Time", "prayer:isha": "Pray Isha on Time",
    "azkar:morning": "Azkar Elsbah", "azkar:evening": "Azkar Elmsaa",
    "life:breakfast": T("Breakfast", "الفطار"), "life:nap": T("Qailula (nap)", "القيلولة"), "life:gym": T("Gym", "الجيم"), "life:sleep": T("Sleep", "النوم"),
  };
  var AUTO_ICON = { "life:breakfast": "🍳", "life:nap": "💤", "life:gym": "🏋️", "life:sleep": "😴" };
  // each country's usual wait from adhan to iqama (by country code); "" = Jumu'ah at Dhuhr's adhan
  var IQAMA_DEFAULT = {
    AE: { fajr: 20, dhuhr: 20, asr: 20, maghrib: 5, isha: 20, jumuah: "12:45" },
    EG: { fajr: 20, dhuhr: 10, asr: 10, maghrib: 7, isha: 10, jumuah: "" },
    SA: { fajr: 25, dhuhr: 20, asr: 20, maghrib: 10, isha: 20, jumuah: "" },
    "*": { fajr: 20, dhuhr: 15, asr: 15, maghrib: 10, isha: 15, jumuah: "" },
  };
  var CAPITAL = { uae: { lat: 25.2048, lng: 55.2708, name: "Dubai", cc: "AE" }, egypt: { lat: 30.0444, lng: 31.2357, name: "Cairo", cc: "EG" }, mwl: { lat: 21.4225, lng: 39.8262, name: "Makkah", cc: "SA" } };
  var REGION_CC = { uae: "AE", egypt: "EG", mwl: "*" };

  function lsGet(k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  // the country the iqama rule follows: the place found, else your clock's country
  function placeCC() {
    var loc = lsGet("time-prayer-loc");
    if (loc && loc.cc) return loc.cc;
    return REGION_CC[window.Prayer ? window.Prayer.regionOf() : "uae"] || "*";
  }
  function prayerSettings() {
    var region = placeCC();
    var saved = lsGet("time-prayer") || {};
    var d = IQAMA_DEFAULT[region] || IQAMA_DEFAULT["*"];
    var mine = saved[region] || {};
    var out = { region: region, on: saved.on !== false, azkar: saved.azkar > 0 ? saved.azkar : 15 };
    ["fajr", "dhuhr", "asr", "maghrib", "isha"].forEach(function (k) { out[k] = mine[k] != null ? mine[k] : d[k]; });
    out.jumuah = mine.jumuah != null ? mine.jumuah : d.jumuah;
    // the day's rhythm around the prayers (owner's email, 2026-11-21): wake at Fajr wherever he is,
    // 6 hours' sleep before it, an hour's qailula, breakfast after the morning azkar, gym 3 days a week
    var life = saved.life || {};
    out.sleepH = life.sleepH > 0 ? life.sleepH : 6;
    out.nap = life.nap != null ? life.nap : 60;
    out.breakfast = life.breakfast != null ? life.breakfast : 15;
    out.gymDays = Array.isArray(life.gymDays) ? life.gymDays : [0, 2, 5]; // Sun, Tue, Fri
    out.gymWhen = life.gymWhen || "isha"; // "isha" = after everything · "slump" = after Asr, when the head switches off
    out.gymMin = life.gymMin > 0 ? life.gymMin : 60;
    return out;
  }
  function savePrayerSettings(patch) {
    var saved = lsGet("time-prayer") || {}, region = placeCC();
    saved[region] = Object.assign({}, saved[region] || {}, patch.region || {});
    if (patch.on != null) saved.on = patch.on;
    if (patch.azkar != null) saved.azkar = patch.azkar;
    if (patch.life) saved.life = Object.assign({}, saved.life || {}, patch.life);
    lsSet("time-prayer", saved);
  }

  // where you are: the phone's location (asked at most every 30 minutes), else the last one, else your clock's capital
  var locAsk = null, geoErr = 0; // 1 = blocked by the browser, 2 = off on the device, 3 = took too long
  function prayerPlace(fresh) {
    var saved = lsGet("time-prayer-loc");
    var region = window.Prayer ? window.Prayer.regionOf() : "uae";
    var fallback = saved && saved.region === region ? saved : Object.assign({ region: region, guess: true }, CAPITAL[region] || CAPITAL.uae);
    if (!navigator.geolocation) return Promise.resolve(fallback);
    if (!fresh && saved && saved.region === region && Date.now() - (saved.at || 0) < 30 * 60000) return Promise.resolve(saved);
    // a place picked by hand stays until the phone's own location is asked for
    if (!fresh && saved && saved.manual) return Promise.resolve(saved);
    if (locAsk) return locAsk;
    locAsk = new Promise(function (resolve) {
      var done = false, finish = function (v) { if (!done) { done = true; locAsk = null; resolve(v); } };
      var failed = function (code) { geoErr = code; finish(Object.assign({}, fallback, { failed: true })); };
      setTimeout(function () { failed(3); }, 9000);
      navigator.geolocation.getCurrentPosition(function (pos) {
        var here = { lat: +pos.coords.latitude.toFixed(4), lng: +pos.coords.longitude.toFixed(4), region: region, at: Date.now() };
        var old = saved && Math.abs(saved.lat - here.lat) < 0.005 && Math.abs(saved.lng - here.lng) < 0.005 && saved.name ? saved : null;
        (old ? Promise.resolve(old) : placeName(here.lat, here.lng)).then(function (n) {
          if (n) { here.name = n.name; here.full = n.full; here.cc = n.cc; }
          geoErr = 0;
          lsSet("time-prayer-loc", here);
          finish(here);
        });
      }, function (err) { failed(err && err.code || 2); }, { enableHighAccuracy: true, timeout: 8000, maximumAge: 30 * 60000 });
    });
    return locAsk;
  }

  function getJSON(url, ms) {
    var ctl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, ms || 6000);
    return fetch(url, ctl ? { signal: ctl.signal } : {}).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .finally(function () { clearTimeout(timer); });
  }
  // the name of the spot: OpenStreetMap (neighbourhood, area, city), else BigDataCloud (city)
  function placeName(lat, lng) {
    var lang = T("en", "ar");
    return getJSON("https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=16&lat=" + lat + "&lon=" + lng + "&accept-language=" + lang)
      .then(function (d) {
        var a = d.address || {};
        var parts = [a.neighbourhood || a.quarter || a.residential, a.suburb || a.city_district, a.city || a.town || a.village || a.county, a.state]
          .filter(function (x, i, all) { return x && all.indexOf(x) === i; });
        if (!parts.length) throw new Error("no name");
        return { name: parts.slice(0, 3).join(T(", ", "، ")), full: d.display_name, cc: String(a.country_code || "").toUpperCase() || null };
      })
      .catch(function () {
        return getJSON("https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=" + lat + "&longitude=" + lng + "&localityLanguage=" + lang)
          .then(function (d) { return { name: [d.locality, d.city, d.countryName].filter(function (x, i, all) { return x && all.indexOf(x) === i; }).join(T(", ", "، ")), cc: d.countryCode || null }; });
      })
      .catch(function () { return null; });
  }
  // that day's times for that spot: AlAdhan (official method of the country, chosen by it),
  // kept per day and place; offline → worked out on the phone
  function prayerTimesFor(date, place) {
    var key = "time-prayer-times";
    var cache = lsGet(key) || {};
    var id = date + "|" + place.lat.toFixed(2) + "," + place.lng.toFixed(2);
    if (cache[id]) return Promise.resolve(cache[id]);
    var d = date.split("-");
    return getJSON("https://api.aladhan.com/v1/timings/" + d[2] + "-" + d[1] + "-" + d[0] + "?latitude=" + place.lat + "&longitude=" + place.lng)
      .then(function (r) {
        var t = r.data.timings, hm = function (x) { return String(x).slice(0, 5); };
        var out = { fajr: hm(t.Fajr), sunrise: hm(t.Sunrise), dhuhr: hm(t.Dhuhr), asr: hm(t.Asr), maghrib: hm(t.Maghrib), isha: hm(t.Isha),
          source: "AlAdhan", method: ((r.data.meta && r.data.meta.method && r.data.meta.method.name) || "").replace(/\s*\(experimental\)/i, "").replace(/^Dubai$/, "UAE") };
        if (!/^\d\d:\d\d$/.test(out.fajr)) throw new Error("bad times");
        Object.keys(cache).forEach(function (k) { if (k.slice(0, 10) < addDays(todayISO(), -2)) delete cache[k]; });
        cache[id] = out; lsSet(key, cache);
        return out;
      })
      .catch(function () {
        var pt = window.Prayer.times(date, place.lat, place.lng);
        pt.source = "device"; pt.method = "";
        return pt;
      });
  }

  function hmToMin(hm) { var p = String(hm).split(":"); return (+p[0]) * 60 + (+p[1]); }
  function minToHm(m) { m = ((m % 1440) + 1440) % 1440; return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0"); }
  // "15:22" -> "3:22"; the from–to says ص/م (AM/PM) once, at the end
  function clock12(hm) { var m = hmToMin(hm), h = Math.floor(m / 60) % 12 || 12; return h + ":" + String(m % 60).padStart(2, "0"); }
  function ampm(hm) { return hmToMin(hm) < 720 ? T("AM", "ص") : T("PM", "م"); }
  function fmtSlot(from, to) {
    if (!to) return clock12(from) + " " + ampm(from);
    return clock12(from) + "–" + clock12(to) + " " + ampm(to);
  }

  // the plan for one day: each prayer's half hour, the azkar after Fajr and Asr
  function prayerPlan(date, place, pt) {
    var set = prayerSettings();
    var friday = new Date(date + "T12:00:00").getDay() === 5;
    var plan = {};
    PRAYER_KEYS.forEach(function (k) {
      var adhan = hmToMin(pt[k]);
      if (k === "dhuhr" && friday) {
        var kh = set.jumuah ? hmToMin(set.jumuah) : adhan;
        var start = Math.floor(kh / 30) * 30;
        plan["prayer:dhuhr"] = { from: minToHm(start), to: minToHm(Math.ceil((kh + 40) / 30) * 30),
          note: T("Jumu'ah · khutba " + clock12(minToHm(kh)), "الجمعة · الخطبة " + clock12(minToHm(kh))), adhan: pt[k] };
        return;
      }
      var iqama = adhan + (Number(set[k]) || 0);
      var from = Math.floor(iqama / 30) * 30;
      plan["prayer:" + k] = { from: minToHm(from), to: minToHm(from + 30), adhan: pt[k],
        note: T("Adhan " + clock12(pt[k]) + " · Iqama " + clock12(minToHm(iqama)), "أذان " + clock12(pt[k]) + " · إقامة " + clock12(minToHm(iqama))) };
    });
    var az = set.azkar;
    var fe = hmToMin(plan["prayer:fajr"].to), ae = hmToMin(plan["prayer:asr"].to);
    plan["azkar:morning"] = { from: minToHm(fe), to: minToHm(fe + az), note: T("after Fajr · sunrise " + clock12(pt.sunrise), "بعد الفجر · الشروق " + clock12(pt.sunrise)) };
    plan["azkar:evening"] = { from: minToHm(ae), to: minToHm(ae + az), note: T("after Asr · Maghrib " + clock12(pt.maghrib), "بعد العصر · المغرب " + clock12(pt.maghrib)) };
    // breakfast right after the morning azkar; work starts when it ends
    var me = fe + az;
    if (set.breakfast > 0) plan["life:breakfast"] = { from: minToHm(me), to: minToHm(me + set.breakfast), note: T("then work starts", "وبعدها الشغل") };
    // qailula: an hour after the Dhuhr (or Jumu'ah) block
    if (set.nap > 0) { var de = hmToMin(plan["prayer:dhuhr"].to); plan["life:nap"] = { from: minToHm(de), to: minToHm(de + set.nap), note: T("qailula", "القيلولة") }; }
    // gym on its days: after everything (after Isha) or in the slump after Asr
    var dow = new Date(date + "T12:00:00").getDay();
    if (set.gymDays.indexOf(dow) >= 0) {
      var gs = set.gymWhen === "slump" ? hmToMin(plan["azkar:evening"].to) : hmToMin(plan["prayer:isha"].to);
      plan["life:gym"] = { from: minToHm(gs), to: minToHm(gs + set.gymMin), note: set.gymWhen === "slump" ? T("when the head switches off", "وقت ما الدماغ بتفصل") : T("after everything", "بعد كل حاجة") };
    }
    // sleep: 6 hours, ending at tomorrow's Fajr adhan where you are
    if (set.sleepH > 0 && window.Prayer) {
      var nf = hmToMin(window.Prayer.times(addDays(date, 1), place.lat, place.lng).fajr);
      var bed = Math.floor((nf - set.sleepH * 60) / 15) * 15;
      plan["life:sleep"] = { from: minToHm(bed), to: minToHm(nf), note: T(set.sleepH + "h · wake for Fajr " + clock12(minToHm(nf)), set.sleepH + " ساعات · اصحى للفجر " + clock12(minToHm(nf))) };
    }
    return { times: pt, plan: plan, place: place, set: set, friday: friday };
  }

  function religionCategoryId() {
    var cats = (state.quarterDetail && state.quarterDetail.categories) || [];
    var c = cats.filter(function (x) { return /relig|islam|deen|faith|spirit|prayer|دين|عباد|صلا|روح/i.test(x.name || ""); })[0];
    return c ? c.id : null;
  }

  var lastPrayer = null; // { date, ... } what the bar shows
  function prayerSync(date, tasks) {
    var set = prayerSettings();
    if (!window.Prayer || !set.on || date < todayISO()) { lastPrayer = null; renderPrayerBar(date); return Promise.resolve(false); }
    var placeP = prayerPlace(false), timesP = placeP.then(function (place) { return prayerTimesFor(date, place); });
    return Promise.all([placeP, timesP]).then(function (both) {
      var place = both[0];
      if (state.currentDate !== date) return false;
      var day = prayerPlan(date, place, both[1]);
      lastPrayer = Object.assign({ date: date }, day);
      renderPrayerBar(date);
      var made = lsGet("time-prayer-made") || {};
      var used = {}, jobs = [];
      Object.keys(day.plan).forEach(function (key) {
        var want = day.plan[key];
        var t = tasks.filter(function (x) { return x.auto_key && x.auto_key.replace(/:hand$/, "") === key; })[0] ||
          tasks.filter(function (x) { return !x.auto_key && !used[x.id] && PRAYER_MATCH[key].test(x.title || ""); })[0];
        if (t) {
          used[t.id] = true;
          made[date + "|" + key] = 1; // seen on this day: if you delete it later, it stays deleted
          if (t.done || /:hand$/.test(t.auto_key || "")) return;
          if (t.time_from === want.from && t.time_to === want.to && t.time_note === want.note && t.auto_key === key) return;
          jobs.push(api("/api/tasks?id=" + t.id, { method: "PATCH", body: { time_from: want.from, time_to: want.to, time_note: want.note, auto_key: key } }));
          return;
        }
        // missing: added once a day (if you delete it, it stays deleted)
        if (made[date + "|" + key] || (state.daySkips || []).indexOf(key) >= 0) return;
        made[date + "|" + key] = 1;
        jobs.push(api("/api/tasks", { method: "POST", body: {
          task_date: date, title: PRAYER_TITLE[key], icon: AUTO_ICON[key] || (/^azkar/.test(key) ? "📿" : "🕌"), category_id: religionCategoryId(),
          time_from: want.from, time_to: want.to, time_note: want.note, auto_key: key } }));
      });
      // only the last two weeks of "added" marks are kept
      var cut = addDays(todayISO(), -14);
      Object.keys(made).forEach(function (k) { if (k.slice(0, 10) < cut) delete made[k]; });
      lsSet("time-prayer-made", made);
      if (!jobs.length) return false;
      return Promise.all(jobs).then(function () { return true; });
    }).catch(function () { return false; });
  }

  function renderPrayerBar(date) {
    var bar = $("#prayerBar");
    if (!bar) return;
    var set = prayerSettings();
    if (!lastPrayer || lastPrayer.date !== date) {
      window.__timePrayer = null;
      window.dispatchEvent(new CustomEvent("time:prayer", { detail: null }));
      bar.hidden = !(!set.on && date >= todayISO());
      if (!bar.hidden) bar.innerHTML = '<button type="button" class="btn btn--ghost btn--sm" data-prayer="on">' + T("🕌 Turn prayer times on", "🕌 شغّل مواقيت الصلاة") + '</button>';
      return;
    }
    var pt = lastPrayer.times, now = new Date(), nowMin = now.getHours() * 60 + now.getMinutes();
    window.__timePrayer = { times: pt, date: date, today: date === todayISO(), friday: lastPrayer.friday,
      names: { fajr: T("Fajr", "الفجر"), sunrise: T("Sunrise", "الشروق"), dhuhr: lastPrayer.friday ? T("Jumu'ah", "الجمعة") : T("Dhuhr", "الظهر"), asr: T("Asr", "العصر"), maghrib: T("Maghrib", "المغرب"), isha: T("Isha", "العشاء") } };
    window.dispatchEvent(new CustomEvent("time:prayer", { detail: window.__timePrayer }));
    var isToday = date === todayISO(), next = null;
    var keys = ["fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha"];
    if (isToday) next = keys.filter(function (k) { return k !== "sunrise" && hmToMin(pt[k]) > nowMin; })[0] || null;
    var name = function (k) { return k === "dhuhr" && lastPrayer.friday ? T(PRAYER_EN.jumuah, PRAYER_AR.jumuah) : T(PRAYER_EN[k], PRAYER_AR[k]); };
    var pl = lastPrayer.place;
    var where = pl.guess ? T(pl.name + " (guess — allow location)", pl.name + " (تقريبي — اسمح بالموقع)")
      : (pl.name || T("your location", "مكانك دلوقتي")) + (pl.manual ? T(" (set by hand)", " (متحدد بإيدك)") : "");
    var src = pt.source === "AlAdhan" ? T("Times: AlAdhan", "المواقيت: AlAdhan") + (pt.method ? " · " + pt.method : "")
      : T("Times: worked out on this phone (offline)", "المواقيت: محسوبة على الموبايل (من غير نت)");
    var rule = IQAMA_DEFAULT[lastPrayer.set.region] ? T("Iqama: " + ({ AE: "UAE", EG: "Egypt", SA: "Saudi" }[lastPrayer.set.region] || lastPrayer.set.region) + " rule", "الإقامة: قاعدة " + ({ AE: "الإمارات", EG: "مصر", SA: "السعودية" }[lastPrayer.set.region] || lastPrayer.set.region))
      : T("Iqama: general rule", "الإقامة: قاعدة عامة");
    bar.hidden = false;
    bar.innerHTML =
      '<div class="prayer-bar__times">' + keys.map(function (k) {
        return '<span class="prayer-bar__t' + (k === next ? " is-next" : "") + (k === "sunrise" ? " is-sun" : "") + '"><small>' + esc(name(k)) + '</small><b>' + clock12(pt[k]) + '</b></span>';
      }).join("") + '</div>' +
      '<div class="prayer-bar__foot"><span title="' + esc(pl.full || "") + '">📍 ' + esc(where) + '<small class="prayer-bar__src">' + esc(src) + ' · ' + esc(rule) + '</small></span>' +
      '<button type="button" class="btn btn--ghost btn--sm" data-prayer="locate">' + T("Update location", "حدّث المكان") + '</button>' +
      '<button type="button" class="btn btn--ghost btn--sm" data-prayer="edit" aria-expanded="false">' + T("⚙️ Prayers & my day", "⚙️ الصلاة ويومي") + '</button></div>' +
      '<form class="prayer-bar__set" hidden>' +
        PRAYER_KEYS.map(function (k) {
          return '<label><span>' + esc(T(PRAYER_EN[k], PRAYER_AR[k])) + '</span><input type="number" min="0" max="60" step="1" name="' + k + '" value="' + set[k] + '" /><small>' + T("min", "دقيقة") + '</small></label>';
        }).join("") +
        '<label><span>' + T("Jumu'ah khutba", "خطبة الجمعة") + '</span><input type="time" name="jumuah" value="' + esc(set.jumuah || "") + '" /></label>' +
        '<label><span>' + T("Azkar", "الأذكار") + '</span><input type="number" min="5" max="60" step="5" name="azkar" value="' + set.azkar + '" /><small>' + T("min", "دقيقة") + '</small></label>' +
        '<h4 class="prayer-bar__h">' + T("My day around the prayers", "يومي حوالين الصلاة") + '</h4>' +
        '<label><span>😴 ' + T("Sleep", "النوم") + '</span><input type="number" min="0" max="10" step="0.5" name="sleepH" value="' + set.sleepH + '" /><small>' + T("h before Fajr", "ساعات قبل الفجر") + '</small></label>' +
        '<label><span>💤 ' + T("Qailula", "القيلولة") + '</span><input type="number" min="0" max="120" step="15" name="nap" value="' + set.nap + '" /><small>' + T("min after Dhuhr", "دقيقة بعد الضهر") + '</small></label>' +
        '<label><span>🍳 ' + T("Breakfast", "الفطار") + '</span><input type="number" min="0" max="60" step="5" name="breakfast" value="' + set.breakfast + '" /><small>' + T("min after azkar", "دقيقة بعد الأذكار") + '</small></label>' +
        '<div class="prayer-bar__gym"><span>🏋️ ' + T("Gym days", "أيام الجيم") + '</span><div class="cal-days">' + [6, 0, 1, 2, 3, 4, 5].map(function (d) {
          return '<button type="button" class="cal-dchip" data-gym="' + d + '" aria-pressed="' + (set.gymDays.indexOf(d) >= 0) + '">' + [T("Sun", "حد"), T("Mon", "اتنين"), T("Tue", "تلات"), T("Wed", "أربع"), T("Thu", "خميس"), T("Fri", "جمعة"), T("Sat", "سبت")][d] + '</button>';
        }).join("") + '</div>' +
        '<select name="gymWhen"><option value="isha"' + (set.gymWhen === "isha" ? " selected" : "") + '>' + T("After everything (after Isha)", "بعد كل حاجة (بعد العشا)") + '</option>' +
        '<option value="slump"' + (set.gymWhen === "slump" ? " selected" : "") + '>' + T("When my head switches off (after Asr)", "وقت ما دماغي بتفصل (بعد العصر)") + '</option></select></div>' +
        '<div class="prayer-bar__btns"><button type="submit" class="btn btn--primary btn--sm">' + T("Save", "حفظ") + '</button>' +
        '<button type="button" class="btn btn--ghost btn--sm" data-prayer="off">' + T("Turn off", "اقفلها") + '</button></div>' +
        '<p class="muted prayer-bar__hint">' + T("Minutes from adhan to iqama at your mosque. Each prayer gets the half hour the iqama falls in.",
          "الدقايق من الأذان للإقامة في مسجدك. كل صلاة بتاخد نص الساعة اللي الإقامة جواها.") + '</p>' +
      '</form>';
  }

  /* when the location can't be read: say where to allow it for this browser and device,
     open the Mac's own setting when the Mac has it off, or let the place be typed in */
  function geoHelp(code) {
    var bar = $("#prayerBar"); if (!bar) return;
    var box = document.getElementById("geoHelp");
    if (!code) { if (box) box.remove(); return; }
    if (!box) { box = document.createElement("div"); box.id = "geoHelp"; box.className = "geo-help"; bar.parentNode.insertBefore(box, bar.nextSibling); }
    var ua = navigator.userAgent, ios = /iPhone|iPad|iPod/.test(ua) || (/Mac/.test(ua) && navigator.maxTouchPoints > 1);
    var mac = !ios && /Mac/.test(ua), edge = /Edg\//.test(ua), safari = /Safari/.test(ua) && !/Chrome|Chromium|Edg\//.test(ua);
    var app = edge ? "Microsoft Edge" : safari ? "Safari" : "Google Chrome";
    var steps;
    if (code === 1 && ios) steps = [
      T("Open the iPhone <b>Settings</b> app → <b>Privacy & Security</b> → <b>Location Services</b> → make sure it's on.", "افتح <b>الإعدادات</b> في الآيفون ← <b>الخصوصية والأمان</b> ← <b>خدمات الموقع</b> ← اتأكد إنها شغالة."),
      T("In the same list: <b>Safari Websites</b> → <b>While Using the App</b>.", "في نفس القايمة: <b>مواقع Safari</b> ← <b>أثناء استخدام التطبيق</b>."),
      T("Back in Safari on this page: tap <b>aA</b> → <b>Website Settings</b> → <b>Location</b> → <b>Allow</b>.", "ارجع للصفحة في Safari: دوس <b>aA</b> ← <b>إعدادات الموقع الإلكتروني</b> ← <b>الموقع</b> ← <b>سماح</b>.")];
    else if (code === 1 && safari) steps = [
      T("Top menu: <b>Safari</b> → <b>Settings for ahmedtarek.tech…</b>", "من القايمة اللي فوق: <b>Safari</b> ← <b>Settings for ahmedtarek.tech…</b>"),
      T("<b>Location</b> → <b>Allow</b>, then press <b>Try again</b> below.", "<b>Location</b> ← <b>Allow</b>، وبعدين دوس <b>جرّب تاني</b> تحت.")];
    else if (code === 1) steps = [
      T("Click the <b>🔒 lock</b> (or <b>ⓘ</b>) at the left of the address bar, where it says ahmedtarek.tech.", "دوس على <b>🔒 القفل</b> (أو <b>ⓘ</b>) على شمال شريط العنوان، جنب ahmedtarek.tech."),
      T("Find <b>Location</b> and switch it to <b>Allow</b>.", "دوّر على <b>Location / الموقع</b> وخليها <b>Allow / سماح</b>."),
      T("Press <b>Try again</b> below (or reload the page).", "دوس <b>جرّب تاني</b> تحت (أو اعمل reload للصفحة).")];
    else if (mac) steps = [
      T("Your Mac has location off for " + app + ". Press the button below — it opens the Mac's Location Services.", "الماك قافل الموقع عن " + app + ". دوس الزرار اللي تحت، هيفتحلك إعدادات خدمات الموقع في الماك."),
      T("Turn on <b>Location Services</b>, then turn on <b>" + app + "</b> in the list.", "شغّل <b>Location Services</b>، وبعدين شغّل <b>" + app + "</b> في القايمة."),
      T("Come back and press <b>Try again</b>.", "ارجع هنا ودوس <b>جرّب تاني</b>.")];
    else steps = [
      T("Turn on your device's location, then press <b>Try again</b>.", "شغّل الموقع في جهازك، وبعدين دوس <b>جرّب تاني</b>."),
      T("Or type your area below.", "أو اكتب منطقتك تحت.")];
    box.innerHTML = '<button type="button" class="iconbtn geo-help__x" data-geo="close" aria-label="' + T("Close", "قفل") + '">✕</button>' +
      '<h4>📍 ' + (code === 1 ? T("Location is blocked for this site", "الموقع مقفول للموقع ده") : T("Couldn't get your location", "مقدرتش أجيب مكانك")) + '</h4>' +
      '<ol>' + steps.map(function (x) { return '<li>' + x + '</li>'; }).join("") + '</ol>' +
      '<div class="geo-help__btns">' +
        (mac && code !== 1 ? '<a class="btn btn--primary btn--sm" href="x-apple.systempreferences:com.apple.preference.security?Privacy_LocationServices">⚙️ ' + T("Open Mac location settings", "افتح إعدادات الموقع في الماك") + '</a>' : '') +
        '<button type="button" class="btn btn--primary btn--sm" data-geo="retry">🔄 ' + T("Try again", "جرّب تاني") + '</button></div>' +
      '<form class="geo-help__find"><label>' + T("Or type your area / city:", "أو اكتب منطقتك أو مدينتك:") + '</label>' +
        '<div><input name="q" placeholder="' + T("e.g. Al Barsha, Dubai", "مثلاً: البرشاء، دبي") + '" autocomplete="off"><button type="submit" class="btn btn--ghost btn--sm">' + T("Search", "دوّر") + '</button></div>' +
        '<ul class="geo-help__res"></ul></form>';
    box.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
  document.addEventListener("click", function (ev) {
    var g = ev.target.closest && ev.target.closest("[data-geo]");
    if (!g) return;
    if (g.dataset.geo === "close") { geoHelp(0); return; }
    if (g.dataset.geo === "retry") { var lb = document.querySelector('#prayerBar [data-prayer="locate"]'); if (lb) lb.click(); return; }
    if (g.dataset.geo === "pick") {
      var r = JSON.parse(g.dataset.place);
      var region = window.Prayer ? window.Prayer.regionOf() : "uae";
      lsSet("time-prayer-loc", { lat: r.lat, lng: r.lng, name: r.name, full: r.full, cc: r.cc, region: region, at: Date.now(), manual: true });
      geoHelp(0);
      toast(T("📍 Set to " + r.name + " — prayer times updated ✓", "📍 اتظبط على " + r.name + " — المواقيت اتحدّثت ✓"));
      loadDay(state.currentDate, { skipEnterAnimation: true });
    }
  });
  document.addEventListener("submit", function (ev) {
    var f = ev.target;
    if (!f.classList || !f.classList.contains("geo-help__find")) return;
    ev.preventDefault();
    var q = f.elements.q.value.trim(), list = f.querySelector(".geo-help__res");
    if (q.length < 2) return;
    list.innerHTML = '<li class="muted">' + T("Searching…", "بدوّر…") + '</li>';
    fetch("https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=6&accept-language=" + T("en", "ar") + "&q=" + encodeURIComponent(q))
      .then(function (r) { return r.json(); })
      .then(function (rows) {
        if (!rows.length) { list.innerHTML = '<li class="muted">' + T("Nothing found — try the city name", "ملقتش حاجة — جرّب اسم المدينة") + '</li>'; return; }
        list.innerHTML = rows.map(function (x) {
          var a = x.address || {};
          var name = [a.neighbourhood || a.suburb || a.quarter, a.city || a.town || a.village || a.state].filter(Boolean).join(T(", ", "، ")) || x.name || x.display_name.split(",")[0];
          var place = { lat: +(+x.lat).toFixed(4), lng: +(+x.lon).toFixed(4), name: name, full: x.display_name, cc: String(a.country_code || "").toUpperCase() || null };
          return '<li><button type="button" data-geo="pick" data-place="' + esc(JSON.stringify(place)) + '"><b>' + esc(name) + '</b><small>' + esc(x.display_name) + '</small></button></li>';
        }).join("");
      })
      .catch(function () { list.innerHTML = '<li class="muted">' + T("Search failed — check the internet", "البحث وقع — اتأكد من النت") + '</li>'; });
  });

  document.addEventListener("click", function (ev) {
    var b = ev.target.closest && ev.target.closest("[data-prayer]");
    if (!b || !$("#prayerBar").contains(b)) return;
    var what = b.dataset.prayer;
    if (what === "gymday") return;
    if (what === "edit") {
      var f = $("#prayerBar .prayer-bar__set");
      f.hidden = !f.hidden; b.setAttribute("aria-expanded", String(!f.hidden));
      return;
    }
    if (what === "locate") {
      busy(b, true);
      // blocked already: asking again shows nothing, so say how to allow it
      var perm = navigator.permissions && navigator.permissions.query ? navigator.permissions.query({ name: "geolocation" }).then(function (r) { return r.state; }).catch(function () { return ""; }) : Promise.resolve("");
      perm.then(function (state0) {
        if (state0 === "denied") { geoErr = 1; geoHelp(1); return; }
        return prayerPlace(true).then(function (p) {
          if (p.failed || p.guess) { geoHelp(geoErr || 2); return; }
          geoHelp(0);
          toast(T("📍 You're in " + (p.name || "this spot") + " — prayer times updated ✓", "📍 إنت في " + (p.name || "المكان ده") + " — المواقيت اتحدّثت ✓"));
          return loadDay(state.currentDate, { skipEnterAnimation: true });
        });
      }).finally(function () { busy(b, false); });
      return;
    }
    if (what === "off" || what === "on") {
      savePrayerSettings({ on: what === "on" });
      loadDay(state.currentDate, { skipEnterAnimation: true });
    }
  });
  document.addEventListener("click", function (ev) {
    var g = ev.target.closest && ev.target.closest("[data-gym]");
    if (g) g.setAttribute("aria-pressed", String(g.getAttribute("aria-pressed") !== "true"));
  });
  document.addEventListener("submit", function (ev) {
    var f = ev.target;
    if (!f.classList || !f.classList.contains("prayer-bar__set")) return;
    ev.preventDefault();
    var v = {};
    PRAYER_KEYS.forEach(function (k) { v[k] = Math.max(0, Math.min(60, Math.round(Number(f.elements[k].value) || 0))); });
    v.jumuah = f.elements.jumuah.value || "";
    var gym = [].map.call(f.querySelectorAll('[data-gym][aria-pressed="true"]'), function (b) { return +b.dataset.gym; });
    savePrayerSettings({ region: v, azkar: Math.max(5, Math.min(60, Number(f.elements.azkar.value) || 15)), life: {
      sleepH: Math.max(0, Math.min(10, Number(f.elements.sleepH.value) || 0)), nap: Math.max(0, Math.min(120, Number(f.elements.nap.value) || 0)),
      breakfast: Math.max(0, Math.min(60, Number(f.elements.breakfast.value) || 0)), gymDays: gym, gymWhen: f.elements.gymWhen.value } });
    toast(T("Iqama times saved ✓", "مواعيد الإقامة اتحفظت ✓"));
    loadDay(state.currentDate, { skipEnterAnimation: true });
  });

  // what time-cal.js (calendar views, repeating events, plan my day) uses from here
  window.__time = {
    openDaySettings: function () {
      var b = document.querySelector('#prayerBar [data-prayer="edit"]'), f = document.querySelector("#prayerBar .prayer-bar__set");
      if (b && f && f.hidden) b.click();
      if (f) f.scrollIntoView({ behavior: "smooth", block: "center" });
    },
    api: api, state: state, toast: toast, esc: esc, T: T, todayISO: todayISO, addDays: addDays,
    loadDay: loadDay, afterTaskChange: afterTaskChange, startEditTask: startEditTask, fmtSlot: fmtSlot,
    clock12: clock12, hmToMin: hmToMin, minToHm: minToHm, playAdd: function () { playAddSound(); },
    categories: function () { return (state.quarterDetail && state.quarterDetail.categories) || []; },
    // a later day's prayers and azkar, worked out on the phone (for the week / month views)
    prayerPlanFor: function (date) {
      var set = prayerSettings();
      if (!set.on || !window.Prayer) return null;
      var region = window.Prayer.regionOf();
      var place = lsGet("time-prayer-loc") || CAPITAL[region] || CAPITAL.uae;
      var pt = window.Prayer.times(date, place.lat, place.lng);
      return prayerPlan(date, place, pt).plan;
    },
    prayerTitle: PRAYER_TITLE,
    autoIcon: AUTO_ICON,
  };

  function renderTasks(tasks, opts) {
    opts = opts || {};
    state.dayTasks = tasks;
    var animate = opts.animate !== false;
    var total = tasks.length;
    // a half-done task counts as half a task
    var done = tasks.reduce(function (n, t) { return n + (t.done ? 1 : t.half ? 0.5 : 0); }, 0);
    animateCount($("#dayPercent"), total ? Math.round((done / total) * 100) : 0, "%");
    window.dispatchEvent(new CustomEvent("time:day", { detail: { pct: total ? Math.round((done / total) * 100) : 0, done: done, total: total } }));
    $("#dayCount").textContent = T(done + " of " + total + " task" + (total === 1 ? "" : "s"), done + " من " + total + " " + (total >= 3 && total <= 10 ? "مهام" : "مهمة"));

    var list = $("#taskList");
    list.innerHTML = "";
    $("#tasksEmpty").hidden = total > 0;
    tasks.forEach(function (t) {
      var row = document.createElement("div");
      row.className = "task-row" + (t.done ? " task-row--done" : "") + (t.half ? " task-row--half" : "") + (animate ? " task-row--enter" : "");
      row.dataset.id = t.id;
      if (t.auto_key) row.dataset.auto = String(t.auto_key).split(":")[0];
      var meta = [];
      if (t.time_from) meta.push('<b class="task-row__slot">🕒 ' + esc(fmtSlot(t.time_from, t.time_to)) + '</b>' +
        (t.time_note ? ' <span class="task-row__note">' + esc(t.time_note) + '</span>' : ''));
      if (t.category_name) meta.push(esc(t.category_name));
      if (t.planned_hours != null) meta.push(fmtH(t.planned_hours) + T(" planned", " مخطط"));
      if (state.selectedTaskIds[t.id]) row.classList.add("task-row--selected");
      row.innerHTML =
        '<span class="task-row__select" aria-hidden="true"></span>' +
        '<span class="task-row__handle" title="' + T("Drag to reorder", "اسحب عشان ترتّب") + '">⠿</span>' +
        '<input type="checkbox" class="task-row__check" ' + (t.done ? "checked" : "") + ' aria-label="' + T("Mark done", "علّم إنها خلصت") + '" />' +
        '<span class="task-row__icon">' + esc(t.icon || "📝") + '</span>' +
        '<div class="task-row__body"><div class="task-row__title">' + esc(t.title) + '</div>' +
        (meta.length ? '<div class="task-row__meta">' + meta.join(" · ") + '</div>' : '') + '</div>' +
        ((t.done || t.half) && t.completed_at ? '<button type="button" class="task-row__time" title="' + T("Done at — click to change it", "وقت ما خلصت — دوس عشان تغيّره") + '">🕒 ' +
          clockOf(t.completed_at) + '</button>' : '') +
        (t.link ? '<a class="iconbtn task-row__link" href="' + esc(t.link) + '" target="_blank" rel="noopener" title="' + T("Open the meeting link", "افتح لينك الميعاد") + '">🔗</a>' : '') +
        (t.done ? '<input type="number" min="0" step="0.25" class="task-row__actual" title="' + T("Actual hours", "الساعات الفعلية") + '" value="' +
          (t.actual_hours != null ? Number(t.actual_hours) : '') + '" />' : '') +
        '<button type="button" class="iconbtn iconbtn--half" aria-pressed="' + !!t.half + '" title="' +
          (t.half ? T("Half done — click to undo", "نص خلصان — دوس عشان ترجّعها") : T("Mark half done", "علّم إنها نص خلصانة")) + '">½</button>' +
        '<button type="button" class="iconbtn iconbtn--edit" title="' + T("Edit task", "تعديل المهمة") + '">✎</button>' +
        '<button type="button" class="iconbtn" title="' + T("Delete task", "مسح المهمة") + '">✕</button>';
      // the circle shows a half as a half-filled circle
      row.querySelector(".task-row__check").indeterminate = !!t.half;

      row.querySelector(".task-row__check").addEventListener("change", function (ev) {
        if (ev.target.checked) playCheckSound();
        api("/api/tasks?id=" + t.id, { method: "PATCH", body: { done: ev.target.checked } })
          .then(function () { return afterTaskChange(); })
          .catch(function (e) { toast(e.message, true); ev.target.checked = !ev.target.checked; });
      });
      var timeBtn = row.querySelector(".task-row__time");
      if (timeBtn) timeBtn.addEventListener("click", function () { openClock(t); });
      var actualInput = row.querySelector(".task-row__actual");
      if (actualInput) {
        actualInput.addEventListener("change", function () {
          var v = actualInput.value === "" ? null : Number(actualInput.value);
          api("/api/tasks?id=" + t.id, { method: "PATCH", body: { actual_hours: v } })
            .then(function () { return afterTaskChange(); })
            .catch(function (e) { toast(e.message, true); });
        });
      }
      row.addEventListener("click", function () {
        if (!state.selectingTasks) return;
        toggleTaskSelected(t.id, row);
      });
      row.querySelector(".iconbtn--half").addEventListener("click", function () {
        if (!t.half) playCheckSound();
        api("/api/tasks?id=" + t.id, { method: "PATCH", body: { half: !t.half } })
          .then(function () { return afterTaskChange(); })
          .catch(function (e) { toast(e.message, true); });
      });
      row.querySelector(".iconbtn--edit").addEventListener("click", function () { startEditTask(t); });
      row.querySelector(".iconbtn:not(.iconbtn--edit):not(.iconbtn--half)").addEventListener("click", function () {
        if (!confirm(T('Delete task "' + t.title + '"?', 'تمسح المهمة "' + t.title + '"؟'))) return;
        api("/api/tasks?id=" + t.id, { method: "DELETE" })
          .then(function () { playDeleteSound(); if (state.editingTaskId === t.id) stopEditTask(); return afterTaskChange(); })
          .catch(function (e) { toast(e.message, true); });
      });
      list.appendChild(row);
    });

    // a selection can only hold tasks that are still on screen
    var present = {};
    tasks.forEach(function (t) { present[t.id] = true; });
    Object.keys(state.selectedTaskIds).forEach(function (id) {
      if (!present[id]) delete state.selectedTaskIds[id];
    });
    state.visibleTaskIds = tasks.map(function (t) { return t.id; });
    $("#taskSelect").hidden = total === 0;
    if (!total && state.selectingTasks) exitTaskSelect();
    else syncTaskSelectBar();
  }

  /* ---------------- "done at" clock ----------------
     A 24-hour dial: 1–12 on the outer ring, 00 and 13–23 on the inner one,
     then minutes. Drag the hand (picking the hour moves on to the minutes)
     or type into the two boxes. Saved on the day on screen, so the graph
     puts the point there. */

  var clock = { task: null, h: 0, m: 0, mode: "h" };
  var CLOCK_OUTER = 0.40, CLOCK_INNER = 0.26; // label rings, as a share of the face width

  (function buildClockFace() {
    var face = $("#clockFace");
    function label(text, ring, i, cls) {
      var el = document.createElement("span");
      var a = i * 30 * Math.PI / 180;
      el.className = "clock-face__num " + cls;
      el.textContent = text;
      el.style.left = (50 + ring * 100 * Math.sin(a)) + "%";
      el.style.top = (50 - ring * 100 * Math.cos(a)) + "%";
      face.appendChild(el);
    }
    for (var i = 0; i < 12; i++) {
      label(i === 0 ? "12" : String(i), CLOCK_OUTER, i, "clock-face__num--h");
      label(i === 0 ? "00" : String(i + 12), CLOCK_INNER, i, "clock-face__num--h clock-face__num--inner");
      label(String(i * 5).padStart(2, "0"), CLOCK_OUTER, i, "clock-face__num--m");
    }
  })();

  function openClock(t) {
    var d = new Date(t.completed_at);
    clock.task = t;
    clock.h = d.getHours();
    clock.m = d.getMinutes();
    $("#clockTask").textContent = (t.icon ? t.icon + " " : "") + t.title;
    setClockMode("h");
    $("#clockDialog").showModal();
    $("#clockH").focus();
    $("#clockH").select();
  }

  function setClockMode(mode) {
    clock.mode = mode;
    $("#clockFace").classList.toggle("clock-face--minutes", mode === "m");
    $("#clockH").classList.toggle("clock-read__part--on", mode === "h");
    $("#clockM").classList.toggle("clock-read__part--on", mode === "m");
    drawClock();
  }

  function drawClock(skipInputs) {
    if (!skipInputs) {
      $("#clockH").value = String(clock.h).padStart(2, "0");
      $("#clockM").value = String(clock.m).padStart(2, "0");
    }
    var deg, ring;
    if (clock.mode === "h") {
      deg = (clock.h % 12) * 30;
      ring = clock.h === 0 || clock.h > 12 ? CLOCK_INNER : CLOCK_OUTER;
    } else {
      deg = clock.m * 6;
      ring = CLOCK_OUTER;
    }
    var hand = $("#clockHand");
    hand.style.height = (ring * 100) + "%";
    hand.style.transform = "rotate(" + deg + "deg)";
    document.querySelectorAll("#clockFace .clock-face__num").forEach(function (el) {
      var on = clock.mode === "h"
        ? el.classList.contains("clock-face__num--h") && Number(el.textContent) === clock.h
        : el.classList.contains("clock-face__num--m") && Number(el.textContent) === clock.m;
      el.classList.toggle("clock-face__num--on", on);
    });
  }

  function clockPick(ev) {
    var box = $("#clockFace").getBoundingClientRect();
    var x = ev.clientX - (box.left + box.width / 2);
    var y = ev.clientY - (box.top + box.height / 2);
    var deg = (Math.atan2(x, -y) * 180 / Math.PI + 360) % 360;
    if (clock.mode === "h") {
      var i = Math.round(deg / 30) % 12;
      var inner = Math.sqrt(x * x + y * y) < box.width * (CLOCK_OUTER + CLOCK_INNER) / 2;
      clock.h = inner ? (i === 0 ? 0 : i + 12) : (i === 0 ? 12 : i);
    } else {
      clock.m = Math.round(deg / 6) % 60;
    }
    drawClock();
  }

  var clockDragging = false;
  $("#clockFace").addEventListener("pointerdown", function (ev) {
    clockDragging = true;
    this.setPointerCapture(ev.pointerId);
    clockPick(ev);
  });
  $("#clockFace").addEventListener("pointermove", function (ev) { if (clockDragging) clockPick(ev); });
  $("#clockFace").addEventListener("pointerup", function () {
    if (!clockDragging) return;
    clockDragging = false;
    if (clock.mode === "h") { playCheckSound(); setClockMode("m"); }
  });

  // typing: the hour box hands over to the minutes once two digits are in
  [["#clockH", "h", 23], ["#clockM", "m", 59]].forEach(function (c) {
    var input = $(c[0]);
    input.addEventListener("focus", function () { setClockMode(c[1]); input.select(); });
    input.addEventListener("input", function () {
      input.value = input.value.replace(/\D/g, "").slice(0, 2);
      if (input.value === "") return;
      clock[c[1]] = Math.min(c[2], Number(input.value));
      drawClock(true);
      if (c[1] === "h" && input.value.length === 2) $("#clockM").focus();
    });
    input.addEventListener("blur", function () { drawClock(); });
    input.addEventListener("keydown", function (ev) {
      if (ev.key === "Enter") { ev.preventDefault(); saveClock(); }
    });
  });

  $("#btnClockNow").addEventListener("click", function () {
    var now = new Date();
    clock.h = now.getHours();
    clock.m = now.getMinutes();
    drawClock();
  });
  $("#btnClockCancel").addEventListener("click", function () { $("#clockDialog").close(); });
  $("#clockDialog").addEventListener("click", function (ev) { if (ev.target === this) this.close(); });
  $("#btnClockSave").addEventListener("click", saveClock);

  function saveClock() {
    var t = clock.task;
    if (!t) return;
    var at = new Date(state.currentDate + "T" + String(clock.h).padStart(2, "0") + ":" + String(clock.m).padStart(2, "0") + ":00");
    var btn = $("#btnClockSave");
    busy(btn, true);
    api("/api/tasks?id=" + t.id, { method: "PATCH", body: { completed_at: at.toISOString() } })
      .then(function () { $("#clockDialog").close(); return afterTaskChange(); })
      .catch(function (e) { toast(e.message, true); })
      .finally(function () { busy(btn, false); });
  }

  /* ---------------- select several tasks, delete them together ---------------- */

  function selectedTaskCount() { return Object.keys(state.selectedTaskIds).length; }

  function syncTaskSelectBar() {
    var n = selectedTaskCount();
    var all = (state.visibleTaskIds || []).length;
    $("#taskSelectCount").textContent = T(n + " selected", "المحدد: " + n);
    $("#btnDeleteSelected").disabled = n === 0;
    $("#btnDeleteSelected").textContent = n ? T("Delete " + n, "مسح " + n) : T("Delete", "مسح");
    $("#btnSelectAll").textContent = n && n === all ? T("Select none", "إلغاء التحديد") : T("Select all", "تحديد الكل");
  }

  function enterTaskSelect() {
    if (state.editingTaskId) stopEditTask(); // an edit form open on a task being deleted would save into nothing
    state.selectingTasks = true;
    state.selectedTaskIds = {};
    $("#taskList").classList.add("task-list--selecting");
    $("#taskSelect").classList.add("task-select--active");
    $("#btnSelectTasks").hidden = true;
    $("#taskSelectBar").hidden = false;
    syncTaskSelectBar();
  }

  function exitTaskSelect() {
    state.selectingTasks = false;
    state.selectedTaskIds = {};
    $("#taskList").classList.remove("task-list--selecting");
    $("#taskSelect").classList.remove("task-select--active");
    document.querySelectorAll("#taskList .task-row--selected").forEach(function (r) { r.classList.remove("task-row--selected"); });
    $("#btnSelectTasks").hidden = false;
    $("#taskSelectBar").hidden = true;
  }

  function toggleTaskSelected(id, row) {
    if (state.selectedTaskIds[id]) delete state.selectedTaskIds[id];
    else state.selectedTaskIds[id] = true;
    row.classList.toggle("task-row--selected", !!state.selectedTaskIds[id]);
    syncTaskSelectBar();
  }

  $("#btnSelectTasks").addEventListener("click", enterTaskSelect);
  $("#btnCancelSelect").addEventListener("click", exitTaskSelect);

  $("#btnSelectAll").addEventListener("click", function () {
    var ids = state.visibleTaskIds || [];
    var everything = selectedTaskCount() === ids.length && ids.length > 0;
    state.selectedTaskIds = {};
    if (!everything) ids.forEach(function (id) { state.selectedTaskIds[id] = true; });
    document.querySelectorAll("#taskList .task-row").forEach(function (r) {
      r.classList.toggle("task-row--selected", !!state.selectedTaskIds[r.dataset.id]);
    });
    syncTaskSelectBar();
  });

  $("#btnDeleteSelected").addEventListener("click", function () {
    var ids = Object.keys(state.selectedTaskIds);
    if (!ids.length) return;
    if (!confirm(T("Delete " + ids.length + " task" + (ids.length === 1 ? "" : "s") + "? This can't be undone.", "تمسح " + I18N.N(ids.length, "task", "tasks", ["مهمة واحدة", "مهمتين", "مهام", "مهمة"]) + "؟ مش هينفع ترجعها."))) return;
    var btn = this;
    busy(btn, true);
    api("/api/tasks?ids=" + ids.join(","), { method: "DELETE" })
      .then(function (r) {
        playDeleteSound();
        var n = r.count != null ? r.count : ids.length;
        toast(T("Deleted " + n + " task" + (n === 1 ? "" : "s"), "اتمسحت " + I18N.N(n, "task", "tasks", ["مهمة واحدة", "مهمتين", "مهام", "مهمة"])));
        exitTaskSelect();
        return afterTaskChange();
      })
      .catch(function (e) { toast(e.message, true); })
      .finally(function () { busy(btn, false); syncTaskSelectBar(); });
  });

  // Escape backs out of select mode, the way it closes anything else modal
  document.addEventListener("keydown", function (ev) {
    if (ev.key === "Escape" && state.selectingTasks) exitTaskSelect();
  });

  // a task's done/actual-hours change can move the daily % and a category's
  // quarterly progress, so refresh the day, the 14-day strip, and the chart together
  function afterTaskChange() {
    loadGamification();
    return Promise.all([
      loadDay(state.currentDate, { skipEnterAnimation: true }),
      loadHistory({ animate: false }),
      state.selectedQuarterId ? loadQuarterDetail(state.selectedQuarterId) : Promise.resolve(),
    ]);
  }

  /* ---------------- drag to reorder ----------------
     Pointer Events (not the HTML5 drag-and-drop API) so this works with a
     finger on a phone, not just a mouse — native dragstart/dragover never
     fire from a touchscreen. */

  function makeReorderable(opts) {
    var state = null;

    opts.listEl.addEventListener("pointerdown", function (ev) {
      var handle = ev.target.closest(opts.handleSelector);
      var row = handle && handle.closest(opts.rowSelector);
      if (!row) return;
      ev.preventDefault();
      state = { id: Number(row.dataset.id), el: row, pointerId: ev.pointerId };
      row.classList.add(opts.draggingClass);
      try { handle.setPointerCapture(ev.pointerId); } catch (e) {}
    });

    opts.listEl.addEventListener("pointermove", function (ev) {
      if (!state || ev.pointerId !== state.pointerId) return;
      var overEl = document.elementFromPoint(ev.clientX, ev.clientY);
      var over = overEl && overEl.closest(opts.rowSelector);
      if (!over || over === state.el || over.parentElement !== opts.listEl) return;
      var rect = over.getBoundingClientRect();
      var before = (ev.clientY - rect.top) < rect.height / 2;
      opts.listEl.insertBefore(state.el, before ? over : over.nextSibling);
    });

    function finish(ev) {
      if (!state || (ev && ev.pointerId !== state.pointerId)) return;
      state.el.classList.remove(opts.draggingClass);
      // a list can hold things that aren't rows (a note above the cards, the
      // "add" form below them) — those have no id and must not enter the order
      var ids = Array.prototype.slice.call(opts.listEl.children)
        .filter(function (el) { return el.matches(opts.rowSelector); })
        .map(function (el) { return Number(el.dataset.id); });
      state = null;
      if (opts.onReorder) opts.onReorder(ids);
      else api(opts.apiUrl, { method: "PATCH", body: { ids: ids } }).catch(opts.onError);
    }
    opts.listEl.addEventListener("pointerup", finish);
    opts.listEl.addEventListener("pointercancel", finish);
  }

  makeReorderable({
    listEl: $("#taskList"),
    rowSelector: ".task-row",
    handleSelector: ".task-row__handle",
    draggingClass: "task-row--dragging",
    apiUrl: "/api/tasks?reorder=1",
    onError: function (e) { toast(e.message, true); loadDay(state.currentDate); },
  });

  /* ---------------- clear day / duplicate to another day ---------------- */

  $("#duplicateDate").value = addDays(todayISO(), 1);

  $("#btnClearDay").addEventListener("click", function () {
    if (!confirm(T("Delete ALL tasks for " + fmtDate(state.currentDate) + "? This can't be undone.", "تمسح كل مهام " + fmtDate(state.currentDate) + "؟ مش هينفع ترجعها."))) return;
    api("/api/tasks?date=" + state.currentDate, { method: "DELETE" })
      .then(function () { toast(T("Day cleared", "اليوم اتمسح")); return afterTaskChange(); })
      .catch(function (e) { toast(e.message, true); });
  });

  $("#btnDuplicateDay").addEventListener("click", function () {
    var to = $("#duplicateDate").value;
    if (!to) { toast(T("Pick a date to copy to", "اختار تاريخ تنسخ ليه"), true); return; }
    var btn = this;
    busy(btn, true);
    api("/api/tasks?duplicate=1", { method: "POST", body: { from_date: state.currentDate, to_date: to } })
      .then(function (r) {
        toast(r.count ? T("Copied " + r.count + " task" + (r.count === 1 ? "" : "s") + " to " + fmtDate(to), "اتنسخت " + I18N.N(r.count, "task", "tasks", ["مهمة واحدة", "مهمتين", "مهام", "مهمة"]) + " ليوم " + fmtDate(to)) : T("No tasks to copy", "مفيش مهام تتنسخ"));
        return to === state.currentDate ? afterTaskChange() : null;
      })
      .catch(function (e) { toast(e.message, true); })
      .finally(function () { busy(btn, false); });
  });

  /* ---------------- add the shown day to Google Calendar ----------------
     Every task of the day on screen becomes its own timed event, back to back
     (planned hours long, 30 min when none), starting at the next half hour
     when it's today or 9:00 on any other day — the owner then drags them
     into place in Google Calendar.

     With GCAL_CLIENT_ID set, the button signs in with Google (a popup, once
     an hour at most) and writes the events straight into the primary
     calendar. Each event id comes from the task id, so pressing it again
     skips tasks already there and keeps wherever they were dragged to.
     Without a client id it falls back to downloading an .ics to import. */

  // OAuth client (Web application) whose authorised JavaScript origin is
  // https://ahmedtarek.tech — public by design, it is not a secret
  var GCAL_CLIENT_ID = "";
  var GCAL_SCOPE = "https://www.googleapis.com/auth/calendar.events";
  var gcalToken = null; // { value, expires }
  var gcalTokenClient = null;

  if (GCAL_CLIENT_ID) {
    // loaded up front: the sign-in popup has to open inside the click itself,
    // which a script still loading at click time would miss
    var gsi = document.createElement("script");
    gsi.src = "https://accounts.google.com/gsi/client";
    gsi.async = true;
    document.head.appendChild(gsi);
  }

  function dayEventPlan(date, tasks) {
    var start = new Date(date + "T09:00:00");
    if (date === todayISO()) {
      start = new Date();
      start.setSeconds(0, 0);
      start.setMinutes(start.getMinutes() < 30 ? 30 : 60);
    }
    return tasks.map(function (t) {
      var title = (t.done ? "✓ " : t.half ? "½ " : "") + (t.icon ? t.icon + " " : "") + t.title;
      // a task with its own from–to keeps it, and doesn't move the others along
      if (t.time_from) {
        var s0 = new Date(date + "T" + t.time_from + ":00");
        var e0 = t.time_to ? new Date(date + "T" + t.time_to + ":00") : new Date(s0.getTime() + 30 * 60000);
        return { task: t, title: title + (t.time_note ? " (" + t.time_note + ")" : ""), start: s0, end: e0 };
      }
      var end = new Date(start.getTime() + Math.round((Number(t.planned_hours) || 0.5) * 60) * 60000);
      var ev = {
        task: t,
        title: title,
        start: start,
        end: end
      };
      start = end;
      return ev;
    });
  }

  $("#btnDayToGcal").addEventListener("click", function () {
    var tasks = state.dayTasks || [];
    if (!tasks.length) { toast(T("No tasks on this day to add", "مفيش مهام في اليوم ده تتضاف"), true); return; }
    var plan = dayEventPlan(state.currentDate, tasks);
    if (!GCAL_CLIENT_ID) { downloadDayIcs(state.currentDate, plan); return; }
    if (!window.google || !google.accounts || !google.accounts.oauth2) {
      toast(T("Google sign-in is still loading — try again in a second", "تسجيل الدخول بجوجل لسه بيحمّل — جرّب تاني بعد ثانية"), true);
      return;
    }
    var btn = this;
    withGcalToken(function (token) {
      busy(btn, true);
      gcalInsertAll(token, plan)
        .then(function (r) {
          var msg = r.added ? T("Added " + r.added + " event" + (r.added === 1 ? "" : "s") + " to Google Calendar ✓", "اتضاف " + I18N.N(r.added, "event", "events", ["حدث واحد", "حدثين", "أحداث", "حدث"]) + " على Google Calendar ✓") : T("Already in Google Calendar", "موجودة بالفعل على Google Calendar");
          if (r.added && r.skipped) msg += T(" · " + r.skipped + " already there", " · " + r.skipped + " موجودة قبل كده");
          toast(msg);
        })
        .catch(function (e) {
          if (e.status === 401) gcalToken = null;
          toast(e.message, true);
        })
        .finally(function () { busy(btn, false); });
    });
  });

  function withGcalToken(fn) {
    if (gcalToken && gcalToken.expires > Date.now() + 60000) { fn(gcalToken.value); return; }
    if (!gcalTokenClient) {
      gcalTokenClient = google.accounts.oauth2.initTokenClient({
        client_id: GCAL_CLIENT_ID,
        scope: GCAL_SCOPE,
        callback: function () {},
        error_callback: function (err) {
          if (err && err.type !== "popup_closed") toast(T("Google sign-in failed — allow pop-ups for this site", "تسجيل الدخول بجوجل فشل — اسمح بالنوافذ المنبثقة للموقع ده"), true);
        }
      });
    }
    gcalTokenClient.callback = function (resp) {
      if (resp.error || !google.accounts.oauth2.hasGrantedAllScopes(resp, GCAL_SCOPE)) {
        toast(T("Calendar access wasn't granted", "ما اتسمحش بالوصول للتقويم"), true);
        return;
      }
      gcalToken = { value: resp.access_token, expires: Date.now() + Number(resp.expires_in || 3600) * 1000 };
      fn(gcalToken.value);
    };
    gcalTokenClient.requestAccessToken();
  }

  function gcalRequest(token, method, path, body) {
    return fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events" + path, {
      method: method,
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined
    }).then(function (res) {
      if (res.ok) return res.json();
      return res.json().catch(function () { return {}; }).then(function (j) {
        var err = new Error((j.error && j.error.message) || T("Google Calendar error " + res.status, "خطأ من Google Calendar " + res.status));
        err.status = res.status;
        throw err;
      });
    });
  }

  function gcalInsertAll(token, plan) {
    var zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    var local = function (d) {
      var pad = function (n) { return String(n).padStart(2, "0"); };
      return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + "T" + pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":00";
    };
    var added = 0, skipped = 0;
    // one after another, not all at once — Calendar rate-limits bursts per user
    return plan.reduce(function (chain, ev) {
      return chain.then(function () {
        // event ids may only use a-v and 0-9; "timetask" + the task id fits
        var id = "timetask" + ev.task.id;
        var body = {
          id: id,
          summary: ev.title,
          start: { dateTime: local(ev.start), timeZone: zone },
          end: { dateTime: local(ev.end), timeZone: zone }
        };
        return gcalRequest(token, "POST", "", body)
          .then(function () { added++; })
          .catch(function (e) {
            if (e.status !== 409) throw e;
            // the id is taken: leave a live event where it was dragged to,
            // bring back one that was deleted (Google keeps it as cancelled)
            return gcalRequest(token, "GET", "/" + id).then(function (existing) {
              if (existing.status !== "cancelled") { skipped++; return; }
              body.status = "confirmed";
              return gcalRequest(token, "PUT", "/" + id, body).then(function () { added++; });
            });
          });
      });
    }, Promise.resolve()).then(function () { return { added: added, skipped: skipped }; });
  }

  function downloadDayIcs(date, plan) {
    var pad = function (n) { return String(n).padStart(2, "0"); };
    // floating local time (no Z / zone), so it lands at the same clock time in the calendar
    var icsTime = function (d) {
      return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + "T" + pad(d.getHours()) + pad(d.getMinutes()) + "00";
    };
    var esc = function (v) { return String(v).replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\n/g, "\\n"); };
    var stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
    var lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//ahmedtarek.tech//time//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
    plan.forEach(function (ev) {
      lines.push(
        "BEGIN:VEVENT",
        "UID:task-" + ev.task.id + "@ahmedtarek.tech",
        "DTSTAMP:" + stamp,
        "DTSTART:" + icsTime(ev.start),
        "DTEND:" + icsTime(ev.end),
        "SUMMARY:" + esc(ev.title),
        "END:VEVENT"
      );
    });
    lines.push("END:VCALENDAR");

    var blob = new Blob([lines.join("\r\n") + "\r\n"], { type: "text/calendar;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "todo-" + date + ".ics";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    window.open("https://calendar.google.com/calendar/r/settings/export", "_blank", "noopener");
    toast(T("Downloaded " + plan.length + " event" + (plan.length === 1 ? "" : "s") + " — in Google Calendar, Import that file", "اتنزّل " + I18N.N(plan.length, "event", "events", ["حدث واحد", "حدثين", "أحداث", "حدث"]) + " — في Google Calendar اعمل Import للملف ده"));
  }

  function startEditTask(t) {
    state.editingTaskId = t.id;
    var form = $("#addTaskForm");
    form.elements.title.value = t.title;
    form.elements.icon.value = t.icon || "";
    form.elements.category_id.value = t.category_id || "";
    form.elements.planned_hours.value = t.planned_hours != null ? Number(t.planned_hours) : "";
    form.elements.time_from.value = t.time_from || "";
    form.elements.time_to.value = t.time_to || "";
    form.elements.actual_hours.value = t.actual_hours != null ? Number(t.actual_hours) : "";
    $("#actualHoursField").hidden = false;
    $("#btnTaskSubmit").textContent = T("Update task", "تحديث المهمة");
    $("#btnCancelTaskEdit").hidden = false;
    form.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function stopEditTask() {
    state.editingTaskId = null;
    var form = $("#addTaskForm");
    form.reset();
    $("#actualHoursField").hidden = true;
    $("#btnTaskSubmit").textContent = T("Add task", "إضافة مهمة");
    $("#btnCancelTaskEdit").hidden = true;
  }

  $("#btnCancelTaskEdit").addEventListener("click", stopEditTask);

  $("#addTaskForm").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var form = this;
    var btn = $("#btnTaskSubmit");
    var b = formData(form);
    var editingId = state.editingTaskId;
    var body = {
      title: b.title,
      icon: b.icon || null,
      category_id: b.category_id ? Number(b.category_id) : null,
      planned_hours: b.planned_hours ? Number(b.planned_hours) : null,
      time_from: b.time_from || null,
      time_to: b.time_to || null,
    };
    if (body.time_from && body.time_to && body.time_to <= body.time_from) {
      toast(T("The end time has to come after the start", "وقت النهاية لازم يكون بعد البداية"), true);
      return;
    }
    if (!body.time_from) body.time_to = null;
    if (editingId) {
      body.actual_hours = b.actual_hours ? Number(b.actual_hours) : null;
      // a prayer whose time was moved by hand keeps that time: the page stops moving it
      var was = (state.dayTasks || []).filter(function (x) { return x.id === editingId; })[0];
      if (was && was.auto_key && !/:hand$/.test(was.auto_key) &&
          ((was.time_from || null) !== body.time_from || (was.time_to || null) !== body.time_to)) {
        body.auto_key = was.auto_key + ":hand";
      }
    }
    else body.task_date = state.currentDate;

    busy(btn, true);
    (editingId ? api("/api/tasks?id=" + editingId, { method: "PATCH", body: body })
               : api("/api/tasks", { method: "POST", body: body }))
      .then(function () {
        toast(editingId ? T("Task updated ✓", "المهمة اتحدّثت ✓") : T("Task added ✓", "المهمة اتضافت ✓"));
        if (!editingId) playAddSound();
        stopEditTask();
        return afterTaskChange();
      })
      .catch(function (e) { toast(e.message, true); })
      .finally(function () { busy(btn, false); });
  });

  /* ---------------- last 14 days strip ---------------- */

  function loadHistory(opts) {
    var to = todayISO();
    var from = addDays(to, -13);
    return api("/api/tasks?stats=1&from=" + from + "&to=" + to).then(function (data) {
      renderHistory(from, to, data.stats, opts);
    }).catch(function (e) { toast(e.message, true); });
  }

  function renderHistory(from, to, stats, opts) {
    opts = opts || {};
    var animate = opts.animate !== false;
    var byDate = {};
    (stats || []).forEach(function (s) { byDate[s.date] = s; });
    var box = $("#dayHistory");
    box.innerHTML = "";
    var bars = [];
    var d = from;
    while (d <= to) {
      var s = byDate[d];
      var pct = s && s.total ? Math.round((s.done / s.total) * 100) : null;
      var target = pct == null ? 6 : Math.max(pct, 4);
      var bar = document.createElement("div");
      bar.className = "day-bar" + (pct == null ? " day-bar--empty" : "");
      // only grow bars in from 0% on a real first load — a same-day refresh
      // (e.g. after checking a task) should just show the new heights directly,
      // not collapse every bar back to 0% and regrow them, which reads as a reset
      bar.style.height = (reduceMotion || !animate) ? target + "%" : "0%";
      bar.title = fmtDate(d) + (pct == null ? T(" · no tasks", " · مفيش مهام") : " · " + pct + "% (" + s.done + "/" + s.total + ")");
      box.appendChild(bar);
      bars.push({ el: bar, target: target });
      d = addDays(d, 1);
    }
    if (!reduceMotion && animate) {
      // double rAF: the 0% height must paint before the transition to `target` starts
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          bars.forEach(function (b) { b.el.style.height = b.target + "%"; });
        });
      });
    }

    // mascot always reflects real "today", independent of whatever day is
    // being browsed via the day picker
    var todayStats = byDate[to];
    var todayPct = todayStats && todayStats.total ? Math.round((todayStats.done / todayStats.total) * 100) : 0;
    var streak = 0;
    var walk = to;
    while (byDate[walk] && byDate[walk].total && byDate[walk].done >= byDate[walk].total) {
      streak++;
      walk = addDays(walk, -1);
    }
    updateMascot(todayPct, streak);
  }

  /* ---------------- mascot: reacts to today's completion %, with a streak + confetti ---------------- */

  // a few lines per mood, one picked at random — the mascot jokes a little (owner, 2026-11-21)
  var MASCOT_MOODS = [
    { max: 0, mouth: "sad", captions: [
      T("Let's go, boss — the day is waiting 💪", "يلا يا معلم، اليوم مستنيك 💪"),
      T("Good morning! First task is on you ☕", "صباح الفل! أول مهمة عليك ☕"),
      T("The couch won't finish the tasks 😅", "الكنبة مش هتخلّص المهام 😅") ] },
    { max: 49, mouth: "neutral", captions: [
      T("Warming up 🔥", "بدأنا نسخن 🔥"),
      T("Nice start… keep going", "بداية حلوة.. كمّل"),
      T("Momentum's climbing, champ 📈", "الحماس بيعلى يا وحش 📈") ] },
    { max: 99, mouth: "happy", captions: [
      T("You're flying today ✈️", "إنت طاير النهارده ✈️"),
      T("A little more and it's a wrap 💯", "فاضل شوية وتقفلها 💯"),
      T("Strong strong, keep it up!", "جامد جامد، كمّل!") ] },
    { max: 100, mouth: "excited", captions: [
      T("Perfect day! 🎉 Treat yourself", "يوم مثالي! 🎉 دلّع نفسك بحاجة حلوة"),
      T("100%! You're a legend 🏆", "100%! ده إنت أسطورة 🏆") ] },
  ];
  var lastMood = null;
  var mascotHit100Today = false;

  function updateMascot(pct, streak) {
    var mood = MASCOT_MOODS.filter(function (m) { return pct <= m.max; })[0] || MASCOT_MOODS[MASCOT_MOODS.length - 1];
    $("#mascotMouth").className = "mascot__mouth mascot__mouth--" + mood.mouth;
    // a new line only when the mood changes, so it doesn't flicker on every re-render
    if (lastMood !== mood) { lastMood = mood; $("#mascotCaption").textContent = mood.captions[Math.floor(Math.random() * mood.captions.length)]; }
    window.dispatchEvent(new CustomEvent("time:mood", { detail: { pct: pct, streak: streak, mood: mood.mouth } }));

    var streakBox = $("#mascotStreak");
    if (streak > 0) { streakBox.hidden = false; $("#streakCount").textContent = streak; }
    else streakBox.hidden = true;

    if (pct >= 100 && !mascotHit100Today) {
      mascotHit100Today = true;
      celebrateMascot();
    } else if (pct < 100) {
      mascotHit100Today = false;
    }
  }

  function celebrateMascot() {
    if (reduceMotion) return;
    var char = $("#mascotChar");
    char.classList.remove("mascot__char--celebrate");
    void char.offsetWidth;
    char.classList.add("mascot__char--celebrate");
    burstConfetti();
    playSuccessSound();
  }

  function burstConfetti(count) {
    var colors = ["#91A3C9", "#FA968B", "#34d399", "#f59e0b", "#F47F72"];
    for (var i = 0; i < (count || 18); i++) {
      var piece = document.createElement("div");
      piece.className = "confetti-piece";
      piece.style.left = Math.random() * 100 + "vw";
      piece.style.background = colors[i % colors.length];
      piece.style.borderRadius = Math.random() > 0.5 ? "50%" : "2px";
      piece.style.animationDelay = (Math.random() * 0.3) + "s";
      document.body.appendChild(piece);
      (function (el) { setTimeout(function () { el.remove(); }, 1900); })(piece);
    }
  }

  /* ---------------- gamification: 5-month commitment cycle + badges ----------------
     The level badge/bar track a running commitment: pick a start date, and
     every 5 calendar months from it is one "cycle" — the bar fills as days
     pass, and completing a cycle triggers the same celebration a badge
     unlock does. Badges themselves are recomputed from real, already-
     persisted facts (tasks done, goals completed, streak, milestones
     checked, cycles completed) every time — no separate counter to drift.
     Only "have I already celebrated this" is kept in localStorage, purely
     so a cycle/badge you've already reached doesn't re-fire its fanfare
     on every load. */

  var COMMIT_CYCLE_MONTHS = 5;
  var STREAK_WINDOW_DAYS = 400;

  /* One glyph each, and a number to reach. The old set repeated the same
     emoji to mean "more of it" ("🔥🔥🔥"), which spilled out of the little
     tiles and read as a mess (owner, 2026-10-17: "this gamification has an
     issue, redo"). Now every badge has its own glyph and shows how far along
     it is, counted from real data each time — nothing is stored but whether
     its fanfare has already played. */
  var BADGES = [
    { id: "task-1", icon: "✅", name: T("First task done", "أول مهمة خلصت"), goal: 1, of: function (s) { return s.totalDone; }, unit: T("tasks", "مهمة") },
    { id: "task-50", icon: "🥉", name: T("50 tasks done", "50 مهمة خلصت"), goal: 50, of: function (s) { return s.totalDone; }, unit: T("tasks", "مهمة") },
    { id: "task-200", icon: "🥈", name: T("200 tasks done", "200 مهمة خلصت"), goal: 200, of: function (s) { return s.totalDone; }, unit: T("tasks", "مهمة") },
    { id: "task-500", icon: "🥇", name: T("500 tasks done", "500 مهمة خلصت"), goal: 500, of: function (s) { return s.totalDone; }, unit: T("tasks", "مهمة") },
    { id: "streak-3", icon: "🔥", name: T("3 days in a row, all done", "3 أيام ورا بعض، كله خلص"), goal: 3, of: function (s) { return s.longestStreak; }, unit: T("days", "يوم") },
    { id: "streak-7", icon: "⚡", name: T("A whole week in a row", "أسبوع كامل ورا بعض"), goal: 7, of: function (s) { return s.longestStreak; }, unit: T("days", "يوم") },
    { id: "streak-30", icon: "🌋", name: T("30 days in a row", "30 يوم ورا بعض"), goal: 30, of: function (s) { return s.longestStreak; }, unit: T("days", "يوم") },
    { id: "goal-1", icon: "🎯", name: T("First goal reached", "أول هدف اتحقق"), goal: 1, of: function (s) { return s.completedGoals; }, unit: T("goals", "هدف") },
    { id: "goal-10", icon: "🏹", name: T("10 goals reached", "10 أهداف اتحققت"), goal: 10, of: function (s) { return s.completedGoals; }, unit: T("goals", "هدف") },
    { id: "pomo-1", icon: "🍅", name: T("First focus block", "أول بلوك تركيز"), goal: 1, of: function (s) { return s.focusBlocks; }, unit: T("blocks", "بلوك") },
    { id: "pomo-day", icon: "💯", name: T("A full ten-block day", "يوم كامل بعشر بلوكات"), goal: 1, of: function (s) { return s.focusFullDays; }, unit: T("days", "يوم") },
    { id: "pomo-100", icon: "🧘", name: T("100 focus blocks", "100 بلوك تركيز"), goal: 100, of: function (s) { return s.focusBlocks; }, unit: T("blocks", "بلوك") },
    { id: "milestone-1", icon: "🪜", name: T("First money milestone", "أول محطة فلوس"), goal: 1, of: function (s) { return s.milestonesChecked; }, unit: T("rungs", "محطة") },
    { id: "milestone-half", icon: "💰", name: T("Halfway up to $500K", "نص الطريق لـ $500K"), goal: 5, of: function (s) { return s.milestonesChecked; }, unit: T("rungs", "محطة") },
    { id: "cycle-1", icon: "🎖️", name: T("One 5-month cycle kept", "دورة 5 شهور كاملة"), goal: 1, of: function (s) { return s.cyclesCompleted; }, unit: T("cycles", "دورة") },
    { id: "cycle-2", icon: "🏅", name: T("Ten months kept", "عشر شهور التزام"), goal: 2, of: function (s) { return s.cyclesCompleted; }, unit: T("cycles", "دورة") },
    { id: "cycle-4", icon: "🏆", name: T("A year kept", "سنة التزام"), goal: 4, of: function (s) { return s.cyclesCompleted; }, unit: T("cycles", "دورة") },
  ];

  function loadCommitStart() {
    try {
      var raw = localStorage.getItem("time-commit-start");
      if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    } catch (e) {}
    var today = todayISO();
    try { localStorage.setItem("time-commit-start", today); } catch (e) {}
    return today;
  }
  function saveCommitStart(iso) {
    try { localStorage.setItem("time-commit-start", iso); } catch (e) {}
  }

  // walks forward from the start date in 5-month steps to find which cycle
  // "today" currently falls in, and how far through it we are
  function computeCommitCycle() {
    var startISO = loadCommitStart();
    var cycleStart = new Date(startISO + "T00:00:00");
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var cyclesCompleted = 0;
    var cycleEnd = new Date(cycleStart.getFullYear(), cycleStart.getMonth() + COMMIT_CYCLE_MONTHS, cycleStart.getDate());
    while (today >= cycleEnd) {
      cyclesCompleted++;
      cycleStart = cycleEnd;
      cycleEnd = new Date(cycleStart.getFullYear(), cycleStart.getMonth() + COMMIT_CYCLE_MONTHS, cycleStart.getDate());
    }
    return {
      startISO: startISO,
      cyclesCompleted: cyclesCompleted,
      currentCycleNum: cyclesCompleted + 1,
      dayInCycle: Math.max(0, Math.round((today - cycleStart) / 86400000)),
      totalCycleDays: Math.round((cycleEnd - cycleStart) / 86400000),
    };
  }

  function loadGamifyMeta() {
    try { return JSON.parse(localStorage.getItem("time-gamify-meta") || "null") || { cyclesCompleted: 0, badges: [], initialized: false }; }
    catch (e) { return { cyclesCompleted: 0, badges: [], initialized: false }; }
  }
  function saveGamifyMeta(meta) {
    try { localStorage.setItem("time-gamify-meta", JSON.stringify(meta)); } catch (e) {}
  }

  function cycleCompleteCelebrate(currentCycleNum) {
    playLevelUpSound();
    if (!reduceMotion) {
      burstConfetti(24);
      var badge = $("#gamifyLevelBadge");
      badge.classList.remove("gamify__level-badge--pop");
      void badge.offsetWidth;
      badge.classList.add("gamify__level-badge--pop");
    }
    toast(T("🎉 5-month cycle complete — cycle " + currentCycleNum + " begins!", "🎉 دورة الـ5 شهور خلصت — الدورة " + currentCycleNum + " بتبدأ!"));
  }

  function badgeUnlockCelebrate(ids) {
    playBadgeSound();
    if (!reduceMotion) burstConfetti(12);
    ids.forEach(function (id) {
      var el = document.querySelector('#gamifyBadges .badge-chip[data-id="' + id + '"]');
      if (el && !reduceMotion) {
        el.classList.remove("badge-chip--pop");
        void el.offsetWidth;
        el.classList.add("badge-chip--pop");
      }
    });
    var names = ids.map(function (id) {
      var b = BADGES.filter(function (x) { return x.id === id; })[0];
      return b ? b.icon + " " + b.name : id;
    });
    toast(T("🏅 New badge: " + names.join(", "), "🏅 شارة جديدة: " + names.join("، ")));
  }

  /* Each badge set by hand (owner, 2026-10-21: «manual adjust — can set
     goal or reset»): its own goal, and a day it counts from. A count
     (tasks, goals, blocks, rungs, cycles) restarted from a day keeps what
     it stood at then as its zero; a streak is counted again from that day,
     out of the days already loaded. Kept in this browser beside the
     commitment's start. */
  var BADGE_STAT = {
    "task-1": "totalDone", "task-50": "totalDone", "task-200": "totalDone", "task-500": "totalDone",
    "streak-3": "streak", "streak-7": "streak", "streak-30": "streak",
    "goal-1": "completedGoals", "goal-10": "completedGoals",
    "pomo-1": "focusBlocks", "pomo-day": "focusFullDays", "pomo-100": "focusBlocks",
    "milestone-1": "milestonesChecked", "milestone-half": "milestonesChecked",
    "cycle-1": "cyclesCompleted", "cycle-2": "cyclesCompleted", "cycle-4": "cyclesCompleted",
  };
  function loadBadgeTune() {
    try { return JSON.parse(localStorage.getItem("time-badge-tune") || "{}") || {}; } catch (e) { return {}; }
  }
  function saveBadgeTune(t) {
    try { localStorage.setItem("time-badge-tune", JSON.stringify(t)); } catch (e) {}
  }
  // the longest run of all-done days from `since` to today
  function streakSince(stats, since) {
    var best = 0, run = 0, d = since, byDate = stats.byDate || {};
    while (d <= stats.to) {
      var s = byDate[d];
      if (s && s.total > 0 && s.done >= s.total) { run++; best = Math.max(best, run); } else { run = 0; }
      d = addDays(d, 1);
    }
    return best;
  }
  function badgeRaw(b, full) {
    return BADGE_STAT[b.id] === "streak" ? full.longestStreak : Math.max(0, Number(b.of(full)) || 0);
  }
  function badgeNow(b, full, tune) {
    var t = tune[b.id];
    if (!t || !t.since) return badgeRaw(b, full);
    if (BADGE_STAT[b.id] === "streak") return streakSince(full, t.since);
    return Math.max(0, badgeRaw(b, full) - (t.base || 0));
  }
  function badgeGoal(b, tune) {
    var g = tune[b.id] && Number(tune[b.id].goal);
    return g && g > 0 ? g : b.goal;
  }
  // "50 tasks done" says its new number; a name without one says the goal
  function badgeName(b, goal) {
    if (goal === b.goal) return b.name;
    return b.name.indexOf(String(b.goal)) !== -1 ? b.name.replace(String(b.goal), String(goal)) : b.name + T(" (goal " + goal + ")", " (الهدف " + goal + ")");
  }
  var lastGamify = null; // { stats, full } — redrawn without fetching again after a change
  var openBadge = null;

  function renderGamification(stats) {
    var cycle = computeCommitCycle();
    var pct = cycle.totalCycleDays > 0 ? Math.min(100, Math.round((cycle.dayInCycle / cycle.totalCycleDays) * 100)) : 0;

    $("#gamifyLevelBadge").textContent = cycle.currentCycleNum;
    $("#gamifyXpText").textContent = T("Day " + cycle.dayInCycle + " / " + cycle.totalCycleDays, "يوم " + cycle.dayInCycle + " / " + cycle.totalCycleDays);
    $("#gamifyXpFill").style.width = pct + "%";
    var startInput = $("#gamifyStartInput");
    if (document.activeElement !== startInput) startInput.value = cycle.startISO;

    var fullStats = {
      totalDone: stats.totalDone,
      completedGoals: stats.completedGoals,
      currentStreak: stats.currentStreak,
      longestStreak: stats.longestStreak,
      milestonesChecked: stats.milestonesChecked,
      cyclesCompleted: cycle.cyclesCompleted,
      focusBlocks: stats.focusBlocks || 0,
      focusFullDays: stats.focusFullDays || 0,
    };
    fullStats.byDate = stats.byDate;
    fullStats.to = stats.to || todayISO();
    lastGamify = { stats: stats, full: fullStats };
    var tune = loadBadgeTune();
    var reached = BADGES.map(function (b) {
      var now = badgeNow(b, fullStats, tune);
      var goal = badgeGoal(b, tune);
      return {
        badge: b, now: now, goal: goal, name: badgeName(b, goal), tuned: Boolean(tune[b.id]),
        done: now >= goal, pct: Math.min(100, Math.round((now / goal) * 100)),
      };
    });
    var unlockedIds = reached.filter(function (r) { return r.done; }).map(function (r) { return r.badge.id; });

    $("#gamifyBadges").innerHTML = reached.map(function (r) {
      var b = r.badge;
      var shown = Math.min(r.now, r.goal);
      var tip = T(r.name + " — " + shown + " of " + r.goal + " " + b.unit + (r.done ? " ✓" : "") + " · click to set the goal or restart", r.name + " — " + shown + " من " + r.goal + " " + b.unit + (r.done ? " ✓" : "") + " · دوس عشان تحدد الهدف أو تبدأ من الأول");
      return '<button type="button" class="badge-chip' + (r.done ? " badge-chip--unlocked" : "") + (r.tuned ? " badge-chip--tuned" : "") +
        (openBadge === b.id ? " badge-chip--open" : "") + '" data-id="' + b.id +
        '" title="' + esc(tip) + '" aria-label="' + esc(tip) + '">' +
        '<span class="badge-chip__glyph">' + b.icon + '</span>' +
        (r.done ? "" : '<span class="badge-chip__bar"><span style="width:' + r.pct + '%"></span></span>') +
      '</button>';
    }).join("");
    if (openBadge) fillBadgeTune(reached.filter(function (r) { return r.badge.id === openBadge; })[0]);
    $("#gamifyBadgeCount").textContent = T(unlockedIds.length + " of " + BADGES.length, unlockedIds.length + " من " + BADGES.length);

    // the nearest one still to come, so the row says what to aim at
    var next = reached.filter(function (r) { return !r.done; })
      .sort(function (a, b) { return b.pct - a.pct; })[0];
    $("#gamifyNext").textContent = next
      ? T("Closest: " + next.badge.icon + " " + next.name + " — " + Math.min(next.now, next.goal) +
        " of " + next.goal + " " + next.badge.unit,
        "الأقرب: " + next.badge.icon + " " + next.name + " — " + Math.min(next.now, next.goal) +
        " من " + next.goal + " " + next.badge.unit)
      : T("Every badge earned 🎉", "كل الشارات اتكسبت 🎉");

    var meta = loadGamifyMeta();
    if (meta.initialized) {
      if (cycle.cyclesCompleted > meta.cyclesCompleted) cycleCompleteCelebrate(cycle.currentCycleNum);
      var newBadges = unlockedIds.filter(function (id) { return meta.badges.indexOf(id) === -1; });
      if (newBadges.length) badgeUnlockCelebrate(newBadges);
    }
    saveGamifyMeta({ cyclesCompleted: cycle.cyclesCompleted, badges: unlockedIds, initialized: true });
  }

  /* Start again. The badges themselves are worked out from real data, so
     there is nothing in them to reset — what is reset is the commitment
     (back to today) and the memory of which fanfares have played. Tasks,
     goals, milestones and focus blocks are untouched. */
  $("#btnGamifyReset").addEventListener("click", function () {
    if (!confirm(T("Restart the 5-month commitment AND every badge from today?\n\nEach badge counts again from zero; the goals you set are kept. Your tasks, goals, milestones and focus blocks are not touched.", "تبدأ التزام الـ5 شهور وكل الشارات من النهارده تاني؟\n\nكل شارة هتتعد من الصفر تاني، والأهداف اللي حددتها هتفضل زي ما هي. مهامك وأهدافك ومحطاتك وبلوكات التركيز مش هتتلمس."))) return;
    var today = todayISO();
    var tune = loadBadgeTune();
    BADGES.forEach(function (b) {
      var t = tune[b.id] || {};
      t.since = today;
      // cycles start over with the commitment itself, so their zero is 0
      t.base = BADGE_STAT[b.id] === "cyclesCompleted" || !lastGamify ? 0 : badgeRaw(b, lastGamify.full);
      tune[b.id] = t;
    });
    saveBadgeTune(tune);
    saveCommitStart(today);
    saveGamifyMeta({ cyclesCompleted: 0, badges: [], initialized: false });
    playAddSound();
    toast(T("Commitment and badges restarted from today ✓", "الالتزام والشارات بدأوا من النهارده تاني ✓"));
    loadGamification();
  });

  /* One badge, opened from its tile. */
  function fillBadgeTune(r) {
    if (!r) { closeBadgeTune(); return; }
    var t = loadBadgeTune()[r.badge.id];
    $("#badgeTuneGlyph").textContent = r.badge.icon;
    $("#badgeTuneName").textContent = r.name + (r.done ? " ✓" : "");
    $("#badgeTuneNow").textContent = Math.min(r.now, r.goal) + T(" of ", " من ") + r.goal + " " + r.badge.unit +
      (t && t.since ? T(" · counting since " + t.since, " · العدّ من " + t.since) : T(" · counting all your history", " · العدّ على كل تاريخك"));
    var goalInput = $("#badgeTuneGoal");
    if (document.activeElement !== goalInput) goalInput.value = r.goal;
    $("#badgeTuneUnit").textContent = r.badge.unit;
    $("#badgeTuneDefault").disabled = !t;
    $("#badgeTune").hidden = false;
  }
  function closeBadgeTune() {
    openBadge = null;
    $("#badgeTune").hidden = true;
    document.querySelectorAll("#gamifyBadges .badge-chip--open").forEach(function (el) { el.classList.remove("badge-chip--open"); });
  }
  function redrawGamify() { if (lastGamify) renderGamification(lastGamify.stats); }

  $("#gamifyBadges").addEventListener("click", function (ev) {
    var chip = ev.target.closest(".badge-chip");
    if (!chip) return;
    if (openBadge === chip.dataset.id) { closeBadgeTune(); return; }
    openBadge = chip.dataset.id;
    redrawGamify();
  });
  $("#badgeTuneClose").addEventListener("click", closeBadgeTune);
  $("#badgeTuneSave").addEventListener("click", function () {
    var b = BADGES.filter(function (x) { return x.id === openBadge; })[0];
    var n = Math.round(Number($("#badgeTuneGoal").value));
    if (!b || !(n >= 1)) { toast(T("A goal is a whole number, 1 or more", "الهدف رقم صحيح، 1 أو أكتر")); return; }
    var tune = loadBadgeTune();
    var t = tune[b.id] || {};
    if (n === b.goal) delete t.goal; else t.goal = n;
    if (Object.keys(t).length) tune[b.id] = t; else delete tune[b.id];
    saveBadgeTune(tune);
    playAddSound();
    toast(T("Goal set: " + badgeName(b, n) + " ✓", "الهدف اتحدد: " + badgeName(b, n) + " ✓"));
    redrawGamify();
  });
  $("#badgeTuneGoal").addEventListener("keydown", function (ev) {
    if (ev.key === "Enter") { ev.preventDefault(); $("#badgeTuneSave").click(); }
  });
  $("#badgeTuneRestart").addEventListener("click", function () {
    var b = BADGES.filter(function (x) { return x.id === openBadge; })[0];
    if (!b || !lastGamify) return;
    var tune = loadBadgeTune();
    var t = tune[b.id] || {};
    t.since = todayISO();
    t.base = badgeRaw(b, lastGamify.full);
    tune[b.id] = t;
    saveBadgeTune(tune);
    playDeleteSound();
    toast(T(b.icon + " restarted from today", b.icon + " بدأت من النهارده تاني"));
    redrawGamify();
  });
  $("#badgeTuneDefault").addEventListener("click", function () {
    var tune = loadBadgeTune();
    delete tune[openBadge];
    saveBadgeTune(tune);
    playAddSound();
    toast(T("Back to its default goal, counting all your history", "رجعت لهدفها الأصلي، والعدّ على كل تاريخك"));
    redrawGamify();
  });

  $("#gamifyStartInput").addEventListener("change", function () {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(this.value)) return;
    saveCommitStart(this.value);
    loadGamification();
  });

  // recomputed from real data every time — never a separate counter that
  // could drift; failures here are swallowed since this is a bonus layer
  // that shouldn't block the rest of the app
  function loadGamification() {
    var to = todayISO();
    var from = addDays(to, -STREAK_WINDOW_DAYS);
    return Promise.all([
      api("/api/tasks?totals=1"),
      api("/api/goals?all=1"),
      api("/api/tasks?stats=1&from=" + from + "&to=" + to),
      api("/api/tasks?pomodoros=1&totals=1"),
    ]).then(function (results) {
      var totals = results[0], goalsAll = results[1], statsResp = results[2];
      var byDate = {};
      (statsResp.stats || []).forEach(function (s) { byDate[s.date] = s; });

      var longestStreak = 0, run = 0;
      var d = from;
      while (d <= to) {
        var s = byDate[d];
        if (s && s.total > 0 && s.done >= s.total) { run++; longestStreak = Math.max(longestStreak, run); }
        else { run = 0; }
        d = addDays(d, 1);
      }
      var currentStreak = 0, walk = to;
      while (byDate[walk] && byDate[walk].total > 0 && byDate[walk].done >= byDate[walk].total) {
        currentStreak++;
        walk = addDays(walk, -1);
      }

      renderGamification({
        totalDone: totals.totalDone || 0,
        completedGoals: goalsAll.completedGoals || 0,
        currentStreak: currentStreak,
        longestStreak: longestStreak,
        milestonesChecked: loadMilestoneChecks().filter(Boolean).length,
        focusBlocks: (results[3] || {}).blocks || 0,
        focusFullDays: (results[3] || {}).fullDays || 0,
        byDate: byDate,
        to: to,
      });
    }).catch(function () {});
  }

  /* ---------------- quarterly goals ---------------- */

  function loadQuarters() {
    return api("/api/quarters").then(function (data) {
      state.quarters = data.quarters || [];
      renderQuarterGallery();
      fillCopyFrom(); // the "start it from an earlier cycle" list

      if (!state.quarters.length) {
        state.selectedQuarterId = null;
        state.quarterDetail = null;
        renderCategorySelect([]);
        renderQuarter(null);
        updateCountdown();
        return;
      }
      // the one you last opened wins over the one today happens to fall in
      var today = todayISO();
      var saved = parseInt(recall("quarter-id", ""), 10);
      var pick = (!isNaN(saved) && state.quarters.filter(function (q) { return q.id === saved; })[0])
        || state.quarters.filter(function (q) { return q.start_date <= today && today <= q.end_date; })[0]
        || state.quarters[0];
      state.selectedQuarterId = pick.id;
      remember("quarter-id", String(pick.id));
      return loadQuarterDetail(pick.id);
    }).catch(function (e) { toast(e.message, true); });
  }

  /* ---------------- quarters gallery: pick one card to open its detail view ---------------- */

  /* Every quarter's average, on the same rule the Days tab uses: a day counts
     only if it has tasks, and the quarter's figure is the mean of those days'
     percentages. One request covers the whole span rather than one per quarter —
     /api/tasks?stats=1 only returns days that have tasks, so the reply is small
     however many years the quarters cover. */
  function loadQuarterStats() {
    var qs = state.quarters || [];
    if (!qs.length) {
      state.quarterStats = null;
      $("#quartersSummary").hidden = true;
      return Promise.resolve();
    }
    var from = qs.reduce(function (m, q) { var d = String(q.start_date).slice(0, 10); return d < m ? d : m; }, "9999-12-31");
    var to = qs.reduce(function (m, q) { var d = String(q.end_date).slice(0, 10); return d > m ? d : m; }, "0000-01-01");

    return Promise.all([
      api("/api/tasks?stats=1&from=" + from + "&to=" + to),
      api("/api/goals?by_quarter=1"),
    ]).then(function (results) {
      var stats = results[0].stats || [];
      var goalsByQuarter = {};
      (results[1].goals || []).forEach(function (g) {
        (goalsByQuarter[g.quarter_id] = goalsByQuarter[g.quarter_id] || []).push(g);
      });
      var today = todayISO();
      var byId = {};
      qs.forEach(function (q) {
        var qf = String(q.start_date).slice(0, 10), qt = String(q.end_date).slice(0, 10);
        var sum = 0, tracked = 0;
        stats.forEach(function (st) {
          var d = String(st.date).slice(0, 10);
          if (d < qf || d > qt || !st.total) return;
          sum += Math.round((st.done / st.total) * 100);
          tracked++;
        });
        byId[q.id] = {
          avg: tracked ? Math.round(sum / tracked) : 0,
          tracked: tracked,
          days: daysBetween(qf, qt),
          // Goals reached, the same target-weighted sum the bar inside a quarter
          // shows, so the two can never disagree. A quarter that hasn't started
          // gets none: its goals at 0% aren't a result yet.
          goals: qf <= today ? combinedGoalsPct(goalsByQuarter[q.id]) : null,
        };
      });
      // the headline is the mean of the quarters that have anything in them, so
      // an untouched future quarter can't drag the number toward zero
      var withData = qs.filter(function (q) { return byId[q.id].tracked; });
      var withGoals = qs.filter(function (q) { return byId[q.id].goals != null; });
      state.quarterStats = {
        byId: byId,
        avg: withData.length
          ? Math.round(withData.reduce(function (a, q) { return a + byId[q.id].avg; }, 0) / withData.length)
          : 0,
        goalsAvg: withGoals.length
          ? Math.round(withGoals.reduce(function (a, q) { return a + byId[q.id].goals; }, 0) / withGoals.length)
          : null,
        goalsCounted: withGoals.length,
        counted: withData.length,
        trackedDays: qs.reduce(function (a, q) { return a + byId[q.id].tracked; }, 0),
      };
      renderQuarterGallery();
    }).catch(function (e) { toast(e.message, true); });
  }

  function daysBetween(from, to) {
    return Math.round((new Date(to + "T00:00:00Z") - new Date(from + "T00:00:00Z")) / 86400000) + 1;
  }

  function renderQuartersSummary() {
    var st = state.quarterStats;
    var box = $("#quartersSummary");
    if (!st || !state.quarters.length) { box.hidden = true; return; }
    box.hidden = false;

    $("#quartersAvgValue").textContent = st.avg + "%";
    $("#quartersAvgSub").textContent = T("daily tasks done · " + plural(st.counted, "quarter"), "مهام يومية خلصت · " + I18N.N(st.counted, "quarter", "quarters", ["ربع سنة واحد", "ربعين", "أرباع", "ربع"]));
    $("#quartersGoalsValue").textContent = st.goalsAvg == null ? "—" : st.goalsAvg + "%";
    $("#quartersGoalsSub").textContent = st.goalsAvg == null
      ? T("no goals set yet", "لسه مفيش أهداف")
      : T("of goals reached · " + plural(st.goalsCounted, "quarter"), "من الأهداف اتحققت · " + I18N.N(st.goalsCounted, "quarter", "quarters", ["ربع سنة واحد", "ربعين", "أرباع", "ربع"]));
    $("#quartersDaysValue").textContent = st.trackedDays;
    $("#quartersDaysSub").textContent = T("across " + plural(state.quarters.length, "quarter"), "على مدار " + I18N.N(state.quarters.length, "quarter", "quarters", ["ربع سنة واحد", "ربعين", "أرباع", "ربع"]));

    var best = null;
    state.quarters.forEach(function (q) {
      var s = st.byId[q.id];
      if (s && s.tracked && (!best || s.avg > best.s.avg)) best = { q: q, s: s };
    });
    $("#quartersBestValue").textContent = best ? best.s.avg + "%" : "—";
    $("#quartersBestSub").textContent = best ? best.q.name : T("no tracked days yet", "لسه مفيش أيام متسجلة");

    // oldest first — a trend line that ran newest-to-oldest would read backwards
    var today = todayISO();
    var points = state.quarters.slice().reverse().map(function (q) {
      var s = st.byId[q.id] || { avg: 0, tracked: 0, days: 0 };
      return {
        id: q.id, name: q.name, avg: s.avg, tracked: s.tracked, days: s.days,
        goals: s.goals == null ? null : s.goals,
        isCurrent: q.start_date <= today && today <= q.end_date,
      };
    });
    window.renderQuartersChart($("#quartersChart"), $("#quartersChartTip"), points, { avg: st.avg });
  }

  function quarterMeasureHtml(label, pct, kind) {
    return '<div class="quarter-card__measure quarter-card__measure--' + kind + '">' +
      '<div class="quarter-card__avg-row"><span>' + label + '</span><b>' + (pct == null ? "—" : pct + "%") + '</b></div>' +
      '<div class="quarter-card__bar"><div class="quarter-card__fill' + (pct != null && pct >= 100 ? ' quarter-card__fill--done' : '') +
        '" style="width:' + (pct || 0) + '%"></div></div>' +
    '</div>';
  }

  function renderQuarterGallery() {
    $("#noQuarters").hidden = state.quarters.length > 0;
    var today = todayISO();
    var box = $("#quarterGallery");
    box.innerHTML = state.quarters.map(function (q) {
      var badge = today < q.start_date ? '<span class="badge badge--muted">' + T("Upcoming", "جاي") + '</span>'
        : today > q.end_date ? '<span class="badge badge--muted">' + T("Past", "فات") + '</span>'
        : '<span class="badge badge--good">' + T("Current", "الحالي") + '</span>';
      var s = state.quarterStats && state.quarterStats.byId[q.id];
      return '<div class="quarter-card" data-id="' + q.id + '">' +
        '<div class="quarter-card__top"><span class="quarter-card__name">' + esc(q.name) + '</span>' + badge + '</div>' +
        '<div class="quarter-card__dates">' + fmtDate(q.start_date) + ' – ' + fmtDate(q.end_date) + '</div>' +
        (s ?
          '<div class="quarter-card__avg">' +
            quarterMeasureHtml(T("Execution", "التنفيذ"), s.tracked ? s.avg : null, "exec") +
            quarterMeasureHtml(T("Goals", "الأهداف"), s.goals, "goals") +
            '<div class="quarter-card__foot">' +
              (s.tracked ? T(s.tracked + ' of ' + s.days + ' days tracked', s.tracked + ' من ' + s.days + ' يوم متسجل') : T('nothing logged yet', 'لسه مفيش حاجة متسجلة')) +
            '</div>' +
          '</div>'
          : '') +
      '</div>';
    }).join("");
    box.querySelectorAll(".quarter-card").forEach(function (card) {
      card.addEventListener("click", function () {
        var id = Number(card.dataset.id);
        state.selectedQuarterId = id;
        remember("quarter-id", String(id));
        loadQuarterDetail(id).then(function () { showQuarterDetailView(); });
      });
    });
    renderQuartersSummary();
  }

  function showQuarterGallery() {
    $("#quarterGalleryView").hidden = false;
    $("#quarterDetailView").hidden = true;
    remember("quarter-view", "gallery");
    renderQuarterGallery(); // paint from what's cached, then refresh in the background
    loadQuarterStats();
  }

  function showQuarterDetailView() {
    $("#quarterGalleryView").hidden = true;
    $("#quarterDetailView").hidden = false;
    remember("quarter-view", "detail");
  }

  // opening the tab lands where you left it — the gallery, or the quarter you opened
  function restoreQuarterView() {
    if (recall("quarter-view", "gallery") === "detail" && state.quarterDetail) showQuarterDetailView();
    else showQuarterGallery();
  }

  $("#btnBackToQuarters").addEventListener("click", showQuarterGallery);

  // the plan's rhythm (hours a day per track, weekend) rides along, for due dates
  function loadPlanState() {
    return api("/api/tasks?plan=state").then(function (r) { state.planState = r.state || null; }).catch(function () { state.planState = state.planState || null; });
  }

  function loadQuarterDetail(id) {
    return Promise.all([api("/api/quarters?id=" + id), loadPlanState()]).then(function (res) {
      var data = res[0];
      state.quarterDetail = data;
      renderCategorySelect(data.categories);
      renderQuarter(data);
      updateCountdown();
    }).catch(function (e) { toast(e.message, true); });
  }

  function renderCategorySelect(categories) {
    var sel = $("#addTaskForm").elements.category_id;
    var current = sel.value;
    sel.innerHTML = '<option value="">' + T("— none —", "— مفيش —") + '</option>' +
      (categories || []).map(function (c) { return '<option value="' + c.id + '">' + esc(c.name) + "</option>"; }).join("");
    if (current) sel.value = current;
  }

  var PACE_LABEL = { ahead: T("Ahead", "سابق"), "on-track": T("On track", "ماشي تمام"), behind: T("Behind", "متأخر"), "not-started": T("Not started", "لسه ما بدأش") };
  var PACE_CLASS = { ahead: "badge--good", "on-track": "badge--muted", behind: "badge--danger", "not-started": "badge--muted" };
  var PACE_DONUT_COLOR = { ahead: "#1fa876", "on-track": "#91A3C9", behind: "#e2586a", "not-started": "#5f6b7d" };
  // Categorical palette led by the site's blurple accent. Every hue sits at a
  // similar mid lightness so the same swatch reads on the white ground and on
  // the dark one, without a per-theme second palette.
  var CATEGORY_PALETTE = ["#879AC4", "#3aa682", "#c98a2b", "#6A82B6", "#C46E64", "#4F689F", "#d1704f", "#8b8fa3"];
  var GOAL_STATUS_LABEL = { done: T("Completed", "خلصت"), "in-progress": T("In progress", "شغال عليه"), "not-started": T("Not started", "لسه ما بدأش") };
  var GOAL_STATUS_COLOR = { done: "#1fa876", "in-progress": "#91A3C9", "not-started": "#5f6b7d" };

  function fmtNum(n) {
    n = Number(n) || 0;
    return Number.isInteger(n) ? String(n) : n.toFixed(1);
  }

  function goalPct(g) {
    return Number(g.target) > 0 ? Math.min(100, Math.round((Number(g.current) / Number(g.target)) * 100)) : 0;
  }

  // weighted by target, so a 500-target goal counts more than a 10-target one —
  // more representative of real progress than a plain average of percentages
  function combinedGoalsPct(goals) {
    if (!goals || !goals.length) return null;
    var sumCurrent = 0, sumTarget = 0;
    goals.forEach(function (g) { sumCurrent += Number(g.current) || 0; sumTarget += Number(g.target) || 0; });
    return sumTarget > 0 ? Math.min(100, Math.round((sumCurrent / sumTarget) * 100)) : 0;
  }

  function overallBarHtml(pct, label, dataId) {
    return '<div class="goals-overall"' + (dataId != null ? ' data-cat-id="' + dataId + '"' : '') + '>' +
      '<div class="goals-overall__top"><span>' + label + '</span><span class="goals-overall__pct">' + pct + '%</span></div>' +
      '<div class="goal-row__bar"><div class="goal-row__fill' + (pct >= 100 ? ' goal-row__fill--done' : '') +
        '" style="width:' + pct + '%"></div></div>' +
    '</div>';
  }

  /* ---------------- due dates from the plan, in series ----------------
     The plan's four tracks run one after another across the quarter (the same
     stretches as the Plan tab's "In series" popup: working days between the
     quarter's dates, the weekend out, each track's share by its hours a day).
     Inside a track's stretch, the goals of its categories — the ones not
     hidden, in the All-goals order — split the days equally, and each goal is
     due on the day its share ends (owner, 2026-10-21: "distribute as days,
     then depends on order in all goals non hidden add days, so this will be
     the due date"). */
  var TRACK_KEYS = ["biz", "brand", "job", "learn"];
  var TRACK_NAME = { biz: T("Business", "البيزنس"), brand: T("Branding", "البراند"), job: T("Job", "الوظيفة"), learn: T("Learning", "التعلّم") };
  var TRACK_COLOR = { biz: "#e0652f", brand: "#15966b", job: "#5570AB", learn: "#d99a00" };
  var TRACK_WORDS = { biz: /business|biz|startup|company|product|cashflow|sales|client/i, brand: /brand|content|linkedin|youtube|social|writing|audience/i, job: /job|work|career|interview|applications?|cv|resume/i, learn: /learn|study|course|read|book|skill|english/i };
  // the plan's own starting numbers, per phase, for when it has not been saved yet
  var PLAN_DEFAULT_HOURS = { 1: { biz: 5, brand: 3, job: 2.5, learn: 1.5 }, 2: { biz: 2, brand: 1.5, job: 8, learn: 0.5 }, 3: { biz: 2.5, brand: 1, job: 8, learn: 0.5 }, 4: { biz: 6, brand: 4, job: 0, learn: 2 } };
  var PLAN_PHASE_NAME = { 1: T("Job hunt and building the business", "تدوير على وظيفة وبناء البيزنس"), 2: T("Job and business together", "الوظيفة والبيزنس مع بعض"), 3: T("Job, with the team running", "الوظيفة، والفريق شغال"), 4: T("Business full-time", "البيزنس فول تايم") };

  function guessTrack(name) {
    for (var i = 0; i < TRACK_KEYS.length; i++) if (TRACK_WORDS[TRACK_KEYS[i]].test(name || "")) return TRACK_KEYS[i];
    return "";
  }

  // the plan's phase from its ticked milestones
  function planPhaseNow() {
    var ps = state.planState, phase = 1, after = { offer: 2, team: 3, passed: 3, left: 4, goal200: 4, goal: 5 };
    if (ps && ps.milestones) Object.keys(after).forEach(function (k) { if (ps.milestones[k] && ps.milestones[k].done) phase = Math.max(phase, after[k]); });
    return Math.min(phase, 4);
  }

  // hours a day per track and the weekend, from a plan phase (the quarter's
  // chosen one, else the plan's current one), its "in series" override if set,
  // else the numbers the plan was born with
  function planRhythm(chosenPhase, ownWeekend) {
    var ps = state.planState, weekend = [5, 6];
    var phase = chosenPhase >= 1 && chosenPhase <= 4 ? Number(chosenPhase) : planPhaseNow();
    var hours = PLAN_DEFAULT_HOURS[phase];
    if (ps && ps.hours) {
      var p = "p" + phase;
      var sr = ps.series && ps.series[p];
      hours = (sr && sr.hours) || ps.hours[p] || hours;
      if (sr && Array.isArray(sr.weekend)) weekend = sr.weekend;
    }
    if (Array.isArray(ownWeekend)) weekend = ownWeekend; // the quarter picked its own days off
    return { hours: hours, weekend: weekend, phase: phase, chosen: !!chosenPhase };
  }

  // the quarter's working days (ISO), its tracks' stretches, and a due date on every goal in play
  function computeDueDates(data) {
    if (!data) return null;
    var r = planRhythm(data.quarter.plan_phase, data.quarter.weekend);
    var days = [];
    for (var iso = String(data.quarter.start_date).slice(0, 10), end = String(data.quarter.end_date).slice(0, 10); iso <= end; iso = addDays(iso, 1)) {
      if (r.weekend.indexOf(new Date(iso + "T00:00:00Z").getUTCDay()) < 0) days.push(iso);
    }
    var W = days.length, perDay = 0;
    TRACK_KEYS.forEach(function (k) { perDay += Number(r.hours[k]) || 0; });
    var stretches = {}, cur = 0;
    if (W && perDay) TRACK_KEYS.forEach(function (k) {
      var h = Number(r.hours[k]) || 0; if (!h) return;
      var span = W * h / perDay;
      stretches[k] = { start: cur, span: span, from: days[Math.floor(cur + 1e-9)], to: days[Math.min(W - 1, Math.ceil(cur + span - 1e-9) - 1)] };
      cur += span;
    });

    var catTrack = {};
    data.categories.forEach(function (c) { catTrack[c.id] = c.track || guessTrack(c.name); c.trackKey = catTrack[c.id]; });
    var goals = data.categories.reduce(function (acc, c) { return acc.concat(c.goals || []); }, [])
      .sort(function (a, b) { return (Number(a.position) || 0) - (Number(b.position) || 0); });
    goals.forEach(function (g) { g.due = null; g.dueTrack = catTrack[g.category_id] || ""; });
    TRACK_KEYS.forEach(function (k) {
      var st = stretches[k]; if (!st) return;
      var mine = goals.filter(function (g) { return !g.hidden && catTrack[g.category_id] === k; });
      if (!mine.length) return;
      var per = st.span / mine.length, c = st.start;
      mine.forEach(function (g) { c += per; g.due = days[Math.min(W - 1, Math.max(0, Math.ceil(c - 1e-9) - 1))]; });
    });
    return { days: days, stretches: stretches, weekend: r.weekend, hours: r.hours, perDay: perDay, phase: r.phase, chosen: r.chosen };
  }

  function dueChipHtml(g) {
    if (!g.due) return "";
    var today = todayISO(), cls = "", text = T("due " + fmtDayMonth(g.due), "المعاد " + fmtDayMonth(g.due));
    if (goalPct(g) >= 100) { cls = "goal-row__due--done"; text = T("done · was due " + fmtDayMonth(g.due), "خلصت · كان معادها " + fmtDayMonth(g.due)); }
    else if (g.due < today) { cls = "goal-row__due--late"; text = T("late · was due " + fmtDayMonth(g.due), "متأخر · كان معاده " + fmtDayMonth(g.due)); }
    else if (addDays(today, 2) >= g.due) cls = "goal-row__due--soon";
    return '<span class="goal-row__due ' + cls + '" title="' + T("From the plan: " + TRACK_NAME[g.dueTrack] + " days, split equally in the All-goals order", "من الخطة: أيام " + TRACK_NAME[g.dueTrack] + "، متقسمة بالتساوي بترتيب كل الأهداف") + '">' + text + '</span>';
  }

  function renderQuarterSeries(data, due) {
    var box = $("#quarterSeries");
    if (!data || !due) { box.hidden = true; return; }
    var keys = TRACK_KEYS.filter(function (k) { return due.stretches[k]; });
    if (!due.days.length) { box.hidden = true; return; }
    var anyTrack = data.categories.some(function (c) { return c.trackKey; });
    var dayName = function (d) { return [T("Sun", "الأحد"), T("Mon", "الاتنين"), T("Tue", "التلات"), T("Wed", "الأربع"), T("Thu", "الخميس"), T("Fri", "الجمعة"), T("Sat", "السبت")][d]; };
    // which phase's hours: the plan's own (auto) or one chosen for this quarter
    var phaseSel = '<select class="quarter-series__phase" id="quarterPhase" aria-label="' + T("Plan phase for the due dates", "مرحلة الخطة لحساب المواعيد") + '">' +
      '<option value=""' + (due.chosen ? '' : ' selected') + '>' + T("Plan now · Phase " + planPhaseNow(), "الخطة دلوقتي · المرحلة " + planPhaseNow()) + '</option>' +
      [1, 2, 3, 4].map(function (n) { return '<option value="' + n + '"' + (due.chosen && due.phase === n ? ' selected' : '') + '>' + T("Phase " + n, "المرحلة " + n) + ' · ' + PLAN_PHASE_NAME[n] + '</option>'; }).join("") +
      '</select>';
    box.innerHTML = phaseSel + '<span>' + T("in series:", "بالترتيب:") + '</span>' + keys.map(function (k) {
      var s = due.stretches[k];
      return '<span class="quarter-series__chip"><i class="quarter-series__dot" style="background:' + TRACK_COLOR[k] + '"></i>' +
        TRACK_NAME[k] + ' ' + fmtDayMonth(s.from) + (s.from === s.to ? '' : T(" → ", " ← ") + fmtDayMonth(s.to)) + '</span>';
    }).join("") +
      '<span class="quarter-series__hint">' + T(due.days.length + " working days · weekend ", I18N.N(due.days.length, "", "", ["يوم شغل", "يومين شغل", "أيام شغل", "يوم شغل"]) + " · الإجازة ") + (due.weekend.length ? due.weekend.map(dayName).join(T(", ", "، ")) : T("none", "مفيش")) +
      (anyTrack ? '' : T(" · set each category's track in Edit quarter to get due dates", " · حدد مسار كل تصنيف من تعديل ربع السنة عشان تطلع المواعيد")) + '</span>';
    box.hidden = false;
    $("#quarterPhase").addEventListener("change", function () {
      var v = this.value ? Number(this.value) : null;
      api("/api/quarters?id=" + data.quarter.id, { method: "PATCH", body: { plan_phase: v } })
        .then(function (r) { data.quarter.plan_phase = r.quarter ? r.quarter.plan_phase : v; renderQuarter(data); if (window.Go) window.Go.play("tap"); })
        .catch(function (e) { toast(e.message, true); });
    });
  }

  function goalRowHtml(g, opts) {
    opts = opts || {};
    var pct = goalPct(g);
    return '<div class="goal-row' + (pct >= 100 ? " goal-row--done" : "") + '" data-id="' + g.id + '">' +
      '<div class="goal-row__top">' +
        (opts.draggable || opts.handle ? '<span class="goal-row__handle" title="' + T("Drag to reorder", "اسحب لإعادة الترتيب") + '">⠿</span>' : '') +
        (opts.categoryName ? '<span class="goal-row__cat-tag">' + esc(opts.categoryName) + '</span>' : '') +
        '<span class="goal-row__title">' + esc(g.title) + '</span>' +
        dueChipHtml(g) +
        '<span class="goal-row__pct">' + pct + '%</span>' +
        (opts.draggable ? '<button type="button" class="iconbtn iconbtn--hide" title="' + T("Hide from this view", "إخفاء من العرض ده") + '">🙈</button>' : '') +
        '<button type="button" class="iconbtn iconbtn--copy" title="' + T("Add to today's to-do", "ضيفه لمهام النهارده") + '">📋</button>' +
        '<button type="button" class="iconbtn iconbtn--edit" title="' + T("Edit goal", "تعديل الهدف") + '">✎</button>' +
        '<button type="button" class="iconbtn iconbtn--delete" title="' + T("Delete goal", "مسح الهدف") + '">✕</button>' +
      '</div>' +
      '<div class="goal-row__bar"><div class="goal-row__fill' + (pct >= 100 ? ' goal-row__fill--done' : '') +
        '" style="width:' + pct + '%"></div></div>' +
      '<div class="goal-row__nums">' +
        '<button type="button" class="goal-row__step" data-delta="-1" title="-1">−</button>' +
        '<input type="number" min="0" step="any" class="goal-row__current" value="' + fmtNum(g.current) + '" />' +
        '<button type="button" class="goal-row__step" data-delta="1" title="+1">+</button>' +
        // the target moves by its own buttons too, rather than only through the
        // edit form (owner, 2026-10-17: "like additional shortcut")
        '<span class="goal-row__target">' +
          '<span class="goal-row__slash">/</span>' +
          '<button type="button" class="goal-row__tstep" data-tdelta="-1" title="' + T("Lower the target", "قلّل المستهدف") + '" aria-label="' + T("Lower the target", "قلّل المستهدف") + '">−</button>' +
          '<input type="number" min="0" step="any" class="goal-row__target-input" value="' + fmtNum(g.target) + '" aria-label="' + T("Target", "المستهدف") + '" />' +
          '<button type="button" class="goal-row__tstep" data-tdelta="1" title="' + T("Raise the target", "زوّد المستهدف") + '" aria-label="' + T("Raise the target", "زوّد المستهدف") + '">+</button>' +
          (g.unit ? '<span class="goal-row__unit">' + esc(g.unit) + '</span>' : '') +
        '</span>' +
      '</div>' +
    '</div>';
  }

  // updates the bar/percentage/input in place, no page-wide reload — used by the
  // +1/-1 buttons so quick repeated taps (e.g. logging each prayer) feel instant
  function updateGoalRowUI(row, current, target) {
    var pct = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
    row.querySelector(".goal-row__pct").textContent = pct + "%";
    var fill = row.querySelector(".goal-row__fill");
    fill.style.width = pct + "%";
    fill.classList.toggle("goal-row__fill--done", pct >= 100);
    // the moment it is reached, the goal goes green and says so once
    var wasDone = row.classList.contains("goal-row--done");
    row.classList.toggle("goal-row--done", pct >= 100);
    var targetInput = row.querySelector(".goal-row__target-input");
    if (targetInput && document.activeElement !== targetInput) targetInput.value = fmtNum(target);
    if (pct >= 100 && !wasDone && window.Go) {
      var r = row.getBoundingClientRect();
      window.Go.burst(r.left + r.width / 2, r.top + r.height / 2, 20, ["🎯", "✨"]);
      window.Go.play("success");
    }
    row.querySelector(".goal-row__current").value = fmtNum(current);
  }

  // same in-place update as updateGoalRowUI, but for a combined "overall" bar
  // (a category's goals combined, or the whole quarter's goals combined)
  function updateOverallBarUI(container, pct) {
    if (!container) return;
    container.querySelector(".goals-overall__pct").textContent = pct + "%";
    var fill = container.querySelector(".goal-row__fill");
    fill.style.width = pct + "%";
    fill.classList.toggle("goal-row__fill--done", pct >= 100);
  }

  // recomputes a category's overall bar (wherever it appears — its own card
  // and the analytics rollup both share the same data-cat-id) and the
  // whole-quarter overall bar from in-memory state — no reload, so it stays
  // instant alongside +1/-1 taps
  function refreshOverallBars(category) {
    var catPct = combinedGoalsPct(category.goals);
    if (catPct != null) {
      document.querySelectorAll('.goals-overall[data-cat-id="' + category.id + '"]').forEach(function (el) {
        updateOverallBarUI(el, catPct);
      });
    }

    if (state.quarterDetail) {
      var allGoals = state.quarterDetail.categories.reduce(function (acc, c) { return acc.concat(c.goals || []); }, []);
      var qPct = combinedGoalsPct(allGoals);
      if (qPct != null) updateOverallBarUI($("#quarterOverallBar").querySelector(".goals-overall"), qPct);
    }
  }

  // updates every instance of this goal's row in the DOM — a goal can appear
  // both in its category card and in the flat "all goals" list at once
  /* The target, moved from the row itself. A target of nothing would make the
     percentage meaningless, so the buttons stop at 1; typing any number is
     still allowed. */
  function setGoalTarget(goal, target, category) {
    var current = Number(goal.current) || 0;
    var wasDone = goalPct(goal) >= 100;
    goal.target = target;
    updateAllGoalRowInstances(goal.id, current, target);
    refreshOverallBars(category);
    bumpGoalRows(goal.id);
    if (!(target > 0 && current >= target && !wasDone)) playStepSound(); // the done moment makes its own noise
    api("/api/goals?id=" + goal.id, { method: "PATCH", body: { target: target, log_date: todayISO() } })
      .then(function () { loadGamification(); })
      .catch(function (e) { toast(e.message, true); loadQuarterDetail(state.selectedQuarterId); });
  }

  function stepGoalTarget(goal, delta, category) {
    setGoalTarget(goal, Math.max(1, (Number(goal.target) || 0) + delta), category);
  }

  function updateAllGoalRowInstances(goalId, current, target) {
    document.querySelectorAll('.goal-row[data-id="' + goalId + '"]').forEach(function (row) {
      updateGoalRowUI(row, current, target);
    });
  }

  // a quick "bump" pop on every instance of a goal row, so incrementing feels
  // tactile rather than the number just silently changing
  function bumpGoalRows(goalId) {
    if (reduceMotion) return;
    document.querySelectorAll('.goal-row[data-id="' + goalId + '"]').forEach(function (row) {
      row.classList.remove("goal-row--bump");
      void row.offsetWidth;
      row.classList.add("goal-row--bump");
    });
  }

  function stepGoal(goal, delta, category) {
    var target = Number(goal.target) || 0;
    var wasDone = goalPct(goal) >= 100;
    var v = Math.max(0, (Number(goal.current) || 0) + delta);
    goal.current = v; // keep in sync so another quick tap steps from the right base
    updateAllGoalRowInstances(goal.id, v, target);
    refreshOverallBars(category);
    bumpGoalRows(goal.id);
    var nowDone = target > 0 && v >= target;
    if (!wasDone && nowDone) { playSuccessSound(); if (!reduceMotion) burstConfetti(14); }
    else playStepSound();
    api("/api/goals?id=" + goal.id, { method: "PATCH", body: { current: v, log_date: todayISO() } })
      .then(function () { loadGamification(); })
      .catch(function (e) { toast(e.message, true); loadQuarterDetail(state.selectedQuarterId); });
  }

  // editing a goal always happens through its category's add-form, regardless
  // of which view (grouped or flat) the edit was triggered from
  function startEditGoal(category, goal) {
    setGoalsView("category");
    var card = document.querySelector('.category-card[data-cat-id="' + category.id + '"]');
    if (!card) return;
    var form = card.querySelector(".goal-add-form");
    form.elements.title.value = goal.title;
    form.elements.target.value = Number(goal.target);
    form.elements.unit.value = goal.unit || "";
    form.dataset.editingId = goal.id;
    form.querySelector("button[type=submit]").textContent = T("Update", "تحديث");
    form.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  // wires one .goal-row element's steppers/copy/edit/delete — used for both
  // the grouped-by-category view and the flat "all goals" view
  function wireGoalRow(row, g, category) {
    row.querySelectorAll(".goal-row__step").forEach(function (btn) {
      btn.addEventListener("click", function () { stepGoal(g, Number(btn.dataset.delta), category); });
    });
    row.querySelectorAll(".goal-row__tstep").forEach(function (btn) {
      btn.addEventListener("click", function () { stepGoalTarget(g, Number(btn.dataset.tdelta), category); });
    });
    row.querySelector(".goal-row__target-input").addEventListener("change", function (ev) {
      var v = Number(ev.target.value);
      if (!(v > 0)) { ev.target.value = fmtNum(g.target); toast(T("A target has to be more than 0", "المستهدف لازم يكون أكبر من 0"), true); return; }
      setGoalTarget(g, v, category);
    });
    row.querySelector(".goal-row__current").addEventListener("change", function (ev) {
      var v = ev.target.value === "" ? 0 : Number(ev.target.value);
      var wasDone = goalPct(g) >= 100;
      var nowDone = Number(g.target) > 0 && v >= Number(g.target);
      api("/api/goals?id=" + g.id, { method: "PATCH", body: { current: v, log_date: todayISO() } })
        .then(function () {
          if (!wasDone && nowDone) { playSuccessSound(); if (!reduceMotion) burstConfetti(14); }
          loadGamification();
          return loadQuarterDetail(state.selectedQuarterId);
        })
        .catch(function (e) { toast(e.message, true); });
    });
    row.querySelector(".iconbtn--copy").addEventListener("click", function () {
      var today = todayISO();
      api("/api/tasks", { method: "POST", body: { task_date: today, title: g.title, category_id: category.id } })
        .then(function () {
          playAddSound();
          toast(T('Added "' + g.title + '" to today\'s to-do ✓', 'اتضاف "' + g.title + '" لمهام النهارده ✓'));
          if (state.currentDate === today) return afterTaskChange();
        })
        .catch(function (e) { toast(e.message, true); });
    });
    row.querySelector(".iconbtn--edit").addEventListener("click", function () { startEditGoal(category, g); });
    row.querySelector(".iconbtn--delete").addEventListener("click", function () {
      if (!confirm(T('Delete goal "' + g.title + '"?', 'تمسح الهدف "' + g.title + '"؟'))) return;
      api("/api/goals?id=" + g.id, { method: "DELETE" })
        .then(function () { playDeleteSound(); return loadQuarterDetail(state.selectedQuarterId); })
        .catch(function (e) { toast(e.message, true); });
    });
  }

  // wires a category card's "+ add goal" form (editing an existing goal also
  // submits through here, once startEditGoal has pre-filled it)
  function wireGoalAddForm(card, category) {
    var addForm = card.querySelector(".goal-add-form");
    addForm.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var form = this;
      var btn = form.querySelector("button[type=submit]");
      var editingId = form.dataset.editingId;
      var body = {
        title: form.elements.title.value.trim(),
        target: Number(form.elements.target.value),
        unit: form.elements.unit.value.trim() || null,
        log_date: todayISO(), // a new or re-targeted goal is history too
      };
      if (!editingId) body.category_id = category.id;
      busy(btn, true);
      (editingId ? api("/api/goals?id=" + editingId, { method: "PATCH", body: body })
                 : api("/api/goals", { method: "POST", body: body }))
        .then(function () {
          toast(editingId ? T("Goal updated ✓", "الهدف اتحدّث ✓") : T("Goal added ✓", "الهدف اتضاف ✓"));
          if (!editingId) playAddSound();
          return loadQuarterDetail(state.selectedQuarterId);
        })
        .catch(function (e) { toast(e.message, true); })
        .finally(function () { busy(btn, false); });
    });
  }

  // horizontal-bar analytics for the selected quarter: hours pace and goals
  // completion side by side across every category, reusing the same bar
  // markup as the per-category/per-quarter "overall" rollups above
  function renderAnalytics(data) {
    var hoursBox = $("#analyticsHours");
    var goalsBox = $("#analyticsGoals");
    hoursBox.innerHTML = "";
    goalsBox.innerHTML = "";

    var hoursCats = data ? data.categories.filter(function (c) { return c.weekly_hours != null && Number(c.weekly_hours) > 0; }) : [];
    var goalsCats = data ? data.categories.filter(function (c) { return (c.goals || []).length > 0; }) : [];
    $("#noAnalytics").hidden = hoursCats.length > 0 || goalsCats.length > 0;

    var hoursSlices = hoursCats.map(function (c, i) {
      return { label: c.name, value: c.progress.actual, color: CATEGORY_PALETTE[i % CATEGORY_PALETTE.length] };
    });
    var totalHoursLogged = hoursCats.reduce(function (sum, c) { return sum + (Number(c.progress.actual) || 0); }, 0);
    window.renderDonutChart($("#donutHoursByCategory"), hoursSlices, {
      label: T("Hours logged by category", "الساعات المسجلة حسب التصنيف"), centerValue: fmtH(totalHoursLogged), centerLabel: T("logged", "مسجّل"),
    });

    var paceCounts = { ahead: 0, "on-track": 0, behind: 0, "not-started": 0 };
    hoursCats.forEach(function (c) { paceCounts[c.progress.pace] = (paceCounts[c.progress.pace] || 0) + 1; });
    var paceSlices = Object.keys(PACE_LABEL).map(function (key) {
      return { label: PACE_LABEL[key], value: paceCounts[key], color: PACE_DONUT_COLOR[key] };
    });
    window.renderDonutChart($("#donutPace"), paceSlices, { label: T("Pace breakdown", "توزيع المعدل"), centerLabel: T("categories", "تصنيفات") });

    if (hoursCats.length) {
      var hoursTitle = document.createElement("div");
      hoursTitle.className = "goals__label";
      hoursTitle.textContent = T("Hours pace — logged vs. quarter target", "معدل الساعات — المسجّل قصاد مستهدف ربع السنة");
      hoursBox.appendChild(hoursTitle);
      hoursCats.forEach(function (c) {
        var p = c.progress;
        var pct = p.target > 0 ? Math.min(100, Math.round((p.actual / p.target) * 100)) : 0;
        var wrap = document.createElement("div");
        wrap.innerHTML = overallBarHtml(pct, c.name);
        hoursBox.appendChild(wrap.firstChild);
      });
    }

    var goalsByCatSlices = goalsCats.map(function (c, i) {
      return { label: c.name, value: (c.goals || []).length, color: CATEGORY_PALETTE[i % CATEGORY_PALETTE.length] };
    });
    window.renderDonutChart($("#donutGoalsByCategory"), goalsByCatSlices, { label: T("Goals by category", "الأهداف حسب التصنيف"), centerLabel: T("goals", "أهداف") });

    var allGoalsFlat = data ? data.categories.reduce(function (acc, c) { return acc.concat(c.goals || []); }, []) : [];
    var statusCounts = { done: 0, "in-progress": 0, "not-started": 0 };
    allGoalsFlat.forEach(function (g) {
      var status = goalPct(g) >= 100 ? "done" : (Number(g.current) > 0 ? "in-progress" : "not-started");
      statusCounts[status]++;
    });
    var statusSlices = Object.keys(GOAL_STATUS_LABEL).map(function (key) {
      return { label: GOAL_STATUS_LABEL[key], value: statusCounts[key], color: GOAL_STATUS_COLOR[key] };
    });
    window.renderDonutChart($("#donutGoalsStatus"), statusSlices, { label: T("Goals status", "حالة الأهداف"), centerLabel: T("goals", "أهداف") });

    if (goalsCats.length) {
      var goalsTitle = document.createElement("div");
      goalsTitle.className = "goals__label";
      if (hoursCats.length) goalsTitle.style.marginTop = "16px";
      goalsTitle.textContent = T("Goals completion", "إنجاز الأهداف");
      goalsBox.appendChild(goalsTitle);
      goalsCats.forEach(function (c) {
        var wrap = document.createElement("div");
        wrap.innerHTML = overallBarHtml(combinedGoalsPct(c.goals), c.name, c.id);
        goalsBox.appendChild(wrap.firstChild);
      });
    }
  }

  // Rewrites the global goal order so that this category's goals sit in `ids`
  // order while every goal keeps the slot it already held. Everything outside
  // the category — and the flat "All goals" view — is left untouched.
  function reorderGoalsWithinCategory(category, ids) {
    var data = state.quarterDetail;
    if (!data) return;
    var all = data.categories.reduce(function (acc, c) { return acc.concat(c.goals || []); }, [])
      .slice().sort(function (a, b) { return (Number(a.position) || 0) - (Number(b.position) || 0); });

    var byId = {};
    all.forEach(function (g) { byId[g.id] = g; });
    var queue = ids.slice();
    var globalIds = all.map(function (g) {
      return Number(g.category_id) === Number(category.id) ? queue.shift() : g.id;
    });

    // keep the in-memory copy in step, or the next renderQuarter (a theme
    // switch, a resize) would redraw the order the user just moved away from
    globalIds.forEach(function (id, i) { if (byId[id]) byId[id].position = i; });
    category.goals = ids.map(function (id) { return byId[id]; }).filter(Boolean);

    api("/api/goals?reorder=1", { method: "PATCH", body: { ids: globalIds } })
      .then(function () { renderQuarter(data); }) // the due dates follow the new order
      .catch(function (e) { toast(e.message, true); loadQuarterDetail(state.selectedQuarterId); });
  }

  // the flat list: the new order is the global order; the due dates follow it
  function reorderGoalsFlat(ids) {
    var data = state.quarterDetail;
    if (!data) return;
    var byId = {};
    data.categories.forEach(function (c) { (c.goals || []).forEach(function (g) { byId[g.id] = g; }); });
    ids.forEach(function (id, i) { if (byId[id]) byId[id].position = i; });
    data.categories.forEach(function (c) { (c.goals || []).sort(function (a, b) { return (Number(a.position) || 0) - (Number(b.position) || 0); }); });
    api("/api/goals?reorder=1", { method: "PATCH", body: { ids: ids } })
      .then(function () { renderQuarter(data); })
      .catch(function (e) { toast(e.message, true); loadQuarterDetail(state.selectedQuarterId); });
  }

  function reorderCategories(ids) {
    var data = state.quarterDetail;
    if (!data) return;
    var byId = {};
    data.categories.forEach(function (c) { byId[c.id] = c; });
    data.categories = ids.map(function (id) { return byId[id]; }).filter(Boolean);
    data.categories.forEach(function (c, i) { c.position = i; });
    api("/api/quarters?reorder_categories=1", { method: "PATCH", body: { ids: ids } })
      .then(function () { renderAnalytics(data); }) // the rollups list categories in order too
      .catch(function (e) { toast(e.message, true); loadQuarterDetail(state.selectedQuarterId); });
  }

  makeReorderable({
    listEl: $("#categoryCards"),
    rowSelector: ".category-card",
    handleSelector: ".category-card__handle",
    draggingClass: "category-card--dragging",
    onReorder: reorderCategories,
  });

  function renderQuarter(data) {
    $("#quarterActions").hidden = !data;
    $("#btnCopyCategories").hidden = !data || !data.categories.length;
    $("#quarterDetailName").textContent = data ? data.quarter.name : "";
    $("#quarterDetailDates").textContent = data ? (fmtDate(data.quarter.start_date) + " – " + fmtDate(data.quarter.end_date)) : "";
    var due = computeDueDates(data);
    renderQuarterSeries(data, due);
    renderAnalytics(data);

    var quarterBarBox = $("#quarterOverallBar");
    quarterBarBox.innerHTML = "";
    var box = $("#categoryCards");
    box.innerHTML = "";
    var flatBox = $("#goalsFlatList");
    flatBox.innerHTML = "";
    $("#goalsViewToggle").hidden = !data;
    if (!data) { $("#noGoalsFlat").hidden = true; return; }

    if (data.quarter.anti_perfectionist) {
      var note = document.createElement("p");
      note.className = "go-note";
      note.textContent = T("🌤 Anti-perfectionist mode is on — targets below already count 75% as done.", "🌤 وضع «مش لازم كمال» شغال — المستهدفات اللي تحت بتتحسب خلصانة عند 75%.");
      box.appendChild(note);
    }

    var allGoals = data.categories.reduce(function (acc, c) { return acc.concat(c.goals || []); }, []);
    var quarterPct = combinedGoalsPct(allGoals);
    if (quarterPct != null) {
      quarterBarBox.innerHTML = overallBarHtml(quarterPct, T("This quarter — all categories' goals", "ربع السنة ده — أهداف كل التصنيفات"));
    }

    data.categories.forEach(function (c) {
      var p = c.progress;
      var hasHours = c.weekly_hours != null && Number(c.weekly_hours) > 0;
      var catPct = combinedGoalsPct(c.goals);
      var card = document.createElement("div");
      card.className = "category-card";
      card.dataset.catId = c.id;
      card.dataset.id = c.id; // makeReorderable reads data-id
      card.innerHTML =
        '<div class="category-card__head">' +
          '<span class="category-card__handle" title="' + T("Drag to reorder categories", "اسحب لإعادة ترتيب التصنيفات") + '">⠿</span>' +
          '<span class="category-card__name">' + esc(c.name) + '</span>' +
        (hasHours ? '<span class="badge ' + PACE_CLASS[p.pace] + '">' + PACE_LABEL[p.pace] + '</span>' : '') +
          '<button type="button" class="iconbtn iconbtn--edit category-card__copy" title="' + T("Copy to another quarter", "انسخ لربع سنة تاني") + '" aria-label="' + T("Copy " + esc(c.name) + " to another quarter", "انسخ " + esc(c.name) + " لربع سنة تاني") + '">⧉</button>' +
        '</div>' +
        (c.trackKey && due && due.stretches[c.trackKey]
          ? '<div class="category-card__track"><i class="quarter-series__dot" style="background:' + TRACK_COLOR[c.trackKey] + '"></i>' +
            T(TRACK_NAME[c.trackKey] + " days", "أيام " + TRACK_NAME[c.trackKey]) + ' · ' + fmtDayMonth(due.stretches[c.trackKey].from) + T(" → ", " ← ") + fmtDayMonth(due.stretches[c.trackKey].to) + '</div>'
          : '') +
        (hasHours ?
          '<div class="category-card__stats">' +
            '<div>' + T("Weekly target", "مستهدف الأسبوع") + '<b>' + fmtH(c.weekly_hours) + '</b></div>' +
            '<div>' + T("Quarter target", "مستهدف ربع السنة") + '<b>' + fmtH(p.target) + '</b></div>' +
            '<div>' + T("Logged", "المسجّل") + '<b>' + fmtH(p.actual) + '</b></div>' +
            '<div>' + T("Remaining", "الباقي") + '<b>' + fmtH(p.remaining) + '</b></div>' +
          '</div>' +
          '<div class="chart" style="min-height:190px"></div>'
          : '<p class="muted" style="margin:0">' + T("No hour target set for this category.", "مفيش مستهدف ساعات للتصنيف ده.") + '</p>') +
        '<div class="goals">' +
          '<div class="goals__label">' + T("Goals", "الأهداف") + '</div>' +
          (catPct != null ? overallBarHtml(catPct, T("Overall", "الإجمالي"), c.id) : '') +
          '<div class="goals__list">' +
            (c.goals || []).map(function (g) { return goalRowHtml(g, { handle: true }); }).join("") +
          '</div>' +
          '<form class="goal-add-form">' +
            '<input name="title" placeholder="' + T("Goal (e.g. Job applications)", "هدف (مثلاً: تقديمات شغل)") + '" required />' +
            '<input name="target" type="number" min="0.01" step="any" placeholder="' + T("Target", "المستهدف") + '" required />' +
            '<input name="unit" placeholder="' + T("unit", "الوحدة") + '" />' +
            '<button type="submit" class="btn btn--ghost btn--sm">' + T("+ Add goal", "+ إضافة هدف") + '</button>' +
          '</form>' +
        '</div>';
      box.appendChild(card);
      if (hasHours) {
        window.renderProgressChart(card.querySelector(".chart"), p.timeline, {
          start: data.quarter.start_date, end: data.quarter.end_date, target: p.target,
        });
      }
      (c.goals || []).forEach(function (g) {
        var row = card.querySelector('.goal-row[data-id="' + g.id + '"]');
        if (row) wireGoalRow(row, g, c);
      });
      wireGoalAddForm(card, c);
      card.querySelector(".category-card__copy").addEventListener("click", function () { openCopyDialog([c.id]); });

      // Goals inside one category. `position` is a single counter shared by every
      // goal in the quarter, so sending just this category's ids would renumber
      // them 0..n and collide with the other categories. Instead the category's
      // goals are permuted within the global slots they already occupy, which
      // leaves the "All goals" list exactly as it was.
      makeReorderable({
        listEl: card.querySelector(".goals__list"),
        rowSelector: ".goal-row",
        handleSelector: ".goal-row__handle",
        draggingClass: "goal-row--dragging",
        onReorder: function (ids) { reorderGoalsWithinCategory(c, ids); },
      });
    });

    // flat "all goals" view — every goal across every category, in one global
    // drag-orderable list (position is a single shared counter, so this sort
    // also matches the order shown within each category above)
    var flatGoals = allGoals.slice().sort(function (a, b) { return (Number(a.position) || 0) - (Number(b.position) || 0); });
    var catById = {};
    data.categories.forEach(function (c) { catById[c.id] = c; });
    flatGoals.forEach(function (g) {
      var cat = catById[g.category_id];
      var wrap = document.createElement("div");
      wrap.innerHTML = goalRowHtml(g, { categoryName: cat ? cat.name : "", draggable: true, handle: true });
      var row = wrap.firstChild;
      row.hidden = !!g.hidden;
      flatBox.appendChild(row);
      if (cat) wireGoalRow(row, g, cat);
      row.querySelector(".iconbtn--hide").addEventListener("click", function () {
        api("/api/goals?id=" + g.id, { method: "PATCH", body: { hidden: true } })
          .then(function () {
            g.hidden = true;
            renderQuarter(state.quarterDetail); // the hidden goal gives its days to the rest
          })
          .catch(function (e) { toast(e.message, true); });
      });
    });

    setGoalsView(state.goalsView);
  }

  /* ---------------- goals view toggle: grouped by category, or one flat drag-orderable list ---------------- */

  function setGoalsView(view) {
    state.goalsView = view;
    try { localStorage.setItem("time-goals-view", view); } catch (e) {}
    $("#categoryCards").hidden = view !== "category";
    $("#goalsFlatList").hidden = view !== "flat";
    $("#noGoalsFlat").hidden = view !== "flat" || $("#goalsFlatList").children.length > 0;
    document.querySelectorAll(".goals-view-toggle__btn").forEach(function (btn) {
      btn.classList.toggle("goals-view-toggle__btn--active", btn.dataset.view === view);
    });
    updateGoalsHiddenBanner();
  }

  $("#goalsViewToggle").addEventListener("click", function (ev) {
    var btn = ev.target.closest(".goals-view-toggle__btn");
    if (!btn) return;
    setGoalsView(btn.dataset.view);
  });

  function updateGoalsHiddenBanner() {
    var allGoals = state.quarterDetail
      ? state.quarterDetail.categories.reduce(function (acc, c) { return acc.concat(c.goals || []); }, [])
      : [];
    var count = allGoals.filter(function (g) { return g.hidden; }).length;
    var banner = $("#goalsHiddenBanner");
    banner.hidden = count === 0 || state.goalsView !== "flat"; // hiding only applies to the flat view
    if (count > 0) banner.querySelector(".goals-hidden-count").textContent = count;
  }

  $("#btnShowHiddenGoals").addEventListener("click", function (ev) {
    ev.preventDefault();
    if (!state.quarterDetail) return;
    var categoryIds = state.quarterDetail.categories.map(function (c) { return c.id; });
    api("/api/goals?unhide_all=1", { method: "PATCH", body: { category_ids: categoryIds } })
      .then(function () {
        state.quarterDetail.categories.forEach(function (c) {
          (c.goals || []).forEach(function (g) { g.hidden = false; });
        });
        renderQuarter(state.quarterDetail);
      })
      .catch(function (e) { toast(e.message, true); });
  });

  makeReorderable({
    listEl: $("#goalsFlatList"),
    rowSelector: ".goal-row",
    handleSelector: ".goal-row__handle",
    draggingClass: "goal-row--dragging",
    onReorder: reorderGoalsFlat,
  });

  $("#btnAddCategoryRow").addEventListener("click", function () { addCategoryRow(); });

  /* ---------------- Ideas: freeform, drag-to-reorder list ---------------- */

  function ideaRowHtml(idea) {
    return '<div class="idea-row idea-row--enter" data-id="' + idea.id + '">' +
      '<span class="idea-row__handle" title="' + T("Drag to reorder", "اسحب لإعادة الترتيب") + '">⠿</span>' +
      '<div class="idea-row__body"><span class="idea-row__text">' + esc(idea.text) + '</span></div>' +
      '<button type="button" class="iconbtn iconbtn--edit" title="' + T("Edit idea", "تعديل الفكرة") + '">✎</button>' +
      '<button type="button" class="iconbtn" title="' + T("Delete idea", "مسح الفكرة") + '">✕</button>' +
    '</div>';
  }

  function startEditIdea(row, idea) {
    var body = row.querySelector(".idea-row__body");
    body.innerHTML = '<input class="idea-row__edit-input" value="' + esc(idea.text) + '" />';
    var input = body.querySelector("input");
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);

    function save() {
      var text = input.value.trim();
      if (!text || text === idea.text) { renderIdeaBody(); return; }
      api("/api/ideas?id=" + idea.id, { method: "PATCH", body: { text: text } })
        .then(function (data) { idea.text = data.idea.text; renderIdeaBody(); })
        .catch(function (e) { toast(e.message, true); renderIdeaBody(); });
    }
    function renderIdeaBody() {
      body.innerHTML = '<span class="idea-row__text">' + esc(idea.text) + '</span>';
    }
    input.addEventListener("keydown", function (ev) {
      if (ev.key === "Enter") { ev.preventDefault(); input.blur(); }
      if (ev.key === "Escape") { ev.preventDefault(); renderIdeaBody(); }
    });
    input.addEventListener("blur", save);
  }

  function loadIdeas() {
    return api("/api/ideas").then(function (data) {
      var ideas = data.ideas || [];
      $("#ideasEmpty").hidden = ideas.length > 0;
      var list = $("#ideaList");
      list.innerHTML = ideas.map(ideaRowHtml).join("");
      list.querySelectorAll(".idea-row").forEach(function (row) {
        var id = Number(row.dataset.id);
        var idea = ideas.filter(function (x) { return x.id === id; })[0];
        row.querySelector(".idea-row__text").addEventListener("click", function () { startEditIdea(row, idea); });
        row.querySelector(".iconbtn--edit").addEventListener("click", function () { startEditIdea(row, idea); });
        row.querySelector(".iconbtn:not(.iconbtn--edit)").addEventListener("click", function () {
          if (!confirm(T("Delete this idea?", "تمسح الفكرة دي؟"))) return;
          api("/api/ideas?id=" + id, { method: "DELETE" })
            .then(function () { playDeleteSound(); return loadIdeas(); })
            .catch(function (e) { toast(e.message, true); });
        });
      });
    }).catch(function (e) { toast(e.message, true); });
  }

  $("#ideaForm").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var form = ev.target;
    var text = form.elements.text.value.trim();
    if (!text) return;
    api("/api/ideas", { method: "POST", body: { text: text } })
      .then(function () { form.reset(); playAddSound(); return loadIdeas(); })
      .catch(function (e) { toast(e.message, true); });
  });

  makeReorderable({
    listEl: $("#ideaList"),
    rowSelector: ".idea-row",
    handleSelector: ".idea-row__handle",
    draggingClass: "idea-row--dragging",
    apiUrl: "/api/ideas?reorder=1",
    onError: function (e) { toast(e.message, true); loadIdeas(); },
  });

  function addCategoryRow(cat) {
    var row = document.createElement("div");
    row.className = "category-row";
    if (cat && cat.id) row.dataset.id = cat.id;
    var hoursVal = cat && cat.weekly_hours != null ? Number(cat.weekly_hours) : "";
    var track = cat ? (cat.track || guessTrack(cat.name)) : "";
    row.innerHTML =
      '<input name="cat_name" placeholder="' + T("Category (e.g. Deep work)", "تصنيف (مثلاً: شغل بتركيز)") + '" value="' + esc(cat ? cat.name : "") + '" required />' +
      '<input name="cat_hours" type="number" min="0.5" step="0.5" placeholder="' + T("h/week (optional)", "ساعة/أسبوع (اختياري)") + '" value="' + hoursVal + '" />' +
      // which of the plan's four tracks it belongs to: its goals' due dates come from that track's stretch
      '<select name="cat_track" title="' + T("Track in the plan", "المسار في الخطة") + '" aria-label="' + T("Track in the plan", "المسار في الخطة") + '">' +
        '<option value="">' + T("— track —", "— المسار —") + '</option>' +
        TRACK_KEYS.map(function (k) { return '<option value="' + k + '"' + (track === k ? ' selected' : '') + '>' + TRACK_NAME[k] + '</option>'; }).join("") +
      '</select>' +
      '<button type="button" class="iconbtn category-row__remove" title="' + T("Remove category", "شيل التصنيف") + '">✕</button>';
    // a fresh row guesses its track as the name is typed, until a track is picked by hand
    row.querySelector("[name=cat_name]").addEventListener("input", function () {
      var sel = row.querySelector("[name=cat_track]");
      if (!sel.dataset.touched) sel.value = guessTrack(this.value);
    });
    row.querySelector("[name=cat_track]").addEventListener("change", function () { this.dataset.touched = "1"; });
    row.querySelector(".category-row__remove").addEventListener("click", function () { row.remove(); });
    $("#categoryRows").appendChild(row);
    syncCopyFrom();
  }

  /* With a cycle to copy from, the categories come with it, so an empty row
     here must not stand in the way of saving. */
  function syncCopyFrom() {
    var copying = !!($("#quarterCopyFrom") || {}).value;
    $("#categoryRows").querySelectorAll("[name=cat_name]").forEach(function (i) { i.required = !copying; });
    $("#categoryRowsNote").hidden = !copying;
  }

  /* How long it runs, counted from the first day (owner, 2026-10-16: "make it
     21 days starts from 22 oct"). 21 days from the 22nd ends on the 11th —
     the first day counts as one. */
  function syncLengthPicks() {
    var form = $("#quarterForm");
    var from = form.elements.start_date.value, to = form.elements.end_date.value;
    var days = from && to && to >= from ? Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1 : 0;
    $("#quarterLength").querySelectorAll(".go-pick").forEach(function (b) {
      b.setAttribute("aria-pressed", String(Number(b.dataset.days) === days));
    });
  }

  $("#quarterLength").addEventListener("click", function (ev) {
    var btn = ev.target.closest(".go-pick");
    if (!btn) return;
    var form = $("#quarterForm");
    if (!form.elements.start_date.value) form.elements.start_date.value = todayISO();
    form.elements.end_date.value = addDays(form.elements.start_date.value, Number(btn.dataset.days) - 1);
    syncLengthPicks(); syncDaysOff();
  });
  ["start_date", "end_date"].forEach(function (n) {
    $("#quarterForm").elements[n].addEventListener("input", function () { syncLengthPicks(); syncDaysOff(); });
  });

  /* A new cycle can be born as a copy of an earlier one — its categories and
     their goals (owner, 2026-10-16: "duplicate same goals exactly of cycle 7
     part 1"). Editing an existing cycle hides this; it is only about birth. */
  function fillCopyFrom() {
    var select = $("#quarterCopyFrom");
    var keep = select.value;
    select.innerHTML = '<option value="">' + T("Nothing — start empty", "ولا حاجة — ابدأ فاضي") + '</option>' +
      (state.quarters || []).map(function (q) {
        return '<option value="' + q.id + '">' + esc(q.name) + " · " + fmtDate(q.start_date) + " – " + fmtDate(q.end_date) + "</option>";
      }).join("");
    select.value = keep;
    syncCopyFrom();
  }

  $("#quarterCopyFrom").addEventListener("change", syncCopyFrom);

  /* Days off per quarter: 7 day buttons (Sat first, the week as it's lived here), and a live
     count — total days, working days, days off — for the dates in the form. */
  var DAY_ORDER = [6, 0, 1, 2, 3, 4, 5];
  var DAY_N = function (d) { return [T("Sun", "الأحد"), T("Mon", "الاتنين"), T("Tue", "التلات"), T("Wed", "الأربع"), T("Thu", "الخميس"), T("Fri", "الجمعة"), T("Sat", "السبت")][d]; };
  function setDaysOff(list) {
    state.quarterWeekend = (list || []).slice();
    $("#quarterWeekend").innerHTML = DAY_ORDER.map(function (d) {
      return '<button type="button" class="go-pick q-off__day" data-wd="' + d + '" aria-pressed="' + (state.quarterWeekend.indexOf(d) >= 0) + '">' + DAY_N(d) + "</button>";
    }).join("");
    syncDaysOff();
  }
  function syncDaysOff() {
    var form = $("#quarterForm"), from = form.elements.start_date.value, to = form.elements.end_date.value, out = $("#quarterDaysInfo");
    if (!from || !to || to < from) { out.textContent = T("Pick the start and end dates to see the days.", "اختار البداية والنهاية عشان تشوف عدد الأيام."); return; }
    var total = 0, work = 0, d = new Date(from + "T00:00:00Z"), end = new Date(to + "T00:00:00Z");
    for (; d <= end; d.setUTCDate(d.getUTCDate() + 1)) { total++; if (state.quarterWeekend.indexOf(d.getUTCDay()) < 0) work++; }
    out.innerHTML = '<b>' + T(total + " days total", I18N.N(total, "", "", ["يوم", "يومين", "أيام", "يوم"]) + " إجمالي") + '</b> · <b class="q-off__work">' +
      T(work + " working days", I18N.N(work, "", "", ["يوم شغل", "يومين شغل", "أيام شغل", "يوم شغل"])) + '</b> · ' +
      T((total - work) + " days off", I18N.N(total - work, "", "", ["يوم إجازة", "يومين إجازة", "أيام إجازة", "يوم إجازة"])) +
      (state.quarterWeekend.length ? " (" + DAY_ORDER.filter(function (x) { return state.quarterWeekend.indexOf(x) >= 0; }).map(DAY_N).join(T(", ", "، ")) + ")" : "");
  }
  $("#quarterWeekend").addEventListener("click", function (ev) {
    var b = ev.target.closest("[data-wd]"); if (!b) return;
    var d = Number(b.dataset.wd), i = state.quarterWeekend.indexOf(d);
    if (i >= 0) state.quarterWeekend.splice(i, 1); else state.quarterWeekend.push(d);
    if (state.quarterWeekend.length > 6) state.quarterWeekend.splice(state.quarterWeekend.indexOf(d), 1); // at least one working day
    b.setAttribute("aria-pressed", String(state.quarterWeekend.indexOf(d) >= 0));
    syncDaysOff();
  });
  state.quarterWeekend = [];
  setDaysOff(planRhythm(0).weekend);

  function resetQuarterForm() {
    var form = $("#quarterForm");
    form.reset();
    $("#categoryRows").innerHTML = "";
    addCategoryRow();
    state.editingQuarterId = null;
    $("#btnQuarterSubmit").textContent = T("Save quarter", "حفظ ربع السنة");
    $("#btnCancelQuarterEdit").hidden = true;
    $("#quarterCopyFromBox").hidden = false;
    $("#quarterCopyFrom").value = "";
    $("#quarterCopyProgress").checked = false;
    fillCopyFrom();
    syncCopyFrom();
    syncLengthPicks();
    setDaysOff(planRhythm(0).weekend); // a new quarter starts with the plan's weekend
  }

  $("#btnCancelQuarterEdit").addEventListener("click", function () {
    resetQuarterForm();
    $("#addQuarterBox").open = false;
  });

  $("#btnEditQuarter").addEventListener("click", function () {
    if (!state.quarterDetail) return;
    var q = state.quarterDetail.quarter;
    showQuarterGallery(); // the create/edit form lives in the gallery view
    var form = $("#quarterForm");
    form.elements.name.value = q.name;
    form.elements.start_date.value = String(q.start_date).slice(0, 10);
    form.elements.end_date.value = String(q.end_date).slice(0, 10);
    form.elements.anti_perfectionist.checked = !!q.anti_perfectionist;
    form.elements.plan_phase.value = q.plan_phase ? String(q.plan_phase) : "";
    setDaysOff(planRhythm(q.plan_phase, q.weekend).weekend);
    $("#categoryRows").innerHTML = "";
    (state.quarterDetail.categories || []).forEach(function (c) { addCategoryRow(c); });
    if (!state.quarterDetail.categories.length) addCategoryRow();
    state.editingQuarterId = q.id;
    $("#quarterCopyFromBox").hidden = true;
    $("#quarterCopyFrom").value = "";
    syncCopyFrom();
    syncLengthPicks();
    $("#btnQuarterSubmit").textContent = T("Update quarter", "تحديث ربع السنة");
    $("#btnCancelQuarterEdit").hidden = false;
    $("#addQuarterBox").open = true;
    form.scrollIntoView({ behavior: "smooth", block: "center" });
  });

  $("#btnDeleteQuarter").addEventListener("click", function () {
    if (!state.quarterDetail) return;
    var q = state.quarterDetail.quarter;
    if (!confirm(T('Delete quarter "' + q.name + '"? Its categories will be removed (logged tasks are kept, just uncategorized).', 'تمسح ربع السنة "' + q.name + '"؟ تصنيفاته هتتشال (المهام المسجلة هتفضل، بس من غير تصنيف).'))) return;
    api("/api/quarters?id=" + q.id, { method: "DELETE" })
      .then(function () { playDeleteSound(); toast(T("Quarter deleted", "ربع السنة اتمسح")); remember("quarter-id", null); return loadQuarters(); })
      .then(function () { showQuarterGallery(); return loadDay(state.currentDate); })
      .catch(function (e) { toast(e.message, true); });
  });

  /* ---------------- copy categories (with goals) to another quarter ---------------- */

  function copyTargetDefault(current, others) {
    var saved = Number(recall("copy-target"));
    var pick = others.filter(function (q) { return q.id === saved; })[0];
    if (pick) return pick.id;
    // otherwise the quarter that comes right after this one — the usual case is
    // carrying this quarter's plan into the next — else the newest other one
    var start = String(current.start_date).slice(0, 10);
    var later = others.filter(function (q) { return String(q.start_date).slice(0, 10) > start; })
      .sort(function (a, b) { return String(a.start_date) < String(b.start_date) ? -1 : 1; });
    return (later[0] || others[0]).id;
  }

  function syncCopyToggle() {
    var boxes = $("#copyCategoryList").querySelectorAll("input");
    var checked = $("#copyCategoryList").querySelectorAll("input:checked").length;
    $("#copyToggleAll").textContent = checked === boxes.length ? T("Select none", "شيل التحديد") : T("Select all", "حدد الكل");
    $("#btnCopySubmit").disabled = !checked;
    $("#btnCopySubmit").textContent = checked ? T("Copy ", "نسخ ") + I18N.N(checked, "category", "categories", ["تصنيف", "تصنيفين", "تصنيفات", "تصنيف"]) : T("Copy", "نسخ");
  }

  function openCopyDialog(onlyIds) {
    var data = state.quarterDetail;
    if (!data || !data.categories.length) return;
    var others = (state.quarters || []).filter(function (q) { return q.id !== data.quarter.id; });
    if (!others.length) { toast(T("Create another quarter first, then copy into it.", "اعمل ربع سنة تاني الأول، وبعدين انسخ فيه.")); return; }

    var select = $("#copyTarget");
    select.innerHTML = others.map(function (q) {
      return '<option value="' + q.id + '">' + esc(q.name) + " · " + fmtDate(q.start_date) + " – " + fmtDate(q.end_date) + "</option>";
    }).join("");
    select.value = String(copyTargetDefault(data.quarter, others));

    $("#copyCategoryList").innerHTML = data.categories.map(function (c) {
      var n = (c.goals || []).length;
      var on = !onlyIds || onlyIds.indexOf(c.id) !== -1;
      return '<label class="copy-dialog__item">' +
        '<input type="checkbox" value="' + c.id + '"' + (on ? " checked" : "") + ' />' +
        '<span class="copy-dialog__name">' + esc(c.name) + '</span>' +
        '<span class="muted">' + (n ? I18N.N(n, "goal", "goals", ["هدف", "هدفين", "أهداف", "هدف"]) : T("no goals", "مفيش أهداف")) + '</span>' +
      '</label>';
    }).join("");
    $("#copyForm").elements.keep_progress.checked = false;
    syncCopyToggle();
    $("#copyDialog").showModal();
  }

  $("#btnCopyCategories").addEventListener("click", function () { openCopyDialog(null); });
  $("#copyCategoryList").addEventListener("change", syncCopyToggle);
  $("#copyToggleAll").addEventListener("click", function () {
    var boxes = $("#copyCategoryList").querySelectorAll("input");
    var all = $("#copyCategoryList").querySelectorAll("input:checked").length === boxes.length;
    boxes.forEach(function (b) { b.checked = !all; });
    syncCopyToggle();
  });
  $("#btnCopyCancel").addEventListener("click", function () { $("#copyDialog").close(); });
  // a click on the backdrop (outside the form) closes it too
  $("#copyDialog").addEventListener("click", function (ev) { if (ev.target === this) this.close(); });

  $("#copyForm").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var ids = Array.prototype.map.call($("#copyCategoryList").querySelectorAll("input:checked"), function (b) { return Number(b.value); });
    if (!ids.length) return;
    var toId = Number($("#copyTarget").value);
    var target = (state.quarters || []).filter(function (q) { return q.id === toId; })[0];
    var btn = $("#btnCopySubmit");
    busy(btn, true);
    api("/api/quarters?copy_categories=1", {
      method: "POST",
      body: { to_quarter_id: toId, category_ids: ids, keep_progress: this.elements.keep_progress.checked, log_date: todayISO() },
    }).then(function (r) {
      remember("copy-target", toId);
      $("#copyDialog").close();
      playAddSound();
      var parts = [];
      if (r.categories_added) parts.push(I18N.N(r.categories_added, "category", "categories", ["تصنيف", "تصنيفين", "تصنيفات", "تصنيف"]));
      if (r.goals_added) parts.push(I18N.N(r.goals_added, "goal", "goals", ["هدف", "هدفين", "أهداف", "هدف"]));
      var msg = parts.length ? T("Copied ", "اتنسخ ") + parts.join(T(" and ", " و")) : T("Nothing new to copy", "مفيش جديد يتنسخ");
      if (r.categories_merged) msg += T(" — " + r.categories_merged + " already there, merged", " — " + r.categories_merged + " كانوا موجودين واتدمجوا");
      toast(msg + (target ? T(" into ", " في ") + target.name : ""));
      return loadDay(state.currentDate); // the task form's category list may now include them
    }).catch(function (e) { toast(e.message, true); })
      .then(function () { busy(btn, false); syncCopyToggle(); });
  });

  $("#quarterForm").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var form = this;
    var btn = $("#btnQuarterSubmit");
    var b = formData(form);
    var categories = Array.prototype.slice.call($("#categoryRows").children).map(function (row) {
      var hoursVal = row.querySelector("[name=cat_hours]").value;
      return {
        id: row.dataset.id ? Number(row.dataset.id) : undefined,
        name: row.querySelector("[name=cat_name]").value.trim(),
        weekly_hours: hoursVal ? Number(hoursVal) : null,
        track: row.querySelector("[name=cat_track]").value || null,
      };
    }).filter(function (c) { return c.name; });
    var body = {
      name: b.name, start_date: b.start_date, end_date: b.end_date,
      anti_perfectionist: form.elements.anti_perfectionist.checked,
      plan_phase: form.elements.plan_phase.value ? Number(form.elements.plan_phase.value) : null,
      weekend: (state.quarterWeekend || []).slice().sort(),
      categories: categories,
    };

    busy(btn, true);
    var editingId = state.editingQuarterId;
    var copyFrom = editingId ? 0 : Number($("#quarterCopyFrom").value) || 0;
    var keepProgress = $("#quarterCopyProgress").checked;
    (editingId ? api("/api/quarters?id=" + editingId, { method: "PATCH", body: body })
               : api("/api/quarters", { method: "POST", body: body }))
      // born as a copy: the older cycle's categories and goals, carried over whole
      .then(function (r) {
        var newId = r.quarter && r.quarter.id;
        if (!copyFrom || !newId) return { r: r, copied: "" };
        return api("/api/quarters?id=" + copyFrom).then(function (src) {
          var ids = (src.categories || []).map(function (c) { return c.id; });
          if (!ids.length) return { r: r, copied: T(" — that cycle had nothing to copy", " — الدورة دي ماكانش فيها حاجة تتنسخ") };
          return api("/api/quarters?copy_categories=1", {
            method: "POST",
            body: { to_quarter_id: newId, category_ids: ids, keep_progress: keepProgress, log_date: todayISO() },
          }).then(function (c) {
            return { r: r, copied: T(" with ", " ومعاه ") + I18N.N(c.categories_added, "category", "categories", ["تصنيف", "تصنيفين", "تصنيفات", "تصنيف"]) +
              (c.goals_added ? T(" and ", " و") + I18N.N(c.goals_added, "goal", "goals", ["هدف", "هدفين", "أهداف", "هدف"]) : "") +
              T(" from ", " من ") + src.quarter.name };
          });
        });
      })
      .then(function (done) {
        var r = done.r;
        toast(editingId ? T("Quarter updated ✓", "ربع السنة اتحدّث ✓") : T("Quarter created" + done.copied + " ✓", "ربع السنة اتعمل" + done.copied + " ✓"));
        if (!editingId) playAddSound();
        resetQuarterForm();
        $("#addQuarterBox").open = false;
        return loadQuarters().then(function () {
          var newId = editingId || (r.quarter && r.quarter.id);
          if (newId) {
            state.selectedQuarterId = newId;
            return loadQuarterDetail(newId).then(function () { showQuarterDetailView(); });
          }
        });
      })
      .catch(function (e) { toast(e.message, true); })
      .finally(function () { busy(btn, false); });
  });

  addCategoryRow(); // one empty row to start with

  /* ---------------- days: a photo gallery, one tile per day in the selected quarter ---------------- */

  // resize + JPEG-compress client-side before ever sending an image to the API
  function resizeImageFile(file, maxDim, quality) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function (e) {
        var img = new Image();
        img.onload = function () {
          var scale = Math.min(1, maxDim / Math.max(img.width, img.height));
          var cw = Math.max(1, Math.round(img.width * scale));
          var ch = Math.max(1, Math.round(img.height * scale));
          var canvas = document.createElement("canvas");
          canvas.width = cw; canvas.height = ch;
          canvas.getContext("2d").drawImage(img, 0, 0, cw, ch);
          resolve(canvas.toDataURL("image/jpeg", quality));
        };
        img.onerror = function () { reject(new Error(T("Could not read that image", "مقدرناش نقرا الصورة دي"))); };
        img.src = e.target.result;
      };
      reader.onerror = function () { reject(new Error(T("Could not read that file", "مقدرناش نقرا الملف ده"))); };
      reader.readAsDataURL(file);
    });
  }

  // the whole tracked span: the earliest quarter's first day to the latest one's last
  function allQuartersSpan() {
    var qs = state.quarters || [];
    return {
      from: qs.reduce(function (m, q) { var d = String(q.start_date).slice(0, 10); return d < m ? d : m; }, "9999-12-31"),
      to: qs.reduce(function (m, q) { var d = String(q.end_date).slice(0, 10); return d > m ? d : m; }, "0000-01-01"),
    };
  }

  // Goals across every quarter, each quarter's goals kept inside their own
  // quarter. Summing them all together would have Q3's targets weighing on a
  // day in Q2, when those goals didn't exist yet.
  function goalsSeriesAllQuarters(log) {
    var byQuarter = {};
    (log || []).forEach(function (r) { (byQuarter[r.quarter_id] = byQuarter[r.quarter_id] || []).push(r); });
    var values = {}, estimated = {};
    (state.quarters || []).forEach(function (q) {
      var rows = byQuarter[q.id];
      if (!rows) return;
      var series = goalsSeries(rows, String(q.start_date).slice(0, 10), String(q.end_date).slice(0, 10));
      Object.keys(series.values).forEach(function (d) { values[d] = series.values[d]; });
      Object.keys(series.estimated).forEach(function (d) { estimated[d] = true; });
    });
    return { values: values, estimated: estimated };
  }

  function loadDaysGallery(opts) {
    var quarters = state.quarters || [];
    var all = state.daysScope === "all" && quarters.length > 0;
    var quarter = state.quarterDetail && state.quarterDetail.quarter;
    if (!all && !quarter) {
      $("#dayGallery").innerHTML = "";
      $("#noDaysQuarter").hidden = false;
      $("#daysQuarterLabel").textContent = "";
      $("#daysQuarterPicker").hidden = true;
      $("#daysAvgValue").textContent = "0%";
      $("#daysAvgSub").textContent = T("0 days tracked", "مفيش أيام متسجلة");
      $("#daysGoalsValue").textContent = "—";
      state.daysData = null;
      $("#focusRange").hidden = true;
      return Promise.resolve();
    }
    $("#noDaysQuarter").hidden = true;
    var picker = $("#daysQuarterPicker");
    picker.innerHTML = (quarters.length > 1 ? '<option value="all">' + T("All quarters", "كل الأرباع") + '</option>' : "") +
      quarters.map(function (q) { return '<option value="' + q.id + '">' + esc(q.name) + "</option>"; }).join("");
    picker.value = all ? "all" : String(quarter.id);
    renderCycleChips(quarters, picker.value);

    var span = all ? allQuartersSpan() : { from: String(quarter.start_date).slice(0, 10), to: String(quarter.end_date).slice(0, 10) };
    var from = span.from, to = span.to;
    $("#daysQuarterLabel").textContent = (all ? plural(quarters.length, "quarter") + " · " : quarters.length < 2 ? quarter.name + " · " : "") +
      fmtDate(from) + " – " + fmtDate(to);

    return Promise.all([
      api("/api/tasks?stats=1&from=" + from + "&to=" + to),
      api("/api/day-photos?from=" + from + "&to=" + to),
      api(all ? "/api/goals?history=1&all=1" : "/api/goals?history=1&quarter_id=" + quarter.id),
      all ? api("/api/goals?by_quarter=1") : Promise.resolve(null),
    ]).then(function (results) {
      opts = opts || {};
      var log = results[2].log || [];
      var series = all ? goalsSeriesAllQuarters(log) : goalsSeries(log, from, to);
      opts.goalsByDate = series.values;
      opts.goalsEstimatedByDate = series.estimated;
      opts.all = all;
      opts.goalsByQuarter = results[3] ? results[3].goals || [] : null;
      renderDaysGallery(from, to, results[0].stats, results[1].photos, opts);
    }).catch(function (e) { toast(e.message, true); });
  }

  /* The quarters as a row of cards: name, dates, and "Now" on the running one.
     A tap writes into the hidden select, whose change handler does the rest. */
  function renderCycleChips(quarters, current) {
    var box = $("#daysQuarterChips");
    box.hidden = quarters.length < 2; // nothing to switch to
    if (box.hidden) { box.innerHTML = ""; return; }
    var today = todayISO();
    var chip = function (value, title, sub, glyph, now) {
      var on = String(value) === String(current);
      return '<button type="button" class="cycle-pick' + (on ? " is-on" : "") + (now ? " is-now" : "") + '" data-value="' + esc(value) + '" aria-pressed="' + on + '">' +
        '<span class="cycle-pick__glyph" aria-hidden="true">' + glyph + "</span>" +
        '<span class="cycle-pick__text"><b>' + esc(title) + "</b><small>" + esc(sub) + "</small></span>" +
        (now ? '<span class="cycle-pick__now">' + T("Now", "دلوقتي") + '</span>' : "") + "</button>";
    };
    var span = allQuartersSpan();
    box.innerHTML = chip("all", T("All quarters", "كل الأرباع"), plural(quarters.length, "quarter") + " · " + fmtDate(span.from) + " – " + fmtDate(span.to), "🗂", false) +
      quarters.map(function (q) {
        var from = String(q.start_date).slice(0, 10), to = String(q.end_date).slice(0, 10);
        var now = from <= today && today <= to;
        var done = to < today;
        return chip(q.id, q.name, fmtDate(from) + " – " + fmtDate(to), now ? "🚀" : done ? "🏁" : "🗓", now);
      }).join("");
    var on = box.querySelector(".is-on");
    if (on) setTimeout(function () { on.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" }); }, 50);
  }

  $("#daysQuarterChips").addEventListener("click", function (ev) {
    var b = ev.target.closest(".cycle-pick");
    if (!b || b.classList.contains("is-on")) return;
    var picker = $("#daysQuarterPicker");
    picker.value = b.getAttribute("data-value");
    this.querySelectorAll(".cycle-pick").forEach(function (x) {
      x.classList.toggle("is-on", x === b);
      x.setAttribute("aria-pressed", String(x === b));
    });
    picker.dispatchEvent(new Event("change"));
  });

  $("#daysQuarterPicker").addEventListener("change", function () {
    if (this.value === "all") {
      state.daysScope = "all";
      remember("days-scope", "all");
      loadDaysGallery();
      return;
    }
    var id = Number(this.value);
    if (!id) return;
    var wasAll = state.daysScope === "all";
    state.daysScope = null;
    remember("days-scope", null);
    if (id === state.selectedQuarterId) { if (wasAll) loadDaysGallery(); return; }
    state.selectedQuarterId = id;
    remember("quarter-id", String(id));
    loadQuarterDetail(id)
      .then(function () { return loadDaysGallery(); })
      .catch(function (e) { toast(e.message, true); });
  });

  /* Goals reached on each day of a quarter, from the goal log.

     Each goal holds its last logged value until it changes (a goal set to 40
     on Monday is still 40 on Wednesday if nobody touched it). A day's figure is
     the same target-weighted sum the quarter's goals bar uses, over the goals
     known by then. Days before the first reading have no value — the line
     starts where the record does, it isn't extended backwards — and nothing is
     drawn past today, where there is nothing to carry forward into yet. */
  function goalsSeries(log, from, to) {
    var today = todayISO();
    var latest = {}, byDate = {}, estimated = {}, i = 0;
    for (var d = from; d <= to && d <= today; d = addDays(d, 1)) {
      while (i < log.length && String(log[i].day).slice(0, 10) <= d) {
        latest[log[i].goal_id] = log[i];
        i++;
      }
      var ids = Object.keys(latest);
      if (!ids.length) continue;
      var cur = 0, tgt = 0, est = false;
      ids.forEach(function (id) {
        cur += Number(latest[id].current) || 0;
        tgt += Number(latest[id].target) || 0;
        if (latest[id].estimated) est = true;
      });
      byDate[d] = tgt > 0 ? Math.min(100, Math.round((cur / tgt) * 100)) : 0;
      // a day resting on even one backfilled reading is an estimate, not a record
      if (est) estimated[d] = true;
    }
    return { values: byDate, estimated: estimated };
  }

  function renderDaysGallery(from, to, stats, photos, opts) {
    opts = opts || {};
    var statsByDate = {};
    (stats || []).forEach(function (s) { statsByDate[s.date] = s; });
    var photosByDate = {};
    (photos || []).forEach(function (p) { photosByDate[p.task_date] = p.photo_data; });
    var estimatedByDate = {};
    (stats || []).forEach(function (s) { if (s.estimated) estimatedByDate[String(s.date).slice(0, 10)] = true; });

    // one walk of the whole quarter, for the chart and the quarter average. The
    // focus range only ever narrows what's drawn from this — it never re-fetches.
    var sumPct = 0, countedDays = 0, totalDays = 0, chartDays = [];
    var walk = from;
    while (walk <= to) {
      totalDays++;
      var st = statsByDate[walk];
      var p = st && st.total ? Math.round((st.done / st.total) * 100) : null;
      if (p != null) { sumPct += p; countedDays++; }
      chartDays.push({ date: walk, pct: p || 0, done: st ? st.done : 0, total: st ? st.total : 0 });
      walk = addDays(walk, 1);
    }

    var avg = countedDays ? Math.round(sumPct / countedDays) : 0;
    $("#daysAvgValue").textContent = avg + "%";
    $("#daysAvgSub").textContent = T(countedDays + " of " + totalDays + " days tracked", countedDays + " من " + totalDays + " يوم متسجلين");

    var quarter = state.quarterDetail && state.quarterDetail.quarter;
    state.daysData = {
      quarterId: opts.all ? "all" : quarter ? quarter.id : null,
      from: from, to: to, days: chartDays, avg: avg,
      statsByDate: statsByDate, photosByDate: photosByDate, estimatedByDate: estimatedByDate,
      goalsByDate: opts.goalsByDate || {},
      goalsEstimatedByDate: opts.goalsEstimatedByDate || {},
    };

    if (opts.all) {
      // across quarters, each quarter's own goals figure counts once — one
      // quarter with far more goals shouldn't speak for all the others
      var byQuarter = {};
      (opts.goalsByQuarter || []).forEach(function (g) { (byQuarter[g.quarter_id] = byQuarter[g.quarter_id] || []).push(g); });
      var pcts = Object.keys(byQuarter).map(function (id) { return combinedGoalsPct(byQuarter[id]); })
        .filter(function (v) { return v != null; });
      var mean = pcts.length ? Math.round(pcts.reduce(function (a2, b) { return a2 + b; }, 0) / pcts.length) : null;
      $("#daysGoalsValue").textContent = mean == null ? "—" : mean + "%";
      $("#daysGoalsSub").textContent = mean == null
        ? T("no goals yet", "مفيش أهداف لسه")
        : T("averaged over ", "المتوسط على ") + plural(pcts.length, "quarter");
    } else {
      // the goals tile reads the live goals, not the log, so it always matches the
      // bar inside the quarter even on a day the log hasn't caught up with
      var allGoals = (state.quarterDetail && state.quarterDetail.categories || [])
        .reduce(function (acc, c) { return acc.concat(c.goals || []); }, []);
      var goalsNow = combinedGoalsPct(allGoals);
      $("#daysGoalsValue").textContent = goalsNow == null ? "—" : goalsNow + "%";
      $("#daysGoalsSub").textContent = goalsNow == null
        ? T("no goals in this quarter", "مفيش أهداف في الربع ده")
        : T("of ", "من ") + plural(allGoals.length, "goal") + T(", target-weighted", "، بوزن المستهدف");
    }
    renderDaysFocus({ animateChart: opts.animate !== false, animateTiles: opts.animate !== false });
  }

  // The photo grid for one date range — the focus filter decides which range, so
  // picking a week narrows the photos to that week too, not just the graph.
  // In "All quarters" the grid is broken into one run of weeks per quarter,
  // each under its own heading — a year of tiles in one unbroken run is
  // impossible to place. Days that fall between two quarters get a run of
  // their own, and only if anything was logged or photographed in them.
  function daySegments(from, to) {
    var data = state.daysData;
    if (!data || data.quarterId !== "all") return [{ label: null, from: from, to: to }];
    var hasData = function (a, b) {
      for (var d = a; d <= b; d = addDays(d, 1)) {
        var st = data.statsByDate[d];
        if ((st && st.total) || data.photosByDate[d]) return true;
      }
      return false;
    };
    var qs = (state.quarters || []).slice().sort(function (x, y) {
      return String(x.start_date) < String(y.start_date) ? -1 : 1;
    });
    var segs = [], cursor = from;
    qs.forEach(function (q) {
      var qf = String(q.start_date).slice(0, 10), qt = String(q.end_date).slice(0, 10);
      if (qf < cursor) qf = cursor;
      if (qt > to) qt = to;
      if (qt < qf) return;
      if (qf > cursor && hasData(cursor, addDays(qf, -1))) {
        segs.push({ label: T("Between quarters", "بين الأرباع"), from: cursor, to: addDays(qf, -1) });
      }
      segs.push({ label: q.name + " · " + fmtDate(qf) + " – " + fmtDate(qt), from: qf, to: qt });
      cursor = addDays(qt, 1);
    });
    if (cursor <= to && hasData(cursor, to)) segs.push({ label: T("Between quarters", "بين الأرباع"), from: cursor, to: to });
    return segs.length ? segs : [{ label: null, from: from, to: to }];
  }

  function renderDayTiles(from, to, animate) {
    var box = $("#dayGallery");
    box.innerHTML = "";
    daySegments(from, to).forEach(function (seg) {
      if (seg.label) {
        var head = document.createElement("div");
        head.className = "day-gallery__head";
        head.textContent = seg.label;
        box.appendChild(head);
      }
      renderTileRun(box, seg.from, seg.to, animate);
    });
  }

  /* A day with no picture, drawn rather than left as a camera emoji (owner,
     2026-10-16). It says which kind of empty it is: today is an invitation,
     a day already gone is plainly empty, and a day still to come is quiet.
     The mark is the summit from the logo, so an empty day still looks ours. */
  var SUMMIT = '<svg class="day-empty__mark" viewBox="0 0 48 36" aria-hidden="true">' +
    '<path class="day-empty__range" d="M3 31 L17 11 L26 23 L33 15 L45 31" />' +
    '<circle class="day-empty__sun" cx="37" cy="7" r="3.2" /></svg>';

  function emptyPhotoHtml(day, today) {
    var when = day === today ? "today" : day < today ? "past" : "future";
    var word = when === "today" ? T("Add photo", "ضيف صورة") : when === "past" ? T("No photo", "مفيش صورة") : T("Not yet", "لسه");
    return '<span class="day-empty day-empty--' + when + '">' + SUMMIT +
      '<span class="day-empty__word">' + word + "</span>" +
      (when === "future" ? "" : '<span class="day-empty__add">' + T("+ Add a photo", "+ ضيف صورة") + '</span>') + "</span>";
  }

  /* Adding or removing a day's picture builds the whole gallery again, which
     empties the page for a moment: the browser then pulls the scroll to the
     top, and on a phone you lose your place (owner, 2026-10-16). This holds on
     to where that day sits on the screen and puts it back afterwards. */
  function keepDayPlace(date) {
    var el = document.querySelector('[data-day="' + date + '"]');
    if (!el) return function () {};
    var was = el.getBoundingClientRect().top;
    return function () {
      var again = function () {
        var now = document.querySelector('[data-day="' + date + '"]');
        if (!now) return;
        var move = now.getBoundingClientRect().top - was;
        if (Math.abs(move) > 1) window.scrollTo(0, Math.max(0, window.scrollY + move));
      };
      // a phone scrolls the file input back into view after its picker closes,
      // and the picture lands a frame later again: hold the place through both
      again();
      requestAnimationFrame(again);
      setTimeout(again, 120);
      setTimeout(again, 400);
    };
  }

  function renderTileRun(box, from, to, animate) {
    var statsByDate = state.daysData.statsByDate;
    var photosByDate = state.daysData.photosByDate;
    var estimatedByDate = state.daysData.estimatedByDate || {};
    var today = todayISO();

    // weeks start Saturday: pad the grid with blank cells so day `from`
    // lands in its real weekday column and every row is one calendar week
    var leadingBlanks = (new Date(from + "T00:00:00Z").getUTCDay() + 1) % 7;
    for (var i = 0; i < leadingBlanks; i++) {
      var blank = document.createElement("div");
      blank.className = "day-tile day-tile--placeholder";
      box.appendChild(blank);
    }

    var d = from;
    while (d <= to) {
      var s = statsByDate[d];
      var pct = s && s.total ? Math.round((s.done / s.total) * 100) : null;
      var photo = photosByDate[d];

      var estimated = !!estimatedByDate[d];
      var tile = document.createElement("div");
      tile.className = "day-tile" + (d === today ? " day-tile--today" : "") +
        (estimated ? " day-tile--estimated" : "") + (animate ? " day-tile--enter" : "");
      tile.setAttribute("data-day", d);
      if (estimated) {
        // written in afterwards rather than ticked off on the day itself
        var mark = document.createElement("span");
        mark.className = "day-tile__estimated";
        mark.textContent = T("estimated", "تقديري");
        mark.title = T("These tasks were written in afterwards, not tracked on the day", "المهام دي اتكتبت بعدين، مش متسجلة في نفس اليوم");
        tile.appendChild(mark);
      }

      var photoLabel = document.createElement("div");
      photoLabel.className = "day-tile__photo";
      if (photo) photoLabel.style.backgroundImage = "url(" + photo + ")";
      else photoLabel.innerHTML = emptyPhotoHtml(d, today);
      var fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.accept = "image/*";
      photoLabel.appendChild(fileInput);
      tile.appendChild(photoLabel);

      photoLabel.addEventListener("click", function (dd, ph, input) {
        return function () { openDayPhotoMenu(dd, ph, input); };
      }(d, photo, fileInput));

      var bar = document.createElement("div");
      bar.className = "day-tile__bar";
      bar.innerHTML = '<div class="day-tile__fill' + (pct != null && pct >= 100 ? " day-tile__fill--done" : "") +
        '" style="width:' + (pct || 0) + '%"></div>';
      tile.appendChild(bar);

      var meta = document.createElement("div");
      meta.className = "day-tile__meta";
      meta.title = T("Open " + fmtDate(d) + "'s to-do list", "افتح مهام " + fmtDate(d));
      meta.innerHTML = "<span>" + fmtDayMonth(d) + "</span><b>" + (pct == null ? "—" : pct + "%") + "</b>";
      meta.addEventListener("click", function (dd) { return function () { openDayDetail(dd); }; }(d));
      tile.appendChild(meta);

      if (photo) {
        var removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "day-tile__remove";
        removeBtn.title = T("Remove photo", "امسح الصورة");
        removeBtn.textContent = "✕";
        tile.appendChild(removeBtn);
        removeBtn.addEventListener("click", function (dd) {
          return function (ev) {
            ev.preventDefault();
            if (!confirm(T("Remove this day's photo?", "تمسح صورة اليوم ده؟"))) return;
            var hold = keepDayPlace(dd);
            api("/api/day-photos?date=" + dd, { method: "DELETE" })
              .then(function () { playDeleteSound(); return loadDaysGallery({ animate: false }); })
              .then(hold)
              .catch(function (e) { toast(e.message, true); });
          };
        }(d));
      }

      fileInput.addEventListener("change", function (dd) {
        return function () {
          var file = this.files[0];
          if (!file) return;
          var hold = keepDayPlace(dd);
          this.blur(); // a focused input is something a phone scrolls to
          Promise.all([resizeImageFile(file, 320, 0.72), resizeImageFile(file, 1800, 0.85)])
            .then(function (sizes) {
              return api("/api/day-photos", { method: "POST", body: { date: dd, photo_data: sizes[0], photo_full: sizes[1] } });
            })
            .then(function () { playAddSound(); toast(T("Photo saved ✓", "الصورة اتحفظت ✓")); return loadDaysGallery({ animate: false }); })
            .then(hold)
            .catch(function (e) { toast(e.message, true); });
        };
      }(d));

      box.appendChild(tile);
      d = addDays(d, 1);
    }
  }

  /* ---------------- days: focus one week (or any from–to range) of the quarter ----------------
     The chart above always shows the whole quarter and its average. This narrows the
     same already-loaded days down to a slice and reports that slice's own average —
     no extra request, and the quarter line stays on screen for comparison. */

  // weeks start Saturday here, same as the day-tile grid
  function weekStart(iso) {
    var dow = new Date(iso + "T00:00:00Z").getUTCDay(); // 0 = Sun … 6 = Sat
    return addDays(iso, -((dow + 1) % 7));
  }

  function clampToQuarter(iso) {
    var d = state.daysData;
    if (!d) return iso;
    if (iso < d.from) return d.from;
    if (iso > d.to) return d.to;
    return iso;
  }

  function focusPreset(key) {
    var d = state.daysData;
    if (!d) return null;
    if (key === "all") return { from: d.from, to: d.to };
    // anchor on today, or on the nearest end of the quarter if today is outside it
    var thisWeek = weekStart(clampToQuarter(todayISO()));
    var starts = { "this-week": thisWeek, "last-week": addDays(thisWeek, -7), "last-4-weeks": addDays(thisWeek, -21) };
    if (!starts[key]) return null;
    var end = key === "last-4-weeks" ? addDays(thisWeek, 6) : addDays(starts[key], 6);
    return { from: clampToQuarter(starts[key]), to: clampToQuarter(end) };
  }

  // light up a preset chip when the range happens to match it, however it was set
  function matchingPreset(from, to) {
    var keys = ["this-week", "last-week", "last-4-weeks", "all"];
    for (var i = 0; i < keys.length; i++) {
      var p = focusPreset(keys[i]);
      if (p && p.from === from && p.to === to) return keys[i];
    }
    return null;
  }

  // A preset is re-evaluated against today rather than restored as fixed dates —
  // "this week" should still mean this week when the page is opened next week.
  // A hand-picked range has no preset, so its exact dates come back instead.
  function savedFocus(quarterId) {
    var raw = recallJSON("days-focus", null);
    if (!raw || raw.quarterId !== quarterId) return null;
    if (raw.preset) {
      // a today-anchored preset stops meaning anything once the quarter no longer
      // contains today — fall through to the default rather than restore a stub
      var today = todayISO();
      if (raw.preset !== "all" && (today < state.daysData.from || today > state.daysData.to)) return null;
      var p = focusPreset(raw.preset);
      return p ? { quarterId: quarterId, from: p.from, to: p.to, preset: raw.preset } : null;
    }
    if (!raw.from || !raw.to) return null;
    return { quarterId: quarterId, from: raw.from, to: raw.to, preset: null };
  }

  function focusStats(from, to) {
    var days = (state.daysData && state.daysData.days) || [];
    var sum = 0, tracked = 0, spanned = 0, done = 0, planned = 0, best = null, worst = null;
    days.forEach(function (d) {
      if (d.date < from || d.date > to) return;
      spanned++;
      if (!d.total) return; // a day with no tasks isn't a 0% day, it's an untracked one
      tracked++;
      sum += d.pct;
      done += d.done;
      planned += d.total;
      if (!best || d.pct > best.pct) best = d;
      if (!worst || d.pct < worst.pct) worst = d;
    });
    return {
      avg: tracked ? Math.round(sum / tracked) : 0,
      tracked: tracked, spanned: spanned, done: done, planned: planned, best: best, worst: worst,
    };
  }

  var PLURAL_AR = {
    "day": ["يوم", "يومين", "أيام", "يوم"],
    "tracked day": ["يوم متسجل", "يومين متسجلين", "أيام متسجلة", "يوم متسجل"],
    "quarter": ["ربع سنة", "ربعين", "أرباع", "ربع"],
    "goal": ["هدف", "هدفين", "أهداف", "هدف"],
    "task": ["مهمة", "مهمتين", "مهام", "مهمة"]
  };
  function plural(n, word) { return I18N.N(n, word, word + "s", PLURAL_AR[word]); }

  function renderDaysFocus(opts) {
    opts = opts || {};
    var data = state.daysData;
    if (!data) { $("#focusRange").hidden = true; return; }
    $("#focusRange").hidden = false;

    // switching quarters drops whatever week was focused in the old one
    if (state.daysFocus && state.daysFocus.quarterId !== data.quarterId) state.daysFocus = null;
    var spanAll = data.quarterId === "all";
    var today = todayISO();
    var todayInQuarter = today >= data.from && today <= data.to;
    // asking for every quarter means wanting to see all of it, not this week of it
    if (!state.daysFocus) state.daysFocus = savedFocus(data.quarterId) || (function () {
      var def = focusPreset(!spanAll && todayInQuarter ? "this-week" : "all");
      return { quarterId: data.quarterId, from: def.from, to: def.to, preset: matchingPreset(def.from, def.to) };
    })();
    var f = state.daysFocus;
    f.from = clampToQuarter(f.from);
    f.to = clampToQuarter(f.to);
    if (f.to < f.from) f.to = f.from;
    remember("days-focus", f);

    ["#focusFrom", "#focusTo"].forEach(function (sel) {
      var el = $(sel);
      el.min = data.from;
      el.max = data.to;
      el.value = sel === "#focusFrom" ? f.from : f.to;
    });

    $("#focusWeekLabel").textContent = fmtDayMonth(f.from) + T(" → ", " ← ") + fmtDayMonth(f.to);
    $("#btnFocusPrevWeek").disabled = f.from <= data.from;
    $("#btnFocusNextWeek").disabled = f.to >= data.to;
    // the "all" chip covers the whole quarter, or everything, depending on scope
    $('#focusRange .chip[data-focus-preset="all"]').textContent = spanAll ? T("Every quarter", "كل الأرباع") : T("Whole quarter", "الربع كله");
    $("#btnDaysChartAll").textContent = spanAll ? T("↩ Every quarter", "↪ كل الأرباع") : T("↩ Whole quarter", "↪ الربع كله");
    document.querySelectorAll("#focusRange .chip").forEach(function (c) {
      c.classList.toggle("chip--on", c.dataset.focusPreset === f.preset);
      // "this week" and friends are anchored on today — meaningless for a quarter
      // that hasn't started or is already over; the arrows still browse any week
      c.disabled = !todayInQuarter && c.dataset.focusPreset !== "all";
    });

    var s = focusStats(f.from, f.to);

    $("#focusAvgValue").textContent = s.avg + "%";
    $("#focusAvgSub").textContent = T(s.tracked + " of " + plural(s.spanned, "day") + " tracked", s.tracked + " متسجلين من " + plural(s.spanned, "day"));
    $("#focusTasksValue").textContent = s.done + "/" + s.planned;
    $("#focusTasksSub").textContent = T("across ", "على ") + plural(s.tracked, "tracked day");

    $("#focusBestValue").textContent = s.best ? s.best.pct + "%" : "—";
    $("#focusBestSub").textContent = s.best
      ? fmtDate(s.best.date) + (s.worst && s.worst.date !== s.best.date ? T(" · worst ", " · الأسوأ ") + s.worst.pct + "% " + fmtDayMonth(s.worst.date) : "")
      : T("no days tracked in this range", "مفيش أيام متسجلة في المدة دي");

    $("#focusRangeNote").textContent = s.tracked
      ? T(fmtDate(f.from) + " → " + fmtDate(f.to) + ": averaging " + s.avg + "%, against " + data.avg + "% " +
        (spanAll ? "across every quarter." : "for the quarter."),
        fmtDate(f.from) + " ← " + fmtDate(f.to) + ": المتوسط " + s.avg + "%، قصاد " + data.avg + "% " +
        (spanAll ? "في كل الأرباع." : "للربع كله."))
      : T("No tasks logged between " + fmtDate(f.from) + " and " + fmtDate(f.to) + ".",
        "مفيش مهام متسجلة بين " + fmtDate(f.from) + " و" + fmtDate(f.to) + ".");

    // picking a week zooms the graph to that week — the quarter's average still
    // rides along as a faint line, so the slice never reads without its context
    var slice = data.days.filter(function (dd) { return dd.date >= f.from && dd.date <= f.to; });
    var zoomed = slice.length > 0 && slice.length < data.days.length;

    $("#daysChartRange").innerHTML = zoomed
      ? T("Showing <b>", "معروض <b>") + esc(fmtDate(f.from)) + T(" → ", " ← ") + esc(fmtDate(f.to)) + "</b> · " + plural(slice.length, "day")
      : (spanAll ? T("Showing every quarter · ", "معروض كل الأرباع · ") : T("Showing the whole quarter · ", "معروض الربع كله · ")) + plural(data.days.length, "day");
    $("#btnDaysChartAll").hidden = !zoomed;

    if (opts.tiles !== false) {
      renderDayTiles(f.from, f.to, opts.animateTiles !== false);
      $("#dayGalleryHint").textContent = zoomed
        ? T("Showing " + plural(slice.length, "day") + " — tap a day's percentage to open its to-do list.",
          "معروض " + plural(slice.length, "day") + " — دوس على نسبة أي يوم عشان تفتح مهامه.")
        : T("Tap a day's percentage to open its to-do list.", "دوس على نسبة أي يوم عشان تفتح مهامه.");
    }

    window.renderDaysChart($("#daysChart"), $("#daysChartTip"), zoomed ? slice : data.days, {
      avg: data.avg,
      goalsByDate: data.goalsByDate,
      goalsEstimatedByDate: data.goalsEstimatedByDate,
      avgLabel: zoomed ? (spanAll ? T("All time", "كل الوقت") : T("Quarter", "ربع السنة")) : T("Avg", "المتوسط"),
      // where each quarter begins, so a year-long line can be read quarter by quarter
      dividers: spanAll ? (state.quarters || []).map(function (q) {
        return { date: String(q.start_date).slice(0, 10), label: q.name };
      }) : null,
      // unzoomed, the range average would sit exactly on the quarter's line
      focus: zoomed ? { avg: s.tracked ? s.avg : null, label: T("This range", "المدة دي") } : null,
      ariaLabel: zoomed
        ? T("Daily completion from " + fmtDate(f.from) + " to " + fmtDate(f.to), "نسبة الإنجاز اليومية من " + fmtDate(f.from) + " لـ " + fmtDate(f.to))
        : (spanAll ? T("Daily completion across every quarter", "نسبة الإنجاز اليومية في كل الأرباع") : T("Daily completion across the quarter", "نسبة الإنجاز اليومية في الربع كله")),
      animate: opts.animateChart !== false,
    });
  }

  function setDaysFocus(from, to) {
    if (!state.daysData) return;
    state.daysFocus = {
      quarterId: state.daysData.quarterId,
      from: from, to: to, preset: matchingPreset(from, to),
    };
    // the line shouldn't replay its draw-in, but a fresh set of tiles should enter
    renderDaysFocus({ animateChart: false, animateTiles: true });
  }

  // step to the adjacent Saturday–Friday week; the buttons are disabled at the
  // quarter's edges, so the shifted week can never fall outside it
  function shiftFocusWeek(dir) {
    if (!state.daysData || !state.daysFocus) return;
    var s = addDays(weekStart(state.daysFocus.from), dir * 7);
    setDaysFocus(clampToQuarter(s), clampToQuarter(addDays(s, 6)));
  }

  $("#focusRange").addEventListener("click", function (ev) {
    var chip = ev.target.closest(".chip[data-focus-preset]");
    if (!chip) return;
    var p = focusPreset(chip.dataset.focusPreset);
    if (p) setDaysFocus(p.from, p.to);
  });
  $("#btnDaysChartAll").addEventListener("click", function () {
    var p = focusPreset("all");
    if (p) setDaysFocus(p.from, p.to);
  });
  $("#btnFocusPrevWeek").addEventListener("click", function () { shiftFocusWeek(-1); });
  $("#btnFocusNextWeek").addEventListener("click", function () { shiftFocusWeek(1); });
  ["#focusFrom", "#focusTo"].forEach(function (sel) {
    $(sel).addEventListener("change", function () {
      var from = $("#focusFrom").value, to = $("#focusTo").value;
      if (!from || !to) return;
      if (to < from) { if (sel === "#focusFrom") to = from; else from = to; }
      setDaysFocus(clampToQuarter(from), clampToQuarter(to));
    });
  });

  // tapping a day tile's percentage jumps to the Today tab loaded on that date
  function openDayDetail(date) {
    return loadDay(date).then(function () { showTab("today"); });
  }

  /* ---------------- day-tile photo action menu: view / replace / go to day ---------------- */
  var dayPhotoMenuState = null;

  function openDayPhotoMenu(date, photoUrl, fileInput) {
    dayPhotoMenuState = { date: date, photoUrl: photoUrl, fileInput: fileInput };
    $("#dayPhotoMenuTitle").textContent = fmtDate(date);
    $("#dayPhotoMenuView").hidden = !photoUrl;
    $("#dayPhotoMenuUpload").textContent = photoUrl ? T("🔁 Replace photo", "🔁 غيّر الصورة") : T("📤 Upload photo", "📤 ارفع صورة");
    $("#dayPhotoMenu").hidden = false;
  }
  function closeDayPhotoMenu() {
    $("#dayPhotoMenu").hidden = true;
    dayPhotoMenuState = null;
  }
  // shows the already-loaded thumbnail immediately, then swaps in the
  // higher-resolution copy (fetched one at a time, not part of the bulk
  // gallery load) once it arrives
  function openDayPhotoView(date, thumbUrl) {
    // src="" is not "no picture" — the browser reads it as this page's own
    // URL and downloads the whole document again to try to decode it
    if (thumbUrl) $("#dayPhotoViewImg").src = thumbUrl;
    else $("#dayPhotoViewImg").removeAttribute("src");
    $("#dayPhotoView").hidden = false;
    $("#dayPhotoView").classList.add("photo-view--loading");
    api("/api/day-photos?date=" + date + "&full=1")
      .then(function (data) {
        var url = data.photo_full || data.photo_data || thumbUrl;
        if (url) $("#dayPhotoViewImg").src = url;
      })
      .catch(function () {})
      .then(function () { $("#dayPhotoView").classList.remove("photo-view--loading"); });
  }
  function closeDayPhotoView() {
    $("#dayPhotoView").hidden = true;
    $("#dayPhotoViewImg").removeAttribute("src");
  }

  $("#dayPhotoMenuBackdrop").addEventListener("click", closeDayPhotoMenu);
  $("#dayPhotoMenuCancel").addEventListener("click", closeDayPhotoMenu);
  $("#dayPhotoMenuView").addEventListener("click", function () {
    if (!dayPhotoMenuState || !dayPhotoMenuState.photoUrl) return;
    var date = dayPhotoMenuState.date, url = dayPhotoMenuState.photoUrl;
    closeDayPhotoMenu();
    openDayPhotoView(date, url);
  });
  $("#dayPhotoMenuUpload").addEventListener("click", function () {
    if (!dayPhotoMenuState) return;
    var input = dayPhotoMenuState.fileInput;
    closeDayPhotoMenu();
    input.click();
  });
  $("#dayPhotoMenuGoto").addEventListener("click", function () {
    if (!dayPhotoMenuState) return;
    var date = dayPhotoMenuState.date;
    closeDayPhotoMenu();
    openDayDetail(date);
  });
  $("#dayPhotoViewClose").addEventListener("click", closeDayPhotoView);
  $("#dayPhotoView").addEventListener("click", function (ev) {
    if (ev.target === this) closeDayPhotoView();
  });
  document.addEventListener("keydown", function (ev) {
    if (ev.key !== "Escape") return;
    if (!$("#dayPhotoView").hidden) closeDayPhotoView();
    else if (!$("#dayPhotoMenu").hidden) closeDayPhotoMenu();
    else if (!$("#fillDays").hidden) closeFillDays();
  });

  /* ---------------- fill the empty days of a stretch (owner, 2026-10-16) ----------------
     The same daily list written onto every day in a range that has nothing on
     it yet. One task per line; a line ending in the word "check" is written
     already ticked. A day with any task on it is never touched, so this can be
     run again later without doubling anything up. */

  var ROUTINE_KEY = "time-routine";
  var DEFAULT_ROUTINE = [
    "Pray Fajr on Time", "Azkar Elsbah", "Pray Dohr on Time", "Pray Asr on Time",
    "Azkar Elmsaa", "Pray Maghrib on Time", "Pray Isha on Time", "Walking 5K Steps",
    "Healthy Breakfast", "Healthy dinner", "Healthy lunch", "Dwa 1",
    "Dwa 2 check",
    "Work 2 hours check", "Work 2 hours check", "Work 2 hours check",
    "Work 2 hours check", "Work 2 hours check",
    "Free time check",
  ].join("\n");

  function readRoutine(text) {
    return String(text || "").split("\n").map(function (line) {
      var t = line.trim();
      if (!t) return null;
      var done = /(^|\s)check$/i.test(t);
      var title = t.replace(/(^|\s)check$/i, "").trim();
      return title ? { title: title.slice(0, 500), done: done } : null;
    }).filter(Boolean);
  }

  function daysBetween(from, to) {
    var out = [];
    if (!from || !to || from > to) return out;
    var d = from;
    while (d <= to && out.length < 400) { out.push(d); d = addDays(d, 1); }
    return out;
  }

  function fillCountNow() {
    var list = readRoutine($("#fillList").value);
    var days = daysBetween($("#fillFrom").value, $("#fillTo").value);
    var ticked = list.filter(function (t) { return t.done; }).length;
    var box = $("#fillCount");
    if (!days.length || !list.length) {
      box.textContent = !list.length ? T("Write at least one task.", "اكتب مهمة واحدة على الأقل.") : T("Pick a first and last day.", "اختار أول يوم وآخر يوم.");
      $("#fillGo").disabled = true;
      return;
    }
    $("#fillGo").disabled = false;
    box.textContent = T(days.length + " day" + (days.length === 1 ? "" : "s") + " × " + list.length +
      " task" + (list.length === 1 ? "" : "s") + ", " + ticked + " of them ticked — only the empty days get them.",
      plural(days.length, "day") + " × " + plural(list.length, "task") + "، منهم " + ticked + " متعلّم عليهم — الأيام الفاضية بس اللي هتاخدهم.");
  }

  function openFillDays() {
    var q = state.quarterDetail && state.quarterDetail.quarter;
    var saved = null;
    try { saved = localStorage.getItem(ROUTINE_KEY); } catch (e) { /* no storage */ }
    $("#fillList").value = saved || DEFAULT_ROUTINE;
    $("#fillFrom").value = q ? String(q.start_date).slice(0, 10) : addDays(todayISO(), -27);
    // never the days still to come unless you ask for them
    $("#fillTo").value = todayISO();
    $("#fillGo").textContent = T("Fill the days", "املا الأيام");
    fillCountNow();
    $("#fillDays").hidden = false;
  }
  function closeFillDays() { $("#fillDays").hidden = true; }

  $("#btnFillDays").addEventListener("click", openFillDays);
  $("#fillCancel").addEventListener("click", closeFillDays);
  $("#fillDaysBackdrop").addEventListener("click", closeFillDays);
  ["#fillList", "#fillFrom", "#fillTo"].forEach(function (sel) {
    $(sel).addEventListener("input", fillCountNow);
  });

  /* The days filled in before the label existed, and a stretch marked by
     mistake (owner, 2026-10-16: "I have filled days from 25th Sep to 17 Oct,
     so add this to them"). The dates above say which days. */
  function markRange(estimated, btn) {
    var from = $("#fillFrom").value, to = $("#fillTo").value;
    if (!from || !to || from > to) { toast(T("Pick a first and last day", "اختار أول يوم وآخر يوم"), true); return; }
    var was = btn.textContent;
    btn.disabled = true;
    btn.textContent = estimated ? T("Marking…", "بيتعلّم…") : T("Removing…", "بيتشال…");
    api("/api/tasks?estimate=1", { method: "PATCH", body: { from: from, to: to, estimated: estimated } })
      .then(function (r) {
        if (!r.days) { toast(estimated ? T("Those days already say estimated", "الأيام دي مكتوب عليها تقديري أصلاً") : T("No label to remove in those days", "مفيش علامة تتشال في الأيام دي")); return null; }
        closeFillDays();
        playAddSound();
        toast(T(r.days + " day" + (r.days === 1 ? "" : "s") +
          (estimated ? " now say estimated ✓" : " no longer say estimated ✓"),
          plural(r.days, "day") + (estimated ? " بقى مكتوب عليهم تقديري ✓" : " اتشالت منهم علامة تقديري ✓")));
        return loadDaysGallery({ animate: false });
      })
      .catch(function (e) { toast(e.message, true); })
      .finally(function () { btn.disabled = false; btn.textContent = was; });
  }

  $("#fillMark").addEventListener("click", function () { markRange(true, this); });
  $("#fillUnmark").addEventListener("click", function () { markRange(false, this); });

  $("#fillGo").addEventListener("click", function () {
    var btn = this;
    var list = readRoutine($("#fillList").value);
    var days = daysBetween($("#fillFrom").value, $("#fillTo").value);
    if (!list.length || !days.length) return;
    try { localStorage.setItem(ROUTINE_KEY, $("#fillList").value); } catch (e) { /* no storage */ }
    btn.disabled = true;

    api("/api/tasks?stats=1&from=" + days[0] + "&to=" + days[days.length - 1])
      .then(function (res) {
        var taken = {};
        (res.stats || []).forEach(function (st) { if (st.total > 0) taken[String(st.date).slice(0, 10)] = true; });
        var empty = days.filter(function (d) { return !taken[d]; });
        if (!empty.length) { toast(T("Every day in that stretch already has tasks", "كل يوم في المدة دي عليه مهام أصلاً")); return null; }
        var total = empty.length * list.length, made = 0;

        // one at a time: hundreds of rows, and the order they are written is
        // the order they show in the day's list
        var step = function (i) {
          if (i >= empty.length) return Promise.resolve(empty.length);
          var day = empty[i];
          var one = function (k) {
            if (k >= list.length) return Promise.resolve();
            // marked, so the day's card can say it was written in afterwards
            return api("/api/tasks", { method: "POST", body: { task_date: day, title: list[k].title, estimated: true } })
              .then(function (r) {
                made++;
                btn.textContent = T("Writing… ", "بيكتب… ") + Math.round((made / total) * 100) + "%";
                if (!list[k].done || !r.task) return null;
                return api("/api/tasks?id=" + r.task.id, { method: "PATCH", body: { done: true } });
              })
              .then(function () { return one(k + 1); });
          };
          return one(0).then(function () { return step(i + 1); });
        };
        return step(0);
      })
      .then(function (filled) {
        if (filled == null) return null;
        closeFillDays();
        playAddSound();
        toast(T(filled + " day" + (filled === 1 ? "" : "s") + " filled ✓", plural(filled, "day") + " اتملوا ✓"));
        return loadDaysGallery({ animate: false });
      })
      .catch(function (e) { toast(e.message, true); })
      .finally(function () { btn.disabled = false; btn.textContent = T("Fill the days", "املا الأيام"); });
  });

  /* ---------------- Focus: ten pomodoros a day ----------------
     Owner, 2026-10-17: "daily target is 10 pomodoro … 1st will be sitting,
     2nd standing, 3rd walking treadmill and etc … reset with Cairo time
     zone", and then: "I want it like checklist, can do daily or click its
     button to work its pomodoro". So: a checklist of ten blocks, each
     carrying the posture it asks for. Tick one off by hand, or press its ▶
     and let its own 25 minutes run it in.

     The day is Cairo's, not the device's, so the list turns over at midnight
     in Cairo wherever he is. A running block is kept by the clock it ends on,
     not by a counter, so a locked phone or a reloaded page never loses time. */

  var POMO_TARGET = 10; // the day's blocks when no hours are typed
  var POMO_MINUTES = 25;

  /* The hours typed decide the blocks, counted the way the plan counts them:
     25 on, 5 off, 5, 5, then a 15-minute break after every fourth. 12 hours is
     22 blocks, not 28 (owner, 2026-10-21: "I write hours, you do that"). The
     durations are the timer's own, if they were changed on this device. */
  function pomoRhythm() {
    var d = typeof loadPomodoroDurations === "function" ? loadPomodoroDurations() : { work: 25, short: 5, long: 15 };
    return { work: d.work || 25, short: d.short || 5, long: d.long || 15, rounds: 4 };
  }
  function pomosInHours(hours) {
    var r = pomoRhythm(), left = hours * 60, n = 0;
    while (left >= r.work) { n++; left -= r.work; left -= (n % r.rounds === 0 ? r.long : r.short); }
    return n;
  }
  function pomoBreakAfter(slot) { var r = pomoRhythm(); return slot % r.rounds === 0 ? r.long : r.short; }
  function pomoTarget() { return pomo.hours > 0 ? Math.max(1, pomosInHours(pomo.hours)) : POMO_TARGET; }
  function fmtMins(m) { var h = Math.floor(m / 60), r = m % 60; return (h ? h + T("h ", "س ") : "") + (r || !h ? r + T("m", "د") : "").trim(); }
  // the postures, in the order he asked for; after the third it starts again
  var POMO_MODES = [
    // name is what the server stores; label is what the page shows
    { glyph: "🪑", name: "Sitting", label: T("Sitting", "قاعد") },
    { glyph: "🧍", name: "Standing", label: T("Standing", "واقف") },
    { glyph: "🚶", name: "Walking (treadmill)", label: T("Walking (treadmill)", "مشي (على المشاية)") },
  ];
  function pomoMode(slot) { return POMO_MODES[(slot - 1) % POMO_MODES.length]; }

  function cairoToday() {
    try {
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit",
      }).format(new Date());
    } catch (e) { return todayISO(); }
  }

  // how long until the list turns over, in Cairo
  function cairoLeft() {
    var now = new Date();
    var parts;
    try {
      parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Africa/Cairo", hour: "2-digit", minute: "2-digit", hour12: false,
      }).formatToParts(now).reduce(function (m, p) { m[p.type] = p.value; return m; }, {});
    } catch (e) { return ""; }
    var mins = (24 * 60) - (Number(parts.hour) * 60 + Number(parts.minute));
    var h = Math.floor(mins / 60), m = mins % 60;
    return T("Resets in " + (h ? h + "h " : "") + m + "m · Cairo", "هيتصفّر بعد " + (h ? h + "س " : "") + m + "د · القاهرة");
  }

  var pomo = { date: null, done: {}, extra: 0, history: [], run: null, hours: Number(recall("pomo-hours", "12")) || 0 };
  // a block left running when the page was closed picks up where it was
  var pomoSaved = recallJSON("pomo-run", null);
  if (pomoSaved && pomoSaved.slot) pomo.run = pomoSaved;

  function pomoSlots() {
    var highest = 0;
    Object.keys(pomo.done).forEach(function (s) { highest = Math.max(highest, Number(s)); });
    return Math.max(pomoTarget(), highest, pomoTarget() + pomo.extra);
  }

  function loadPomodoros() {
    var day = cairoToday();
    return api("/api/tasks?pomodoros=1&date=" + day).then(function (r) {
      pomo.date = r.date || day;
      pomo.done = {};
      (r.slots || []).forEach(function (s) { pomo.done[s.slot] = s; });
      pomo.history = r.history || [];
      renderPomodoros();
      if (pomo.run) paintPomoRun(); // a block that was running when the page closed
    }).catch(function (e) { toast(e.message, true); });
  }

  function renderPomodoros() {
    var total = pomoSlots();
    var done = Object.keys(pomo.done).length;
    $("#pomoDone").textContent = done;
    $("#pomoTarget").textContent = pomoTarget();
    $("#pomoFill").style.width = Math.min(100, Math.round((done / pomoTarget()) * 100)) + "%";
    $("#pomoFill").classList.toggle("goal-row__fill--done", done >= pomoTarget());
    $("#pomoReset").textContent = cairoLeft();
    var target = pomoTarget(), r = pomoRhythm();
    var hoursIn = $("#pomoHours"); if (document.activeElement !== hoursIn) hoursIn.value = pomo.hours || "";
    $("#pomoSay").textContent = done >= target
      ? T((target === 10 ? "Ten" : target) + " done — that is the day's work 🎉", target + " خلصوا — ده شغل اليوم كله 🎉")
      : done === 0 ? T((target === 10 ? "Ten" : target) + " blocks waiting. Press ▶ on the first one.", target + " بلوك مستنيينك. دوس ▶ على أول واحد.")
        : T((target - done) + " to go. " + pomoMode(done + 1).glyph + " " + pomoMode(done + 1).name + " is next.",
          "فاضل " + (target - done) + ". اللي جاي: " + pomoMode(done + 1).glyph + " " + pomoMode(done + 1).label + ".");
    var mins = 0;
    Object.keys(pomo.done).forEach(function (s) { mins += Number(pomo.done[s].minutes) || 0; });
    // what the hours become: the blocks, the focus in them, and the clock time with the breaks
    var focusMin = target * r.work, withBreaks = focusMin;
    for (var b = 1; b < target; b++) withBreaks += pomoBreakAfter(b);
    $("#pomoMinutes").textContent = T((pomo.hours ? pomo.hours + "h → " : "") + target + " × " + r.work + " min = " + fmtMins(focusMin) + " of focus, " + fmtMins(withBreaks) + " with the breaks" +
      (mins ? " · " + fmtMins(mins) + " logged today" : ""),
      (pomo.hours ? pomo.hours + "س ← " : "") + target + " × " + r.work + " دقيقة = " + fmtMins(focusMin) + " تركيز، " + fmtMins(withBreaks) + " بالاستراحات" +
      (mins ? " · " + fmtMins(mins) + " متسجلين النهارده" : ""));

    var list = $("#pomoList");
    list.innerHTML = "";
    for (var slot = 1; slot <= total; slot++) {
      var mode = pomoMode(slot);
      var row = document.createElement("div");
      var isDone = !!pomo.done[slot];
      var isRunning = pomo.run && pomo.run.slot === slot;
      row.className = "pomo-row" + (isDone ? " pomo-row--done" : "") + (isRunning ? " pomo-row--running" : "") +
        (slot > pomoTarget() ? " pomo-row--extra" : "");
      row.dataset.slot = slot;
      row.innerHTML =
        '<button type="button" class="pomo-row__check" aria-pressed="' + isDone + '" ' +
          'aria-label="' + (isDone ? T("Undo block ", "الغي بلوك ") : T("Tick off block ", "علّم على بلوك ")) + slot + '">' + (isDone ? "✓" : "") + '</button>' +
        '<span class="pomo-row__n">' + slot + '</span>' +
        '<span class="pomo-row__mode"><span class="pomo-row__glyph">' + mode.glyph + '</span>' + esc(mode.label) + '</span>' +
        '<span class="pomo-row__len">' + (pomo.done[slot] && pomo.done[slot].minutes ? pomo.done[slot].minutes : POMO_MINUTES) + T(" min", " دقيقة") + '</span>' +
        '<button type="button" class="btn btn--ghost btn--sm pomo-row__go">' +
          (isRunning ? T("Running…", "شغال…") : isDone ? T("Again", "تاني") : T("▶ Start", "▶ ابدأ")) + '</button>';
      list.appendChild(row);
      // the break that follows: 5 minutes, or 15 after every fourth block
      if (slot < total) {
        var br = pomoBreakAfter(slot), gap = document.createElement("div");
        gap.className = "pomo-break" + (br >= pomoRhythm().long ? " pomo-break--long" : "") + (isDone ? " pomo-break--done" : "");
        gap.textContent = (br >= pomoRhythm().long ? "🛋 " : "☕ ") + T(br + " min break", "استراحة " + br + " دقيقة");
        list.appendChild(gap);
      }
    }
    renderPomoHistory();
  }

  function renderPomoHistory() {
    var byDate = {};
    pomo.history.forEach(function (h) { byDate[String(h.date).slice(0, 10)] = h.done; });
    var box = $("#pomoHistory");
    box.innerHTML = "";
    for (var i = 13; i >= 0; i--) {
      var d = addDays(pomo.date || cairoToday(), -i);
      var n = byDate[d] || 0;
      var cell = document.createElement("div");
      cell.className = "pomo-day" + (n >= pomoTarget() ? " pomo-day--full" : n ? " pomo-day--some" : "");
      cell.style.setProperty("--fill", Math.min(100, Math.round((n / pomoTarget()) * 100)) + "%");
      cell.title = fmtDate(d) + " — " + n + T(" of ", " من ") + pomoTarget();
      cell.innerHTML = '<span class="pomo-day__n">' + (n || "") + "</span>";
      box.appendChild(cell);
    }
  }

  function tickPomodoro(slot, minutes) {
    var mode = pomoMode(slot);
    return api("/api/tasks?pomodoros=1", {
      method: "POST",
      body: { date: pomo.date || cairoToday(), slot: slot, mode: mode.name, minutes: minutes || null },
    }).then(function (r) {
      pomo.done[slot] = r.slot || { slot: slot, mode: mode.name, minutes: minutes || null };
      var today = pomo.date || cairoToday();
      var seen = false;
      pomo.history.forEach(function (h) { if (String(h.date).slice(0, 10) === today) { h.done = Object.keys(pomo.done).length; seen = true; } });
      if (!seen) pomo.history.push({ date: today, done: Object.keys(pomo.done).length });
      renderPomodoros();
    });
  }

  function untickPomodoro(slot) {
    return api("/api/tasks?pomodoros=1&date=" + (pomo.date || cairoToday()) + "&slot=" + slot, { method: "DELETE" })
      .then(function () {
        delete pomo.done[slot];
        var today = pomo.date || cairoToday();
        pomo.history.forEach(function (h) { if (String(h.date).slice(0, 10) === today) h.done = Object.keys(pomo.done).length; });
        renderPomodoros();
      });
  }

  /* ---- the running block ---- */

  function savePomoRun() { remember("pomo-run", pomo.run); }

  function startPomodoro(slot) {
    pomo.run = { slot: slot, endsAt: Date.now() + POMO_MINUTES * 60000, left: null, minutes: POMO_MINUTES };
    savePomoRun();
    if (window.Go) window.Go.play("open");
    renderPomodoros();
    paintPomoRun();
  }

  function stopPomodoro(silent) {
    pomo.run = null;
    savePomoRun();
    document.title = pomoTitleBase;
    $("#pomoRun").hidden = true;
    if (!silent && window.Go) window.Go.play("tap");
    renderPomodoros();
  }

  function pomoLeftMs() {
    if (!pomo.run) return 0;
    return pomo.run.left != null ? pomo.run.left : Math.max(0, pomo.run.endsAt - Date.now());
  }

  var pomoTitleBase = document.title;

  function paintPomoRun() {
    var box = $("#pomoRun");
    if (!pomo.run) { box.hidden = true; document.title = pomoTitleBase; return; }
    box.hidden = false;
    var mode = pomoMode(pomo.run.slot);
    var ms = pomoLeftMs();
    var secs = Math.ceil(ms / 1000);
    var clock = Math.floor(secs / 60) + ":" + ("0" + (secs % 60)).slice(-2);
    $("#pomoRunMode").textContent = T("Block ", "بلوك ") + pomo.run.slot + " · " + mode.glyph + " " + mode.label;
    $("#pomoRunClock").textContent = clock;
    $("#pomoRunFill").style.width = (100 - Math.min(100, (ms / (pomo.run.minutes * 60000)) * 100)) + "%";
    $("#pomoPause").textContent = pomo.run.left != null ? T("Resume", "كمّل") : T("Pause", "وقّف مؤقتاً");
    document.title = clock + " · " + mode.label + " — " + pomoTitleBase;
    if (ms <= 0) finishPomodoro();
  }

  function finishPomodoro() {
    var run = pomo.run;
    if (!run) return;
    pomo.run = null;
    savePomoRun();
    document.title = pomoTitleBase;
    $("#pomoRun").hidden = true;
    tickPomodoro(run.slot, run.minutes).then(function () {
      var row = document.querySelector('.pomo-row[data-slot="' + run.slot + '"]');
      if (row && window.Go) {
        var r = row.getBoundingClientRect();
        window.Go.burst(r.left + r.width / 2, r.top + r.height / 2, 22, ["🍅", "✨"]);
      }
      if (window.Go) window.Go.play("success");
      var done = Object.keys(pomo.done).length;
      toast(done >= pomoTarget() ? T("Ten blocks done today 🎉", "بلوكات النهارده كلها خلصت 🎉") : T("Block " + run.slot + " done — " + (pomoTarget() - done) + " to go", "بلوك " + run.slot + " خلص — فاضل " + (pomoTarget() - done)));
    }).catch(function (e) { toast(e.message, true); });
  }

  // one timer for the page: the clock, the Cairo turnover, and nothing else
  setInterval(function () {
    if (document.querySelector('.tabpanel[data-tabpanel="focus"]').hidden && !pomo.run) return;
    if (pomo.date && cairoToday() !== pomo.date) { stopPomodoro(true); loadPomodoros(); return; }
    if (pomo.run) paintPomoRun();
    else if (pomo.date) $("#pomoReset").textContent = cairoLeft();
  }, 1000);

  $("#pomoList").addEventListener("click", function (ev) {
    var row = ev.target.closest(".pomo-row");
    if (!row) return;
    var slot = Number(row.dataset.slot);
    if (ev.target.closest(".pomo-row__check")) {
      if (pomo.done[slot]) {
        untickPomodoro(slot).catch(function (e) { toast(e.message, true); });
      } else {
        if (pomo.run && pomo.run.slot === slot) stopPomodoro(true);
        tickPomodoro(slot).then(function () {
          if (window.Go) {
            var r = row.getBoundingClientRect();
            window.Go.burst(r.left + r.width / 2, r.top + r.height / 2, 14, ["🍅"]);
            window.Go.play("coin");
          }
        }).catch(function (e) { toast(e.message, true); });
      }
      return;
    }
    if (ev.target.closest(".pomo-row__go")) {
      if (pomo.run && pomo.run.slot !== slot && pomoLeftMs() > 0) {
        if (!confirm(T("Block " + pomo.run.slot + " is still running. Start block " + slot + " instead?", "بلوك " + pomo.run.slot + " لسه شغال. تبدأ بلوك " + slot + " بداله؟"))) return;
      }
      startPomodoro(slot);
      row.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  });

  $("#pomoPause").addEventListener("click", function () {
    if (!pomo.run) return;
    if (pomo.run.left != null) { pomo.run.endsAt = Date.now() + pomo.run.left; pomo.run.left = null; }
    else pomo.run.left = Math.max(0, pomo.run.endsAt - Date.now());
    savePomoRun();
    if (window.Go) window.Go.play("tap");
    paintPomoRun();
  });
  $("#pomoDoneNow").addEventListener("click", function () {
    if (!pomo.run) return;
    // credit the minutes actually spent, not the whole block
    var spent = Math.max(1, Math.round((pomo.run.minutes * 60000 - pomoLeftMs()) / 60000));
    pomo.run.minutes = spent;
    finishPomodoro();
  });
  $("#pomoStop").addEventListener("click", function () { stopPomodoro(); });
  $("#pomoHours").addEventListener("change", function () {
    var v = Math.max(0, Math.min(18, Math.round((Number(this.value) || 0) * 2) / 2));
    pomo.hours = v; remember("pomo-hours", v ? String(v) : null); pomo.extra = 0;
    renderPomodoros();
    if (window.Go) window.Go.play("tap");
  });
  $("#pomoAddOne").addEventListener("click", function () {
    pomo.extra++;
    renderPomodoros();
    if (window.Go) window.Go.play("tap");
  });

  /* ---------------- resize: redraw progress charts ---------------- */

  var resizeTimer;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      if ($("#view-app").hidden) return;
      if (state.quarterDetail) renderQuarter(state.quarterDetail);
      // the days chart is sized off box.clientWidth, so it needs the same nudge
      if (state.daysData && !document.querySelector('.tabpanel[data-tabpanel="days"]').hidden) {
        renderDaysFocus({ animateChart: false, tiles: false });
      }
      if (state.quarterStats && !$("#quarterGalleryView").hidden) renderQuartersSummary();
    }, 150);
  });

  /* ---------------- go ---------------- */
  boot();
})();
