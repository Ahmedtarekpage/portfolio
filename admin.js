/* Admin panel logic: passkey auth, clients, hour packages, sessions, balance chart. */
(function () {
  "use strict";

  var $ = function (sel) { return document.querySelector(sel); };
  var state = { clientId: null, detail: null };

  /* ---------------- helpers ---------------- */

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
          if (r.status === 401 && path.indexOf("action=me") === -1) { show("view-login"); }
          throw new Error(data.error || ("Request failed (" + r.status + ")"));
        }
        return data;
      });
    });
  }

  function show(id) {
    ["view-loading", "view-login", "view-setup", "view-list", "view-client"].forEach(function (v) {
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
    if (btn) { btn.disabled = on; }
  }

  function formData(form) {
    var out = {};
    new FormData(form).forEach(function (v, k) { if (typeof v === "string") out[k] = v.trim(); });
    return out;
  }

  /* ---------------- auth ---------------- */

  function boot() {
    api("/api/auth?action=me").then(function (me) {
      if (me.authed) return loadClients();
      show("view-login");
      if (!me.hasCredentials) {
        $("#btnShowSetup").textContent = "First-time setup — register your iPhone";
      }
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
      .then(function (options) {
        return SimpleWebAuthnBrowser.startAuthentication({ optionsJSON: options });
      })
      .then(function (response) {
        return api("/api/auth?action=login-verify", { method: "POST", body: { response: response } });
      })
      .then(function () { loadClients(); })
      .catch(function (e) {
        if (e.name !== "NotAllowedError") showErr("#loginError", e.message || "Sign-in failed");
      })
      .finally(function () { busy(btn, false); });
  });

  $("#btnShowSetup").addEventListener("click", function () { show("view-setup"); });
  $("#btnBackToLogin").addEventListener("click", function () { show("view-login"); });

  function registerPasskey(secret, label, errSel) {
    return api("/api/auth?action=register-options", { method: "POST", body: { secret: secret } })
      .then(function (options) {
        return SimpleWebAuthnBrowser.startRegistration({ optionsJSON: options });
      })
      .then(function (response) {
        return api("/api/auth?action=register-verify", {
          method: "POST",
          body: { secret: secret, response: response, label: label || "passkey" },
        });
      });
  }

  $("#setupForm").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var btn = this.querySelector("button[type=submit]");
    showErr("#setupError", "");
    busy(btn, true);
    registerPasskey($("#setupSecret").value, $("#setupLabel").value.trim())
      .then(function () { toast("Passkey registered ✓"); loadClients(); })
      .catch(function (e) {
        if (e.name === "InvalidStateError") showErr("#setupError", "This device already has a passkey registered — go back and sign in.");
        else if (e.name !== "NotAllowedError") showErr("#setupError", e.message || "Setup failed");
      })
      .finally(function () { busy(btn, false); });
  });

  $("#btnAddDevice").addEventListener("click", function () {
    var btn = this;
    busy(btn, true);
    registerPasskey("", "extra device")
      .then(function () { toast("New passkey registered ✓"); })
      .catch(function (e) {
        if (e.name === "InvalidStateError") toast("This device already has a passkey", true);
        else if (e.name !== "NotAllowedError") toast(e.message, true);
      })
      .finally(function () { busy(btn, false); });
  });

  $("#btnLogout").addEventListener("click", function () {
    api("/api/auth?action=logout", { method: "POST", body: {} }).then(function () { show("view-login"); });
  });

  /* ---------------- client list ---------------- */

  function loadClients() {
    show("view-loading");
    return api("/api/clients").then(function (data) {
      var tbody = $("#clientsTable tbody");
      tbody.innerHTML = "";
      $("#clientsEmpty").hidden = data.clients.length > 0;
      data.clients.forEach(function (c) {
        var t = c.totals || {};
        var badge = "";
        if (t.nextExpiry && t.nextExpiry.hours > 0) {
          var days = Math.round((new Date(t.nextExpiry.date) - new Date(todayISO())) / 86400000);
          if (days <= 7) badge = '<span class="badge badge--warn">' + fmtH(t.nextExpiry.hours) + " expire in " + days + "d</span>";
        }
        if (t.overdraft > 0) badge += '<span class="badge badge--danger">unpaid ' + fmtH(t.overdraft) + "</span>";
        var tr = document.createElement("tr");
        tr.className = "rowlink";
        tr.innerHTML =
          "<td><strong>" + esc(c.name) + "</strong>" + badge + "</td>" +
          "<td class=\"muted\">" + esc([c.phone, c.email].filter(Boolean).join(" · ") || "—") + "</td>" +
          "<td class=\"muted\">" + esc(c.transaction_type || "—") + "</td>" +
          "<td class=\"num\"><strong>" + fmtH(t.available) + "</strong></td>" +
          "<td class=\"muted\">" + (t.nextExpiry ? fmtDate(t.nextExpiry.date) : "—") + "</td>";
        tr.addEventListener("click", function () { openClient(c.id); });
        tbody.appendChild(tr);
      });
      show("view-list");
    }).catch(function (e) { toast(e.message, true); show("view-list"); });
  }

  $("#addClientForm").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var form = this;
    var btn = form.querySelector("button[type=submit]");
    busy(btn, true);
    api("/api/clients", { method: "POST", body: formData(form) })
      .then(function () { form.reset(); $("#addClientBox").open = false; toast("Client added ✓"); return loadClients(); })
      .catch(function (e) { toast(e.message, true); })
      .finally(function () { busy(btn, false); });
  });

  /* ---------------- client detail ---------------- */

  $("#btnBack").addEventListener("click", function () { state.clientId = null; loadClients(); });

  function openClient(id) {
    state.clientId = id;
    show("view-loading");
    return api("/api/client?id=" + id).then(function (data) {
      state.detail = data;
      renderClient(data);
      show("view-client");
      renderChart(data.timeline);
    }).catch(function (e) { toast(e.message, true); loadClients(); });
  }

  function renderClient(data) {
    var c = data.client, t = data.totals;
    $("#cName").textContent = c.name;
    $("#cMeta").textContent = [c.phone, c.email, c.nationality, c.transaction_type, c.notes]
      .filter(Boolean).join("  ·  ") || "No contact details yet";
    $("#editClientForm").hidden = true;

    var tiles = [
      { label: "Available now", value: fmtH(t.available), cls: "tile--accent", sub: t.nextExpiry ? fmtH(t.nextExpiry.hours) + " expire " + fmtDate(t.nextExpiry.date) : "" },
      { label: "Purchased", value: fmtH(t.purchased), sub: "" },
      { label: "Used", value: fmtH(t.used), sub: data.sessions.length + " session" + (data.sessions.length === 1 ? "" : "s") },
      { label: "Expired", value: fmtH(t.expired), cls: t.expired > 0 ? "tile--warn" : "", sub: "" },
    ];
    if (t.overdraft > 0) tiles.push({ label: "Unpaid hours", value: fmtH(t.overdraft), cls: "tile--danger", sub: "sessions beyond balance" });
    $("#tiles").innerHTML = tiles.map(function (x) {
      return '<div class="tile ' + (x.cls || "") + '"><div class="tile__label">' + x.label +
        '</div><div class="tile__value">' + x.value + "</div>" +
        (x.sub ? '<div class="tile__sub">' + esc(x.sub) + "</div>" : "") + "</div>";
    }).join("");

    // packages table
    var pt = $("#packagesTable tbody");
    pt.innerHTML = "";
    data.packages.forEach(function (p) {
      var expired = String(p.expires_at).slice(0, 10) < todayISO();
      var tr = document.createElement("tr");
      tr.innerHTML =
        "<td>" + fmtDate(p.purchased_at) + (p.note ? '<div class="muted" style="font-size:.78rem">' + esc(p.note) + "</div>" : "") + "</td>" +
        '<td class="num"><strong>' + fmtH(p.hours) + "</strong></td>" +
        '<td class="num muted">' + (p.amount_paid != null ? Number(p.amount_paid).toLocaleString() + " " + esc(p.currency || "") : "—") + "</td>" +
        "<td class=\"muted\">" + fmtDate(p.expires_at) + (expired ? ' <span class="badge badge--warn">expired</span>' : "") + "</td>" +
        '<td><button class="iconbtn" title="Delete purchase">✕</button></td>';
      tr.querySelector(".iconbtn").addEventListener("click", function () {
        if (!confirm("Delete this " + fmtH(p.hours) + " purchase? This changes the balance history.")) return;
        api("/api/packages?id=" + p.id, { method: "DELETE" })
          .then(function () { return openClient(state.clientId); })
          .catch(function (e) { toast(e.message, true); });
      });
      pt.appendChild(tr);
    });

    // sessions table
    var st = $("#sessionsTable tbody");
    st.innerHTML = "";
    data.sessions.forEach(function (s) {
      var tr = document.createElement("tr");
      tr.innerHTML =
        "<td>" + fmtDate(s.session_date) + "</td>" +
        '<td class="num">' + fmtH(s.hours) + "</td>" +
        "<td>" + esc(s.topic || "—") + "</td>" +
        "<td>" + (s.has_pdf ? '<a href="/api/pdf?id=' + s.id + '" target="_blank" rel="noopener">📄 PDF</a>' : '<span class="muted">—</span>') + "</td>" +
        '<td><button class="iconbtn" title="Delete session">✕</button></td>';
      tr.querySelector(".iconbtn").addEventListener("click", function () {
        if (!confirm("Delete this session record?")) return;
        api("/api/sessions?id=" + s.id, { method: "DELETE" })
          .then(function () { return openClient(state.clientId); })
          .catch(function (e) { toast(e.message, true); });
      });
      st.appendChild(tr);
    });

    // default form dates
    $("#addPackageForm").elements.purchased_at.value = todayISO();
    $("#addSessionForm").elements.session_date.value = todayISO();
  }

  $("#btnEditClient").addEventListener("click", function () {
    var form = $("#editClientForm");
    var c = state.detail.client;
    form.hidden = !form.hidden;
    if (!form.hidden) {
      ["name", "phone", "email", "nationality", "transaction_type", "notes"].forEach(function (k) {
        if (form.elements[k]) form.elements[k].value = c[k] || "";
      });
    }
  });

  $("#editClientForm").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var btn = this.querySelector("button[type=submit]");
    busy(btn, true);
    api("/api/clients?id=" + state.clientId, { method: "PATCH", body: formData(this) })
      .then(function () { toast("Saved ✓"); return openClient(state.clientId); })
      .catch(function (e) { toast(e.message, true); })
      .finally(function () { busy(btn, false); });
  });

  $("#btnDeleteClient").addEventListener("click", function () {
    var c = state.detail.client;
    if (!confirm('Delete "' + c.name + '" and ALL their purchases and sessions? This cannot be undone.')) return;
    api("/api/clients?id=" + state.clientId, { method: "DELETE" })
      .then(function () { toast("Client deleted"); return loadClients(); })
      .catch(function (e) { toast(e.message, true); });
  });

  $("#addPackageForm").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var form = this;
    var btn = form.querySelector("button[type=submit]");
    var b = formData(form);
    b.client_id = state.clientId;
    busy(btn, true);
    api("/api/packages", { method: "POST", body: b })
      .then(function () { form.reset(); toast("Hours added ✓"); return openClient(state.clientId); })
      .catch(function (e) { toast(e.message, true); })
      .finally(function () { busy(btn, false); });
  });

  $("#addSessionForm").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var form = this;
    var btn = form.querySelector("button[type=submit]");
    var b = formData(form);
    b.client_id = state.clientId;
    delete b.pdf;
    var file = form.elements.pdf.files[0];

    var ready = Promise.resolve();
    if (file) {
      if (file.size > 3 * 1024 * 1024) { toast("PDF is too large (max 3 MB)", true); return; }
      ready = new Promise(function (resolve, reject) {
        var fr = new FileReader();
        fr.onload = function () { b.pdf_base64 = String(fr.result).split(",")[1]; b.pdf_name = file.name; resolve(); };
        fr.onerror = reject;
        fr.readAsDataURL(file);
      });
    }
    busy(btn, true);
    ready
      .then(function () { return api("/api/sessions", { method: "POST", body: b }); })
      .then(function () { form.reset(); toast("Session recorded ✓"); return openClient(state.clientId); })
      .catch(function (e) { toast(e.message, true); })
      .finally(function () { busy(btn, false); });
  });

  /* ---------------- balance chart (SVG step chart) ---------------- */

  var COLORS = { line: "#60a5fa", purchase: "#1fa876", session: "#3b82f6", expiry: "#d97706", danger: "#e2586a", surface: "#131822" };
  var DAY = 86400000;

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

  function renderChart(timeline) {
    var box = $("#chart");
    var tip = $("#chartTip");
    box.innerHTML = "";
    tip.hidden = true;
    if (!timeline || !timeline.length) {
      box.innerHTML = '<p class="muted center" style="padding:60px 0">No activity yet — add a purchase of hours to see the graph.</p>';
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

    // step-line paths: solid up to today, dashed after
    function buildPath(points, startBal, startT, endT) {
      var d = "M " + x(startT) + " " + y(startBal);
      var bal = startBal;
      points.forEach(function (p) {
        d += " L " + x(p.t) + " " + y(bal) + " L " + x(p.t) + " " + y(p.balance);
        bal = p.balance;
      });
      d += " L " + x(endT) + " " + y(bal);
      return d;
    }
    var past = pts.filter(function (p) { return p.t <= todayT; });
    var future = pts.filter(function (p) { return p.t > todayT; });
    var balAtToday = past.length ? past[past.length - 1].balance : 0;

    if (past.length) {
      // subtle area under the realized line
      var area = buildPath(past, 0, pts[0].t, todayT) +
        " L " + x(todayT) + " " + y(0) + " L " + x(pts[0].t) + " " + y(0) + " Z";
      svg.appendChild(svgEl("path", { d: area, fill: COLORS.line, opacity: 0.07 }));
      svg.appendChild(svgEl("path", { d: buildPath(past, 0, pts[0].t, todayT), fill: "none", stroke: COLORS.line, "stroke-width": 2, "stroke-linejoin": "round" }));
    }
    if (future.length) {
      svg.appendChild(svgEl("path", {
        d: buildPath(future, balAtToday, todayT, maxT),
        fill: "none", stroke: COLORS.line, "stroke-width": 2, "stroke-dasharray": "5 5", opacity: 0.6,
      }));
    }

    // today marker
    svg.appendChild(svgEl("line", { x1: x(todayT), x2: x(todayT), y1: M.t, y2: H - M.b, stroke: "rgba(255,255,255,0.18)", "stroke-width": 1, "stroke-dasharray": "2 4" }));
    var tl = svgEl("text", { x: x(todayT), y: M.t - 3, "text-anchor": "middle", fill: "#9aa6b8", "font-size": 10 });
    tl.textContent = "today";
    svg.appendChild(tl);
    // current balance direct label
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
  }

  var resizeTimer;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      if (state.detail && !$("#view-client").hidden) renderChart(state.detail.timeline);
    }, 150);
  });

  /* ---------------- go ---------------- */
  boot();
})();
