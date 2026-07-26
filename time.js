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

  /* ---------------- theme (light/dark, persisted; set pre-paint in <head>) ---------------- */

  function currentTheme() {
    return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    var btn = $("#btnTheme");
    if (btn) btn.textContent = theme === "light" ? "☀️" : "🌙";
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", theme === "light" ? "#eef1f7" : "#0b0e14");
    try { localStorage.setItem("time-theme", theme); } catch (e) {}
  }

  applyTheme(currentTheme()); // sync the toggle icon to whatever the pre-paint script already set

  $("#btnTheme").addEventListener("click", function () {
    var btn = this;
    applyTheme(currentTheme() === "light" ? "dark" : "light");
    // reduceMotion is assigned further down but hoisted, and this only runs on a later click
    if (!reduceMotion) {
      btn.classList.remove("theme-toggle--spin");
      void btn.offsetWidth; // restart the animation on repeat clicks
      btn.classList.add("theme-toggle--spin");
    }
    // charts read CSS custom properties at render time — redraw with the new theme's colors
    if (state.quarterDetail) renderQuarter(state.quarterDetail);
  });

  /* ---------------- tabs: Today / Quarter / Analytics ---------------- */

  function showTab(name) {
    document.querySelectorAll("#tabbar .tab").forEach(function (btn) {
      btn.classList.toggle("tab--active", btn.dataset.tab === name);
    });
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
    if (btn.dataset.tab === "days") loadDaysGallery();
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
        ["cdDays", "cdHours", "cdMinutes", "cdSeconds"].forEach(function (id) { $("#" + id).textContent = "00"; });
        lastCountdownText = "ended";
      }
      return;
    }

    box.classList.remove("countdown--ended");
    var target = now < start ? start : end;
    $("#countdownLabel").textContent = now < start ? "Starts in" : "Time left in this quarter";

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
     Double the target every fixed 5-month checkpoint counted forward from
     today — a constant, explicit growth-rate assumption, independent of
     the age-target date above (that's a separate personal deadline; this
     ladder is its own pace tracker). */

  var MILESTONE_HALVINGS = 9;
  var MILESTONE_TARGET = 500000;
  var MILESTONE_MONTHS_PER_DOUBLING = 5;

  function buildMilestones() {
    var values = [MILESTONE_TARGET];
    for (var i = 0; i < MILESTONE_HALVINGS; i++) values.unshift(values[0] / 2);

    var today = new Date(); today.setHours(0, 0, 0, 0);

    return values.map(function (val, idx) {
      var monthsOut = (idx + 1) * MILESTONE_MONTHS_PER_DOUBLING;
      return { value: val, date: new Date(today.getFullYear(), today.getMonth() + monthsOut, today.getDate()) };
    });
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
    label.textContent = "💰 Time left to hit $" + fmtMoney(next.value);
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

  function renderMilestones() {
    var list = $("#milestoneList");
    if (!list) return;
    var milestones = buildMilestones();
    var checked = loadMilestoneChecks();
    var nextIdx = milestones.findIndex(function (_, i) { return !checked[i]; });

    list.innerHTML = milestones.map(function (m, i) {
      var isChecked = !!checked[i];
      var isNext = i === nextIdx;
      var cls = "milestone-row" + (isChecked ? " milestone-row--done" : "") + (isNext ? " milestone-row--next" : "");
      var prevVal = i === 0 ? 0 : milestones[i - 1].value;
      var dateLabel = m.date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
      return '<div class="' + cls + '" data-idx="' + i + '">' +
        '<input type="checkbox" class="task-row__check milestone-row__check"' + (isChecked ? " checked" : "") + ' aria-label="Mark $' + fmtMoney(m.value) + ' reached" />' +
        '<span class="milestone-row__body">' +
          '<span class="milestone-row__top">' +
            '<span class="milestone-row__amount">$' + fmtMoney(m.value) + '</span>' +
            '<span class="milestone-row__delta">+$' + fmtMoney(m.value - prevVal) + ' to add</span>' +
          '</span>' +
          '<span class="milestone-row__date">pace: by ' + dateLabel + '</span>' +
        '</span></div>';
    }).join("");

    list.querySelectorAll(".milestone-row__check").forEach(function (box) {
      box.addEventListener("change", function () {
        var idx = Number(box.closest(".milestone-row").dataset.idx);
        var checks = loadMilestoneChecks();
        checks[idx] = box.checked;
        saveMilestoneChecks(checks);
        if (box.checked) { idx === milestones.length - 1 ? playSuccessSound() : playCheckSound(); }
        renderMilestones();
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
      row.innerHTML =
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
      row.querySelector(".iconbtn--edit").addEventListener("click", function () { startEditTask(t); });
      row.querySelector(".iconbtn:not(.iconbtn--edit)").addEventListener("click", function () {
        if (!confirm('Delete task "' + t.title + '"?')) return;
        api("/api/tasks?id=" + t.id, { method: "DELETE" })
          .then(function () { playDeleteSound(); if (state.editingTaskId === t.id) stopEditTask(); return afterTaskChange(); })
          .catch(function (e) { toast(e.message, true); });
      });
      list.appendChild(row);
    });
  }

  // a task's done/actual-hours change can move the daily % and a category's
  // quarterly progress, so refresh the day, the 14-day strip, and the chart together
  function afterTaskChange() {
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
      var ids = Array.prototype.slice.call(opts.listEl.children).map(function (el) { return Number(el.dataset.id); });
      state = null;
      api(opts.apiUrl, { method: "PATCH", body: { ids: ids } }).catch(opts.onError);
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

  function burstConfetti() {
    var colors = ["#60a5fa", "#a78bfa", "#34d399", "#f59e0b", "#f472b6"];
    for (var i = 0; i < 18; i++) {
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

  /* ---------------- quarterly goals ---------------- */

  function loadQuarters() {
    return api("/api/quarters").then(function (data) {
      state.quarters = data.quarters || [];
      var sel = $("#quarterSelect");
      sel.innerHTML = state.quarters.map(function (q) {
        return '<option value="' + q.id + '">' + esc(q.name) + " (" + fmtDate(q.start_date) + "–" + fmtDate(q.end_date) + ")</option>";
      }).join("");

      if (!state.quarters.length) {
        state.selectedQuarterId = null;
        state.quarterDetail = null;
        renderCategorySelect([]);
        renderQuarter(null);
        updateCountdown();
        return;
      }
      var today = todayISO();
      var pick = state.quarters.filter(function (q) { return q.start_date <= today && today <= q.end_date; })[0]
        || state.quarters[0];
      state.selectedQuarterId = pick.id;
      sel.value = pick.id;
      return loadQuarterDetail(pick.id);
    }).catch(function (e) { toast(e.message, true); });
  }

  $("#quarterSelect").addEventListener("change", function () {
    state.selectedQuarterId = Number(this.value);
    loadQuarterDetail(state.selectedQuarterId);
  });

  function loadQuarterDetail(id) {
    return api("/api/quarters?id=" + id).then(function (data) {
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
  var CATEGORY_PALETTE = ["#60a5fa", "#34d399", "#f59e0b", "#a78bfa", "#f472b6", "#22d3ee", "#fb923c", "#94a3b8"];
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

  function goalRowHtml(g, opts) {
    opts = opts || {};
    var pct = goalPct(g);
    return '<div class="goal-row" data-id="' + g.id + '">' +
      '<div class="goal-row__top">' +
        (opts.draggable ? '<span class="goal-row__handle" title="Drag to reorder">⠿</span>' : '') +
        (opts.categoryName ? '<span class="goal-row__cat-tag">' + esc(opts.categoryName) + '</span>' : '') +
        '<span class="goal-row__title">' + esc(g.title) + '</span>' +
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
        ' / <b>' + fmtNum(g.target) + '</b>' + (g.unit ? ' ' + esc(g.unit) : '') +
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
  function updateAllGoalRowInstances(goalId, current, target) {
    document.querySelectorAll('.goal-row[data-id="' + goalId + '"]').forEach(function (row) {
      updateGoalRowUI(row, current, target);
    });
  }

  function stepGoal(goal, delta, category) {
    var target = Number(goal.target) || 0;
    var wasDone = goalPct(goal) >= 100;
    var v = Math.max(0, (Number(goal.current) || 0) + delta);
    goal.current = v; // keep in sync so another quick tap steps from the right base
    updateAllGoalRowInstances(goal.id, v, target);
    refreshOverallBars(category);
    if (!wasDone && target > 0 && v >= target) playSuccessSound();
    api("/api/goals?id=" + goal.id, { method: "PATCH", body: { current: v } })
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
    row.querySelector(".goal-row__current").addEventListener("change", function (ev) {
      var v = ev.target.value === "" ? 0 : Number(ev.target.value);
      var wasDone = goalPct(g) >= 100;
      var nowDone = Number(g.target) > 0 && v >= Number(g.target);
      api("/api/goals?id=" + g.id, { method: "PATCH", body: { current: v } })
        .then(function () {
          if (!wasDone && nowDone) playSuccessSound();
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

  function renderQuarter(data) {
    $("#noQuarters").hidden = state.quarters.length > 0;
    $("#quarterSelect").hidden = state.quarters.length === 0;
    $("#quarterActions").hidden = !data;
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
      note.className = "muted";
      note.style.marginBottom = "4px";
      note.textContent = "Anti-perfectionist mode is on — targets below already count 75% as done.";
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
      card.innerHTML =
        '<div class="category-card__head"><span class="category-card__name">' + esc(c.name) + '</span>' +
        (hasHours ? '<span class="badge ' + PACE_CLASS[p.pace] + '">' + PACE_LABEL[p.pace] + '</span>' : '') +
        '</div>' +
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
          (c.goals || []).map(function (g) { return goalRowHtml(g); }).join("") +
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
      wrap.innerHTML = goalRowHtml(g, { categoryName: cat ? cat.name : "", draggable: true });
      var row = wrap.firstChild;
      row.hidden = !!g.hidden;
      flatBox.appendChild(row);
      if (cat) wireGoalRow(row, g, cat);
      row.querySelector(".iconbtn--hide").addEventListener("click", function () {
        api("/api/goals?id=" + g.id, { method: "PATCH", body: { hidden: true } })
          .then(function () {
            g.hidden = true;
            row.hidden = true;
            updateGoalsHiddenBanner();
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
        document.querySelectorAll("#goalsFlatList .goal-row[hidden]").forEach(function (row) { row.hidden = false; });
        updateGoalsHiddenBanner();
      })
      .catch(function (e) { toast(e.message, true); });
  });

  makeReorderable({
    listEl: $("#goalsFlatList"),
    rowSelector: ".goal-row",
    handleSelector: ".goal-row__handle",
    draggingClass: "goal-row--dragging",
    apiUrl: "/api/goals?reorder=1",
    onError: function (e) { toast(e.message, true); loadQuarterDetail(state.selectedQuarterId); },
  });

  $("#btnAddCategoryRow").addEventListener("click", function () { addCategoryRow(); });

  function addCategoryRow(cat) {
    var row = document.createElement("div");
    row.className = "category-row";
    if (cat && cat.id) row.dataset.id = cat.id;
    var hoursVal = cat && cat.weekly_hours != null ? Number(cat.weekly_hours) : "";
    row.innerHTML =
      '<input name="cat_name" placeholder="Category (e.g. Deep work)" value="' + esc(cat ? cat.name : "") + '" required />' +
      '<input name="cat_hours" type="number" min="0.5" step="0.5" placeholder="h/week (optional)" value="' + hoursVal + '" />' +
      '<button type="button" class="iconbtn category-row__remove" title="Remove category">✕</button>';
    row.querySelector(".category-row__remove").addEventListener("click", function () { row.remove(); });
    $("#categoryRows").appendChild(row);
  }

  function resetQuarterForm() {
    var form = $("#quarterForm");
    form.reset();
    $("#categoryRows").innerHTML = "";
    addCategoryRow();
    state.editingQuarterId = null;
    $("#btnQuarterSubmit").textContent = "Save quarter";
    $("#btnCancelQuarterEdit").hidden = true;
  }

  $("#btnCancelQuarterEdit").addEventListener("click", function () {
    resetQuarterForm();
    $("#addQuarterBox").open = false;
  });

  $("#btnEditQuarter").addEventListener("click", function () {
    if (!state.quarterDetail) return;
    var q = state.quarterDetail.quarter;
    var form = $("#quarterForm");
    form.elements.name.value = q.name;
    form.elements.start_date.value = String(q.start_date).slice(0, 10);
    form.elements.end_date.value = String(q.end_date).slice(0, 10);
    form.elements.anti_perfectionist.checked = !!q.anti_perfectionist;
    $("#categoryRows").innerHTML = "";
    (state.quarterDetail.categories || []).forEach(function (c) { addCategoryRow(c); });
    if (!state.quarterDetail.categories.length) addCategoryRow();
    state.editingQuarterId = q.id;
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
      .then(function () { playDeleteSound(); toast("Quarter deleted"); return loadQuarters(); })
      .then(function () { return loadDay(state.currentDate); })
      .catch(function (e) { toast(e.message, true); });
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
      };
    }).filter(function (c) { return c.name; });
    var body = {
      name: b.name, start_date: b.start_date, end_date: b.end_date,
      anti_perfectionist: form.elements.anti_perfectionist.checked,
      categories: categories,
    };

    busy(btn, true);
    var editingId = state.editingQuarterId;
    (editingId ? api("/api/quarters?id=" + editingId, { method: "PATCH", body: body })
               : api("/api/quarters", { method: "POST", body: body }))
      .then(function (r) {
        toast(editingId ? "Quarter updated ✓" : "Quarter created ✓");
        if (!editingId) playAddSound();
        resetQuarterForm();
        $("#addQuarterBox").open = false;
        return loadQuarters().then(function () {
          var newId = editingId || (r.quarter && r.quarter.id);
          if (newId) {
            state.selectedQuarterId = newId;
            $("#quarterSelect").value = newId;
            return loadQuarterDetail(newId);
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

  function loadDaysGallery(opts) {
    var quarter = state.quarterDetail && state.quarterDetail.quarter;
    if (!quarter) {
      $("#dayGallery").innerHTML = "";
      $("#noDaysQuarter").hidden = false;
      $("#daysQuarterLabel").textContent = "";
      $("#daysAvgValue").textContent = "0%";
      $("#daysAvgSub").textContent = "0 days tracked";
      return Promise.resolve();
    }
    $("#noDaysQuarter").hidden = true;
    $("#daysQuarterLabel").textContent = quarter.name + " (" + fmtDate(quarter.start_date) + "–" + fmtDate(quarter.end_date) + ")";

    var from = String(quarter.start_date).slice(0, 10);
    var to = String(quarter.end_date).slice(0, 10);
    return Promise.all([
      api("/api/tasks?stats=1&from=" + from + "&to=" + to),
      api("/api/day-photos?from=" + from + "&to=" + to),
    ]).then(function (results) {
      renderDaysGallery(from, to, results[0].stats, results[1].photos, opts);
    }).catch(function (e) { toast(e.message, true); });
  }

  function renderDaysGallery(from, to, stats, photos, opts) {
    opts = opts || {};
    var animate = opts.animate !== false;
    var statsByDate = {};
    (stats || []).forEach(function (s) { statsByDate[s.date] = s; });
    var photosByDate = {};
    (photos || []).forEach(function (p) { photosByDate[p.task_date] = p.photo_data; });

    var box = $("#dayGallery");
    box.innerHTML = "";
    var today = todayISO();
    var sumPct = 0, countedDays = 0, totalDays = 0;
    var chartDays = [];
    var d = from;
    while (d <= to) {
      totalDays++;
      var s = statsByDate[d];
      var pct = s && s.total ? Math.round((s.done / s.total) * 100) : null;
      if (pct != null) { sumPct += pct; countedDays++; }
      chartDays.push({ date: d, pct: pct || 0, done: s ? s.done : 0, total: s ? s.total : 0 });
      var photo = photosByDate[d];

      var tile = document.createElement("div");
      tile.className = "day-tile" + (d === today ? " day-tile--today" : "") + (animate ? " day-tile--enter" : "");

      var photoLabel = document.createElement("label");
      photoLabel.className = "day-tile__photo";
      if (photo) photoLabel.style.backgroundImage = "url(" + photo + ")";
      else photoLabel.textContent = "📷";
      var fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.accept = "image/*";
      photoLabel.appendChild(fileInput);
      tile.appendChild(photoLabel);

      var bar = document.createElement("div");
      bar.className = "day-tile__bar";
      bar.innerHTML = '<div class="day-tile__fill' + (pct != null && pct >= 100 ? " day-tile__fill--done" : "") +
        '" style="width:' + (pct || 0) + '%"></div>';
      tile.appendChild(bar);

      var meta = document.createElement("div");
      meta.className = "day-tile__meta";
      meta.title = "Open " + fmtDate(d) + "'s to-do list";
      meta.innerHTML = "<span>" + fmtDate(d) + "</span><b>" + (pct == null ? "—" : pct + "%") + "</b>";
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
            api("/api/day-photos?date=" + dd, { method: "DELETE" })
              .then(function () { playDeleteSound(); return loadDaysGallery({ animate: false }); })
              .catch(function (e) { toast(e.message, true); });
          };
        }(d));
      }

      fileInput.addEventListener("change", function (dd) {
        return function () {
          var file = this.files[0];
          if (!file) return;
          resizeImageFile(file, 480, 0.75)
            .then(function (dataUrl) { return api("/api/day-photos", { method: "POST", body: { date: dd, photo_data: dataUrl } }); })
            .then(function () { playAddSound(); toast("Photo saved ✓"); return loadDaysGallery({ animate: false }); })
            .catch(function (e) { toast(e.message, true); });
        };
      }(d));

      box.appendChild(tile);
      d = addDays(d, 1);
    }

    var avg = countedDays ? Math.round(sumPct / countedDays) : 0;
    $("#daysAvgValue").textContent = avg + "%";
    $("#daysAvgSub").textContent = countedDays + " of " + totalDays + " days tracked";
    window.renderDaysChart($("#daysChart"), $("#daysChartTip"), chartDays, { avg: avg });
  }

  // tapping a day tile's percentage jumps to the Today tab loaded on that date
  function openDayDetail(date) {
    return loadDay(date).then(function () { showTab("today"); });
  }

  /* ---------------- resize: redraw progress charts ---------------- */

  var resizeTimer;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      if (state.quarterDetail && !$("#view-app").hidden) renderQuarter(state.quarterDetail);
    }, 150);
  });

  /* ---------------- go ---------------- */
  boot();
})();
