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
          throw new Error(data.error || ("Request failed (" + r.status + ")"));
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
    return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  }

  // day-tile grid only: no weekday text needed there since the Sat-Fri
  // column headers above the grid already convey it
  function fmtDayMonth(iso) {
    if (!iso) return "—";
    var d = new Date(String(iso).slice(0, 10) + "T00:00:00Z");
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  }

  function fmtH(n) {
    n = Number(n) || 0;
    return (Number.isInteger(n) ? n : n.toFixed(1)) + "h";
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
        $("#countdownLabel").textContent = "This quarter has ended";
        $("#countdownSpent").textContent = "";
        $("#countdownBar").style.width = "100%";
        ["cdDays", "cdHours", "cdMinutes", "cdSeconds"].forEach(function (id) { $("#" + id).textContent = "00"; });
        lastCountdownText = "ended";
      }
      return;
    }

    box.classList.remove("countdown--ended");
    var target = now < start ? start : end;
    $("#countdownLabel").textContent = now < start ? "Starts in" : "Time left in this quarter";

    if (now < start) {
      $("#countdownSpent").textContent = "";
      $("#countdownBar").style.width = "0%";
    } else {
      var totalQuarterDays = Math.max(1, Math.round((end - start) / 86400000));
      var spentDays = Math.min(totalQuarterDays, Math.max(0, Math.floor((now - start) / 86400000)));
      var done = Math.min(1, Math.max(0, (now - start) / (end - start)));
      $("#countdownSpent").textContent = "Day " + spentDays + " of " + totalQuarterDays + " · " + Math.round(done * 100) + "% gone";
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
      toast("Target age updated ✓");
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
      return "Halved down from $500K to ~$976, " + MILESTONE_HALVINGS + " steps. The age " + age +
        " date has gone by, so the ladder keeps a " + MILESTONE_MONTHS_PER_DOUBLING +
        "-month pace from today. Check one off once you've actually reached it.";
    }
    var weeks = Math.max(1, Math.round((deadline - today) / 604800000 / (MILESTONE_HALVINGS + 1)));
    var every = weeks >= 9 ? Math.round(weeks / 4.345) + " months" : weeks + (weeks === 1 ? " week" : " weeks");
    return "Halved down from $500K to ~$976 — doubling every " + every + ", " + MILESTONE_HALVINGS +
      " times in a row, the last landing on your " + age + "th birthday (" +
      deadline.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) +
      "). Check one off once you've actually reached it.";
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
      label.textContent = "🎉 All milestones reached!";
      MS_UNIT_IDS.forEach(function (id) { $("#" + id).textContent = "00"; });
      return;
    }
    box.classList.remove("countdown--ended");
    var nextIdx = milestones.indexOf(next);
    var reached = Number(loadMilestoneAmounts()[nextIdx]) || 0;
    var pct = next.value > 0 ? Math.min(100, Math.round((reached / next.value) * 100)) : 0;
    label.textContent = "💰 Time left to hit $" + fmtMoney(next.value) + " (" + pct + "% there)";
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
      var dateLabel = m.date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
      var rowAmount = Number(amounts[i]) || 0;
      var pct = m.value > 0 ? Math.min(100, Math.round((rowAmount / m.value) * 100)) : 0;
      return '<div class="' + cls + '" data-idx="' + i + '">' +
        '<input type="checkbox" class="task-row__check milestone-row__check"' + (isChecked ? " checked" : "") + ' aria-label="Mark $' + fmtMoney(m.value) + ' reached" />' +
        '<span class="milestone-row__body">' +
          '<span class="milestone-row__top">' +
            '<span class="milestone-row__amount">$' + fmtMoney(m.value) + '</span>' +
            '<span class="milestone-row__delta">+$' + fmtMoney(m.value - prevVal) + ' to add</span>' +
          '</span>' +
          '<span class="goal-row__nums milestone-row__reached">' +
            '<input type="number" class="goal-row__current milestone-row__amount-input" min="0" step="any" placeholder="0" value="' + (rowAmount || "") + '" />' +
            ' / $' + fmtMoney(m.value) + ' reached' +
          '</span>' +
          '<span class="milestone-row__date">pace: by ' + dateLabel + '</span>' +
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
    return phase === "work" ? "Focus" : phase === "long" ? "Long break" : "Short break";
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
    toast(pomodoroPhaseLabel(pomodoroPhase) + " time!");
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
    pomodoroFocusText = text || "Focused work";
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
      toast("Pomodoro durations updated ✓");
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
      .then(function () { initApp(); })
      .catch(function (e) { if (e.name !== "NotAllowedError") showErr("#loginError", e.message || "Sign-in failed"); })
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
      .then(function () { toast("Passkey registered ✓"); initApp(); })
      .catch(function (e) {
        if (e.name === "InvalidStateError") showErr("#setupError", "This device already holds the passkey — reload and sign in.");
        else if (e.name !== "NotAllowedError") showErr("#setupError", e.message || "Setup failed");
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
    return api("/api/tasks?date=" + date).then(function (data) {
      renderTasks(data.tasks, { animate: !opts.skipEnterAnimation });
      renderTodayChart(date, data.tasks);
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

    var doneSorted = tasks.filter(function (t) { return t.done; })
      .sort(function (a, b) { return new Date(taskCompletionTime(a)) - new Date(taskCompletionTime(b)); });
    var running = 0;
    var points = doneSorted.map(function (t) {
      running++;
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

  function renderTasks(tasks, opts) {
    opts = opts || {};
    var animate = opts.animate !== false;
    var total = tasks.length;
    var done = tasks.filter(function (t) { return t.done; }).length;
    animateCount($("#dayPercent"), total ? Math.round((done / total) * 100) : 0, "%");
    $("#dayCount").textContent = done + " of " + total + " task" + (total === 1 ? "" : "s");

    var list = $("#taskList");
    list.innerHTML = "";
    $("#tasksEmpty").hidden = total > 0;
    tasks.forEach(function (t) {
      var row = document.createElement("div");
      row.className = "task-row" + (t.done ? " task-row--done" : "") + (animate ? " task-row--enter" : "");
      row.dataset.id = t.id;
      var meta = [];
      if (t.category_name) meta.push(esc(t.category_name));
      if (t.planned_hours != null) meta.push(fmtH(t.planned_hours) + " planned");
      if (state.selectedTaskIds[t.id]) row.classList.add("task-row--selected");
      row.innerHTML =
        '<span class="task-row__select" aria-hidden="true"></span>' +
        '<span class="task-row__handle" title="Drag to reorder">⠿</span>' +
        '<input type="checkbox" class="task-row__check" ' + (t.done ? "checked" : "") + ' aria-label="Mark done" />' +
        '<span class="task-row__icon">' + esc(t.icon || "📝") + '</span>' +
        '<div class="task-row__body"><div class="task-row__title">' + esc(t.title) + '</div>' +
        (meta.length ? '<div class="task-row__meta">' + meta.join(" · ") + '</div>' : '') + '</div>' +
        (t.done ? '<input type="number" min="0" step="0.25" class="task-row__actual" title="Actual hours" value="' +
          (t.actual_hours != null ? Number(t.actual_hours) : '') + '" />' : '') +
        '<button type="button" class="iconbtn iconbtn--edit" title="Edit task">✎</button>' +
        '<button type="button" class="iconbtn" title="Delete task">✕</button>';

      row.querySelector(".task-row__check").addEventListener("change", function (ev) {
        if (ev.target.checked) playCheckSound();
        api("/api/tasks?id=" + t.id, { method: "PATCH", body: { done: ev.target.checked } })
          .then(function () { return afterTaskChange(); })
          .catch(function (e) { toast(e.message, true); ev.target.checked = !ev.target.checked; });
      });
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
      row.querySelector(".iconbtn--edit").addEventListener("click", function () { startEditTask(t); });
      row.querySelector(".iconbtn:not(.iconbtn--edit)").addEventListener("click", function () {
        if (!confirm('Delete task "' + t.title + '"?')) return;
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

  /* ---------------- select several tasks, delete them together ---------------- */

  function selectedTaskCount() { return Object.keys(state.selectedTaskIds).length; }

  function syncTaskSelectBar() {
    var n = selectedTaskCount();
    var all = (state.visibleTaskIds || []).length;
    $("#taskSelectCount").textContent = n + " selected";
    $("#btnDeleteSelected").disabled = n === 0;
    $("#btnDeleteSelected").textContent = n ? "Delete " + n : "Delete";
    $("#btnSelectAll").textContent = n && n === all ? "Select none" : "Select all";
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
    if (!confirm("Delete " + ids.length + " task" + (ids.length === 1 ? "" : "s") + "? This can't be undone.")) return;
    var btn = this;
    busy(btn, true);
    api("/api/tasks?ids=" + ids.join(","), { method: "DELETE" })
      .then(function (r) {
        playDeleteSound();
        var n = r.count != null ? r.count : ids.length;
        toast("Deleted " + n + " task" + (n === 1 ? "" : "s"));
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
    if (!confirm("Delete ALL tasks for " + fmtDate(state.currentDate) + "? This can't be undone.")) return;
    api("/api/tasks?date=" + state.currentDate, { method: "DELETE" })
      .then(function () { toast("Day cleared"); return afterTaskChange(); })
      .catch(function (e) { toast(e.message, true); });
  });

  $("#btnDuplicateDay").addEventListener("click", function () {
    var to = $("#duplicateDate").value;
    if (!to) { toast("Pick a date to copy to", true); return; }
    var btn = this;
    busy(btn, true);
    api("/api/tasks?duplicate=1", { method: "POST", body: { from_date: state.currentDate, to_date: to } })
      .then(function (r) {
        toast(r.count ? ("Copied " + r.count + " task" + (r.count === 1 ? "" : "s") + " to " + fmtDate(to)) : "No tasks to copy");
        return to === state.currentDate ? afterTaskChange() : null;
      })
      .catch(function (e) { toast(e.message, true); })
      .finally(function () { busy(btn, false); });
  });

  function startEditTask(t) {
    state.editingTaskId = t.id;
    var form = $("#addTaskForm");
    form.elements.title.value = t.title;
    form.elements.icon.value = t.icon || "";
    form.elements.category_id.value = t.category_id || "";
    form.elements.planned_hours.value = t.planned_hours != null ? Number(t.planned_hours) : "";
    form.elements.actual_hours.value = t.actual_hours != null ? Number(t.actual_hours) : "";
    $("#actualHoursField").hidden = false;
    $("#btnTaskSubmit").textContent = "Update task";
    $("#btnCancelTaskEdit").hidden = false;
    form.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function stopEditTask() {
    state.editingTaskId = null;
    var form = $("#addTaskForm");
    form.reset();
    $("#actualHoursField").hidden = true;
    $("#btnTaskSubmit").textContent = "Add task";
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
    };
    if (editingId) body.actual_hours = b.actual_hours ? Number(b.actual_hours) : null;
    else body.task_date = state.currentDate;

    busy(btn, true);
    (editingId ? api("/api/tasks?id=" + editingId, { method: "PATCH", body: body })
               : api("/api/tasks", { method: "POST", body: body }))
      .then(function () {
        toast(editingId ? "Task updated ✓" : "Task added ✓");
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
      bar.title = fmtDate(d) + (pct == null ? " · no tasks" : " · " + pct + "% (" + s.done + "/" + s.total + ")");
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

  var MASCOT_MOODS = [
    { max: 0, mouth: "sad", caption: "Let's get started! 💪" },
    { max: 49, mouth: "neutral", caption: "Building momentum…" },
    { max: 99, mouth: "happy", caption: "You're doing great!" },
    { max: 100, mouth: "excited", caption: "Perfect day! 🎉" },
  ];
  var mascotHit100Today = false;

  function updateMascot(pct, streak) {
    var mood = MASCOT_MOODS.filter(function (m) { return pct <= m.max; })[0] || MASCOT_MOODS[MASCOT_MOODS.length - 1];
    $("#mascotMouth").className = "mascot__mouth mascot__mouth--" + mood.mouth;
    $("#mascotCaption").textContent = mood.caption;

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
    var colors = ["#60a5fa", "#a78bfa", "#34d399", "#f59e0b", "#f472b6"];
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
    { id: "task-1", icon: "✅", name: "First task done", goal: 1, of: function (s) { return s.totalDone; }, unit: "tasks" },
    { id: "task-50", icon: "🥉", name: "50 tasks done", goal: 50, of: function (s) { return s.totalDone; }, unit: "tasks" },
    { id: "task-200", icon: "🥈", name: "200 tasks done", goal: 200, of: function (s) { return s.totalDone; }, unit: "tasks" },
    { id: "task-500", icon: "🥇", name: "500 tasks done", goal: 500, of: function (s) { return s.totalDone; }, unit: "tasks" },
    { id: "streak-3", icon: "🔥", name: "3 days in a row, all done", goal: 3, of: function (s) { return s.longestStreak; }, unit: "days" },
    { id: "streak-7", icon: "⚡", name: "A whole week in a row", goal: 7, of: function (s) { return s.longestStreak; }, unit: "days" },
    { id: "streak-30", icon: "🌋", name: "30 days in a row", goal: 30, of: function (s) { return s.longestStreak; }, unit: "days" },
    { id: "goal-1", icon: "🎯", name: "First goal reached", goal: 1, of: function (s) { return s.completedGoals; }, unit: "goals" },
    { id: "goal-10", icon: "🏹", name: "10 goals reached", goal: 10, of: function (s) { return s.completedGoals; }, unit: "goals" },
    { id: "pomo-1", icon: "🍅", name: "First focus block", goal: 1, of: function (s) { return s.focusBlocks; }, unit: "blocks" },
    { id: "pomo-day", icon: "💯", name: "A full ten-block day", goal: 1, of: function (s) { return s.focusFullDays; }, unit: "days" },
    { id: "pomo-100", icon: "🧘", name: "100 focus blocks", goal: 100, of: function (s) { return s.focusBlocks; }, unit: "blocks" },
    { id: "milestone-1", icon: "🪜", name: "First money milestone", goal: 1, of: function (s) { return s.milestonesChecked; }, unit: "rungs" },
    { id: "milestone-half", icon: "💰", name: "Halfway up to $500K", goal: 5, of: function (s) { return s.milestonesChecked; }, unit: "rungs" },
    { id: "cycle-1", icon: "🎖️", name: "One 5-month cycle kept", goal: 1, of: function (s) { return s.cyclesCompleted; }, unit: "cycles" },
    { id: "cycle-2", icon: "🏅", name: "Ten months kept", goal: 2, of: function (s) { return s.cyclesCompleted; }, unit: "cycles" },
    { id: "cycle-4", icon: "🏆", name: "A year kept", goal: 4, of: function (s) { return s.cyclesCompleted; }, unit: "cycles" },
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
    toast("🎉 5-month cycle complete — cycle " + currentCycleNum + " begins!");
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
    toast("🏅 New badge: " + names.join(", "));
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
    return b.name.indexOf(String(b.goal)) !== -1 ? b.name.replace(String(b.goal), String(goal)) : b.name + " (goal " + goal + ")";
  }
  var lastGamify = null; // { stats, full } — redrawn without fetching again after a change
  var openBadge = null;

  function renderGamification(stats) {
    var cycle = computeCommitCycle();
    var pct = cycle.totalCycleDays > 0 ? Math.min(100, Math.round((cycle.dayInCycle / cycle.totalCycleDays) * 100)) : 0;

    $("#gamifyLevelBadge").textContent = cycle.currentCycleNum;
    $("#gamifyXpText").textContent = "Day " + cycle.dayInCycle + " / " + cycle.totalCycleDays;
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
      var tip = r.name + " — " + shown + " of " + r.goal + " " + b.unit + (r.done ? " ✓" : "") + " · click to set the goal or restart";
      return '<button type="button" class="badge-chip' + (r.done ? " badge-chip--unlocked" : "") + (r.tuned ? " badge-chip--tuned" : "") +
        (openBadge === b.id ? " badge-chip--open" : "") + '" data-id="' + b.id +
        '" title="' + esc(tip) + '" aria-label="' + esc(tip) + '">' +
        '<span class="badge-chip__glyph">' + b.icon + '</span>' +
        (r.done ? "" : '<span class="badge-chip__bar"><span style="width:' + r.pct + '%"></span></span>') +
      '</button>';
    }).join("");
    if (openBadge) fillBadgeTune(reached.filter(function (r) { return r.badge.id === openBadge; })[0]);
    $("#gamifyBadgeCount").textContent = unlockedIds.length + " of " + BADGES.length;

    // the nearest one still to come, so the row says what to aim at
    var next = reached.filter(function (r) { return !r.done; })
      .sort(function (a, b) { return b.pct - a.pct; })[0];
    $("#gamifyNext").textContent = next
      ? "Closest: " + next.badge.icon + " " + next.name + " — " + Math.min(next.now, next.goal) +
        " of " + next.goal + " " + next.badge.unit
      : "Every badge earned 🎉";

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
    if (!confirm("Restart the 5-month commitment AND every badge from today?\n\nEach badge counts again from zero; the goals you set are kept. Your tasks, goals, milestones and focus blocks are not touched.")) return;
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
    toast("Commitment and badges restarted from today ✓");
    loadGamification();
  });

  /* One badge, opened from its tile. */
  function fillBadgeTune(r) {
    if (!r) { closeBadgeTune(); return; }
    var t = loadBadgeTune()[r.badge.id];
    $("#badgeTuneGlyph").textContent = r.badge.icon;
    $("#badgeTuneName").textContent = r.name + (r.done ? " ✓" : "");
    $("#badgeTuneNow").textContent = Math.min(r.now, r.goal) + " of " + r.goal + " " + r.badge.unit +
      (t && t.since ? " · counting since " + t.since : " · counting all your history");
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
    if (!b || !(n >= 1)) { toast("A goal is a whole number, 1 or more"); return; }
    var tune = loadBadgeTune();
    var t = tune[b.id] || {};
    if (n === b.goal) delete t.goal; else t.goal = n;
    if (Object.keys(t).length) tune[b.id] = t; else delete tune[b.id];
    saveBadgeTune(tune);
    playAddSound();
    toast("Goal set: " + badgeName(b, n) + " ✓");
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
    toast(b.icon + " restarted from today");
    redrawGamify();
  });
  $("#badgeTuneDefault").addEventListener("click", function () {
    var tune = loadBadgeTune();
    delete tune[openBadge];
    saveBadgeTune(tune);
    playAddSound();
    toast("Back to its default goal, counting all your history");
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
    $("#quartersAvgSub").textContent = "daily tasks done · " + plural(st.counted, "quarter");
    $("#quartersGoalsValue").textContent = st.goalsAvg == null ? "—" : st.goalsAvg + "%";
    $("#quartersGoalsSub").textContent = st.goalsAvg == null
      ? "no goals set yet"
      : "of goals reached · " + plural(st.goalsCounted, "quarter");
    $("#quartersDaysValue").textContent = st.trackedDays;
    $("#quartersDaysSub").textContent = "across " + plural(state.quarters.length, "quarter");

    var best = null;
    state.quarters.forEach(function (q) {
      var s = st.byId[q.id];
      if (s && s.tracked && (!best || s.avg > best.s.avg)) best = { q: q, s: s };
    });
    $("#quartersBestValue").textContent = best ? best.s.avg + "%" : "—";
    $("#quartersBestSub").textContent = best ? best.q.name : "no tracked days yet";

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
      var badge = today < q.start_date ? '<span class="badge badge--muted">Upcoming</span>'
        : today > q.end_date ? '<span class="badge badge--muted">Past</span>'
        : '<span class="badge badge--good">Current</span>';
      var s = state.quarterStats && state.quarterStats.byId[q.id];
      return '<div class="quarter-card" data-id="' + q.id + '">' +
        '<div class="quarter-card__top"><span class="quarter-card__name">' + esc(q.name) + '</span>' + badge + '</div>' +
        '<div class="quarter-card__dates">' + fmtDate(q.start_date) + ' – ' + fmtDate(q.end_date) + '</div>' +
        (s ?
          '<div class="quarter-card__avg">' +
            quarterMeasureHtml("Execution", s.tracked ? s.avg : null, "exec") +
            quarterMeasureHtml("Goals", s.goals, "goals") +
            '<div class="quarter-card__foot">' +
              (s.tracked ? s.tracked + ' of ' + s.days + ' days tracked' : 'nothing logged yet') +
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
    sel.innerHTML = '<option value="">— none —</option>' +
      (categories || []).map(function (c) { return '<option value="' + c.id + '">' + esc(c.name) + "</option>"; }).join("");
    if (current) sel.value = current;
  }

  var PACE_LABEL = { ahead: "Ahead", "on-track": "On track", behind: "Behind", "not-started": "Not started" };
  var PACE_CLASS = { ahead: "badge--good", "on-track": "badge--muted", behind: "badge--danger", "not-started": "badge--muted" };
  var PACE_DONUT_COLOR = { ahead: "#1fa876", "on-track": "#60a5fa", behind: "#e2586a", "not-started": "#5f6b7d" };
  // Categorical palette led by the site's blurple accent. Every hue sits at a
  // similar mid lightness so the same swatch reads on the white ground and on
  // the dark one, without a per-theme second palette.
  var CATEGORY_PALETTE = ["#8477d4", "#3aa682", "#c98a2b", "#4f93d1", "#c4649b", "#3fadaf", "#d1704f", "#8b8fa3"];
  var GOAL_STATUS_LABEL = { done: "Completed", "in-progress": "In progress", "not-started": "Not started" };
  var GOAL_STATUS_COLOR = { done: "#1fa876", "in-progress": "#60a5fa", "not-started": "#5f6b7d" };

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
  var TRACK_NAME = { biz: "Business", brand: "Branding", job: "Job", learn: "Learning" };
  var TRACK_COLOR = { biz: "#e0652f", brand: "#15966b", job: "#2a78d6", learn: "#d99a00" };
  var TRACK_WORDS = { biz: /business|biz|startup|company|product|cashflow|sales|client/i, brand: /brand|content|linkedin|youtube|social|writing|audience/i, job: /job|work|career|interview|applications?|cv|resume/i, learn: /learn|study|course|read|book|skill|english/i };
  var PLAN_DEFAULT_HOURS = { biz: 5, brand: 3, job: 2.5, learn: 1.5 };

  function guessTrack(name) {
    for (var i = 0; i < TRACK_KEYS.length; i++) if (TRACK_WORDS[TRACK_KEYS[i]].test(name || "")) return TRACK_KEYS[i];
    return "";
  }

  // hours a day per track and the weekend, from the plan's current phase (its
  // "in series" override if set), else the numbers the plan was born with
  function planRhythm() {
    var ps = state.planState, hours = PLAN_DEFAULT_HOURS, weekend = [5, 6];
    if (ps && ps.hours) {
      var phase = 1, after = { offer: 2, team: 3, passed: 3, left: 4, goal200: 4, goal: 5 };
      Object.keys(after).forEach(function (k) { if (ps.milestones && ps.milestones[k] && ps.milestones[k].done) phase = Math.max(phase, after[k]); });
      var p = "p" + Math.min(phase, 4);
      var sr = ps.series && ps.series[p];
      hours = (sr && sr.hours) || ps.hours[p] || hours;
      if (sr && Array.isArray(sr.weekend)) weekend = sr.weekend;
    }
    return { hours: hours, weekend: weekend };
  }

  // the quarter's working days (ISO), its tracks' stretches, and a due date on every goal in play
  function computeDueDates(data) {
    if (!data) return null;
    var r = planRhythm();
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
    return { days: days, stretches: stretches, weekend: r.weekend, hours: r.hours, perDay: perDay };
  }

  function dueChipHtml(g) {
    if (!g.due) return "";
    var today = todayISO(), cls = "", text = "due " + fmtDayMonth(g.due);
    if (goalPct(g) >= 100) { cls = "goal-row__due--done"; text = "done · was due " + fmtDayMonth(g.due); }
    else if (g.due < today) { cls = "goal-row__due--late"; text = "late · was due " + fmtDayMonth(g.due); }
    else if (addDays(today, 2) >= g.due) cls = "goal-row__due--soon";
    return '<span class="goal-row__due ' + cls + '" title="From the plan: ' + TRACK_NAME[g.dueTrack] + ' days, split equally in the All-goals order">' + text + '</span>';
  }

  function renderQuarterSeries(data, due) {
    var box = $("#quarterSeries");
    if (!data || !due) { box.hidden = true; return; }
    var keys = TRACK_KEYS.filter(function (k) { return due.stretches[k]; });
    if (!due.days.length || !keys.length) { box.hidden = true; return; }
    var anyTrack = data.categories.some(function (c) { return c.trackKey; });
    var dayName = function (d) { return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d]; };
    box.innerHTML = '<span>In series:</span>' + keys.map(function (k) {
      var s = due.stretches[k];
      return '<span class="quarter-series__chip"><i class="quarter-series__dot" style="background:' + TRACK_COLOR[k] + '"></i>' +
        TRACK_NAME[k] + ' ' + fmtDayMonth(s.from) + (s.from === s.to ? '' : ' → ' + fmtDayMonth(s.to)) + '</span>';
    }).join("") +
      '<span class="quarter-series__hint">' + due.days.length + ' working days · weekend ' + (due.weekend.length ? due.weekend.map(dayName).join(", ") : "none") +
      (anyTrack ? '' : ' · set each category\'s track in Edit quarter to get due dates') + '</span>';
    box.hidden = false;
  }

  function goalRowHtml(g, opts) {
    opts = opts || {};
    var pct = goalPct(g);
    return '<div class="goal-row' + (pct >= 100 ? " goal-row--done" : "") + '" data-id="' + g.id + '">' +
      '<div class="goal-row__top">' +
        (opts.draggable || opts.handle ? '<span class="goal-row__handle" title="Drag to reorder">⠿</span>' : '') +
        (opts.categoryName ? '<span class="goal-row__cat-tag">' + esc(opts.categoryName) + '</span>' : '') +
        '<span class="goal-row__title">' + esc(g.title) + '</span>' +
        dueChipHtml(g) +
        '<span class="goal-row__pct">' + pct + '%</span>' +
        (opts.draggable ? '<button type="button" class="iconbtn iconbtn--hide" title="Hide from this view">🙈</button>' : '') +
        '<button type="button" class="iconbtn iconbtn--copy" title="Add to today\'s to-do">📋</button>' +
        '<button type="button" class="iconbtn iconbtn--edit" title="Edit goal">✎</button>' +
        '<button type="button" class="iconbtn iconbtn--delete" title="Delete goal">✕</button>' +
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
          '<button type="button" class="goal-row__tstep" data-tdelta="-1" title="Lower the target" aria-label="Lower the target">−</button>' +
          '<input type="number" min="0" step="any" class="goal-row__target-input" value="' + fmtNum(g.target) + '" aria-label="Target" />' +
          '<button type="button" class="goal-row__tstep" data-tdelta="1" title="Raise the target" aria-label="Raise the target">+</button>' +
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
    form.querySelector("button[type=submit]").textContent = "Update";
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
      if (!(v > 0)) { ev.target.value = fmtNum(g.target); toast("A target has to be more than 0", true); return; }
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
          toast('Added "' + g.title + '" to today\'s to-do ✓');
          if (state.currentDate === today) return afterTaskChange();
        })
        .catch(function (e) { toast(e.message, true); });
    });
    row.querySelector(".iconbtn--edit").addEventListener("click", function () { startEditGoal(category, g); });
    row.querySelector(".iconbtn--delete").addEventListener("click", function () {
      if (!confirm('Delete goal "' + g.title + '"?')) return;
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
          toast(editingId ? "Goal updated ✓" : "Goal added ✓");
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
      label: "Hours logged by category", centerValue: fmtH(totalHoursLogged), centerLabel: "logged",
    });

    var paceCounts = { ahead: 0, "on-track": 0, behind: 0, "not-started": 0 };
    hoursCats.forEach(function (c) { paceCounts[c.progress.pace] = (paceCounts[c.progress.pace] || 0) + 1; });
    var paceSlices = Object.keys(PACE_LABEL).map(function (key) {
      return { label: PACE_LABEL[key], value: paceCounts[key], color: PACE_DONUT_COLOR[key] };
    });
    window.renderDonutChart($("#donutPace"), paceSlices, { label: "Pace breakdown", centerLabel: "categories" });

    if (hoursCats.length) {
      var hoursTitle = document.createElement("div");
      hoursTitle.className = "goals__label";
      hoursTitle.textContent = "Hours pace — logged vs. quarter target";
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
    window.renderDonutChart($("#donutGoalsByCategory"), goalsByCatSlices, { label: "Goals by category", centerLabel: "goals" });

    var allGoalsFlat = data ? data.categories.reduce(function (acc, c) { return acc.concat(c.goals || []); }, []) : [];
    var statusCounts = { done: 0, "in-progress": 0, "not-started": 0 };
    allGoalsFlat.forEach(function (g) {
      var status = goalPct(g) >= 100 ? "done" : (Number(g.current) > 0 ? "in-progress" : "not-started");
      statusCounts[status]++;
    });
    var statusSlices = Object.keys(GOAL_STATUS_LABEL).map(function (key) {
      return { label: GOAL_STATUS_LABEL[key], value: statusCounts[key], color: GOAL_STATUS_COLOR[key] };
    });
    window.renderDonutChart($("#donutGoalsStatus"), statusSlices, { label: "Goals status", centerLabel: "goals" });

    if (goalsCats.length) {
      var goalsTitle = document.createElement("div");
      goalsTitle.className = "goals__label";
      if (hoursCats.length) goalsTitle.style.marginTop = "16px";
      goalsTitle.textContent = "Goals completion";
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
      note.textContent = "🌤 Anti-perfectionist mode is on — targets below already count 75% as done.";
      box.appendChild(note);
    }

    var allGoals = data.categories.reduce(function (acc, c) { return acc.concat(c.goals || []); }, []);
    var quarterPct = combinedGoalsPct(allGoals);
    if (quarterPct != null) {
      quarterBarBox.innerHTML = overallBarHtml(quarterPct, "This quarter — all categories' goals");
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
          '<span class="category-card__handle" title="Drag to reorder categories">⠿</span>' +
          '<span class="category-card__name">' + esc(c.name) + '</span>' +
        (hasHours ? '<span class="badge ' + PACE_CLASS[p.pace] + '">' + PACE_LABEL[p.pace] + '</span>' : '') +
          '<button type="button" class="iconbtn iconbtn--edit category-card__copy" title="Copy to another quarter" aria-label="Copy ' + esc(c.name) + ' to another quarter">⧉</button>' +
        '</div>' +
        (c.trackKey && due && due.stretches[c.trackKey]
          ? '<div class="category-card__track"><i class="quarter-series__dot" style="background:' + TRACK_COLOR[c.trackKey] + '"></i>' +
            TRACK_NAME[c.trackKey] + ' days · ' + fmtDayMonth(due.stretches[c.trackKey].from) + ' → ' + fmtDayMonth(due.stretches[c.trackKey].to) + '</div>'
          : '') +
        (hasHours ?
          '<div class="category-card__stats">' +
            '<div>Weekly target<b>' + fmtH(c.weekly_hours) + '</b></div>' +
            '<div>Quarter target<b>' + fmtH(p.target) + '</b></div>' +
            '<div>Logged<b>' + fmtH(p.actual) + '</b></div>' +
            '<div>Remaining<b>' + fmtH(p.remaining) + '</b></div>' +
          '</div>' +
          '<div class="chart" style="min-height:190px"></div>'
          : '<p class="muted" style="margin:0">No hour target set for this category.</p>') +
        '<div class="goals">' +
          '<div class="goals__label">Goals</div>' +
          (catPct != null ? overallBarHtml(catPct, "Overall", c.id) : '') +
          '<div class="goals__list">' +
            (c.goals || []).map(function (g) { return goalRowHtml(g, { handle: true }); }).join("") +
          '</div>' +
          '<form class="goal-add-form">' +
            '<input name="title" placeholder="Goal (e.g. Job applications)" required />' +
            '<input name="target" type="number" min="0.01" step="any" placeholder="Target" required />' +
            '<input name="unit" placeholder="unit" />' +
            '<button type="submit" class="btn btn--ghost btn--sm">+ Add goal</button>' +
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
      '<span class="idea-row__handle" title="Drag to reorder">⠿</span>' +
      '<div class="idea-row__body"><span class="idea-row__text">' + esc(idea.text) + '</span></div>' +
      '<button type="button" class="iconbtn iconbtn--edit" title="Edit idea">✎</button>' +
      '<button type="button" class="iconbtn" title="Delete idea">✕</button>' +
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
          if (!confirm("Delete this idea?")) return;
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
      '<input name="cat_name" placeholder="Category (e.g. Deep work)" value="' + esc(cat ? cat.name : "") + '" required />' +
      '<input name="cat_hours" type="number" min="0.5" step="0.5" placeholder="h/week (optional)" value="' + hoursVal + '" />' +
      // which of the plan's four tracks it belongs to: its goals' due dates come from that track's stretch
      '<select name="cat_track" title="Track in the plan" aria-label="Track in the plan">' +
        '<option value="">— track —</option>' +
        TRACK_KEYS.map(function (k) { return '<option value="' + k + '"' + (track === k ? ' selected' : '') + '>' + TRACK_NAME[k] + '</option>'; }).join("") +
      '</select>' +
      '<button type="button" class="iconbtn category-row__remove" title="Remove category">✕</button>';
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
    syncLengthPicks();
  });
  ["start_date", "end_date"].forEach(function (n) {
    $("#quarterForm").elements[n].addEventListener("input", syncLengthPicks);
  });

  /* A new cycle can be born as a copy of an earlier one — its categories and
     their goals (owner, 2026-10-16: "duplicate same goals exactly of cycle 7
     part 1"). Editing an existing cycle hides this; it is only about birth. */
  function fillCopyFrom() {
    var select = $("#quarterCopyFrom");
    var keep = select.value;
    select.innerHTML = '<option value="">Nothing — start empty</option>' +
      (state.quarters || []).map(function (q) {
        return '<option value="' + q.id + '">' + esc(q.name) + " · " + fmtDate(q.start_date) + " – " + fmtDate(q.end_date) + "</option>";
      }).join("");
    select.value = keep;
    syncCopyFrom();
  }

  $("#quarterCopyFrom").addEventListener("change", syncCopyFrom);

  function resetQuarterForm() {
    var form = $("#quarterForm");
    form.reset();
    $("#categoryRows").innerHTML = "";
    addCategoryRow();
    state.editingQuarterId = null;
    $("#btnQuarterSubmit").textContent = "Save quarter";
    $("#btnCancelQuarterEdit").hidden = true;
    $("#quarterCopyFromBox").hidden = false;
    $("#quarterCopyFrom").value = "";
    $("#quarterCopyProgress").checked = false;
    fillCopyFrom();
    syncCopyFrom();
    syncLengthPicks();
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
    $("#categoryRows").innerHTML = "";
    (state.quarterDetail.categories || []).forEach(function (c) { addCategoryRow(c); });
    if (!state.quarterDetail.categories.length) addCategoryRow();
    state.editingQuarterId = q.id;
    $("#quarterCopyFromBox").hidden = true;
    $("#quarterCopyFrom").value = "";
    syncCopyFrom();
    syncLengthPicks();
    $("#btnQuarterSubmit").textContent = "Update quarter";
    $("#btnCancelQuarterEdit").hidden = false;
    $("#addQuarterBox").open = true;
    form.scrollIntoView({ behavior: "smooth", block: "center" });
  });

  $("#btnDeleteQuarter").addEventListener("click", function () {
    if (!state.quarterDetail) return;
    var q = state.quarterDetail.quarter;
    if (!confirm('Delete quarter "' + q.name + '"? Its categories will be removed (logged tasks are kept, just uncategorized).')) return;
    api("/api/quarters?id=" + q.id, { method: "DELETE" })
      .then(function () { playDeleteSound(); toast("Quarter deleted"); remember("quarter-id", null); return loadQuarters(); })
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
    $("#copyToggleAll").textContent = checked === boxes.length ? "Select none" : "Select all";
    $("#btnCopySubmit").disabled = !checked;
    $("#btnCopySubmit").textContent = checked ? "Copy " + checked + " categor" + (checked === 1 ? "y" : "ies") : "Copy";
  }

  function openCopyDialog(onlyIds) {
    var data = state.quarterDetail;
    if (!data || !data.categories.length) return;
    var others = (state.quarters || []).filter(function (q) { return q.id !== data.quarter.id; });
    if (!others.length) { toast("Create another quarter first, then copy into it."); return; }

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
        '<span class="muted">' + (n ? n + " goal" + (n === 1 ? "" : "s") : "no goals") + '</span>' +
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
      if (r.categories_added) parts.push(r.categories_added + " categor" + (r.categories_added === 1 ? "y" : "ies"));
      if (r.goals_added) parts.push(r.goals_added + " goal" + (r.goals_added === 1 ? "" : "s"));
      var msg = parts.length ? "Copied " + parts.join(" and ") : "Nothing new to copy";
      if (r.categories_merged) msg += " — " + r.categories_merged + " already there, merged";
      toast(msg + (target ? " into " + target.name : ""));
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
          if (!ids.length) return { r: r, copied: " — that cycle had nothing to copy" };
          return api("/api/quarters?copy_categories=1", {
            method: "POST",
            body: { to_quarter_id: newId, category_ids: ids, keep_progress: keepProgress, log_date: todayISO() },
          }).then(function (c) {
            return { r: r, copied: " with " + c.categories_added + " categor" + (c.categories_added === 1 ? "y" : "ies") +
              (c.goals_added ? " and " + c.goals_added + " goal" + (c.goals_added === 1 ? "" : "s") : "") +
              " from " + src.quarter.name };
          });
        });
      })
      .then(function (done) {
        var r = done.r;
        toast(editingId ? "Quarter updated ✓" : "Quarter created" + done.copied + " ✓");
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
        img.onerror = function () { reject(new Error("Could not read that image")); };
        img.src = e.target.result;
      };
      reader.onerror = function () { reject(new Error("Could not read that file")); };
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
      $("#daysAvgSub").textContent = "0 days tracked";
      $("#daysGoalsValue").textContent = "—";
      state.daysData = null;
      $("#focusRange").hidden = true;
      return Promise.resolve();
    }
    $("#noDaysQuarter").hidden = true;
    var picker = $("#daysQuarterPicker");
    picker.innerHTML = (quarters.length > 1 ? '<option value="all">All quarters</option>' : "") +
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
        (now ? '<span class="cycle-pick__now">Now</span>' : "") + "</button>";
    };
    var span = allQuartersSpan();
    box.innerHTML = chip("all", "All quarters", plural(quarters.length, "quarter") + " · " + fmtDate(span.from) + " – " + fmtDate(span.to), "🗂", false) +
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
    $("#daysAvgSub").textContent = countedDays + " of " + totalDays + " days tracked";

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
        ? "no goals yet"
        : "averaged over " + plural(pcts.length, "quarter");
    } else {
      // the goals tile reads the live goals, not the log, so it always matches the
      // bar inside the quarter even on a day the log hasn't caught up with
      var allGoals = (state.quarterDetail && state.quarterDetail.categories || [])
        .reduce(function (acc, c) { return acc.concat(c.goals || []); }, []);
      var goalsNow = combinedGoalsPct(allGoals);
      $("#daysGoalsValue").textContent = goalsNow == null ? "—" : goalsNow + "%";
      $("#daysGoalsSub").textContent = goalsNow == null
        ? "no goals in this quarter"
        : "of " + plural(allGoals.length, "goal") + ", target-weighted";
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
        segs.push({ label: "Between quarters", from: cursor, to: addDays(qf, -1) });
      }
      segs.push({ label: q.name + " · " + fmtDate(qf) + " – " + fmtDate(qt), from: qf, to: qt });
      cursor = addDays(qt, 1);
    });
    if (cursor <= to && hasData(cursor, to)) segs.push({ label: "Between quarters", from: cursor, to: to });
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
    var word = when === "today" ? "Add photo" : when === "past" ? "No photo" : "Not yet";
    return '<span class="day-empty day-empty--' + when + '">' + SUMMIT +
      '<span class="day-empty__word">' + word + "</span>" +
      (when === "future" ? "" : '<span class="day-empty__add">+ Add a photo</span>') + "</span>";
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
        mark.textContent = "estimated";
        mark.title = "These tasks were written in afterwards, not tracked on the day";
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
      meta.title = "Open " + fmtDate(d) + "'s to-do list";
      meta.innerHTML = "<span>" + fmtDayMonth(d) + "</span><b>" + (pct == null ? "—" : pct + "%") + "</b>";
      meta.addEventListener("click", function (dd) { return function () { openDayDetail(dd); }; }(d));
      tile.appendChild(meta);

      if (photo) {
        var removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "day-tile__remove";
        removeBtn.title = "Remove photo";
        removeBtn.textContent = "✕";
        tile.appendChild(removeBtn);
        removeBtn.addEventListener("click", function (dd) {
          return function (ev) {
            ev.preventDefault();
            if (!confirm("Remove this day's photo?")) return;
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
            .then(function () { playAddSound(); toast("Photo saved ✓"); return loadDaysGallery({ animate: false }); })
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

  function plural(n, word) { return n + " " + word + (n === 1 ? "" : "s"); }

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

    $("#focusWeekLabel").textContent = fmtDayMonth(f.from) + " → " + fmtDayMonth(f.to);
    $("#btnFocusPrevWeek").disabled = f.from <= data.from;
    $("#btnFocusNextWeek").disabled = f.to >= data.to;
    // the "all" chip covers the whole quarter, or everything, depending on scope
    $('#focusRange .chip[data-focus-preset="all"]').textContent = spanAll ? "Every quarter" : "Whole quarter";
    $("#btnDaysChartAll").textContent = spanAll ? "↩ Every quarter" : "↩ Whole quarter";
    document.querySelectorAll("#focusRange .chip").forEach(function (c) {
      c.classList.toggle("chip--on", c.dataset.focusPreset === f.preset);
      // "this week" and friends are anchored on today — meaningless for a quarter
      // that hasn't started or is already over; the arrows still browse any week
      c.disabled = !todayInQuarter && c.dataset.focusPreset !== "all";
    });

    var s = focusStats(f.from, f.to);

    $("#focusAvgValue").textContent = s.avg + "%";
    $("#focusAvgSub").textContent = s.tracked + " of " + plural(s.spanned, "day") + " tracked";
    $("#focusTasksValue").textContent = s.done + "/" + s.planned;
    $("#focusTasksSub").textContent = "across " + plural(s.tracked, "tracked day");

    $("#focusBestValue").textContent = s.best ? s.best.pct + "%" : "—";
    $("#focusBestSub").textContent = s.best
      ? fmtDate(s.best.date) + (s.worst && s.worst.date !== s.best.date ? " · worst " + s.worst.pct + "% " + fmtDayMonth(s.worst.date) : "")
      : "no days tracked in this range";

    $("#focusRangeNote").textContent = s.tracked
      ? fmtDate(f.from) + " → " + fmtDate(f.to) + ": averaging " + s.avg + "%, against " + data.avg + "% " +
        (spanAll ? "across every quarter." : "for the quarter.")
      : "No tasks logged between " + fmtDate(f.from) + " and " + fmtDate(f.to) + ".";

    // picking a week zooms the graph to that week — the quarter's average still
    // rides along as a faint line, so the slice never reads without its context
    var slice = data.days.filter(function (dd) { return dd.date >= f.from && dd.date <= f.to; });
    var zoomed = slice.length > 0 && slice.length < data.days.length;

    $("#daysChartRange").innerHTML = zoomed
      ? "Showing <b>" + esc(fmtDate(f.from)) + " → " + esc(fmtDate(f.to)) + "</b> · " + plural(slice.length, "day")
      : (spanAll ? "Showing every quarter · " : "Showing the whole quarter · ") + plural(data.days.length, "day");
    $("#btnDaysChartAll").hidden = !zoomed;

    if (opts.tiles !== false) {
      renderDayTiles(f.from, f.to, opts.animateTiles !== false);
      $("#dayGalleryHint").textContent = zoomed
        ? "Showing " + plural(slice.length, "day") + " — tap a day's percentage to open its to-do list."
        : "Tap a day's percentage to open its to-do list.";
    }

    window.renderDaysChart($("#daysChart"), $("#daysChartTip"), zoomed ? slice : data.days, {
      avg: data.avg,
      goalsByDate: data.goalsByDate,
      goalsEstimatedByDate: data.goalsEstimatedByDate,
      avgLabel: zoomed ? (spanAll ? "All time" : "Quarter") : "Avg",
      // where each quarter begins, so a year-long line can be read quarter by quarter
      dividers: spanAll ? (state.quarters || []).map(function (q) {
        return { date: String(q.start_date).slice(0, 10), label: q.name };
      }) : null,
      // unzoomed, the range average would sit exactly on the quarter's line
      focus: zoomed ? { avg: s.tracked ? s.avg : null, label: "This range" } : null,
      ariaLabel: zoomed
        ? "Daily completion from " + fmtDate(f.from) + " to " + fmtDate(f.to)
        : (spanAll ? "Daily completion across every quarter" : "Daily completion across the quarter"),
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
    $("#dayPhotoMenuUpload").textContent = photoUrl ? "🔁 Replace photo" : "📤 Upload photo";
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
      box.textContent = !list.length ? "Write at least one task." : "Pick a first and last day.";
      $("#fillGo").disabled = true;
      return;
    }
    $("#fillGo").disabled = false;
    box.textContent = days.length + " day" + (days.length === 1 ? "" : "s") + " × " + list.length +
      " task" + (list.length === 1 ? "" : "s") + ", " + ticked + " of them ticked — only the empty days get them.";
  }

  function openFillDays() {
    var q = state.quarterDetail && state.quarterDetail.quarter;
    var saved = null;
    try { saved = localStorage.getItem(ROUTINE_KEY); } catch (e) { /* no storage */ }
    $("#fillList").value = saved || DEFAULT_ROUTINE;
    $("#fillFrom").value = q ? String(q.start_date).slice(0, 10) : addDays(todayISO(), -27);
    // never the days still to come unless you ask for them
    $("#fillTo").value = todayISO();
    $("#fillGo").textContent = "Fill the days";
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
    if (!from || !to || from > to) { toast("Pick a first and last day", true); return; }
    var was = btn.textContent;
    btn.disabled = true;
    btn.textContent = estimated ? "Marking…" : "Removing…";
    api("/api/tasks?estimate=1", { method: "PATCH", body: { from: from, to: to, estimated: estimated } })
      .then(function (r) {
        if (!r.days) { toast(estimated ? "Those days already say estimated" : "No label to remove in those days"); return null; }
        closeFillDays();
        playAddSound();
        toast(r.days + " day" + (r.days === 1 ? "" : "s") +
          (estimated ? " now say estimated ✓" : " no longer say estimated ✓"));
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
        if (!empty.length) { toast("Every day in that stretch already has tasks"); return null; }
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
                btn.textContent = "Writing… " + Math.round((made / total) * 100) + "%";
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
        toast(filled + " day" + (filled === 1 ? "" : "s") + " filled ✓");
        return loadDaysGallery({ animate: false });
      })
      .catch(function (e) { toast(e.message, true); })
      .finally(function () { btn.disabled = false; btn.textContent = "Fill the days"; });
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
  function fmtMins(m) { var h = Math.floor(m / 60), r = m % 60; return (h ? h + "h " : "") + (r || !h ? r + "m" : "").trim(); }
  // the postures, in the order he asked for; after the third it starts again
  var POMO_MODES = [
    { glyph: "🪑", name: "Sitting" },
    { glyph: "🧍", name: "Standing" },
    { glyph: "🚶", name: "Walking (treadmill)" },
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
    return "Resets in " + (h ? h + "h " : "") + m + "m · Cairo";
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
      ? (target === 10 ? "Ten" : target) + " done — that is the day's work 🎉"
      : done === 0 ? (target === 10 ? "Ten" : target) + " blocks waiting. Press ▶ on the first one."
        : (target - done) + " to go. " + pomoMode(done + 1).glyph + " " + pomoMode(done + 1).name + " is next.";
    var mins = 0;
    Object.keys(pomo.done).forEach(function (s) { mins += Number(pomo.done[s].minutes) || 0; });
    // what the hours become: the blocks, the focus in them, and the clock time with the breaks
    var focusMin = target * r.work, withBreaks = focusMin;
    for (var b = 1; b < target; b++) withBreaks += pomoBreakAfter(b);
    $("#pomoMinutes").textContent = (pomo.hours ? pomo.hours + "h → " : "") + target + " × " + r.work + " min = " + fmtMins(focusMin) + " of focus, " + fmtMins(withBreaks) + " with the breaks" +
      (mins ? " · " + fmtMins(mins) + " logged today" : "");

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
          'aria-label="' + (isDone ? "Undo block " : "Tick off block ") + slot + '">' + (isDone ? "✓" : "") + '</button>' +
        '<span class="pomo-row__n">' + slot + '</span>' +
        '<span class="pomo-row__mode"><span class="pomo-row__glyph">' + mode.glyph + '</span>' + esc(mode.name) + '</span>' +
        '<span class="pomo-row__len">' + (pomo.done[slot] && pomo.done[slot].minutes ? pomo.done[slot].minutes : POMO_MINUTES) + ' min</span>' +
        '<button type="button" class="btn btn--ghost btn--sm pomo-row__go">' +
          (isRunning ? "Running…" : isDone ? "Again" : "▶ Start") + '</button>';
      list.appendChild(row);
      // the break that follows: 5 minutes, or 15 after every fourth block
      if (slot < total) {
        var br = pomoBreakAfter(slot), gap = document.createElement("div");
        gap.className = "pomo-break" + (br >= pomoRhythm().long ? " pomo-break--long" : "") + (isDone ? " pomo-break--done" : "");
        gap.textContent = (br >= pomoRhythm().long ? "🛋 " : "☕ ") + br + " min break";
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
      cell.title = fmtDate(d) + " — " + n + " of " + pomoTarget();
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
    $("#pomoRunMode").textContent = "Block " + pomo.run.slot + " · " + mode.glyph + " " + mode.name;
    $("#pomoRunClock").textContent = clock;
    $("#pomoRunFill").style.width = (100 - Math.min(100, (ms / (pomo.run.minutes * 60000)) * 100)) + "%";
    $("#pomoPause").textContent = pomo.run.left != null ? "Resume" : "Pause";
    document.title = clock + " · " + mode.name + " — " + pomoTitleBase;
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
      toast(done >= pomoTarget() ? "Ten blocks done today 🎉" : "Block " + run.slot + " done — " + (pomoTarget() - done) + " to go");
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
        if (!confirm("Block " + pomo.run.slot + " is still running. Start block " + slot + " instead?")) return;
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
