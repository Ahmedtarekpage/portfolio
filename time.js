/* Time-tracking page logic: passkey auth (shared with /admin), a tabbed app
   (Home / Elmktb / Analytics) built around an auto-computed Year > Virtual-Year
   > Cycle > Quarter schedule (see api/_lib/cycle.js). Home is a gallery of
   tiles — Today + one per category — tap a tile to drill into its detail. */
(function () {
  "use strict";

  var $ = function (sel) { return document.querySelector(sel); };
  var state = {
    currentDate: todayISO(),
    activeTab: "home",
    dayStats: { pct: 0, done: 0, total: 0 },
    categories: [],
    todayInfo: null,
    cycles: [],
    currentCycleKey: null,      // the actual current cycle — gallery tiles always reflect this
    galleryCycleDetail: null,   // current-cycle data, for gallery tile stats
    selectedCategoryId: null,   // which category's detail is open (Home)
    selectedCycleKey: null,     // cycle being browsed inside an open category detail
    cycleDetail: null,
    analyticsCycleKey: null,
    analyticsDetail: null,
    elmktbDetail: null,
    editingTaskId: null,
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

  var toastTimer;
  function toast(msg, isError) {
    var t = $("#toast");
    t.textContent = msg;
    t.className = "toast" + (isError ? " toast--error" : "");
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 3500);
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
    if (state.cycleDetail) renderCategoryDetail(state.cycleDetail);
    if (state.analyticsDetail) renderAnalytics(state.analyticsDetail);
  });

  /* ---------------- tabs ---------------- */

  function showTab(name) {
    state.activeTab = name;
    document.querySelectorAll("#tabbar .tab").forEach(function (btn) {
      btn.classList.toggle("tab--active", btn.dataset.tab === name);
    });
    document.querySelectorAll(".tabpanel").forEach(function (panel) {
      panel.hidden = panel.dataset.tabpanel !== name;
    });
    if (name === "home") openGallery();
    if (name === "elmktb") loadElmktb();
    if (name === "analytics") loadAnalyticsDetail(state.analyticsCycleKey);
  }

  $("#tabbar").addEventListener("click", function (ev) {
    var btn = ev.target.closest(".tab");
    if (btn) showTab(btn.dataset.tab);
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
    Promise.all([loadCategories(), loadCyclePicker(), loadDay(state.currentDate), loadHistory()])
      .then(function () { return loadGalleryCycleDetail(); })
      .then(function () { openGallery(); show("view-app"); })
      .catch(function (e) { toast(e.message, true); show("view-app"); });
  }

  /* ---------------- today: to-do list ---------------- */

  $("#dayPicker").addEventListener("change", function () { loadDay(this.value || todayISO()); });
  $("#btnPrevDay").addEventListener("click", function () { loadDay(addDays(state.currentDate, -1)); });
  $("#btnNextDay").addEventListener("click", function () { loadDay(addDays(state.currentDate, 1)); });
  $("#btnToday").addEventListener("click", function () { loadDay(todayISO()); });

  function loadDay(date) {
    if (date !== state.currentDate && state.editingTaskId) stopEditTask();
    state.currentDate = date;
    $("#dayPicker").value = date;
    return api("/api/tasks?date=" + date).then(function (data) {
      renderTasks(data.tasks);
    }).catch(function (e) { toast(e.message, true); });
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

  function renderTasks(tasks) {
    var total = tasks.length;
    var done = tasks.filter(function (t) { return t.done; }).length;
    var pct = total ? Math.round((done / total) * 100) : 0;
    state.dayStats = { pct: pct, done: done, total: total };
    animateCount($("#dayPercent"), pct, "%");
    $("#dayCount").textContent = done + " of " + total + " task" + (total === 1 ? "" : "s");
    if (!$("#homeGallery").hidden) renderGallery();

    var list = $("#taskList");
    list.innerHTML = "";
    $("#tasksEmpty").hidden = total > 0;
    tasks.forEach(function (t) {
      var row = document.createElement("div");
      row.className = "task-row" + (t.done ? " task-row--done" : "");
      row.dataset.id = t.id;
      var meta = [];
      if (t.category_name) meta.push(esc(t.category_name));
      if (t.planned_hours != null) meta.push(fmtH(t.planned_hours) + " planned");
      row.innerHTML =
        '<span class="task-row__handle" draggable="true" title="Drag to reorder">⠿</span>' +
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
          .then(function () { if (state.editingTaskId === t.id) stopEditTask(); return afterTaskChange(); })
          .catch(function (e) { toast(e.message, true); });
      });
      list.appendChild(row);
    });
  }

  // a task's done/actual-hours change can move the daily % and a category's
  // cycle progress, so refresh the day, the 14-day strip, the gallery, and
  // whichever goal/analytics view is currently loaded together
  function afterTaskChange() {
    var jobs = [loadDay(state.currentDate), loadHistory(), loadGalleryCycleDetail()];
    if (!$("#homeDetailCategory").hidden && state.selectedCycleKey) jobs.push(loadCycleDetail(state.selectedCycleKey));
    if (state.activeTab === "analytics" && state.analyticsCycleKey) jobs.push(loadAnalyticsDetail(state.analyticsCycleKey));
    if (state.activeTab === "elmktb") jobs.push(loadElmktb());
    return Promise.all(jobs);
  }

  /* ---------------- drag to reorder ---------------- */

  var dragState = null;

  $("#taskList").addEventListener("dragstart", function (ev) {
    var handle = ev.target.closest(".task-row__handle");
    var row = handle && handle.closest(".task-row");
    if (!row) { ev.preventDefault(); return; }
    dragState = { id: Number(row.dataset.id), el: row };
    row.classList.add("task-row--dragging");
    ev.dataTransfer.effectAllowed = "move";
    ev.dataTransfer.setData("text/plain", String(dragState.id));
  });

  $("#taskList").addEventListener("dragover", function (ev) {
    if (!dragState) return;
    ev.preventDefault();
    var over = ev.target.closest(".task-row");
    if (!over || over === dragState.el) return;
    var rect = over.getBoundingClientRect();
    var before = (ev.clientY - rect.top) < rect.height / 2;
    $("#taskList").insertBefore(dragState.el, before ? over : over.nextSibling);
  });

  $("#taskList").addEventListener("drop", function (ev) { ev.preventDefault(); });

  $("#taskList").addEventListener("dragend", function () {
    if (!dragState) return;
    dragState.el.classList.remove("task-row--dragging");
    var ids = Array.prototype.slice.call($("#taskList").children).map(function (el) { return Number(el.dataset.id); });
    dragState = null;
    api("/api/tasks?reorder=1", { method: "PATCH", body: { ids: ids } })
      .catch(function (e) { toast(e.message, true); loadDay(state.currentDate); });
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
      .then(function () { toast(editingId ? "Task updated ✓" : "Task added ✓"); stopEditTask(); return afterTaskChange(); })
      .catch(function (e) { toast(e.message, true); })
      .finally(function () { busy(btn, false); });
  });

  /* ---------------- last 14 days strip ---------------- */

  function loadHistory() {
    var to = todayISO();
    var from = addDays(to, -13);
    return api("/api/tasks?stats=1&from=" + from + "&to=" + to).then(function (data) {
      renderHistory(from, to, data.stats);
    }).catch(function (e) { toast(e.message, true); });
  }

  function renderHistory(from, to, stats) {
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
      bar.style.height = reduceMotion ? target + "%" : "0%";
      bar.title = fmtDate(d) + (pct == null ? " · no tasks" : " · " + pct + "% (" + s.done + "/" + s.total + ")");
      box.appendChild(bar);
      bars.push({ el: bar, target: target });
      d = addDays(d, 1);
    }
    if (!reduceMotion) {
      // double rAF: the 0% height must paint before the transition to `target` starts
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          bars.forEach(function (b) { b.el.style.height = b.target + "%"; });
        });
      });
    }
  }

  /* ---------------- persistent categories (task-add dropdown) ---------------- */

  function loadCategories() {
    return api("/api/categories").then(function (data) {
      state.categories = data.categories || [];
      renderCategorySelect(state.categories);
    }).catch(function (e) { toast(e.message, true); });
  }

  function renderCategorySelect(categories) {
    var sel = $("#addTaskForm").elements.category_id;
    var current = sel.value;
    sel.innerHTML = '<option value="">— none —</option>' +
      (categories || []).map(function (c) { return '<option value="' + c.id + '">' + esc(c.name) + "</option>"; }).join("");
    if (current) sel.value = current;
  }

  $("#addCategoryForm").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var form = this;
    var name = form.elements.name.value.trim();
    if (!name) return;
    var btn = form.querySelector("button[type=submit]");
    busy(btn, true);
    api("/api/categories", { method: "POST", body: { name: name } })
      .then(function () {
        form.reset();
        toast("Category added ✓");
        return Promise.all([loadCategories(), loadGalleryCycleDetail()]);
      })
      .catch(function (e) { toast(e.message, true); })
      .finally(function () { busy(btn, false); });
  });

  /* ---------------- cycle status (Home) + picker (category detail/Analytics) ---------------- */

  function renderCycleStatus() {
    var info = state.todayInfo;
    var el = $("#cycleStatus");
    if (!el) return;
    if (!info) { el.textContent = ""; return; }
    if (info.phase === "year-end-buffer") {
      el.textContent = "Year-end buffer — new cycle starts " + fmtDate((info.realYear + 1) + "-01-01");
    } else if (info.phase === "break") {
      el.textContent = "Y" + info.virtualYear + " · Break — next cycle starts " + fmtDate(addDays(info.cycleEnd, 1));
    } else {
      el.textContent = "Y" + info.virtualYear + " · Cycle " + info.cycleLetter + " · Q" + info.quarterNumber +
        " · " + fmtDate(info.cycleStart) + "–" + fmtDate(info.cycleEnd);
    }
  }

  function cycleOptionsHtml(cycles) {
    return cycles.map(function (c) {
      var tag = c.current ? "current" : (c.editable ? "upcoming" : "past");
      return '<option value="' + c.cycleKey + '">' + esc(c.label) + " (" + fmtDate(c.start) + "–" + fmtDate(c.end) + ") · " + tag + "</option>";
    }).join("");
  }

  function loadCyclePicker() {
    return api("/api/cycle-goals?list=1").then(function (data) {
      state.todayInfo = data.today;
      state.cycles = data.cycles || [];
      renderCycleStatus();
      var html = cycleOptionsHtml(state.cycles);
      $("#cycleSelect").innerHTML = html;
      $("#analyticsCycleSelect").innerHTML = html;

      var today = todayISO();
      // during a break/buffer there's no "current" cycle — fall back to the
      // *nearest* upcoming one (matches the server's own default-cycle pick),
      // not the furthest-out cycle in the window
      var current = state.cycles.filter(function (c) { return c.current; })[0];
      var upcoming = state.cycles.filter(function (c) { return c.start > today; })[0];
      var fallback = current || upcoming || state.cycles[state.cycles.length - 1];
      state.currentCycleKey = fallback ? fallback.cycleKey : null;
      if (!state.analyticsCycleKey && fallback) state.analyticsCycleKey = fallback.cycleKey;
      if (state.analyticsCycleKey) $("#analyticsCycleSelect").value = state.analyticsCycleKey;
    }).catch(function (e) { toast(e.message, true); });
  }

  $("#cycleSelect").addEventListener("change", function () {
    state.selectedCycleKey = this.value;
    loadCycleDetail(state.selectedCycleKey);
  });

  $("#analyticsCycleSelect").addEventListener("change", function () {
    state.analyticsCycleKey = this.value;
    loadAnalyticsDetail(state.analyticsCycleKey);
  });

  /* ---------------- goals: shared rendering for Categories + Elmktb ---------------- */

  var PACE_LABEL = { ahead: "Ahead", "on-track": "On track", behind: "Behind", "not-started": "Not started" };
  var PACE_CLASS = { ahead: "badge--good", "on-track": "badge--muted", behind: "badge--danger", "not-started": "badge--muted" };

  function fmtNum(n) {
    n = Number(n) || 0;
    return Number.isInteger(n) ? String(n) : n.toFixed(1);
  }

  function goalPct(g) {
    return Number(g.target) > 0 ? Math.min(100, Math.round((Number(g.current) / Number(g.target)) * 100)) : 0;
  }

  function goalRowHtml(g, editable) {
    var pct = goalPct(g);
    var dis = editable ? "" : " disabled";
    return '<div class="goal-row" data-id="' + g.id + '">' +
      '<div class="goal-row__top">' +
        '<span class="goal-row__title">' + esc(g.title) + '</span>' +
        '<span class="goal-row__pct">' + pct + '%</span>' +
        (editable ? '<button type="button" class="iconbtn iconbtn--edit" title="Edit goal">✎</button>' +
          '<button type="button" class="iconbtn" title="Delete goal">✕</button>' : '') +
      '</div>' +
      '<div class="goal-row__bar"><div class="goal-row__fill' + (pct >= 100 ? ' goal-row__fill--done' : '') +
        '" style="width:' + pct + '%"></div></div>' +
      '<div class="goal-row__nums">' +
        '<button type="button" class="goal-row__step" data-delta="-1" title="-1"' + dis + '>−</button>' +
        '<input type="number" min="0" step="any" class="goal-row__current" value="' + fmtNum(g.current) + '"' + dis + ' />' +
        '<button type="button" class="goal-row__step" data-delta="1" title="+1"' + dis + '>+</button>' +
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

  function stepGoal(row, goal, delta, onChange) {
    var target = Number(goal.target) || 0;
    var v = Math.max(0, (Number(row.querySelector(".goal-row__current").value) || 0) + delta);
    updateGoalRowUI(row, v, target);
    goal.current = v; // keep in sync so another quick tap steps from the right base
    api("/api/goals?id=" + goal.id, { method: "PATCH", body: { current: v } })
      .catch(function (e) { toast(e.message, true); onChange(); });
  }

  // wires interaction for one category's goal rows + its add/edit form. `box`
  // must contain .goal-row[data-id] elements and, only when editable, an
  // optional .goal-add-form. `onChange` re-fetches + re-renders after a write.
  function wireGoals(box, category, cycleKey, editable, onChange) {
    (category.goals || []).forEach(function (g) {
      var row = box.querySelector('.goal-row[data-id="' + g.id + '"]');
      if (!row || !editable) return;
      row.querySelectorAll(".goal-row__step").forEach(function (btn) {
        btn.addEventListener("click", function () { stepGoal(row, g, Number(btn.dataset.delta), onChange); });
      });
      row.querySelector(".goal-row__current").addEventListener("change", function (ev) {
        var v = ev.target.value === "" ? 0 : Number(ev.target.value);
        api("/api/goals?id=" + g.id, { method: "PATCH", body: { current: v } })
          .then(onChange)
          .catch(function (e) { toast(e.message, true); });
      });
      row.querySelector(".iconbtn--edit").addEventListener("click", function () {
        var form = box.querySelector(".goal-add-form");
        if (!form) return;
        form.elements.title.value = g.title;
        form.elements.target.value = Number(g.target);
        form.elements.unit.value = g.unit || "";
        form.dataset.editingId = g.id;
        form.querySelector("button[type=submit]").textContent = "Update";
        form.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
      row.querySelector(".iconbtn:not(.iconbtn--edit)").addEventListener("click", function () {
        if (!confirm('Delete goal "' + g.title + '"?')) return;
        api("/api/goals?id=" + g.id, { method: "DELETE" })
          .then(onChange)
          .catch(function (e) { toast(e.message, true); });
      });
    });

    if (!editable) return;
    var addForm = box.querySelector(".goal-add-form");
    if (!addForm) return;
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
      if (!editingId) { body.category_id = category.id; body.cycle_key = cycleKey; }
      busy(btn, true);
      (editingId ? api("/api/goals?id=" + editingId, { method: "PATCH", body: body })
                 : api("/api/goals", { method: "POST", body: body }))
        .then(function () { toast(editingId ? "Goal updated ✓" : "Goal added ✓"); return onChange(); })
        .catch(function (e) { toast(e.message, true); })
        .finally(function () { busy(btn, false); });
    });
  }

  /* ---------------- Home gallery: Today tile + one tile per category ---------------- */

  var CATEGORY_ICON_RULES = [
    [/relig|spirit|pray|faith|azkar/i, "🙏"],
    [/health|fit|gym|body|workout/i, "💪"],
    [/cash|money|financ|income|invest/i, "💰"],
    [/business|career|work|job/i, "💼"],
    [/learn|study|course|educat|read/i, "📚"],
    [/brand|market|social|content/i, "🎨"],
    [/rest|sleep|recover/i, "🧘"],
    [/travel/i, "✈️"],
  ];

  function categoryIcon(name) {
    for (var i = 0; i < CATEGORY_ICON_RULES.length; i++) {
      if (CATEGORY_ICON_RULES[i][0].test(name)) return CATEGORY_ICON_RULES[i][1];
    }
    return "⭐";
  }

  // a single combined completion % for the tile: hours pace if a weekly
  // target is set, else the average of the cycle's numeric goals, else none
  function categoryPct(c) {
    if (c.weekly_hours != null && Number(c.weekly_hours) > 0 && c.progress && c.progress.target > 0) {
      return Math.min(100, Math.round((c.progress.actual / c.progress.target) * 100));
    }
    var goals = c.goals || [];
    if (goals.length) {
      var sum = goals.reduce(function (s, g) { return s + goalPct(g); }, 0);
      return Math.round(sum / goals.length);
    }
    return null;
  }

  // hours-tracked categories have a real pace (ahead/behind, elapsed-time-aware);
  // goals-only categories don't, so the ring stays neutral for those
  var RING_PACE_CLASS = { ahead: "ring__fill--good", "on-track": "ring__fill--good", behind: "ring__fill--danger", "not-started": "ring__fill--muted" };
  function categoryRingClass(c) {
    if (c.weekly_hours != null && Number(c.weekly_hours) > 0 && c.progress) return RING_PACE_CLASS[c.progress.pace] || null;
    return null;
  }

  var RING_CIRC = 113.1; // 2 * pi * r18

  function ringSvg(pct, colorClass) {
    var offset = RING_CIRC * (1 - (pct || 0) / 100);
    return '<svg class="ring" viewBox="0 0 44 44" width="56" height="56" aria-hidden="true">' +
      '<circle class="ring__track" cx="22" cy="22" r="18" />' +
      '<circle class="ring__fill' + (colorClass ? ' ' + colorClass : '') + '" cx="22" cy="22" r="18" stroke-dasharray="' + RING_CIRC + '" ' +
        'stroke-dashoffset="' + (reduceMotion ? offset : RING_CIRC) + '" data-offset="' + offset + '" />' +
    '</svg>';
  }

  function galleryTileHtml(opts) {
    return '<button type="button" class="gallery-tile" data-kind="' + opts.kind + '"' +
      (opts.id != null ? ' data-id="' + opts.id + '"' : '') + '>' +
      '<span class="gallery-tile__ring">' + ringSvg(opts.pct, opts.ringClass) + '<span class="gallery-tile__icon">' + opts.icon + '</span></span>' +
      '<span class="gallery-tile__name">' + esc(opts.name) + '</span>' +
      '<span class="gallery-tile__pct">' + (opts.pct == null ? esc(opts.sub || "—") : opts.pct + "%") + '</span>' +
    '</button>';
  }

  function loadGalleryCycleDetail() {
    if (!state.currentCycleKey) return Promise.resolve();
    return api("/api/cycle-goals?cycle_key=" + encodeURIComponent(state.currentCycleKey)).then(function (data) {
      state.galleryCycleDetail = data;
      if (!$("#homeGallery").hidden) renderGallery();
    }).catch(function (e) { toast(e.message, true); });
  }

  function renderGallery() {
    var box = $("#galleryGrid");
    var categories = (state.galleryCycleDetail && state.galleryCycleDetail.categories) || [];
    var tiles = [galleryTileHtml({
      kind: "today", icon: "📅", name: "Today",
      pct: state.dayStats.total ? state.dayStats.pct : null,
      sub: state.dayStats.total ? "" : "No tasks",
    })];
    categories.forEach(function (c) {
      tiles.push(galleryTileHtml({
        kind: "category", id: c.id, icon: categoryIcon(c.name), name: c.name,
        pct: categoryPct(c), ringClass: categoryRingClass(c),
      }));
    });
    box.innerHTML = tiles.join("");

    if (!reduceMotion) {
      // double rAF: the full-circle (0%) state must paint before animating to the real offset
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          box.querySelectorAll(".ring__fill").forEach(function (el) { el.style.strokeDashoffset = el.dataset.offset; });
        });
      });
    }

    box.querySelectorAll(".gallery-tile").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (btn.dataset.kind === "today") openToday();
        else openCategory(Number(btn.dataset.id));
      });
    });
  }

  function openGallery() {
    state.selectedCategoryId = null;
    $("#homeGallery").hidden = false;
    $("#homeDetailToday").hidden = true;
    $("#homeDetailCategory").hidden = true;
    renderGallery();
  }

  function openToday() {
    $("#homeGallery").hidden = true;
    $("#homeDetailToday").hidden = false;
    $("#homeDetailCategory").hidden = true;
  }

  function openCategory(categoryId) {
    state.selectedCategoryId = categoryId;
    state.selectedCycleKey = state.currentCycleKey;
    $("#homeGallery").hidden = true;
    $("#homeDetailToday").hidden = true;
    $("#homeDetailCategory").hidden = false;
    if (state.selectedCycleKey) $("#cycleSelect").value = state.selectedCycleKey;
    loadCycleDetail(state.selectedCycleKey);
  }

  document.querySelectorAll(".detail-back").forEach(function (btn) {
    btn.addEventListener("click", openGallery);
  });

  /* ---------------- category detail (Home > tap a category tile) ---------------- */

  function categoryCardHtml(c, editable) {
    var p = c.progress;
    var hasHours = c.weekly_hours != null && Number(c.weekly_hours) > 0;
    return '<div class="category-card" data-id="' + c.id + '">' +
      '<div class="category-card__head"><span class="category-card__name">' + esc(c.name) + '</span>' +
      (hasHours ? '<span class="badge ' + PACE_CLASS[p.pace] + '">' + PACE_LABEL[p.pace] + '</span>' : '') +
      (editable ? '<button type="button" class="iconbtn category-card__delete" title="Delete category">✕</button>' : '') +
      '</div>' +
      '<label class="category-card__hours">Weekly target' +
        '<input type="number" min="0" step="0.5" class="cat-hours-input" placeholder="h/week"' +
        (c.weekly_hours != null ? ' value="' + Number(c.weekly_hours) + '"' : '') +
        (editable ? '' : ' disabled') + ' />' +
      '</label>' +
      (hasHours ?
        '<div class="category-card__stats">' +
          '<div>Weekly target<b>' + fmtH(c.weekly_hours) + '</b></div>' +
          '<div>Cycle target<b>' + fmtH(p.target) + '</b></div>' +
          '<div>Logged<b>' + fmtH(p.actual) + '</b></div>' +
          '<div>Remaining<b>' + fmtH(p.remaining) + '</b></div>' +
        '</div>' +
        '<div class="chart" style="min-height:190px"></div>'
        : '') +
      '<div class="goals">' +
        '<div class="goals__label">Goals</div>' +
        (c.goals || []).map(function (g) { return goalRowHtml(g, editable); }).join("") +
        (editable ?
          '<form class="goal-add-form">' +
            '<input name="title" placeholder="Goal (e.g. Job applications)" required />' +
            '<input name="target" type="number" min="0.01" step="any" placeholder="Target" required />' +
            '<input name="unit" placeholder="unit" />' +
            '<button type="submit" class="btn btn--ghost btn--sm">+ Add goal</button>' +
          '</form>' : '') +
      '</div>' +
    '</div>';
  }

  function loadCycleDetail(cycleKey) {
    if (!cycleKey) return Promise.resolve();
    return api("/api/cycle-goals?cycle_key=" + encodeURIComponent(cycleKey)).then(function (data) {
      state.cycleDetail = data;
      renderCategoryDetail(data);
    }).catch(function (e) { toast(e.message, true); });
  }

  // re-fetches both the open category's detail (for this view) and the
  // current cycle's gallery snapshot (in case this write touched "now")
  function refreshCategoryDetail() {
    return Promise.all([loadCycleDetail(state.selectedCycleKey), loadGalleryCycleDetail()]);
  }

  // the cycle immediately before cycleKey, from the already-loaded picker list
  function previousCycleInfo(cycleKey) {
    var cur = state.cycles.filter(function (c) { return c.cycleKey === cycleKey; })[0];
    if (!cur) return null;
    var earlier = state.cycles.filter(function (c) { return c.start < cur.start; });
    if (!earlier.length) return null;
    earlier.sort(function (a, b) { return a.start < b.start ? 1 : -1; });
    return earlier[0];
  }

  // carries a category's weekly-hours target + goal list forward from its
  // previous cycle — goals are scoped per cycle, so without this every 42
  // days means re-typing the same milestones from scratch
  function copyPreviousCycle(categoryId, fromCycleKey, toCycleKey) {
    return api("/api/cycle-goals?cycle_key=" + encodeURIComponent(fromCycleKey)).then(function (prevData) {
      var prevCat = (prevData.categories || []).filter(function (x) { return x.id === categoryId; })[0];
      if (!prevCat) { toast("Nothing to copy from that cycle", true); return; }
      var jobs = [];
      if (prevCat.weekly_hours != null) {
        jobs.push(api("/api/cycle-goals", {
          method: "PATCH", body: { cycle_key: toCycleKey, category_id: categoryId, weekly_hours: prevCat.weekly_hours },
        }));
      }
      (prevCat.goals || []).forEach(function (g) {
        jobs.push(api("/api/goals", {
          method: "POST", body: { category_id: categoryId, cycle_key: toCycleKey, title: g.title, target: Number(g.target), unit: g.unit },
        }));
      });
      return Promise.all(jobs);
    }).then(function () {
      toast("Copied from previous cycle ✓");
      return refreshCategoryDetail();
    }).catch(function (e) { toast(e.message, true); });
  }

  function renderCategoryDetail(data) {
    var c = (data.categories || []).filter(function (x) { return x.id === state.selectedCategoryId; })[0];
    $("#categoryDetailName").textContent = c ? c.name : "";
    $("#cycleReadonlyNote").hidden = !!data.editable;
    var box = $("#categoryDetailBody");
    if (!c) { box.innerHTML = ""; return; }

    // only offer to copy forward when this cycle genuinely has nothing set yet —
    // avoids silently duplicating goals on top of ones already entered
    var prev = data.editable ? previousCycleInfo(data.cycleKey) : null;
    var showCopy = prev && !(c.goals || []).length && c.weekly_hours == null;

    box.innerHTML =
      (showCopy ? '<button type="button" class="btn btn--ghost btn--sm copy-cycle-btn">↩ Copy goals &amp; target from ' + esc(prev.label) + '</button>' : '') +
      categoryCardHtml(c, data.editable);
    var card = box.querySelector(".category-card");

    if (showCopy) {
      box.querySelector(".copy-cycle-btn").addEventListener("click", function (ev) {
        busy(ev.target, true);
        copyPreviousCycle(c.id, prev.cycleKey, data.cycleKey).finally(function () { busy(ev.target, false); });
      });
    }

    var hasHours = c.weekly_hours != null && Number(c.weekly_hours) > 0;
    if (hasHours) {
      window.renderProgressChart(card.querySelector(".chart"), c.progress.timeline, {
        start: data.start, end: data.end, target: c.progress.target,
      });
    }
    if (data.editable) {
      card.querySelector(".category-card__delete").addEventListener("click", function () {
        if (!confirm('Delete category "' + c.name + '" completely? This removes its goals and hour targets across EVERY cycle — past and future, not just this one. Logged tasks are kept, just uncategorized.')) return;
        api("/api/categories?id=" + c.id, { method: "DELETE" })
          .then(function () {
            toast("Category deleted");
            return Promise.all([loadCategories(), loadGalleryCycleDetail(), loadDay(state.currentDate)]);
          })
          .then(openGallery)
          .catch(function (e) { toast(e.message, true); });
      });
    }
    var hoursInput = card.querySelector(".cat-hours-input");
    hoursInput.addEventListener("change", function () {
      var v = hoursInput.value === "" ? null : Number(hoursInput.value);
      api("/api/cycle-goals", { method: "PATCH", body: { cycle_key: data.cycleKey, category_id: c.id, weekly_hours: v } })
        .then(refreshCategoryDetail)
        .catch(function (e) { toast(e.message, true); });
    });
    wireGoals(card, c, data.cycleKey, data.editable, refreshCategoryDetail);
  }

  /* ---------------- Elmktb tab: current-cycle goals as a to-do rollup ---------------- */

  function loadElmktb() {
    return api("/api/cycle-goals").then(function (data) {
      state.elmktbDetail = data;
      renderElmktb(data);
    }).catch(function (e) { toast(e.message, true); });
  }

  function renderElmktb(data) {
    var today = todayISO();
    var quarters = data.quarters || [];
    var upcoming = quarters.filter(function (q) { return q.end >= today; })[0] || quarters[0];
    var statusEl = $("#elmktbStatus");
    if (!data.cycleKey || !upcoming) {
      statusEl.textContent = "No active or upcoming cycle right now.";
    } else {
      var daysLeft = Math.max(0, Math.round((new Date(upcoming.end + "T00:00:00Z") - new Date(today + "T00:00:00Z")) / 86400000) + 1);
      statusEl.textContent = "Q" + upcoming.number + " · " + fmtDate(upcoming.start) + "–" + fmtDate(upcoming.end) +
        " · " + daysLeft + " day" + (daysLeft === 1 ? "" : "s") + " left";
    }

    // read-only preview — editing goals happens in one place (the category's
    // own detail view, opened from Home) instead of duplicating the same
    // +/- controls here too
    var withGoals = (data.categories || []).filter(function (c) { return (c.goals || []).length; });
    $("#elmktbEmpty").hidden = withGoals.length > 0;
    var box = $("#elmktbList");
    box.innerHTML = withGoals.map(function (c) {
      return '<div class="elmktb-group" data-cat="' + c.id + '">' +
        '<div class="elmktb-group__head">' +
          '<span class="elmktb-group__name">' + esc(c.name) + '</span>' +
          '<button type="button" class="linklike elmktb-group__edit">Edit →</button>' +
        '</div>' +
        (c.goals || []).map(function (g) { return goalRowHtml(g, false); }).join("") +
      '</div>';
    }).join("");

    withGoals.forEach(function (c) {
      var group = box.querySelector('.elmktb-group[data-cat="' + c.id + '"]');
      group.querySelector(".elmktb-group__edit").addEventListener("click", function () { goToCategory(c.id); });
    });
  }

  function goToCategory(categoryId) {
    showTab("home");
    openCategory(categoryId);
  }

  /* ---------------- Analytics tab: read-only progress ---------------- */

  function analyticsHoursCardHtml(c) {
    var p = c.progress;
    return '<div class="category-card" data-id="' + c.id + '">' +
      '<div class="category-card__head"><span class="category-card__name">' + esc(c.name) + '</span>' +
      '<span class="badge ' + PACE_CLASS[p.pace] + '">' + PACE_LABEL[p.pace] + '</span>' +
      '</div>' +
      '<div class="category-card__stats">' +
        '<div>Weekly target<b>' + fmtH(c.weekly_hours) + '</b></div>' +
        '<div>Cycle target<b>' + fmtH(p.target) + '</b></div>' +
        '<div>Logged<b>' + fmtH(p.actual) + '</b></div>' +
        '<div>Remaining<b>' + fmtH(p.remaining) + '</b></div>' +
      '</div>' +
      '<div class="chart" style="min-height:190px"></div>' +
    '</div>';
  }

  // goal-only categories have no hours chart to show, but still deserve a
  // place in Analytics — otherwise the tab silently omits some categories
  function analyticsGoalsCardHtml(c) {
    return '<div class="category-card" data-id="' + c.id + '">' +
      '<div class="category-card__head"><span class="category-card__name">' + esc(c.name) + '</span></div>' +
      '<div class="goals">' +
        '<div class="goals__label">Goals</div>' +
        (c.goals || []).map(function (g) { return goalRowHtml(g, false); }).join("") +
      '</div>' +
    '</div>';
  }

  function loadAnalyticsDetail(cycleKey) {
    if (!cycleKey) return Promise.resolve();
    return api("/api/cycle-goals?cycle_key=" + encodeURIComponent(cycleKey)).then(function (data) {
      state.analyticsDetail = data;
      renderAnalytics(data);
    }).catch(function (e) { toast(e.message, true); });
  }

  function renderAnalytics(data) {
    var withHours = (data.categories || []).filter(function (c) { return c.weekly_hours != null && Number(c.weekly_hours) > 0; });
    var goalsOnly = (data.categories || []).filter(function (c) {
      return !(c.weekly_hours != null && Number(c.weekly_hours) > 0) && (c.goals || []).length;
    });
    $("#noAnalytics").hidden = (withHours.length + goalsOnly.length) > 0;
    var box = $("#analyticsCards");
    box.innerHTML = withHours.map(analyticsHoursCardHtml).join("") + goalsOnly.map(analyticsGoalsCardHtml).join("");
    withHours.forEach(function (c) {
      var card = box.querySelector('.category-card[data-id="' + c.id + '"]');
      window.renderProgressChart(card.querySelector(".chart"), c.progress.timeline, {
        start: data.start, end: data.end, target: c.progress.target,
      });
    });
  }

  /* ---------------- resize: redraw progress charts ---------------- */

  var resizeTimer;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      if ($("#view-app").hidden) return;
      if (!$("#homeDetailCategory").hidden && state.cycleDetail) renderCategoryDetail(state.cycleDetail);
      if (state.activeTab === "analytics" && state.analyticsDetail) renderAnalytics(state.analyticsDetail);
    }, 150);
  });

  /* ---------------- go ---------------- */
  boot();
})();
