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
    state.currentDate = date;
    $("#dayPicker").value = date;
    return api("/api/tasks?date=" + date).then(function (data) {
      renderTasks(data.tasks);
    }).catch(function (e) { toast(e.message, true); });
  }

  function renderTasks(tasks) {
    var total = tasks.length;
    var done = tasks.filter(function (t) { return t.done; }).length;
    $("#dayPercent").textContent = (total ? Math.round((done / total) * 100) : 0) + "%";
    $("#dayCount").textContent = done + " of " + total + " task" + (total === 1 ? "" : "s");

    var list = $("#taskList");
    list.innerHTML = "";
    $("#tasksEmpty").hidden = total > 0;
    tasks.forEach(function (t) {
      var row = document.createElement("div");
      row.className = "task-row" + (t.done ? " task-row--done" : "");
      var meta = [];
      if (t.category_name) meta.push(esc(t.category_name));
      if (t.planned_hours != null) meta.push(fmtH(t.planned_hours) + " planned");
      row.innerHTML =
        '<input type="checkbox" class="task-row__check" ' + (t.done ? "checked" : "") + ' aria-label="Mark done" />' +
        '<div class="task-row__body"><div class="task-row__title">' + esc(t.title) + '</div>' +
        (meta.length ? '<div class="task-row__meta">' + meta.join(" · ") + '</div>' : '') + '</div>' +
        (t.done ? '<input type="number" min="0" step="0.25" class="task-row__actual" title="Actual hours" value="' +
          (t.actual_hours != null ? Number(t.actual_hours) : '') + '" />' : '') +
        '<button type="button" class="iconbtn" title="Delete task">✕</button>';

      row.querySelector(".task-row__check").addEventListener("change", function (ev) {
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
      row.querySelector(".iconbtn").addEventListener("click", function () {
        if (!confirm('Delete task "' + t.title + '"?')) return;
        api("/api/tasks?id=" + t.id, { method: "DELETE" })
          .then(function () { return afterTaskChange(); })
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

  $("#addTaskForm").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var form = this;
    var btn = form.querySelector("button[type=submit]");
    var b = formData(form);
    b.task_date = state.currentDate;
    if (!b.category_id) delete b.category_id;
    if (!b.planned_hours) delete b.planned_hours;
    busy(btn, true);
    api("/api/tasks", { method: "POST", body: b })
      .then(function () { form.reset(); return loadDay(state.currentDate); })
      .then(function () { return loadHistory(); })
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
    var d = from;
    while (d <= to) {
      var s = byDate[d];
      var pct = s && s.total ? Math.round((s.done / s.total) * 100) : null;
      var bar = document.createElement("div");
      bar.className = "day-bar" + (pct == null ? " day-bar--empty" : "");
      bar.style.height = (pct == null ? 6 : Math.max(pct, 4)) + "%";
      bar.title = fmtDate(d) + (pct == null ? " · no tasks" : " · " + pct + "% (" + s.done + "/" + s.total + ")");
      box.appendChild(bar);
      d = addDays(d, 1);
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

  function renderQuarter(data) {
    $("#noQuarters").hidden = state.quarters.length > 0;
    $("#quarterSelect").hidden = state.quarters.length === 0;
    $("#quarterActions").hidden = !data;
    var box = $("#categoryCards");
    box.innerHTML = "";
    if (!data) return;

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
        '<div class="chart" style="min-height:190px"></div>';
      box.appendChild(card);
      window.renderProgressChart(card.querySelector(".chart"), p.timeline, {
        start: data.quarter.start_date, end: data.quarter.end_date, target: p.target,
      });
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
    var body = { name: b.name, start_date: b.start_date, end_date: b.end_date, categories: categories };

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
