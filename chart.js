/* Shared hours-balance chart (SVG line chart) — used by the admin panel and the
   read-only client share page.
   Exposes:
     window.renderBalanceChart(box, tip, timeline, opts)
       opts.from / opts.to  — 'YYYY-MM-DD' bounds; only events inside are shown
       opts.onPointClick(p) — called with the timeline point when a marker is clicked
     window.chartRangeControls(bar, onChange) — wires preset chips + date inputs,
       returns { reset } to silently restore the "All" state. */
(function () {
  "use strict";

  var COLORS = { line: "#60a5fa", purchase: "#1fa876", session: "#3b82f6", expiry: "#d97706", danger: "#e2586a", surface: "#131822" };
  var DAY = 86400000;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function fmtDate(iso) {
    var d = new Date(String(iso).slice(0, 10) + "T00:00:00Z");
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  }

  function fmtH(n) {
    n = Number(n) || 0;
    return (Number.isInteger(n) ? n : n.toFixed(1)) + "h";
  }

  function todayISO() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function svgEl(name, attrs) {
    var el = document.createElementNS("http://www.w3.org/2000/svg", name);
    for (var k in attrs) el.setAttribute(k, attrs[k]);
    return el;
  }

  function niceStep(range, targetTicks) {
    var raw = range / targetTicks;
    var steps = [1, 2, 2.5, 5, 10, 20, 25, 50, 100, 200, 500];
    for (var i = 0; i < steps.length; i++) if (steps[i] >= raw) return steps[i];
    return Math.ceil(raw / 100) * 100;
  }

  window.renderBalanceChart = function (box, tip, timeline, opts) {
    opts = opts || {};
    box.innerHTML = "";
    tip.hidden = true;
    if (!timeline || !timeline.length) {
      box.innerHTML = '<p class="muted center" style="padding:60px 0">No activity yet.</p>';
      return;
    }

    var all = timeline.map(function (p) {
      return Object.assign({}, p, { t: new Date(p.date + "T00:00:00Z").getTime() });
    });
    var todayT = new Date(todayISO() + "T00:00:00Z").getTime();

    var fromT = opts.from ? new Date(String(opts.from).slice(0, 10) + "T00:00:00Z").getTime() : null;
    var toT = opts.to ? new Date(String(opts.to).slice(0, 10) + "T00:00:00Z").getTime() : null;
    if (fromT != null && toT != null && fromT > toT) { var sw = fromT; fromT = toT; toT = sw; }

    var pts = all.filter(function (p) {
      return (fromT == null || p.t >= fromT) && (toT == null || p.t <= toT);
    });
    if (!pts.length) {
      box.innerHTML = '<p class="muted center" style="padding:60px 0">No activity in this date range.</p>';
      return;
    }

    var W = Math.max(box.clientWidth || 600, 320), H = 280;
    var M = { l: 46, r: 18, t: 16, b: 32 };
    var minT = fromT != null ? fromT : Math.min(pts[0].t, todayT);
    var maxT = toT != null ? toT : Math.max(pts[pts.length - 1].t, todayT);
    if (maxT <= minT) maxT = minT + DAY;
    var pad = Math.max((maxT - minT) * 0.04, DAY);
    minT -= pad; maxT += pad;

    // carry the balance from just before the visible window so the line
    // starts at the right height instead of at zero
    var lead = null;
    if (fromT != null) {
      for (var li = 0; li < all.length; li++) if (all[li].t < fromT) lead = all[li];
    }
    var linePts = pts.slice();
    if (lead) linePts.unshift({ t: minT, balance: lead.balance, lead: true });

    var yMax = Math.max.apply(null, linePts.map(function (p) { return p.balance; }).concat([1])) * 1.1;

    var x = function (t) { return M.l + ((t - minT) / (maxT - minT)) * (W - M.l - M.r); };
    var y = function (v) { return H - M.b - (v / yMax) * (H - M.t - M.b); };

    var svg = svgEl("svg", { viewBox: "0 0 " + W + " " + H, width: W, height: H, role: "img", "aria-label": "Hours balance over time" });

    // y grid + labels
    var step = niceStep(yMax, 4);
    for (var v = 0; v <= yMax; v += step) {
      svg.appendChild(svgEl("line", { x1: M.l, x2: W - M.r, y1: y(v), y2: y(v), stroke: "rgba(255,255,255,0.06)", "stroke-width": 1 }));
      var lbl = svgEl("text", { x: M.l - 8, y: y(v) + 4, "text-anchor": "end", fill: "#5f6b7d", "font-size": 11 });
      lbl.textContent = v;
      svg.appendChild(lbl);
    }

    // x labels (~5)
    var nx = Math.min(5, Math.max(2, Math.floor(W / 130)));
    for (var i = 0; i <= nx; i++) {
      var t = minT + ((maxT - minT) * i) / nx;
      var xl = svgEl("text", { x: x(t), y: H - 10, "text-anchor": "middle", fill: "#5f6b7d", "font-size": 11 });
      xl.textContent = new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
      svg.appendChild(xl);
    }

    // smooth line: straight segments between events, solid up to today, dashed after
    function linePath(points, endT) {
      var d = "M " + x(points[0].t) + " " + y(points[0].balance);
      for (var i = 1; i < points.length; i++) d += " L " + x(points[i].t) + " " + y(points[i].balance);
      if (endT != null) d += " L " + x(endT) + " " + y(points[points.length - 1].balance);
      return d;
    }
    var solidEnd = Math.min(todayT, maxT); // don't draw past the visible window
    var past = linePts.filter(function (p) { return p.t <= todayT; });
    var future = linePts.filter(function (p) { return p.t > todayT; });
    var balAtToday = past.length ? past[past.length - 1].balance : (lead ? lead.balance : 0);

    var areaEl = null, lineEl = null;
    if (past.length && solidEnd >= minT) {
      var area = linePath(past, solidEnd) +
        " L " + x(solidEnd) + " " + y(0) + " L " + x(past[0].t) + " " + y(0) + " Z";
      areaEl = svgEl("path", { d: area, fill: COLORS.line, opacity: 0.07 });
      svg.appendChild(areaEl);
      lineEl = svgEl("path", { d: linePath(past, solidEnd), fill: "none", stroke: COLORS.line, "stroke-width": 2, "stroke-linejoin": "round" });
      svg.appendChild(lineEl);
    }
    if (future.length) {
      var dashStart = Math.max(Math.min(todayT, maxT), minT);
      var start = [{ t: dashStart, balance: balAtToday }].concat(future);
      svg.appendChild(svgEl("path", {
        d: linePath(start, null),
        fill: "none", stroke: COLORS.line, "stroke-width": 2, "stroke-dasharray": "5 5", opacity: 0.6,
      }));
    }

    // today marker + current balance label (only when today is inside the window)
    if (todayT >= minT && todayT <= maxT) {
      svg.appendChild(svgEl("line", { x1: x(todayT), x2: x(todayT), y1: M.t, y2: H - M.b, stroke: "rgba(255,255,255,0.18)", "stroke-width": 1, "stroke-dasharray": "2 4" }));
      var tl = svgEl("text", { x: x(todayT), y: M.t - 3, "text-anchor": "middle", fill: "#9aa6b8", "font-size": 10 });
      tl.textContent = "today";
      svg.appendChild(tl);
      var bl = svgEl("text", { x: Math.min(x(todayT) + 7, W - M.r - 30), y: y(balAtToday) - 8, fill: "#eef2f8", "font-size": 12, "font-weight": 600 });
      bl.textContent = fmtH(balAtToday);
      svg.appendChild(bl);
    }

    // event markers (shape encodes the event type; color is secondary)
    var markers = [];
    pts.forEach(function (p) {
      var cx = x(p.t), cy = y(p.balance), m;
      if (p.kind === "purchase") {
        m = svgEl("path", { d: "M " + cx + " " + (cy - 6) + " L " + (cx + 6) + " " + (cy + 5) + " L " + (cx - 6) + " " + (cy + 5) + " Z", fill: COLORS.purchase });
      } else if (p.kind === "expiry") {
        m = svgEl("rect", { x: cx - 4.5, y: cy - 4.5, width: 9, height: 9, fill: COLORS.expiry, transform: "rotate(45 " + cx + " " + cy + ")" });
      } else {
        m = svgEl("circle", { cx: cx, cy: cy, r: 4.5, fill: p.uncovered > 0 ? COLORS.danger : COLORS.session });
      }
      m.setAttribute("stroke", COLORS.surface);
      m.setAttribute("stroke-width", 2);
      if (p.future) m.setAttribute("opacity", 0.55);
      svg.appendChild(m);
      markers.push({ p: p, cx: cx, cy: cy });
    });

    // hover layer: crosshair + tooltip on nearest event
    var cross = svgEl("line", { y1: M.t, y2: H - M.b, stroke: "rgba(255,255,255,0.25)", "stroke-width": 1, visibility: "hidden" });
    var ring = svgEl("circle", { r: 9, fill: "none", stroke: "#eef2f8", "stroke-width": 1.5, visibility: "hidden" });
    svg.appendChild(cross);
    svg.appendChild(ring);

    var overlay = svgEl("rect", { x: M.l, y: M.t, width: W - M.l - M.r, height: H - M.t - M.b, fill: "transparent" });
    overlay.style.touchAction = "pan-y";
    if (opts.onPointClick) overlay.style.cursor = "pointer";
    svg.appendChild(overlay);

    function nearest(ev) {
      var rect = svg.getBoundingClientRect();
      var px = ((ev.clientX - rect.left) / rect.width) * W;
      var best = null, bestD = Infinity;
      markers.forEach(function (m) {
        var d = Math.abs(m.cx - px);
        if (d < bestD) { bestD = d; best = m; }
      });
      return best;
    }

    function onMove(ev) {
      var best = nearest(ev);
      if (!best) return;
      cross.setAttribute("x1", best.cx); cross.setAttribute("x2", best.cx);
      cross.setAttribute("visibility", "visible");
      ring.setAttribute("cx", best.cx); ring.setAttribute("cy", best.cy);
      ring.setAttribute("visibility", "visible");
      tip.innerHTML = "<div class=\"muted\">" + fmtDate(best.p.date) + (best.p.future ? " · upcoming" : "") + "</div>" +
        esc(best.p.label) + "<div>Balance: <b>" + fmtH(best.p.balance) + "</b></div>" +
        (best.p.uncovered > 0 ? '<div style="color:#ff9aa7">' + fmtH(best.p.uncovered) + " not covered by any package</div>" : "") +
        (opts.onPointClick ? '<div class="muted">Tap for details</div>' : "");
      tip.hidden = false;
      var bx = box.getBoundingClientRect();
      var left = (best.cx / W) * bx.width + 12;
      if (left + 190 > bx.width) left = left - 214;
      tip.style.left = left + "px";
      tip.style.top = Math.max((best.cy / H) * bx.height - 40, 0) + "px";
    }
    function onLeave() {
      cross.setAttribute("visibility", "hidden");
      ring.setAttribute("visibility", "hidden");
      tip.hidden = true;
    }
    overlay.addEventListener("pointermove", onMove);
    overlay.addEventListener("pointerdown", onMove);
    overlay.addEventListener("pointerleave", onLeave);
    if (opts.onPointClick) {
      overlay.addEventListener("click", function (ev) {
        var best = nearest(ev);
        if (best) opts.onPointClick(best.p);
      });
    }

    box.appendChild(svg);

    // entrance animation: line draws itself, area fades, markers pop in
    var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reduceMotion && lineEl) {
      try {
        var len = lineEl.getTotalLength();
        lineEl.style.strokeDasharray = len;
        lineEl.style.strokeDashoffset = len;
        if (areaEl) { areaEl.style.opacity = 0; }
        var markerEls = svg.querySelectorAll("path[fill='" + COLORS.purchase + "'], rect[fill='" + COLORS.expiry + "'], circle[r='4.5']");
        markerEls.forEach(function (el, i) {
          el.style.opacity = 0;
          el.style.transition = "opacity 0.3s ease " + (0.55 + i * 0.05) + "s";
        });
        lineEl.getBoundingClientRect(); // force layout so the transition runs
        lineEl.style.transition = "stroke-dashoffset 0.9s ease";
        lineEl.style.strokeDashoffset = 0;
        if (areaEl) {
          areaEl.style.transition = "opacity 0.7s ease 0.35s";
          areaEl.style.opacity = "0.07";
        }
        markerEls.forEach(function (el) {
          var target = el.getAttribute("opacity") || 1;
          requestAnimationFrame(function () { el.style.opacity = target; });
        });
      } catch (e) { /* SVG not measurable — skip animation */ }
    }
  };

  /* Preset chips ("All", "30d", …) + custom from/to date inputs.
     onChange(from, to) fires with 'YYYY-MM-DD' strings or nulls. */
  window.chartRangeControls = function (bar, onChange) {
    var from = bar.querySelector("input[name=from]");
    var to = bar.querySelector("input[name=to]");
    var chips = Array.prototype.slice.call(bar.querySelectorAll(".chip"));

    function iso(d) {
      return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    }
    function setActive(chip) {
      chips.forEach(function (c) { c.classList.toggle("chip--on", c === chip); });
    }

    chips.forEach(function (chip) {
      chip.addEventListener("click", function () {
        var r = chip.getAttribute("data-range");
        if (r === "all") {
          from.value = ""; to.value = "";
        } else {
          var end = new Date();
          from.value = iso(new Date(end.getTime() - Number(r) * DAY));
          to.value = iso(end);
        }
        setActive(chip);
        onChange(from.value || null, to.value || null);
      });
    });
    [from, to].forEach(function (inp) {
      inp.addEventListener("change", function () {
        setActive(null); // custom range — no preset highlighted
        onChange(from.value || null, to.value || null);
      });
    });

    return {
      reset: function () {
        from.value = ""; to.value = "";
        setActive(chips[0] || null);
      },
    };
  };

  /* Quarterly category progress — cumulative logged hours (solid, stepped) vs
     the straight expected-pace line (dashed) from (start, 0) to (end, target).
       opts.start / opts.end  — 'YYYY-MM-DD' quarter bounds
       opts.target            — total target hours for the quarter
       opts.color             — line color (defaults to COLORS.line) */
  window.renderProgressChart = function (box, timeline, opts) {
    opts = opts || {};
    box.innerHTML = "";
    var start = new Date(String(opts.start).slice(0, 10) + "T00:00:00Z").getTime();
    var end = new Date(String(opts.end).slice(0, 10) + "T00:00:00Z").getTime();
    if (end <= start) end = start + DAY;
    var target = Number(opts.target) || 0;
    var todayT = new Date(todayISO() + "T00:00:00Z").getTime();

    var logged = (timeline || []).map(function (p) {
      return { t: new Date(String(p.date).slice(0, 10) + "T00:00:00Z").getTime(), v: Number(p.cumulative) };
    });
    var actualPts = [{ t: start, v: 0 }].concat(logged);
    var lastActual = actualPts[actualPts.length - 1].v;

    var W = Math.max(box.clientWidth || 600, 260), H = 190;
    var M = { l: 40, r: 12, t: 14, b: 24 };
    var yMax = Math.max(target, lastActual, 1) * 1.1;
    var x = function (t) { return M.l + ((t - start) / (end - start)) * (W - M.l - M.r); };
    var y = function (v) { return H - M.b - (v / yMax) * (H - M.t - M.b); };

    var svg = svgEl("svg", { viewBox: "0 0 " + W + " " + H, width: W, height: H, role: "img", "aria-label": "Category progress" });

    var step = niceStep(yMax, 3);
    for (var v = 0; v <= yMax; v += step) {
      svg.appendChild(svgEl("line", { x1: M.l, x2: W - M.r, y1: y(v), y2: y(v), stroke: "rgba(255,255,255,0.06)", "stroke-width": 1 }));
      var lbl = svgEl("text", { x: M.l - 8, y: y(v) + 4, "text-anchor": "end", fill: "#5f6b7d", "font-size": 10 });
      lbl.textContent = Number.isInteger(v) ? v : v.toFixed(1);
      svg.appendChild(lbl);
    }

    // expected pace: straight line from (start, 0) to (end, target)
    svg.appendChild(svgEl("path", {
      d: "M " + x(start) + " " + y(0) + " L " + x(end) + " " + y(target),
      fill: "none", stroke: "#5f6b7d", "stroke-width": 1.5, "stroke-dasharray": "5 5",
    }));

    // actual cumulative: stepped line, held flat from the last log up to today
    var color = opts.color || COLORS.line;
    var d = "M " + x(actualPts[0].t) + " " + y(actualPts[0].v);
    for (var i = 1; i < actualPts.length; i++) {
      d += " L " + x(actualPts[i].t) + " " + y(actualPts[i - 1].v);
      d += " L " + x(actualPts[i].t) + " " + y(actualPts[i].v);
    }
    var extendTo = Math.min(Math.max(todayT, actualPts[actualPts.length - 1].t), end);
    if (extendTo > actualPts[actualPts.length - 1].t) d += " L " + x(extendTo) + " " + y(lastActual);
    svg.appendChild(svgEl("path", { d: d, fill: "none", stroke: color, "stroke-width": 2.5, "stroke-linejoin": "round" }));

    if (todayT >= start && todayT <= end) {
      svg.appendChild(svgEl("line", { x1: x(todayT), x2: x(todayT), y1: M.t, y2: H - M.b, stroke: "rgba(255,255,255,0.18)", "stroke-width": 1, "stroke-dasharray": "2 4" }));
    }

    [{ t: start, anchor: "start" }, { t: end, anchor: "end" }].forEach(function (p) {
      var xl = svgEl("text", { x: x(p.t), y: H - 6, "text-anchor": p.anchor, fill: "#5f6b7d", "font-size": 10 });
      xl.textContent = new Date(p.t).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
      svg.appendChild(xl);
    });

    box.appendChild(svg);
  };
})();