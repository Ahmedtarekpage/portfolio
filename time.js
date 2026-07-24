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
    if (state.quarterDetail) renderQuarter(state.quarterDetail);
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
    Promise.all([loadQuarters(), loadDay(state.currentDate), loadHistory()])
      .then(function () { show("view-app"); })
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
    animateCount($("#dayPercent"), total ? Math.round((done / total) * 100) : 0, "%");
    $("#dayCount").textContent = done + " of " + total + " task" + (total === 1 ? "" : "s");

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
  // quarterly progress, so refresh the day, the 14-day strip, and the chart together
  function afterTaskChange() {
    return Promise.all([
      loadDay(state.currentDate),
      loadHistory(),
      state.selectedQuarterId ? loadQuarterDetail(state.selectedQuarterId) : Promise.resolve(),
    ]);
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

  function fmtNum(n) {
    n = Number(n) || 0;
    return Number.isInteger(n) ? String(n) : n.toFixed(1);
  }

  function goalPct(g) {
    return Number(g.target) > 0 ? Math.min(100, Math.round((Number(g.current) / Number(g.target)) * 100)) : 0;
  }

  function goalRowHtml(g) {
    var pct = goalPct(g);
    return '<div class="goal-row" data-id="' + g.id + '">' +
      '<div class="goal-row__top">' +
        '<span class="goal-row__title">' + esc(g.title) + '</span>' +
        '<span class="goal-row__pct">' + pct + '%</span>' +
        '<button type="button" class="iconbtn iconbtn--edit" title="Edit goal">✎</button>' +
        '<button type="button" class="iconbtn" title="Delete goal">✕</button>' +
      '</div>' +
      '<div class="goal-row__bar"><div class="goal-row__fill' + (pct >= 100 ? ' goal-row__fill--done' : '') +
        '" style="width:' + pct + '%"></div></div>' +
      '<div class="goal-row__nums">' +
        '<input type="number" min="0" step="any" class="goal-row__current" value="' + fmtNum(g.current) + '" /> / ' +
        '<b>' + fmtNum(g.target) + '</b>' + (g.unit ? ' ' + esc(g.unit) : '') +
      '</div>' +
    '</div>';
  }

  function wireGoals(card, category) {
    var box = card.querySelector(".goals");

    (category.goals || []).forEach(function (g) {
      var row = box.querySelector('.goal-row[data-id="' + g.id + '"]');
      if (!row) return;
      row.querySelector(".goal-row__current").addEventListener("change", function (ev) {
        var v = ev.target.value === "" ? 0 : Number(ev.target.value);
        api("/api/goals?id=" + g.id, { method: "PATCH", body: { current: v } })
          .then(function () { return loadQuarterDetail(state.selectedQuarterId); })
          .catch(function (e) { toast(e.message, true); });
      });
      row.querySelector(".iconbtn--edit").addEventListener("click", function () {
        var form = box.querySelector(".goal-add-form");
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
          .then(function () { return loadQuarterDetail(state.selectedQuarterId); })
          .catch(function (e) { toast(e.message, true); });
      });
    });

    var addForm = box.querySelector(".goal-add-form");
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
        .then(function () { toast(editingId ? "Goal updated ✓" : "Goal added ✓"); return loadQuarterDetail(state.selectedQuarterId); })
        .catch(function (e) { toast(e.message, true); })
        .finally(function () { busy(btn, false); });
    });
  }

  function renderQuarter(data) {
    $("#noQuarters").hidden = state.quarters.length > 0;
    $("#quarterSelect").hidden = state.quarters.length === 0;
    $("#quarterActions").hidden = !data;
    var box = $("#categoryCards");
    box.innerHTML = "";
    if (!data) return;

    if (data.quarter.anti_perfectionist) {
      var note = document.createElement("p");
      note.className = "muted";
      note.style.marginBottom = "4px";
      note.textContent = "Anti-perfectionist mode is on — targets below already count 75% as done.";
      box.appendChild(note);
    }

    data.categories.forEach(function (c) {
      var p = c.progress;
      var card = document.createElement("div");
      card.className = "category-card";
      card.innerHTML =
        '<div class="category-card__head"><span class="category-card__name">' + esc(c.name) + '</span>' +
        '<span class="badge ' + PACE_CLASS[p.pace] + '">' + PACE_LABEL[p.pace] + '</span></div>' +
        '<div class="category-card__stats">' +
          '<div>Weekly target<b>' + fmtH(c.weekly_hours) + '</b></div>' +
          '<div>Quarter target<b>' + fmtH(p.target) + '</b></div>' +
          '<div>Logged<b>' + fmtH(p.actual) + '</b></div>' +
          '<div>Remaining<b>' + fmtH(p.remaining) + '</b></div>' +
        '</div>' +
        '<div class="chart" style="min-height:190px"></div>' +
        '<div class="goals">' +
          '<div class="goals__label">Goals</div>' +
          (c.goals || []).map(goalRowHtml).join("") +
          '<form class="goal-add-form">' +
            '<input name="title" placeholder="Goal (e.g. Job applications)" required />' +
            '<input name="target" type="number" min="0.01" step="any" placeholder="Target" required />' +
            '<input name="unit" placeholder="unit" />' +
            '<button type="submit" class="btn btn--ghost btn--sm">+ Add goal</button>' +
          '</form>' +
        '</div>';
      box.appendChild(card);
      window.renderProgressChart(card.querySelector(".chart"), p.timeline, {
        start: data.quarter.start_date, end: data.quarter.end_date, target: p.target,
      });
      wireGoals(card, c);
    });
  }

  $("#btnAddCategoryRow").addEventListener("click", function () { addCategoryRow(); });

  function addCategoryRow(cat) {
    var row = document.createElement("div");
    row.className = "category-row";
    if (cat && cat.id) row.dataset.id = cat.id;
    row.innerHTML =
      '<input name="cat_name" placeholder="Category (e.g. Deep work)" value="' + esc(cat ? cat.name : "") + '" required />' +
      '<input name="cat_hours" type="number" min="0.5" step="0.5" placeholder="h/week" value="' + (cat ? Number(cat.weekly_hours) : "") + '" required />' +
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
      .then(function () { toast("Quarter deleted"); return loadQuarters(); })
      .then(function () { return loadDay(state.currentDate); })
      .catch(function (e) { toast(e.message, true); });
  });

  $("#quarterForm").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var form = this;
    var btn = $("#btnQuarterSubmit");
    var b = formData(form);
    var categories = Array.prototype.slice.call($("#categoryRows").children).map(function (row) {
      return {
        id: row.dataset.id ? Number(row.dataset.id) : undefined,
        name: row.querySelector("[name=cat_name]").value.trim(),
        weekly_hours: Number(row.querySelector("[name=cat_hours]").value),
      };
    }).filter(function (c) { return c.name && c.weekly_hours > 0; });
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
