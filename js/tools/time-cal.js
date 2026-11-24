/* time-cal.js — the day as a calendar (owner, 2026-11-21).
   · Views: List (the to-do list as it was) · Day · Week · Month, like Google Calendar.
     Timed things sit on the hour grid; things with no time sit in "Anytime" at the top.
     Later days show what is coming before it is made: repeating events, meetings, prayers (dashed).
   · 🔁 Repeating: rules like "every day 11pm–6am Sleep", "Mon/Wed 7–8pm Gym"; prayers and azkar
     are built in (on/off). The server puts each rule's task on the day when the day is opened.
   · 🧠 Plan my day: write everything down (one per line, with a time like "30m" / "1h" / "ساعة"),
     and a local planner — no AI, no data leaves the page — does the method:
       1. Eisenhower: important × urgent from the words, "!" / "!!", and the quarter's categories.
            do first · schedule · quick (or hand off) · drop
       2. Top 3: the day is a win if these three are done.
       3. Time: your estimate + 30% (we always guess short); ≤ 2 min → do it now, no block.
       4. Blocks: the hardest goes in your focus hours (default 9–12), the rest in the earliest free
          time between prayers, meetings and repeating events; one free hour is kept for surprises.
       5. Batching: calls together, errands together, messages together.
       6. Over 50 minutes → split into 🍅 25-minute rounds (the note says how many).
   · 🌙 End of day: what's done, what isn't, and copy the unfinished to tomorrow.
   Uses window.__time (from time.js). */
(function () {
  "use strict";
  var X = window.__time; if (!X) return;
  var T = X.T, esc = X.esc, $ = function (s) { return document.querySelector(s); };
  var bar = $("#calBar"), view = $("#calView"), panel = $("#calPanel");
  if (!bar) return;
  var DAY_ORDER = [6, 0, 1, 2, 3, 4, 5];
  var DAY_SHORT = [T("Sun", "حد"), T("Mon", "اتنين"), T("Tue", "تلات"), T("Wed", "أربع"), T("Thu", "خميس"), T("Fri", "جمعة"), T("Sat", "سبت")];
  var tz = ""; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (e) {}
  var lsGet = function (k, d) { try { var v = JSON.parse(localStorage.getItem(k) || "null"); return v == null ? d : v; } catch (e) { return d; } };
  var lsSet = function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  var dowOf = function (date) { return new Date(date + "T12:00:00Z").getUTCDay(); };
  var mins = function (hm) { return hm ? X.hmToMin(hm) : null; };
  var routines = [];

  /* ---------------- views ---------------- */
  var mode = lsGet("time-cal-view", "list");
  function setMode(m) {
    mode = m; lsSet("time-cal-view", m);
    bar.querySelectorAll("[data-view]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.view === m)); });
    var list = m === "list";
    ["#taskList", "#taskSelect"].forEach(function (s) { var el = $(s); if (el) el.classList.toggle("cal-hide", !list); });
    view.hidden = list;
    if (!list) draw();
  }
  bar.addEventListener("click", function (ev) {
    var b = ev.target.closest("button"); if (!b) return;
    if (b.dataset.view) setMode(b.dataset.view);
    if (b.id === "btnPlanDay") togglePanel("plan");
    if (b.id === "btnRepeat") togglePanel("repeat");
    if (b.id === "btnReview") togglePanel("review");
  });

  // the anchor day is the day picker's
  function anchor() { return X.state.currentDate || X.todayISO(); }
  function weekStart(d) { var w = dowOf(d), back = (w - 6 + 7) % 7; return X.addDays(d, -back); } // weeks start Saturday
  var range = null;
  function load(from, to) {
    return X.api("/api/tasks?range=1&from=" + from + "&to=" + to + "&tz=" + encodeURIComponent(tz)).then(function (d) { range = Object.assign({ from: from, to: to }, d); routines = d.routines || routines; return range; });
  }

  // everything on one day: the real tasks, plus (today on) what is coming but not made yet
  function itemsOf(date, data) {
    var real = data.tasks.filter(function (t) { return t.task_date === date; });
    var keys = {}; real.forEach(function (t) { if (t.auto_key) keys[String(t.auto_key).replace(/:hand$/, "")] = 1; });
    var skip = {}; data.skips.forEach(function (s) { if (s.date === date) skip[s.auto_key] = 1; });
    var out = real.map(function (t) { return { id: t.id, title: t.title, icon: t.icon, from: t.time_from, to: t.time_to, note: t.time_note, done: t.done, half: t.half, link: t.link, auto: t.auto_key, real: t }; });
    if (date < X.todayISO()) return out;
    var add = function (key, it) { if (!keys[key] && !skip[key]) { it.virtual = true; it.auto = key; out.push(it); } };
    data.routines.forEach(function (r) {
      if (r.start_date && r.start_date > date) return; if (r.end_date && r.end_date < date) return;
      if ((r.days || []).indexOf(dowOf(date)) < 0) return;
      add("routine:" + r.id, { title: r.title, icon: r.icon || "🔁", from: r.time_from, to: r.time_to });
    });
    data.meetings.forEach(function (m) {
      if (m.date !== date) return;
      add("meeting:" + m.id, { title: m.title, icon: "🗣️", from: m.from, to: m.to, note: m.note, link: m.link });
      if (m.prep) add("prep:" + m.id, { title: "Prep: " + m.client, icon: "📝", from: m.prep, to: m.from });
    });
    var pp = X.prayerPlanFor(date);
    if (pp) Object.keys(pp).forEach(function (k) { add(k, { title: X.prayerTitle[k], icon: X.autoIcon[k] || (/^azkar/.test(k) ? "📿" : "🕌"), from: pp[k].from, to: pp[k].to, note: pp[k].note }); });
    return out;
  }
  // overnight (to before from): on its own day it runs to midnight
  function span(it) { var a = mins(it.from), b = it.to ? mins(it.to) : a + 30; if (b <= a) b = 1440; return [a, b]; }
  // overlapping blocks side by side
  function lanes(items) {
    var timed = items.filter(function (i) { return i.from; }).sort(function (a, b) { return span(a)[0] - span(b)[0]; });
    // lanes per cluster of overlapping blocks: one overlap doesn't squeeze the whole day
    var ends = [], cluster = [], clusterEnd = -1;
    var close = function () { cluster.forEach(function (c) { c.lanes = ends.length; }); cluster = []; ends = []; };
    timed.forEach(function (it) {
      var s = span(it);
      if (s[0] >= clusterEnd) close();
      var lane = ends.findIndex(function (e) { return e <= s[0]; });
      if (lane < 0) { lane = ends.length; ends.push(0); }
      ends[lane] = s[1]; it.lane = lane; cluster.push(it); clusterEnd = Math.max(clusterEnd, s[1]);
    });
    close();
    return timed;
  }

  var HOUR = 46;
  function grid(dates, data, opts) {
    var today = X.todayISO(), all = dates.map(function (d) { return itemsOf(d, data); });
    var first = 24 * 60, last = 0;
    all.forEach(function (list) { list.forEach(function (it) { if (it.from) { var s = span(it); first = Math.min(first, s[0]); last = Math.max(last, s[1]); } }); });
    var h0 = Math.max(0, Math.min(6, Math.floor(first / 60))), h1 = Math.min(24, Math.max(23, Math.ceil(last / 60)));
    var cols = dates.map(function (d, i) {
      var list = all[i], tl = lanes(list.slice()), any = list.filter(function (it) { return !it.from; });
      var done = list.filter(function (it) { return it.done; }).length, real = list.filter(function (it) { return !it.virtual; }).length;
      var head = opts.week ? '<button type="button" class="cal-col__head' + (d === today ? " is-today" : "") + '" data-go="' + d + '"><b>' + DAY_SHORT[dowOf(d)] + '</b><span>' + Number(d.slice(8)) + '</span>' +
        (real ? '<i style="--p:' + Math.round(done / real * 100) + '%"></i>' : '') + '</button>' : '';
      var anyHtml = '<div class="cal-any">' + any.map(chip).join("") + '</div>';
      var blocks = tl.map(function (it) {
        var s = span(it), top = (s[0] - h0 * 60) / 60 * HOUR, hgt = Math.max(18, (s[1] - s[0]) / 60 * HOUR - 2);
        var w = 100 / it.lanes, can = canDrag(it);
        return '<div class="cal-ev' + kind(it) + (it.done ? " is-done" : "") + (it.virtual ? " is-virtual" : "") + (hgt < 34 ? " is-short" : "") + (can ? " is-drag" : "") + '" style="top:' + top + 'px;height:' + hgt + 'px;left:calc(' + (it.lane * w) + '% + 2px);width:calc(' + w + '% - 4px)"' +
          (it.id ? ' data-id="' + it.id + '"' : '') + ' title="' + esc(X.fmtSlot(it.from, it.to) + " · " + it.title + (it.note ? " · " + it.note : "")) + '">' +
          (it.id ? '<input type="checkbox" class="cal-ev__check" ' + (it.done ? "checked" : "") + ' aria-label="' + T("Done", "خلصت") + '">' : '') +
          '<b>' + esc((it.icon ? it.icon + " " : "") + it.title) + '</b><small>' + esc(X.fmtSlot(it.from, it.to)) + (it.note && !opts.week ? " · " + esc(it.note) : "") + '</small>' +
          (it.link ? '<a href="' + esc(it.link) + '" target="_blank" rel="noopener" class="cal-ev__link">🔗</a>' : '') +
          (can ? '<i class="cal-ev__rs" title="' + T("Drag to make it longer or shorter", "اسحب عشان تطوّلها أو تقصّرها") + '"></i>' : '') + '</div>';
      }).join("");
      var now = new Date(), nm = now.getHours() * 60 + now.getMinutes();
      var nowLine = d === today && nm >= h0 * 60 && nm <= h1 * 60 ? '<div class="cal-now" style="top:' + ((nm - h0 * 60) / 60 * HOUR) + 'px"></div>' : '';
      return { head: head, any: anyHtml, body: '<div class="cal-col__body" data-date="' + d + '" data-h0="' + h0 + '" style="height:' + (h1 - h0) * HOUR + 'px">' + blocks + nowLine + '</div>' };
    });
    var hours = ""; for (var h = h0; h < h1; h++) hours += '<div class="cal-hour" style="height:' + HOUR + 'px"><span>' + X.clock12(X.minToHm(h * 60)) + (h < 12 ? T("a", "ص") : T("p", "م")) + '</span></div>';
    if (opts.headsOnly) return '<div class="cal-grid cal-grid--heads' + (opts.week ? " cal-grid--week" : "") + '" style="--cols:' + dates.length + '"><div class="cal-gutter"></div>' + cols.map(function (c) { return c.head; }).join("") + '</div>';
    return '<div class="cal-grid' + (opts.week ? " cal-grid--week" : "") + '" style="--cols:' + dates.length + '">' +
      '<div class="cal-gutter cal-any-label">' + T("Anytime", "أي وقت") + '</div>' + cols.map(function (c) { return c.any; }).join("") +
      '<div class="cal-hours">' + hours + '</div>' + cols.map(function (c) { return '<div class="cal-col">' + c.body + '</div>'; }).join("") + '</div>';
  }
  // real tasks move; a client meeting moves from the Clients page; overnight blocks (sleep) stay put
  function canDrag(it) {
    if (!it.id || it.virtual) return false;
    if (/^(meeting|prep):/.test(it.auto || "")) return false;
    return !(it.from && it.to && mins(it.to) <= mins(it.from));
  }
  function kind(it) { var k = String(it.auto || "").split(":")[0]; return k ? " k-" + k : ""; }
  function chip(it) {
    return '<span class="cal-chip' + kind(it) + (it.done ? " is-done" : "") + (it.virtual ? " is-virtual" : "") + (!it.from && it.id ? " is-drag" : "") + '"' + (it.id ? ' data-id="' + it.id + '"' : '') + '>' +
      (it.from ? '<em>' + esc(X.clock12(it.from)) + '</em> ' : '') + esc((it.icon ? it.icon + " " : "") + it.title) + '</span>';
  }

  function head(title, step) {
    return '<div class="cal-head"><button type="button" class="iconbtn" data-step="-' + step + '" aria-label="' + T("Back", "اللي قبله") + '">‹</button>' +
      '<b>' + esc(title) + '</b><button type="button" class="iconbtn" data-step="' + step + '" aria-label="' + T("Next", "اللي بعده") + '">›</button>' +
      '<button type="button" class="btn btn--ghost btn--sm" data-step="0">' + T("Today", "النهارده") + '</button></div>';
  }
  var fmtDay = function (d, o) { return new Date(d + "T12:00:00").toLocaleDateString(T("en-GB", "ar-EG"), o || { weekday: "long", day: "numeric", month: "long" }); };

  var drawing = 0;
  function draw() {
    if (mode === "list") return;
    var a = anchor(), my = ++drawing;
    var from, to;
    if (mode === "day") { from = to = a; }
    else if (mode === "week") { from = weekStart(a); to = X.addDays(from, 6); }
    else { var f = a.slice(0, 8) + "01"; from = weekStart(f); to = X.addDays(from, 41); }
    if (!view.innerHTML) view.innerHTML = '<p class="muted center">' + T("Loading…", "بيحمّل…") + '</p>';
    load(from, to).then(function (data) {
      if (my !== drawing) return;
      if (mode === "day") view.innerHTML = head(fmtDay(a), 1) + grid([a], data, {});
      else if (mode === "week") {
        var ds = []; for (var i = 0; i < 7; i++) ds.push(X.addDays(from, i));
        view.innerHTML = head(fmtDay(from, { day: "numeric", month: "short" }) + " – " + fmtDay(to, { day: "numeric", month: "short" }), 7) +
          '<div class="cal-wk">' + grid(ds, data, { week: true, headsOnly: true }) + '<div class="cal-scroll">' + grid(ds, data, { week: true }) + '</div></div>';
        var wk = view.querySelector(".cal-wk"), sc0 = view.querySelector(".cal-scroll"), hd = view.querySelector(".cal-grid--heads");
        sc0.addEventListener("scroll", function () { hd.style.transform = "translateX(" + (-sc0.scrollLeft) + "px)"; }, { passive: true });
      } else view.innerHTML = head(new Date(a + "T12:00:00").toLocaleDateString(T("en-GB", "ar-EG"), { month: "long", year: "numeric" }), 30) + month(from, a, data);
      var nowEl = view.querySelector(".cal-now"), sc = view.querySelector(".cal-scroll");
      if (nowEl && sc) sc.scrollTop = Math.max(0, nowEl.offsetTop - 120);
    }).catch(function (e) { X.toast(e.message, true); });
  }
  function month(from, a, data) {
    var today = X.todayISO(), m = a.slice(0, 7), html = '<div class="cal-month">' + DAY_ORDER.map(function (d) { return '<div class="cal-month__dow">' + DAY_SHORT[d] + '</div>'; }).join("");
    for (var i = 0; i < 42; i++) {
      var d = X.addDays(from, i), list = itemsOf(d, data).sort(function (x, y) { return (mins(x.from) == null ? 9999 : mins(x.from)) - (mins(y.from) == null ? 9999 : mins(y.from)); });
      var real = list.filter(function (it) { return !it.virtual; }), done = real.filter(function (it) { return it.done; }).length;
      var shown = list.filter(function (it) { return !/^(prayer|azkar):/.test(it.auto || ""); });
      var pr = list.length - shown.length;
      html += '<button type="button" class="cal-day' + (d.slice(0, 7) !== m ? " is-out" : "") + (d === today ? " is-today" : "") + (d === a ? " is-pick" : "") + '" data-go="' + d + '">' +
        '<span class="cal-day__n">' + Number(d.slice(8)) + (real.length ? ' <i style="--p:' + Math.round(done / real.length * 100) + '%"></i>' : '') + '</span>' +
        shown.slice(0, 3).map(chip).join("") + (shown.length > 3 ? '<span class="cal-more">+' + (shown.length - 3) + '</span>' : '') +
        (pr ? '<span class="cal-pr">🕌 ' + pr + '</span>' : '') + '</button>';
    }
    return html + '</div>';
  }
  view.addEventListener("click", function (ev) {
    var t = ev.target;
    var st = t.closest("[data-step]");
    if (st) {
      var n = Number(st.dataset.step), a = anchor(), d;
      if (n === 0) d = X.todayISO();
      else if (mode === "month") { var dt = new Date(a + "T12:00:00Z"); dt.setUTCMonth(dt.getUTCMonth() + (n > 0 ? 1 : -1), 1); d = dt.toISOString().slice(0, 10); }
      else d = X.addDays(a, n);
      X.loadDay(d).then(draw); return;
    }
    var go = t.closest("[data-go]");
    if (go && !t.closest("a")) { X.loadDay(go.dataset.go).then(function () { setMode(mode === "month" ? "day" : mode === "week" ? "day" : mode); }); return; }
    if (t.classList.contains("cal-ev__check")) {
      var id = Number(t.closest("[data-id]").dataset.id);
      X.api("/api/tasks?id=" + id, { method: "PATCH", body: { done: t.checked } }).then(function () { return X.afterTaskChange(); }).then(draw).catch(function (e) { X.toast(e.message, true); });
      return;
    }
    var ev2 = t.closest(".cal-ev[data-id], .cal-chip[data-id]");
    if (ev2 && !t.closest("a")) {
      var task = range && range.tasks.filter(function (x) { return x.id === Number(ev2.dataset.id); })[0];
      if (task) { setMode("list"); X.startEditTask(task); }
    }
  });
  /* ---- drag & drop on the Day / Week grid (owner, 2026-11-21: "drag drop in the schedule") ----
     A block: drag to another time (15-minute steps), or to another day in the week; its bottom edge
     makes it longer or shorter. A task from "Anytime": drag it onto the grid to give it a time.
     A prayer moved by hand keeps the new time (the page stops moving it). */
  var STEP = 15, drag = null, justDragged = 0;
  var pxToMin = function (px) { return Math.round(px / HOUR * 60 / STEP) * STEP; };
  var colAt = function (x, y) { var e = document.elementFromPoint(x, y); return e && e.closest ? e.closest(".cal-col__body") : null; };
  view.addEventListener("pointerdown", function (ev) {
    if (ev.button !== 0) return;
    var t = ev.target;
    if (t.closest(".cal-ev__check, a")) return;
    var evEl = t.closest(".cal-ev.is-drag"), chipEl = !evEl && t.closest(".cal-any .cal-chip.is-drag");
    if (!evEl && !chipEl) return;
    var el = evEl || chipEl, task = range && range.tasks.filter(function (x) { return x.id === Number(el.dataset.id); })[0];
    if (!task) return;
    drag = { el: el, task: task, chip: !!chipEl, resize: !!t.closest(".cal-ev__rs"), x0: ev.clientX, y0: ev.clientY, moved: false,
      top0: el.offsetTop, h0: el.offsetHeight, body0: el.parentNode };
    el.setPointerCapture(ev.pointerId);
  });
  view.addEventListener("pointermove", function (ev) {
    if (!drag) return;
    var dx = ev.clientX - drag.x0, dy = ev.clientY - drag.y0;
    if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 6) return;
    if (!drag.moved) {
      drag.moved = true; drag.el.classList.add("is-dragging");
      if (drag.chip) { // a chip follows the finger as a ghost
        var g = drag.el.cloneNode(true); g.className += " cal-ghost"; document.body.appendChild(g); drag.ghost = g;
        drag.tip = document.createElement("div"); drag.tip.className = "cal-droptip"; document.body.appendChild(drag.tip);
      }
    }
    ev.preventDefault();
    var body = colAt(ev.clientX, ev.clientY);
    if (drag.chip) {
      drag.ghost.style.left = ev.clientX + 8 + "px"; drag.ghost.style.top = ev.clientY + 8 + "px";
      if (body) {
        var r = body.getBoundingClientRect(), m = (+body.dataset.h0) * 60 + pxToMin(ev.clientY - r.top);
        drag.drop = { date: body.dataset.date, from: m };
        drag.tip.hidden = false; drag.tip.textContent = X.clock12(X.minToHm(m)); drag.tip.style.left = ev.clientX + 8 + "px"; drag.tip.style.top = ev.clientY - 28 + "px";
      } else { drag.drop = null; drag.tip.hidden = true; }
      return;
    }
    var h0 = +drag.body0.dataset.h0;
    if (drag.resize) {
      var hgt = Math.max(HOUR / 4, Math.round((drag.h0 + dy) / (HOUR / 4)) * (HOUR / 4));
      drag.el.style.height = hgt - 2 + "px";
      drag.from = h0 * 60 + pxToMin(drag.top0); drag.to = drag.from + pxToMin(hgt);
    } else {
      // another day's column in the week view
      if (body && body !== drag.el.parentNode && body.dataset.h0 === drag.body0.dataset.h0) body.appendChild(drag.el);
      var top = Math.max(0, Math.round((drag.top0 + dy) / (HOUR / 4)) * (HOUR / 4));
      drag.el.style.top = top + "px"; drag.el.style.left = "2px"; drag.el.style.width = "calc(100% - 4px)";
      var len = span({ from: drag.task.time_from, to: drag.task.time_to });
      drag.from = h0 * 60 + pxToMin(top); drag.to = drag.from + (len[1] - len[0]);
    }
    drag.to = Math.min(drag.to, 1439);
    var sm = drag.el.querySelector("small"); if (sm) sm.textContent = X.fmtSlot(X.minToHm(drag.from), X.minToHm(drag.to));
  });
  var endDrag = function () {
    if (!drag) return;
    var d = drag; drag = null;
    if (d.ghost) d.ghost.remove(); if (d.tip) d.tip.remove();
    d.el.classList.remove("is-dragging");
    if (!d.moved) return;
    justDragged = Date.now();
    var body = {}, t = d.task;
    if (d.chip) {
      if (!d.drop) return;
      var len = t.planned_hours ? Math.round(Number(t.planned_hours) * 60) : 30;
      body = { time_from: X.minToHm(d.drop.from), time_to: X.minToHm(Math.min(1439, d.drop.from + len)) };
      if (d.drop.date !== t.task_date) body.task_date = d.drop.date;
    } else {
      body = { time_from: X.minToHm(d.from), time_to: X.minToHm(d.to) };
      var newDate = d.el.parentNode && d.el.parentNode.dataset.date;
      if (newDate && newDate !== t.task_date) body.task_date = newDate;
      if (body.time_from === t.time_from && body.time_to === t.time_to && !body.task_date) return;
    }
    // a prayer / repeat moved by hand keeps the new time
    if (t.auto_key && !/:hand$/.test(t.auto_key)) body.auto_key = t.auto_key + ":hand";
    if (window.TimeFX) window.TimeFX.haptic();
    X.api("/api/tasks?id=" + t.id, { method: "PATCH", body: body })
      .then(function () { X.toast(T("Moved to ", "اتنقلت لـ ") + X.fmtSlot(body.time_from, body.time_to) + " ✓"); return X.loadDay(anchor(), { skipEnterAnimation: true }); })
      .then(draw).catch(function (e) { X.toast(e.message, true); draw(); });
  };
  view.addEventListener("pointerup", endDrag);
  view.addEventListener("pointercancel", function () { if (drag) { drag.moved = false; endDrag(); draw(); } });
  // a click right after a drag is the end of the drag, not a tap
  view.addEventListener("click", function (ev) { if (Date.now() - justDragged < 350) { ev.stopPropagation(); ev.preventDefault(); } }, true);

  // redraw when the day's tasks change
  window.addEventListener("time:tasks", function () { if (mode !== "list") draw(); });

  /* ---------------- panels ---------------- */
  var open = null;
  function togglePanel(name) {
    if (open === name) { panel.hidden = true; open = null; markBtns(); return; }
    open = name; panel.hidden = false; markBtns();
    if (name === "repeat") drawRepeat();
    if (name === "plan") drawPlan();
    if (name === "review") drawReview();
    panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
  function markBtns() { [["btnPlanDay", "plan"], ["btnRepeat", "repeat"], ["btnReview", "review"]].forEach(function (p) { var b = document.getElementById(p[0]); if (b) b.setAttribute("aria-expanded", String(open === p[1])); }); }
  function closeBtn() { return '<button type="button" class="iconbtn cal-panel__x" data-close aria-label="' + T("Close", "قفل") + '">✕</button>'; }
  panel.addEventListener("click", function (ev) {
    if (ev.target.closest("[data-close]")) togglePanel(open);
    if (ev.target.closest("[data-ignore]")) {
      var f = panel.querySelector(".cal-review"); if (f) lsSet("time-why-" + anchor(), f.elements.why.value || "");
      X.toast(T("Left as it is ✓", "اتساب زي ما هو ✓")); togglePanel("review");
    }
  });
  function dayChips(sel) {
    return '<div class="cal-days">' + DAY_ORDER.map(function (d) { return '<button type="button" class="cal-dchip" data-d="' + d + '" aria-pressed="' + (sel.indexOf(d) >= 0) + '">' + DAY_SHORT[d] + '</button>'; }).join("") +
      '<button type="button" class="cal-dchip cal-dchip--all" data-all>' + T("Every day", "كل يوم") + '</button></div>';
  }

  /* ---- 🔁 repeating ---- */
  var SUGGEST = [
    { title: T("Lesson", "درس"), icon: "📚", time_from: "20:00", time_to: "21:00", days: [1, 3] },
    { title: T("Quran", "قرآن"), icon: "📖", time_from: "06:15", time_to: "06:35", days: [0, 1, 2, 3, 4, 5, 6] },
    { title: T("Weekly review", "مراجعة الأسبوع"), icon: "🗓️", time_from: "20:00", time_to: "20:30", days: [5] },
  ];
  var editing = null;
  function daysText(days) {
    if (days.length === 7) return T("Every day", "كل يوم");
    return DAY_ORDER.filter(function (d) { return days.indexOf(d) >= 0; }).map(function (d) { return DAY_SHORT[d]; }).join(T(", ", "، "));
  }
  function drawRepeat() {
    X.api("/api/tasks?routines=1").then(function (d) {
      routines = d.routines || [];
      var r = editing || { title: "", icon: "🔁", time_from: "", time_to: "", days: [0, 1, 2, 3, 4, 5, 6] };
      panel.innerHTML = closeBtn() + '<h3>🔁 ' + T("Repeating events", "أحداث بتتكرر") + '</h3>' +
        '<p class="muted">' + T("Like Google Calendar: set it once, it lands on every day it repeats.", "زي Google Calendar: تتعمل مرة، وتنزل لوحدها في كل يوم بتتكرر فيه.") + '</p>' +
        '<ul class="cal-rlist">' +
        '<li class="is-built"><span>🕌</span><div><b>' + T("Prayers + azkar", "الصلوات + الأذكار") + '</b><small>' + T("Every day · times from your location", "كل يوم · المواقيت من مكانك") + '</small></div><em>' + T("built in", "تلقائي") + '</em></li>' +
        '<li class="is-built"><span>😴</span><div><b>' + T("Sleep · qailula · breakfast · gym", "النوم · القيلولة · الفطار · الجيم") + '</b><small>' + T("Move with Fajr every day: wake at Fajr, 6h sleep before it", "بيتحركوا مع الفجر كل يوم: تصحى الفجر، و6 ساعات نوم قبله") + '</small></div>' +
          '<button type="button" class="btn btn--ghost btn--sm" data-daysettings>⚙️ ' + T("Change", "غيّر") + '</button></li>' +
        routines.map(function (x) {
          return '<li data-rid="' + x.id + '"><span>' + esc(x.icon || "🔁") + '</span><div><b>' + esc(x.title) + '</b><small>' + esc(daysText(x.days)) + (x.time_from ? " · " + esc(X.fmtSlot(x.time_from, x.time_to)) : " · " + T("any time", "أي وقت")) + '</small></div>' +
            '<button type="button" class="iconbtn" data-redit="' + x.id + '" title="' + T("Edit", "تعديل") + '">✎</button><button type="button" class="iconbtn" data-rdel="' + x.id + '" title="' + T("Delete", "مسح") + '">✕</button></li>';
        }).join("") + '</ul>' +
        (editing ? '' : '<div class="cal-suggest">' + T("Quick add:", "إضافة سريعة:") + ' ' + SUGGEST.map(function (s, i) { return '<button type="button" class="chipc" data-sug="' + i + '">' + s.icon + " " + esc(s.title) + '</button>'; }).join("") + '</div>') +
        '<form class="form form--grid cal-rform">' +
        '<label class="span2"><span>' + T("What", "إيه") + '</span><input name="title" required value="' + esc(r.title) + '" placeholder="' + T("e.g. Gym", "مثلاً: جيم") + '"></label>' +
        '<label><span>' + T("Icon", "أيقونة") + '</span><input name="icon" maxlength="4" value="' + esc(r.icon || "") + '"></label>' +
        '<label><span>' + T("From", "من") + '</span><input name="time_from" type="time" value="' + esc(r.time_from || "") + '"></label>' +
        '<label><span>' + T("To", "لحد") + '</span><input name="time_to" type="time" value="' + esc(r.time_to || "") + '"></label>' +
        '<div class="span2"><span class="cal-lbl">' + T("Repeats on", "بيتكرر يوم") + '</span>' + dayChips(r.days) + '</div>' +
        '<p class="span2 muted cal-hint">' + T("No time = it goes in “Anytime”. An end before the start runs overnight (sleep).", "من غير وقت = بيروح في “أي وقت”. لو النهاية قبل البداية يبقى بيعدّي نص الليل (زي النوم).") + '</p>' +
        '<div class="span2"><button type="submit" class="btn btn--primary">' + (editing ? T("Save changes", "حفظ التعديل") : T("Add", "إضافة")) + '</button>' +
        (editing ? ' <button type="button" class="btn btn--ghost" data-rcancel>' + T("Cancel", "إلغاء") + '</button>' : '') + '</div></form>';
    }).catch(function (e) { X.toast(e.message, true); });
  }
  panel.addEventListener("click", function (ev) {
    var t = ev.target;
    var dc = t.closest(".cal-dchip");
    if (dc) {
      var box = dc.parentNode;
      if (dc.hasAttribute("data-all")) { var allOn = box.querySelectorAll('[data-d][aria-pressed="true"]').length === 7; box.querySelectorAll("[data-d]").forEach(function (b) { b.setAttribute("aria-pressed", String(!allOn)); }); }
      else dc.setAttribute("aria-pressed", String(dc.getAttribute("aria-pressed") !== "true"));
      return;
    }
    if (t.closest("[data-daysettings]")) { togglePanel("repeat"); X.openDaySettings(); return; }
    if (t.dataset.sug != null) { editing = null; var s = SUGGEST[+t.dataset.sug]; drawFormFrom(s); return; }
    if (t.dataset.redit) { editing = routines.filter(function (x) { return x.id === +t.dataset.redit; })[0]; drawRepeat(); return; }
    if (t.hasAttribute && t.hasAttribute("data-rcancel")) { editing = null; drawRepeat(); return; }
    if (t.dataset.rdel) {
      var r = routines.filter(function (x) { return x.id === +t.dataset.rdel; })[0];
      if (!r || !confirm(T('Stop "' + r.title + '" from today on?', 'توقّف "' + r.title + '" من النهارده؟'))) return;
      X.api("/api/tasks?routines=1&id=" + r.id + "&from=" + X.todayISO(), { method: "DELETE" }).then(function () { X.toast(T("Removed ✓", "اتشال ✓")); drawRepeat(); return X.loadDay(anchor()); }).catch(function (e) { X.toast(e.message, true); });
    }
  });
  function drawFormFrom(s) {
    var f = panel.querySelector(".cal-rform"); if (!f) return;
    f.elements.title.value = s.title; f.elements.icon.value = s.icon; f.elements.time_from.value = s.time_from; f.elements.time_to.value = s.time_to;
    f.querySelectorAll("[data-d]").forEach(function (b) { b.setAttribute("aria-pressed", String(s.days.indexOf(+b.dataset.d) >= 0)); });
    f.elements.title.focus();
  }
  panel.addEventListener("submit", function (ev) {
    var f = ev.target;
    if (f.classList.contains("cal-rform")) {
      ev.preventDefault();
      var days = [].map.call(f.querySelectorAll('[data-d][aria-pressed="true"]'), function (b) { return +b.dataset.d; });
      if (!days.length) { X.toast(T("Pick at least one day", "اختار يوم واحد على الأقل"), true); return; }
      var body = { title: f.elements.title.value, icon: f.elements.icon.value || null, time_from: f.elements.time_from.value || null, time_to: f.elements.time_to.value || null, days: days, start_date: X.todayISO() };
      if (body.time_to && !body.time_from) { X.toast(T("Add a start time too", "حط وقت البداية كمان"), true); return; }
      var req = editing ? X.api("/api/tasks?routines=1&id=" + editing.id + "&from=" + X.todayISO(), { method: "PATCH", body: body }) : X.api("/api/tasks?routines=1", { method: "POST", body: body });
      req.then(function () { X.toast(editing ? T("Saved ✓", "اتحفظ ✓") : T("Added — it repeats from today ✓", "اتضاف — بيتكرر من النهارده ✓")); X.playAdd(); editing = null; drawRepeat(); return X.loadDay(anchor()); })
        .catch(function (e) { X.toast(e.message, true); });
    }
    if (f.classList.contains("cal-pform")) { ev.preventDefault(); makePlan(f); }
    if (f.classList.contains("cal-review")) { ev.preventDefault(); moveToTomorrow(f); }
  });

  /* ---- 🧠 plan my day ---- */
  // start/end empty = automatic: the day starts when breakfast ends, ends 30 min before sleep
  var PLAN_DEFAULT = { start: "", end: "", focusFrom: "09:00", focusTo: "12:00", buffer: 60 };
  var W = {
    important: /client|customer|money|pay|bill|invoice|deadline|proposal|interview|health|doctor|family|wife|exam|goal|project|launch|contract|عميل|عملاء|فلوس|دفع|فاتور|مهم|صح[ةه]|دكتور|مرات|زوج|أهل|اهل|مشروع|هدف|امتحان|مقابل|عقد|إطلاق/i,
    urgent: /today|tonight|now|asap|urgent|overdue|due|before|deadline|reply|call back|النهارده|النهاردة|دلوقتي|حالا|حالًا|ضروري|مستعجل|قبل|متأخر|آخر ميعاد|اخر ميعاد/i,
    focus: /study|learn|read|course|think|plan|research|design|write|strategy|مذاكر|أذاكر|اذاكر|اتعلم|أتعلم|كورس|أفكر|افكر|فكّر|تفكير|تخطيط|خطة|خطه|بحث|أكتب|اكتب|تصميم/i,
    drop: /maybe|someday|scroll|youtube|netflix|tiktok|instagram|browse|ممكن|يمكن|فيسبوك|يوتيوب|تيك توك|انستا/i,
    calls: /\bcall|phone|ring|مكالم|كلّم|كلم |اتصل|تليفون/i,
    errands: /errand|buy|shop|pick up|groceries|bank|pharmacy|مشوار|اشتري|أشتري|سوبر|بنك|صيدلي/i,
    msgs: /email|e-mail|reply|message|whatsapp|text |رد |ايميل|إيميل|رسال|واتس/i,
  };
  function parseLine(line) {
    var t = line.trim(); if (!t) return null;
    var m = 0, imp = 0, urg = 0;
    if (/!!/.test(t)) { imp = 2; urg = 2; } else if (/!/.test(t)) imp = 2;
    t = t.replace(/!+/g, " ");
    var rules = [
      [/ساعة\s*و\s*نص|ساعه\s*و\s*نص/, 90], [/ساعتين/, 120], [/نص\s*ساع[ةه]/, 30], [/ربع\s*ساع[ةه]/, 15], [/\bhalf\s*(an\s*)?hour\b/i, 30],
    ];
    rules.forEach(function (r) { if (!m && r[0].test(t)) { m = r[1]; t = t.replace(r[0], " "); } });
    var re = /(\d+(?:[.,]\d+)?)\s*(m|min|mins|minutes?|د|دق|دقيق[ةه]|دقايق|دقائق|h|hr|hrs|hours?|س|ساع[ةه]|ساعات)(?=\s|$|[,.،])/i, x = re.exec(t);
    if (!m && x) { var n = parseFloat(x[1].replace(",", ".")); m = /^(h|hr|hrs|hour|hours|س|ساع)/i.test(x[2]) ? n * 60 : n; t = t.replace(x[0], " "); }
    if (!m && /(^|\s)(ساع[ةه]|hour)(\s|$)/i.test(t)) { m = 60; t = t.replace(/(^|\s)(ساع[ةه]|hour)(\s|$)/i, " "); }
    t = t.replace(/\s+/g, " ").trim();
    if (W.important.test(t)) imp++;
    if (W.urgent.test(t)) urg++;
    var cat = X.categories().filter(function (c) { return c.name && new RegExp(c.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(t); })[0];
    if (cat) imp++;
    var batch = W.calls.test(t) ? "calls" : W.errands.test(t) ? "errands" : W.msgs.test(t) ? "msgs" : null;
    var it = { title: t, est: m || 0, imp: imp, urg: urg, cat: cat ? cat.id : null, batch: batch, focus: W.focus.test(t), dropWord: W.drop.test(t) };
    it.q = qOf(it);
    return it;
  }
  // Eisenhower: important × urgent → do first · schedule · quick / hand off · drop
  function qOf(it) {
    if (it.at) return it.imp && it.urg ? "do" : it.imp ? "plan" : "quick"; // a fixed time is never dropped
    if (it.dropWord && !it.imp && !it.urg) return "drop";
    if (it.imp && it.urg) return "do";
    if (it.imp) return "plan";
    if (it.urg) return "quick";
    return it.est && it.est <= 20 ? "quick" : "plan";
  }
  var Q = {
    do: { l: T("Do first", "اعمله الأول"), c: "q-do" }, plan: { l: T("Schedule", "حدّد له ميعاد"), c: "q-plan" },
    quick: { l: T("Quick / hand off", "بسرعة / اديه لحد"), c: "q-quick" }, drop: { l: T("Drop", "امسحه"), c: "q-drop" },
  };
  var QORDER = ["do", "plan", "quick", "drop"];
  var planItems = [];
  function drawPlan() {
    var cfg = Object.assign({}, PLAN_DEFAULT, lsGet("time-planner", {}));
    var rows = lsGet("time-plan-rows", null);
    if (!rows || !rows.length) rows = [{ t: "", d: 30 }];
    panel.innerHTML = closeBtn() + '<h3>🧠 ' + T("Plan my day", "خطّط يومي") + '</h3>' +
      '<p class="muted cal-hint">' + T("Write everything you have today. Pick how long, tap ⭐ if it's important and ⚡ if it's urgent. If it must happen at a set time (a meeting), put the time.",
        "اكتب كل اللي عليك النهارده. اختار هياخد قد إيه، ودوس ⭐ لو مهم و⚡ لو مستعجل. ولو لازم يتعمل في ساعة معينة (زي ميعاد)، اكتب الساعة.") + '</p>' +
      '<form class="form cal-pform"><div class="cal-rows">' + rows.map(rowHtml).join("") + '</div>' +
      '<button type="button" class="btn btn--ghost btn--sm cal-addrow" data-pr="add">＋ ' + T("Add another", "ضيف كمان") + '</button>' +
      '<details class="cal-paste"><summary>' + T("Or paste a list", "أو الصق قايمة") + '</summary>' +
        '<textarea name="dump" rows="5" placeholder="' + esc(T("One per line, e.g.\nCall the bank 10m\nClient proposal 2h !!", "كل حاجة في سطر، مثلاً:\nأكلم البنك 10m\nعرض العميل ساعتين !!")) + '"></textarea>' +
        '<button type="button" class="btn btn--ghost btn--sm" data-pr="paste">⬆️ ' + T("Turn into rows", "حوّلها لصفوف") + '</button></details>' +
      '<details class="cal-cfg"><summary>' + T("My day settings", "إعدادات يومي") + '</summary><div class="form--grid">' +
      '<label><span>' + T("Day starts (empty = after breakfast)", "اليوم بيبدأ (فاضي = بعد الفطار)") + '</span><input type="time" name="start" value="' + cfg.start + '"></label>' +
      '<label><span>' + T("Day ends (empty = before sleep)", "اليوم بيخلص (فاضي = قبل النوم)") + '</span><input type="time" name="end" value="' + cfg.end + '"></label>' +
      '<label><span>' + T("Focus from", "التركيز من") + '</span><input type="time" name="focusFrom" value="' + cfg.focusFrom + '"></label>' +
      '<label><span>' + T("Focus to", "التركيز لحد") + '</span><input type="time" name="focusTo" value="' + cfg.focusTo + '"></label>' +
      '<label><span>' + T("Free time kept (min)", "وقت فاضي للمفاجآت (دقيقة)") + '</span><input type="number" min="0" max="240" step="15" name="buffer" value="' + cfg.buffer + '"></label></div></details>' +
      '<button type="submit" class="btn btn--primary">✨ ' + T("Sort it and plan", "رتّبها وخطّط") + '</button></form><div class="cal-plan" id="calPlan"></div>';
  }
  var DURS = [5, 10, 15, 20, 30, 45, 60, 90, 120, 150, 180, 240];
  // 90 → "1.5 h", 160 → "2 h 40 min", 45 → "45 min"
  function durText(m) {
    m = Math.round(m);
    if (m < 60) return m + T(" min", " دقيقة");
    if (m % 30 === 0) return (m / 60) + T(" h", " ساعة");
    return Math.floor(m / 60) + T(" h ", " ساعة و") + (m % 60) + T(" min", " دقيقة");
  }
  function rowHtml(r) {
    var d = DURS.indexOf(r.d) >= 0 ? r.d : 30;
    return '<div class="cal-row">' +
      '<input class="cal-row__t" value="' + esc(r.t || "") + '" placeholder="' + T("What do you need to do?", "عايز تعمل إيه؟") + '" enterkeyhint="next">' +
      '<select class="cal-row__d" aria-label="' + T("How long", "هياخد قد إيه") + '">' + DURS.map(function (m) { return '<option value="' + m + '"' + (m === d ? " selected" : "") + '>⏱ ' + durText(m) + '</option>'; }).join("") + '</select>' +
      '<button type="button" class="cal-tg" data-pr="i" aria-pressed="' + !!r.i + '" title="' + T("Important", "مهم") + '">⭐ <span>' + T("Important", "مهم") + '</span></button>' +
      '<button type="button" class="cal-tg cal-tg--u" data-pr="u" aria-pressed="' + !!r.u + '" title="' + T("Urgent", "مستعجل") + '">⚡ <span>' + T("Urgent", "مستعجل") + '</span></button>' +
      '<label class="cal-row__at" title="' + T("Only if it has a set time", "بس لو ليها ساعة معينة") + '">🕒<input type="time" value="' + esc(r.at || "") + '"></label>' +
      '<button type="button" class="iconbtn" data-pr="del" aria-label="' + T("Remove", "شيل") + '">✕</button></div>';
  }
  function readRows() {
    return [].map.call(panel.querySelectorAll(".cal-row"), function (el) {
      return { t: el.querySelector(".cal-row__t").value, d: +el.querySelector(".cal-row__d").value, i: el.querySelector('[data-pr="i"]').getAttribute("aria-pressed") === "true",
        u: el.querySelector('[data-pr="u"]').getAttribute("aria-pressed") === "true", at: el.querySelector(".cal-row__at input").value || "" };
    });
  }
  function saveRows() { lsSet("time-plan-rows", readRows()); }
  function addRow(r, focus) {
    var box = panel.querySelector(".cal-rows"); if (!box) return;
    box.insertAdjacentHTML("beforeend", rowHtml(r || { t: "", d: 30 }));
    if (focus) box.lastElementChild.querySelector(".cal-row__t").focus();
  }
  panel.addEventListener("click", function (ev) {
    var b = ev.target.closest("[data-pr]"); if (!b) return;
    var row = b.closest(".cal-row");
    if (b.dataset.pr === "add") addRow(null, true);
    if (b.dataset.pr === "del" && row) { row.remove(); if (!panel.querySelector(".cal-row")) addRow(null, true); }
    if (b.dataset.pr === "i" || b.dataset.pr === "u") b.setAttribute("aria-pressed", String(b.getAttribute("aria-pressed") !== "true"));
    if (b.dataset.pr === "paste") {
      var ta = panel.querySelector('textarea[name="dump"]'), lines = ta.value.split("\n").map(parseLine).filter(Boolean);
      if (!lines.length) return;
      // empty rows give way to the pasted ones
      panel.querySelectorAll(".cal-row").forEach(function (r) { if (!r.querySelector(".cal-row__t").value.trim()) r.remove(); });
      lines.forEach(function (it) {
        var d = DURS.reduce(function (best, m) { return Math.abs(m - (it.est || 30)) < Math.abs(best - (it.est || 30)) ? m : best; }, 30);
        addRow({ t: it.title, d: d, i: it.imp >= 2, u: it.urg >= 2 });
      });
      ta.value = ""; b.closest("details").open = false;
    }
    saveRows();
  });
  panel.addEventListener("input", function (ev) { if (ev.target.closest(".cal-row")) saveRows(); });
  panel.addEventListener("keydown", function (ev) {
    if (ev.key === "Enter" && ev.target.classList.contains("cal-row__t")) {
      ev.preventDefault();
      var next = ev.target.closest(".cal-row").nextElementSibling;
      if (next) next.querySelector(".cal-row__t").focus(); else addRow(null, true);
    }
  });

  function makePlan(f) {
    saveRows();
    var cfg = { start: f.elements.start.value || "", end: f.elements.end.value || "", focusFrom: f.elements.focusFrom.value || PLAN_DEFAULT.focusFrom, focusTo: f.elements.focusTo.value || PLAN_DEFAULT.focusTo, buffer: Math.max(0, Number(f.elements.buffer.value) || 0) };
    lsSet("time-planner", cfg);
    planItems = readRows().filter(function (r) { return r.t.trim(); }).map(function (r) {
      // the words still count (client, money, today…); the buttons add to them
      var it = parseLine(r.t);
      it.est = r.d || it.est || 30;
      if (r.i) it.imp = Math.max(it.imp, 2);
      if (r.u) it.urg = Math.max(it.urg, 2);
      it.at = r.at || "";
      it.q = qOf(it);
      return it;
    });
    if (!planItems.length) { X.toast(T("Write at least one thing", "اكتب حاجة واحدة على الأقل"), true); return; }
    layoutPlan(cfg);
  }
  // the planner: sort, pick 3, add 30%, batch, then place in the free time
  function layoutPlan(cfg) {
    var date = anchor(), tasks = X.state.dayTasks || [];
    planItems.forEach(function (it) {
      it.est = it.est || (it.q === "quick" ? 15 : 30);
      it.now = !it.at && it.est <= 2;
      it.len = it.at ? it.est : it.now ? it.est : Math.ceil(it.est * 1.3 / 5) * 5;
      it.score = { do: 300, plan: 200, quick: 100, drop: 0 }[it.q] + it.imp * 20 + it.urg * 15 + Math.min(60, it.est) / 6;
    });
    var live = planItems.filter(function (it) { return it.q !== "drop" && !it.now; }).sort(function (a, b) { return b.score - a.score; });
    // the top 3 are only ever important things: fewer stars beats a filler star
    var top = live.filter(function (it) { return it.q === "do" || it.imp > 0; }).slice(0, 3);
    planItems.forEach(function (it) { it.top = top.indexOf(it) >= 0; });
    // batches: the non-top calls / errands / messages go together
    var blocks = [], groups = {}, fixed = [];
    live.forEach(function (it) {
      if (it.at) { fixed.push({ items: [it], title: it.title, len: it.len, top: it.top, q: it.q, cat: it.cat, fixed: true, slot: [mins(it.at), mins(it.at) + it.len] }); return; }
      if (it.batch && !it.top) { (groups[it.batch] = groups[it.batch] || []).push(it); return; }
      // hard = needs the focus hours: the top 3, anything long, and studying / thinking things through
      blocks.push({ items: [it], title: it.title, len: it.len, top: it.top, q: it.q, hard: it.top || it.focus || it.est >= 45, cat: it.cat });
    });
    var BN = { calls: T("📞 Calls", "📞 المكالمات"), errands: T("🛒 Errands", "🛒 المشاوير"), msgs: T("✉️ Messages", "✉️ الرسايل") };
    Object.keys(groups).forEach(function (k) {
      var g = groups[k];
      if (g.length === 1) { var it = g[0]; blocks.push({ items: g, title: it.title, len: it.len, top: false, q: it.q, cat: it.cat }); return; }
      blocks.push({ items: g, title: BN[k] + ": " + g.map(function (x) { return x.title; }).join(T(", ", "، ")), len: g.reduce(function (s, x) { return s + x.len; }, 0), top: false, q: g[0].q, batch: true });
    });
    // free time: the day's window minus what is already timed (prayers, meetings, repeats)
    var byKey = function (k) { return tasks.filter(function (t) { return String(t.auto_key || "").replace(/:hand$/, "") === k; })[0]; };
    var bf = byKey("life:breakfast") || byKey("azkar:morning"), sl = byKey("life:sleep");
    var a = cfg.start ? mins(cfg.start) : bf && bf.time_to ? mins(bf.time_to) : 8 * 60;
    var b = cfg.end ? mins(cfg.end) : sl && sl.time_from && mins(sl.time_from) > 12 * 60 ? mins(sl.time_from) - 30 : 22 * 60;
    if (date === X.todayISO()) { var n = new Date(); a = Math.max(a, Math.ceil((n.getHours() * 60 + n.getMinutes()) / 15) * 15); }
    var sleepAt = sl && sl.time_from && mins(sl.time_from) > 12 * 60 ? mins(sl.time_from) : 1440;
    var busy = [];
    tasks.forEach(function (t) { if (!t.time_from) return; var s = mins(t.time_from), e = t.time_to ? mins(t.time_to) : s + 30; if (e <= s) { busy.push([s, 1440]); busy.push([0, e]); } else busy.push([s, e]); });
    busy.sort(function (x, y) { return x[0] - y[0]; });
    var free = [[a, b]];
    var carve = function (bz) { free = free.flatMap(function (f) { if (bz[1] <= f[0] || bz[0] >= f[1]) return [f]; var out = []; if (bz[0] > f[0]) out.push([f[0], bz[0]]); if (bz[1] < f[1]) out.push([bz[1], f[1]]); return out; }); };
    busy.forEach(carve);
    // fixed-time things first, where they were asked to be; say if they clash with a prayer or a meeting
    fixed.forEach(function (bk) {
      carve(bk.slot);
      var clash = tasks.filter(function (t) { if (!t.time_from) return false; var s = mins(t.time_from), e = t.time_to ? mins(t.time_to) : s + 30; if (e <= s) e = 1440; return s < bk.slot[1] && e > bk.slot[0]; });
      bk.clash = clash.map(function (t) { return t.title; }).join(T(", ", "، "));
    });
    var total = free.reduce(function (s, f) { return s + Math.max(0, f[1] - f[0]); }, 0), used = 0;
    var fa = mins(cfg.focusFrom), fb = mins(cfg.focusTo);
    var take = function (len, lo, hi) {
      for (var i = 0; i < free.length; i++) {
        var s = Math.max(free[i][0], lo), e = Math.min(free[i][1], hi);
        if (e - s >= len) { var f = free[i], r = [s, s + len], parts = []; if (r[0] > f[0]) parts.push([f[0], r[0]]); if (r[1] < f[1]) parts.push([r[1], f[1]]); free.splice.apply(free, [i, 1].concat(parts)); return r; }
      }
      return null;
    };
    // order: "do first" always first (important + urgent always gets a time), then the rest of the top 3, schedule, quick
    blocks.sort(function (x, y) { return ((x.q === "do" ? 0 : 1) - (y.q === "do" ? 0 : 1)) || (y.top - x.top) || (QORDER.indexOf(x.q) - QORDER.indexOf(y.q)) || (y.len - x.len); });
    // the biggest free gap (≥ 25 min) inside a window, earliest first among the biggest
    var biggest = function (lo, hi) {
      var best = null;
      free.forEach(function (f) { var s = Math.max(f[0], lo), e = Math.min(f[1], hi); if (e - s >= 25 && (!best || e - s > best[1] - best[0])) best = [s, e]; });
      return best;
    };
    var parts = fixed.map(function (bk) { return { bk: bk, slot: bk.slot }; });
    blocks.forEach(function (bk) {
      var must = bk.q === "do";
      // the hour kept for surprises never pushes out an important + urgent one
      if (!must && used + bk.len > total - cfg.buffer) { bk.left = true; return; }
      var r = (bk.hard && take(bk.len, fa, fb)) || take(bk.len, 0, 1440);
      if (r) { used += bk.len; parts.push({ bk: bk, slot: r }); return; }
      // too long for any one gap: split it into rounds across the gaps, focus hours first
      if (bk.len < 50 && !must) { bk.left = true; return; }
      var rest = bk.len, mine = [];
      while (rest > 0 && mine.length < 6) {
        var g = (bk.hard && biggest(fa, fb)) || biggest(0, 1440);
        if (!g) break;
        var chunk = Math.min(rest, g[1] - g[0]), after = rest - chunk;
        if (after > 0 && after < 25) after = 25; // a last round is never shorter than one pomodoro
        var rr = take(chunk, g[0], g[1]); if (!rr) break;
        mine.push(rr); used += chunk; rest = after;
      }
      // still not all in: "do first" goes on after the day's end (before sleep), then in any 15-minute gap
      if (rest > 0 && must) {
        var late = [Math.max(b, a), sleepAt];
        busy.forEach(function (bz) { if (bz[0] < late[1] && bz[1] > late[0]) { if (bz[0] <= late[0]) late[0] = Math.max(late[0], bz[1]); else late[1] = Math.min(late[1], bz[0]); } });
        if (late[1] - late[0] >= Math.min(rest, 15)) { var lr = [late[0], Math.min(late[1], late[0] + rest)]; mine.push(lr); used += lr[1] - lr[0]; rest -= lr[1] - lr[0]; bk.late = true; }
        while (rest > 0 && mine.length < 8) {
          var g2 = null; free.forEach(function (f) { if (!g2 && f[1] - f[0] >= 15) g2 = f; });
          if (!g2) break;
          var c2 = Math.min(rest, g2[1] - g2[0]), r2 = take(c2, g2[0], g2[1]); if (!r2) break;
          mine.push(r2); used += c2; rest -= c2;
        }
        mine.sort(function (x, y) { return x[0] - y[0]; });
      }
      if (rest > 0) { bk.left = true; bk.rest = rest; }
      mine.forEach(function (rr, i) { parts.push({ bk: bk, slot: rr, part: i + 1, of: mine.length }); });
    });
    planItems.forEach(function (it) { it.slotAt = null; });
    parts.forEach(function (pt) { pt.bk.items.forEach(function (it) { if (it.slotAt == null || pt.slot[0] < it.slotAt) it.slotAt = pt.slot[0]; }); });
    var placed = parts.map(function (pt) {
      return { title: pt.bk.title + (pt.of > 1 ? " (" + pt.part + "/" + pt.of + ")" : ""), len: pt.slot[1] - pt.slot[0], top: pt.bk.top, q: pt.bk.q, hard: pt.bk.hard, batch: pt.bk.batch, cat: pt.bk.cat, slot: pt.slot, fixed: pt.bk.fixed, clash: pt.bk.clash, late: pt.bk.late && pt.slot[0] >= b };
    }).sort(function (x, y) { return x.slot[0] - y.slot[0]; });
    var unplaced = blocks.filter(function (bk) { return bk.left; }).map(function (bk) { return { title: bk.title + (bk.rest ? T(" (the rest)", " (الباقي)") : ""), len: bk.rest || bk.len, cat: bk.cat, q: bk.q, top: bk.top }; });
    var mustLeft = unplaced.filter(function (u) { return u.q === "do"; });
    var nowList = planItems.filter(function (it) { return it.now; }), drops = planItems.filter(function (it) { return it.q === "drop"; });
    var pomo = function (len) { return len >= 50 ? " · 🍅 ×" + Math.ceil(len / 30) : ""; };
    var box = document.getElementById("calPlan");
    box.innerHTML =
      // 1) the four squares: important × urgent, each task where it falls (tap one to move it)
      '<h4>' + T("1. Your four squares — tap a task to move it to the next square", "١. المربعات الأربعة — دوس على أي مهمة عشان تنقلها للمربع اللي بعده") + '</h4>' +
      '<div class="eis"><span class="eis__ax eis__ax--top">' + T("Urgent", "مستعجل") + '</span><span class="eis__ax eis__ax--top2">' + T("Not urgent", "مش مستعجل") + '</span>' +
      '<span class="eis__ax eis__ax--side">' + T("Important", "مهم") + '</span><span class="eis__ax eis__ax--side2">' + T("Not important", "مش مهم") + '</span>' +
      ["do", "plan", "quick", "drop"].map(function (q) {
        var tip = { do: T("Do it today, first", "اعمله النهارده الأول"), plan: T("Give it a time", "حدّد له ميعاد"), quick: T("Fast, or hand it off", "خلّصه بسرعة أو اديه لحد"), drop: T("Delete it", "امسحه") }[q];
        var mine = planItems.map(function (it, i) { return { it: it, i: i }; }).filter(function (x) { return x.it.q === q; });
        return '<div class="eis__sq ' + Q[q].c + '"><b>' + Q[q].l + '</b><small>' + tip + '</small>' +
          (mine.length ? mine.map(function (x) {
            var it = x.it;
            return '<button type="button" class="eis__t" data-q="' + x.i + '">' + (it.top ? "⭐ " : "") + (it.at ? "📌 " : "") + (it.now ? "⚡ " : "") + esc(it.title) +
              '<em>' + (it.at ? X.fmtSlot(it.at) + " · " : it.slotAt != null ? "🕒 " + X.fmtSlot(X.minToHm(it.slotAt)) + " · " : "") + (it.now ? T("now", "دلوقتي") : durText(it.est) + (it.at ? "" : " → " + durText(it.len) + T(" with +30%", " بعد +30%"))) + '</em></button>';
          }).join("") : '<i class="eis__empty">—</i>') + '</div>';
      }).join("") + '</div>' +
      (top.length ? '<h4>' + T("2. Today's top 3 — if these are done, the day is a win", "٢. أهم 3 النهارده — لو خلصوا يبقى يومك ناجح") + '</h4><ol class="cal-top">' + top.map(function (it) { return '<li>⭐ ' + esc(it.title) + '</li>'; }).join("") + '</ol>' : '') +
      (nowList.length ? '<h4>⚡ ' + T("Under 2 minutes — just do them now", "أقل من دقيقتين — اعملها دلوقتي") + '</h4><ul class="cal-mini">' + nowList.map(function (it) { return '<li>' + esc(it.title) + '</li>'; }).join("") + '</ul>' : '') +
      '<h4>' + T("3. Your blocks", "٣. البلوكات بتاعتك") + ' <small class="muted">' + T("(between prayers, meetings and repeats; ", "(بين الصلوات والمواعيد والحاجات المتكررة؛ ") + cfg.buffer + T(" min kept free)", " دقيقة فاضية للمفاجآت)") + '</small></h4>' +
      (placed.length ? '<p class="muted cal-hint">' + T("Change any time or name before you approve — or ✕ to take it out. You can still edit after.", "غيّر أي وقت أو اسم قبل ما توافق، أو ✕ تشيله. وتقدر تعدّل بعد الموافقة كمان.") + '</p>' +
        '<ul class="cal-blocks">' + placed.map(function (bk, i) {
        return '<li class="' + Q[bk.q].c + '" data-b="' + i + '"><span class="cal-bt"><input type="time" class="cal-bf" value="' + X.minToHm(bk.slot[0]) + '"><i>–</i><input type="time" class="cal-bto" value="' + X.minToHm(bk.slot[1]) + '"></span>' +
          '<input class="cal-bn" value="' + esc((bk.top ? "⭐ " : "") + bk.title) + '"><button type="button" class="iconbtn" data-bx="' + i + '" aria-label="' + T("Take out", "شيلها") + '">✕</button>' +
          '<small>' + (bk.fixed ? "📌 " + T("set time", "ساعة ثابتة") + " · " : "") + Q[bk.q].l + ' · ' + durText(bk.len) + pomo(bk.len) +
          (bk.clash ? ' · <b class="cal-clash">⚠️ ' + T("same time as ", "في نفس وقت ") + esc(bk.clash) + '</b>' : '') +
          (bk.late ? ' · <b class="cal-clash">🌙 ' + T("after your day's end — it's important + urgent", "بعد نهاية يومك — عشان مهم ومستعجل") + '</b>' : '') + (bk.hard && bk.slot[0] >= fa && bk.slot[1] <= fb ? T(" · in your focus hours", " · في وقت تركيزك") : "") + '</small></li>';
      }).join("") + '</ul>' : '<p class="muted">' + T("No free time left in the day for these.", "مفيش وقت فاضي في اليوم للحاجات دي.") + '</p>') +
            // important + urgent always gets a time: what the day can't hold, you give a time to here
      (mustLeft.length ? '<h4 class="cal-clash">⚠️ ' + T("Not enough hours today for all of \"Do first\" — give these a time", "اليوم مش مكفّي كل \"اعمله الأول\" — حدّد وقت للدول") + '</h4>' +
        '<ul class="cal-blocks cal-must">' + mustLeft.map(function (u, i) {
          return '<li class="q-do" data-m="' + i + '"><span class="cal-bt"><input type="time" class="cal-bf" required><i>–</i><input type="time" class="cal-bto"></span>' +
            '<input class="cal-bn" value="' + esc((u.top ? "⭐ " : "") + u.title) + '"><span></span><small>' + durText(u.len) + T(" · pick the start, the end fills itself", " · اختار البداية والنهاية بتتحسب لوحدها") + '</small></li>';
        }).join("") + '</ul>' : '') +
      (unplaced.length > mustLeft.length ? '<h4>' + T("Didn't fit today", "ما لحقتش النهارده") + '</h4><ul class="cal-mini">' + unplaced.filter(function (u) { return u.q !== "do"; }).map(function (bk) { return '<li>' + esc(bk.title) + ' <small>' + durText(bk.len) + '</small></li>'; }).join("") + '</ul>' +
        '<label class="cal-check"><input type="checkbox" id="calPlanLoose" checked> ' + T("Add these without a time (do them if there's room)", "ضيفهم من غير وقت (لو فيه وقت اعملهم)") + '</label>' : '') +
      (drops.length ? '<p class="muted cal-hint">🗑️ ' + T("The \"Drop\" square isn't added to your day.", "مربع \"امسحه\" مش بيتحط في يومك.") + '</p>' : '') +
      '<button type="button" class="btn btn--primary" id="calPlanGo">✅ ' + T("Put it on my day", "حطها في يومي") + '</button>';
    box.scrollIntoView({ behavior: "smooth", block: "start" });
    // drag a task from one square to another
    var eDrag = null, eJust = 0;
    box.onpointerdown = function (ev) {
      var t = ev.target.closest(".eis__t"); if (!t || ev.button !== 0) return;
      eDrag = { el: t, i: +t.dataset.q, x0: ev.clientX, y0: ev.clientY, moved: false };
      t.setPointerCapture(ev.pointerId);
    };
    box.onpointermove = function (ev) {
      if (!eDrag) return;
      if (!eDrag.moved && Math.abs(ev.clientX - eDrag.x0) + Math.abs(ev.clientY - eDrag.y0) < 6) return;
      ev.preventDefault();
      if (!eDrag.moved) { eDrag.moved = true; eDrag.ghost = eDrag.el.cloneNode(true); eDrag.ghost.classList.add("cal-ghost"); document.body.appendChild(eDrag.ghost); eDrag.el.classList.add("is-dragging"); }
      eDrag.ghost.style.left = ev.clientX - 20 + "px"; eDrag.ghost.style.top = ev.clientY - 14 + "px";
      var under = document.elementFromPoint(ev.clientX, ev.clientY), sq = under && under.closest && under.closest(".eis__sq");
      box.querySelectorAll(".eis__sq").forEach(function (s) { s.classList.toggle("is-over", s === sq); });
    };
    box.onpointerup = function (ev) {
      if (!eDrag) return;
      var d = eDrag; eDrag = null;
      if (d.ghost) d.ghost.remove();
      if (!d.moved) return;
      eJust = Date.now();
      var under = document.elementFromPoint(ev.clientX, ev.clientY), sq = under && under.closest && under.closest(".eis__sq");
      var q = sq && QORDER.filter(function (k) { return sq.classList.contains(Q[k].c); })[0];
      if (q && planItems[d.i].q !== q) { planItems[d.i].q = q; if (window.TimeFX) window.TimeFX.haptic(); layoutPlan(cfg); return; }
      d.el.classList.remove("is-dragging"); box.querySelectorAll(".eis__sq").forEach(function (s) { s.classList.remove("is-over"); });
    };
    box.onchange = function (ev) {
      var li = ev.target.closest(".cal-must li");
      if (li && ev.target.classList.contains("cal-bf") && ev.target.value) {
        var u = mustLeft[+li.dataset.m]; li.classList.remove("is-need");
        li.querySelector(".cal-bto").value = X.minToHm(Math.min(1439, mins(ev.target.value) + u.len));
      }
    };
    box.onclick = function (ev) {
      if (Date.now() - eJust < 350) return;
      var qb = ev.target.closest("[data-q]");
      if (qb) { var it = planItems[+qb.dataset.q]; it.q = QORDER[(QORDER.indexOf(it.q) + 1) % 4]; it.est = it.est; layoutPlan(cfg); return; }
      var bx = ev.target.closest("[data-bx]");
      if (bx) { var li = bx.closest("li"); li.classList.add("is-out"); li.dataset.out = "1"; return; }
      if (ev.target.id === "calPlanGo") {
        // every leftover "do first" needs its time first
        var missing = [].filter.call(box.querySelectorAll(".cal-must li"), function (li) { return !li.querySelector(".cal-bf").value; });
        if (missing.length) { X.toast(T("Give every \"Do first\" a time first ⏰", "حدّد وقت لكل \"اعمله الأول\" الأول ⏰"), true); missing[0].scrollIntoView({ behavior: "smooth", block: "center" }); missing[0].classList.add("is-need"); return; }
        var keep = [];
        box.querySelectorAll(".cal-blocks:not(.cal-must) li").forEach(function (li) {
          if (li.dataset.out) return;
          var bk = placed[+li.dataset.b], f0 = li.querySelector(".cal-bf").value, t0 = li.querySelector(".cal-bto").value, nm = li.querySelector(".cal-bn").value.trim();
          if (!f0 || !nm) return;
          keep.push(Object.assign({}, bk, { title: nm.replace(/^⭐\s*/, ""), slot: [mins(f0), t0 ? mins(t0) : mins(f0) + bk.len] }));
        });
        box.querySelectorAll(".cal-must li").forEach(function (li) {
          var u = mustLeft[+li.dataset.m], f0 = mins(li.querySelector(".cal-bf").value), t0 = li.querySelector(".cal-bto").value;
          keep.push({ title: li.querySelector(".cal-bn").value.trim().replace(/^⭐\s*/, "") || u.title, len: u.len, top: u.top, q: "do", cat: u.cat, slot: [f0, t0 ? mins(t0) : Math.min(1439, f0 + u.len)] });
        });
        commit(keep, unplaced.filter(function (u) { return u.q !== "do"; }), nowList, ev.target);
      }
    };
  }
  function commit(placed, unplaced, nowList, btn) {
    var date = anchor(), jobs = [];
    var post = function (body) { body.task_date = date; return X.api("/api/tasks", { method: "POST", body: body }); };
    placed.forEach(function (bk) {
      jobs.push(post({ title: (bk.top ? "⭐ " : "") + bk.title.replace(/^⭐\s*/, ""), icon: bk.batch ? null : (bk.top ? "🎯" : null), category_id: bk.cat || null,
        time_from: X.minToHm(bk.slot[0]), time_to: X.minToHm(bk.slot[1]), planned_hours: Math.round(bk.len / 60 * 4) / 4 || null,
        time_note: ((bk.fixed ? "📌 " + T("set time", "ساعة ثابتة") + " · " : "") + Q[bk.q].l + (!bk.fixed && bk.len >= 50 ? " · 🍅 ×" + Math.ceil(bk.len / 30) : "")).slice(0, 120) }));
    });
    nowList.forEach(function (it) { jobs.push(post({ title: "⚡ " + it.title, time_note: T("under 2 min — do it now", "أقل من دقيقتين — دلوقتي") })); });
    var loose = document.getElementById("calPlanLoose");
    if (loose && loose.checked) unplaced.forEach(function (bk) { jobs.push(post({ title: bk.title, category_id: bk.cat || null, planned_hours: Math.round(bk.len / 60 * 4) / 4 || null })); });
    if (!jobs.length) return;
    btn.disabled = true;
    Promise.all(jobs).then(function () {
      X.playAdd(); X.toast(T("Your day is planned ✓ " + jobs.length + " added", "يومك اتخطط ✓ اتضاف " + jobs.length));
      if (window.TimeFX) window.TimeFX.quip(T("Plan's ready. Now let's crush it 💥", "الخطة جاهزة.. يلا نكسّرها 💥"), btn);
      lsSet("time-plan-rows", []);
      togglePanel("plan"); setMode("day"); return X.afterTaskChange();
    }).catch(function (e) { X.toast(e.message, true); btn.disabled = false; });
  }

  /* ---- 🌙 end of day ---- */
  function drawReview() {
    var tasks = X.state.dayTasks || [], date = anchor();
    var done = tasks.filter(function (t) { return t.done; }), half = tasks.filter(function (t) { return t.half; });
    var left = tasks.filter(function (t) { return !t.done && !t.half && !t.auto_key; });
    var autoLeft = tasks.filter(function (t) { return !t.done && !t.half && t.auto_key; }).length;
    panel.innerHTML = closeBtn() + '<h3>🌙 ' + T("End of day — 5 minutes", "مراجعة آخر اليوم — 5 دقايق") + '</h3>' +
      '<div class="cal-rev"><div><b>' + done.length + '</b><small>' + T("done", "خلصت") + '</small></div><div><b>' + half.length + '</b><small>' + T("half", "نص") + '</small></div><div><b>' + (left.length + autoLeft) + '</b><small>' + T("not done", "ما خلصتش") + '</small></div></div>' +
      (left.length ? '<form class="cal-review"><p>' + T("What didn't happen — and why? Tick what moves to tomorrow:", "إيه اللي ما حصلش وليه؟ علّم اللي يتنقل لبكرة:") + '</p>' +
        left.map(function (t) { return '<label class="cal-check"><input type="checkbox" name="m" value="' + t.id + '" checked> ' + esc((t.icon ? t.icon + " " : "") + t.title) + '</label>'; }).join("") +
        '<textarea name="why" rows="2" placeholder="' + T("One line: why did it slip? (just for you)", "سطر واحد: اتأجلت ليه؟ (ليك إنت بس)") + '">' + esc(lsGet("time-why-" + date, "")) + '</textarea>' +
        '<div class="cal-rev-btns"><button type="submit" class="btn btn--primary">➡️ ' + T("Move to tomorrow", "انقلهم لبكرة") + '</button>' +
        '<button type="button" class="btn btn--ghost" data-ignore>🙈 ' + T("Ignore", "تجاهل") + '</button></div></form>'
        : '<p>' + T("Nothing left to move. Clean day! 🎉", "مفيش حاجة تتنقل. يوم نضيف! 🎉") + '</p>') +
      (autoLeft ? '<p class="muted">' + T("Prayers, meetings and repeats come back by themselves — they aren't copied.", "الصلوات والمواعيد والحاجات المتكررة بترجع لوحدها — مش بتتنقل.") + '</p>' : '');
  }
  function moveToTomorrow(f) {
    var date = anchor(), next = X.addDays(date, 1), ids = [].map.call(f.querySelectorAll('input[name="m"]:checked'), function (i) { return +i.value; });
    lsSet("time-why-" + date, f.elements.why.value || "");
    var tasks = (X.state.dayTasks || []).filter(function (t) { return ids.indexOf(t.id) >= 0; });
    if (!tasks.length) { togglePanel("review"); return; }
    Promise.all(tasks.map(function (t) {
      return X.api("/api/tasks", { method: "POST", body: { task_date: next, title: t.title, icon: t.icon, category_id: t.category_id, planned_hours: t.planned_hours, link: t.link } });
    })).then(function () {
      X.toast(T(tasks.length + " copied to tomorrow ✓", "اتنقل " + tasks.length + " لبكرة ✓"));
      if (window.TimeFX) window.TimeFX.quip(T("Tomorrow-you says thanks 😅", "إنت بتاع بكرة بيقولك شكراً 😅"), f.querySelector("button"));
      togglePanel("review");
    }).catch(function (e) { X.toast(e.message, true); });
  }

  setMode(mode);
})();
