/* Shared hours-balance chart (SVG line chart) — used by the admin panel and the
   read-only client share page. Exposes window.renderBalanceChart(box, tip, timeline). */
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

  window.renderBalanceChart = function (box, tip, timeline) {
    box.innerHTML = "";
    tip.hidden = true;
    if (!timeline || !timeline.length) {
      box.innerHTML = '<p class="muted center" style="padding:60px 0">No activity yet.</p>';
      return;
    }

    var pts = timeline.map(function (p) {
      return Object.assign({}, p, { t: new Date(p.date + "T00:00:00Z").getTime() });
    });
    var todayT = new Date(todayISO() + "T00:00:00Z").getTime();

    var W = Math.max(box.clientWidth || 600, 320), H = 280;
    var M = { l: 46, r: 18, t: 16, b: 32 };
    var minT = Math.min(pts[0].t, todayT), maxT = Math.max(pts[pts.length - 1].t, todayT);
    var pad = Math.max((maxT - minT) * 0.04, DAY);
    minT -= pad; maxT += pad;
    var yMax = Math.max.apply(null, pts.map(function (p) { return p.balance; }).concat([1])) * 1.1;

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
    var past = pts.filter(function (p) { return p.t <= todayT; });
    var future = pts.filter(function (p) { return p.t > todayT; });
    var balAtToday = past.length ? past[past.length - 1].balance : 0;

    if (past.length) {
      var area = linePath(past, todayT) +
        " L " + x(todayT) + " " + y(0) + " L " + x(past[0].t) + " " + y(0) + " Z";
      svg.appendChild(svgEl("path", { d: area, fill: COLORS.line, opacity: 0.07 }));
      svg.appendChild(svgEl("path", { d: linePath(past, todayT), fill: "none", stroke: COLORS.line, "stroke-width": 2, "stroke-linejoin": "round" }));
    }
    if (future.length) {
      var start = [{ t: todayT, balance: balAtToday }].concat(future);
      svg.appendChild(svgEl("path", {
        d: linePath(start, null),
        fill: "none", stroke: COLORS.line, "stroke-width": 2, "stroke-dasharray": "5 5", opacity: 0.6,
      }));
    }

    // today marker + current balance label
    svg.appendChild(svgEl("line", { x1: x(todayT), x2: x(todayT), y1: M.t, y2: H - M.b, stroke: "rgba(255,255,255,0.18)", "stroke-width": 1, "stroke-dasharray": "2 4" }));
    var tl = svgEl("text", { x: x(todayT), y: M.t - 3, "text-anchor": "middle", fill: "#9aa6b8", "font-size": 10 });
    tl.textContent = "today";
    svg.appendChild(tl);
    var bl = svgEl("text", { x: Math.min(x(todayT) + 7, W - M.r - 30), y: y(balAtToday) - 8, fill: "#eef2f8", "font-size": 12, "font-weight": 600 });
    bl.textContent = fmtH(balAtToday);
    svg.appendChild(bl);

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
    svg.appendChild(overlay);

    function onMove(ev) {
      var rect = svg.getBoundingClientRect();
      var px = ((ev.clientX - rect.left) / rect.width) * W;
      var best = null, bestD = Infinity;
      markers.forEach(function (m) {
        var d = Math.abs(m.cx - px);
        if (d < bestD) { bestD = d; best = m; }
      });
      if (!best) return;
      cross.setAttribute("x1", best.cx); cross.setAttribute("x2", best.cx);
      cross.setAttribute("visibility", "visible");
      ring.setAttribute("cx", best.cx); ring.setAttribute("cy", best.cy);
      ring.setAttribute("visibility", "visible");
      tip.innerHTML = "<div class=\"muted\">" + fmtDate(best.p.date) + (best.p.future ? " · upcoming" : "") + "</div>" +
        esc(best.p.label) + "<div>Balance: <b>" + fmtH(best.p.balance) + "</b></div>" +
        (best.p.uncovered > 0 ? '<div style="color:#ff9aa7">' + fmtH(best.p.uncovered) + " not covered by any package</div>" : "");
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

    box.appendChild(svg);
  };
})();
