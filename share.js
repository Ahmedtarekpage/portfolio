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

  function render(data) {
    current = data;
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
        '<td class="num muted">' + (p.amount_paid != null ? Number(p.amount_paid).toLocaleString() + " " + esc(p.currency || "") : "—") + "</td>" +
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
    window.renderBalanceChart($("#chart"), $("#chartTip"), data.timeline);
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
      if (current) window.renderBalanceChart($("#chart"), $("#chartTip"), current.timeline);
    }, 150);
  });
})();
