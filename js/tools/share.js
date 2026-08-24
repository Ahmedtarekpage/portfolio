/* Read-only client share page: /c/<token> */
(function () {
  "use strict";

  var $ = function (sel) { return document.querySelector(sel); };

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

  function show(id) {
    ["view-loading", "view-error", "view-share"].forEach(function (v) {
      document.getElementById(v).hidden = v !== id;
    });
  }

  // token comes from /c/<token> (rewrite) or ?token=
  var token = new URLSearchParams(location.search).get("token") ||
    decodeURIComponent(location.pathname.split("/").filter(Boolean).pop() || "");

  var current = null;
  var chartFrom = null, chartTo = null;

  function renderChart() {
    $("#chartDetail").hidden = true;
    window.renderBalanceChart($("#chart"), $("#chartTip"), current.timeline, {
      from: chartFrom,
      to: chartTo,
      onPointClick: showPointDetail,
    });
  }

  window.chartRangeControls($("#chartFilter"), function (from, to) {
    chartFrom = from;
    chartTo = to;
    if (current) renderChart();
  });

  function detailRow(label, valueHtml) {
    return '<div class="muted">' + label + "</div><div>" + valueHtml + "</div>";
  }

  // NOTE: intentionally no payment amounts here — money details are admin-only
  function showPointDetail(p) {
    var rows = [
      detailRow("Date", fmtDate(p.date) + (p.future ? ' <span class="badge badge--warn">upcoming</span>' : "")),
      detailRow("Event", esc(p.label)),
      detailRow("Change", (p.delta > 0 ? "+" : "−") + fmtH(Math.abs(p.delta))),
      detailRow("Balance after", "<strong>" + fmtH(p.balance) + "</strong>"),
    ];
    if (p.uncovered > 0) rows.push(detailRow("Not covered", '<span style="color:#ff9aa7">' + fmtH(p.uncovered) + "</span>"));

    if (p.kind === "purchase" || p.kind === "expiry") {
      var pkg = (current.packages || []).filter(function (x) { return x.id === p.packageId; })[0];
      if (pkg) rows.push(detailRow("Package", fmtH(pkg.hours) + " bought " + fmtDate(pkg.purchased_at) + ", expires " + fmtDate(pkg.expires_at)));
    }
    if (p.kind === "session") {
      var s = (current.sessions || []).filter(function (x) { return x.id === p.sessionId; })[0];
      if (s) {
        if (s.topic) rows.push(detailRow("Topic", esc(s.topic)));
        if (s.has_pdf) rows.push(detailRow("Minutes", '<a href="/api/share?token=' + encodeURIComponent(token) + "&pdf=" + s.id + '" target="_blank" rel="noopener">📄 PDF</a>'));
      }
    }

    var box = $("#chartDetail");
    box.innerHTML = '<button type="button" class="chart-detail__close" aria-label="Close">✕</button>' +
      '<div class="chart-detail__grid">' + rows.join("") + "</div>";
    box.querySelector(".chart-detail__close").addEventListener("click", function () { box.hidden = true; });
    box.hidden = false;
  }

  function render(data) {
    current = data;
    var av = $("#cAvatar");
    if (data.gender === "male" || data.gender === "female") {
      av.innerHTML = '<img src="/assets/avatar-' + data.gender + '.svg" alt="" />';
    } else {
      av.classList.add("avatar--initial");
      av.textContent = String(data.name || "?").trim().charAt(0).toUpperCase();
    }
    $("#cName").textContent = data.name;
    document.title = "Hours overview — " + data.name;
    var t = data.totals;

    var tiles = [
      { label: "Available now", value: fmtH(t.available), cls: "tile--accent", sub: t.nextExpiry ? fmtH(t.nextExpiry.hours) + " expire " + fmtDate(t.nextExpiry.date) : "" },
      { label: "Purchased", value: fmtH(t.purchased), sub: "" },
      { label: "Used", value: fmtH(t.used), sub: data.sessions.length + " session" + (data.sessions.length === 1 ? "" : "s") },
      { label: "Expired", value: fmtH(t.expired), cls: t.expired > 0 ? "tile--warn" : "", sub: "" },
    ];
    $("#tiles").innerHTML = tiles.map(function (x) {
      return '<div class="tile ' + (x.cls || "") + '"><div class="tile__label">' + x.label +
        '</div><div class="tile__value">' + x.value + "</div>" +
        (x.sub ? '<div class="tile__sub">' + esc(x.sub) + "</div>" : "") + "</div>";
    }).join("");

    var today = new Date().toISOString().slice(0, 10);
    $("#packagesTable tbody").innerHTML = data.packages.map(function (p) {
      var expired = String(p.expires_at).slice(0, 10) < today;
      return "<tr><td>" + fmtDate(p.purchased_at) + "</td>" +
        '<td class="num"><strong>' + fmtH(p.hours) + "</strong></td>" +
        '<td class="muted">' + fmtDate(p.expires_at) + (expired ? ' <span class="badge badge--warn">expired</span>' : "") + "</td></tr>";
    }).join("");

    $("#sessionsTable tbody").innerHTML = data.sessions.map(function (s) {
      return "<tr><td>" + fmtDate(s.session_date) + "</td>" +
        '<td class="num">' + fmtH(s.hours) + "</td>" +
        "<td>" + esc(s.topic || "—") + "</td>" +
        "<td>" + (s.has_pdf
          ? '<a href="/api/share?token=' + encodeURIComponent(token) + "&pdf=" + s.id + '" target="_blank" rel="noopener">📄 PDF</a>'
          : '<span class="muted">—</span>') + "</td></tr>";
    }).join("");

    show("view-share");
    renderChart();
  }

  fetch("/api/share?token=" + encodeURIComponent(token))
    .then(function (r) { return r.json().then(function (d) { return r.ok ? d : Promise.reject(new Error(d.error || "Invalid link")); }); })
    .then(render)
    .catch(function (e) {
      $("#errorMsg").textContent = e.message || "This link is not valid anymore.";
      show("view-error");
    });

  var resizeTimer;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      if (current) renderChart();
    }, 150);
  });
})();
