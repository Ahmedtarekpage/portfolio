/* Admin panel logic: passkey auth, clients, hour packages, sessions, balance chart. */
(function () {
  "use strict";

  var $ = function (sel) { return document.querySelector(sel); };
  var state = { clientId: null, detail: null, editingSessionId: null };

  function readFileB64(file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(String(fr.result).split(",")[1]); };
      fr.onerror = reject;
      fr.readAsDataURL(file);
    });
  }

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

  function avatarHtml(client, extraClass) {
    var cls = "avatar " + (extraClass || "");
    if (client.gender === "male" || client.gender === "female") {
      return '<span class="' + cls + '"><img src="/assets/avatar-' + client.gender + '.svg" alt="" /></span>';
    }
    var initial = String(client.name || "?").trim().charAt(0).toUpperCase();
    return '<span class="' + cls + ' avatar--initial">' + esc(initial) + "</span>";
  }

  /* ---------------- auth ---------------- */

  function boot() {
    api("/api/auth?action=me").then(function (me) {
      if (me.authed) return loadClients();
      // one-device policy: setup is only offered while NO passkey exists yet
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

  $("#btnSetup").addEventListener("click", function () {
    var btn = this;
    showErr("#setupError", "");
    busy(btn, true);
    api("/api/auth?action=register-options", { method: "POST", body: {} })
      .then(function (options) {
        return SimpleWebAuthnBrowser.startRegistration({ optionsJSON: options });
      })
      .then(function (response) {
        return api("/api/auth?action=register-verify", {
          method: "POST",
          body: { response: response, label: "admin device" },
        });
      })
      .then(function () { toast("Passkey registered ✓ — this device is now the only key"); loadClients(); })
      .catch(function (e) {
        if (e.name === "InvalidStateError") showErr("#setupError", "This device already holds the passkey — reload and sign in.");
        else if (e.name !== "NotAllowedError") showErr("#setupError", e.message || "Setup failed");
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
          '<td><span class="namecell">' + avatarHtml(c, "avatar--sm") + "<strong>" + esc(c.name) + "</strong></span>" + badge + "</td>" +
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
    $("#btnRevokeShare").hidden = !c.share_token;
    $("#cAvatar").outerHTML = avatarHtml(c, "avatar--lg").replace('class="', 'id="cAvatar" class="');
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
      var paid = p.amount_paid != null ? Number(p.amount_paid).toLocaleString() + " " + esc(p.currency || "") : "—";
      if (p.has_proof) paid += ' <a href="/api/pdf?proof=' + p.id + '" target="_blank" rel="noopener" title="Payment proof">📷</a>';
      var tr = document.createElement("tr");
      tr.innerHTML =
        "<td>" + fmtDate(p.purchased_at) + (p.note ? '<div class="muted" style="font-size:.78rem">' + esc(p.note) + "</div>" : "") + "</td>" +
        '<td class="num"><strong>' + fmtH(p.hours) + "</strong></td>" +
        '<td class="num muted">' + paid + "</td>" +
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
        '<td class="num">' +
          '<button class="iconbtn iconbtn--edit" title="Edit session">✎</button>' +
          '<button class="iconbtn iconbtn--del" title="Delete session">✕</button></td>';
      tr.querySelector(".iconbtn--edit").addEventListener("click", function () { startEditSession(s); });
      tr.querySelector(".iconbtn--del").addEventListener("click", function () {
        if (!confirm("Delete this session record?")) return;
        api("/api/sessions?id=" + s.id, { method: "DELETE" })
          .then(function () { return openClient(state.clientId); })
          .catch(function (e) { toast(e.message, true); });
      });
      st.appendChild(tr);
    });

    // default form dates + leave edit mode
    stopEditSession();
    $("#addPackageForm").elements.purchased_at.value = todayISO();
    $("#addSessionForm").elements.session_date.value = todayISO();
  }

  function startEditSession(s) {
    state.editingSessionId = s.id;
    var form = $("#addSessionForm");
    form.elements.session_date.value = String(s.session_date).slice(0, 10);
    form.elements.hours.value = Number(s.hours);
    form.elements.topic.value = s.topic || "";
    form.elements.pdf.value = "";
    $("#btnSessionSubmit").textContent = "Update session";
    $("#btnCancelEdit").hidden = false;
    form.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function stopEditSession() {
    state.editingSessionId = null;
    var form = $("#addSessionForm");
    form.reset();
    form.elements.session_date.value = todayISO();
    $("#btnSessionSubmit").textContent = "Record session";
    $("#btnCancelEdit").hidden = true;
  }

  $("#btnCancelEdit").addEventListener("click", stopEditSession);

  $("#btnShare").addEventListener("click", function () {
    var btn = this;
    busy(btn, true);
    api("/api/clients?id=" + state.clientId + "&share=create", { method: "POST", body: {} })
      .then(function (r) {
        var url = location.origin + "/c/" + r.token;
        state.detail.client.share_token = r.token;
        $("#btnRevokeShare").hidden = false;
        return navigator.clipboard.writeText(url).then(
          function () { toast("Read-only link copied — send it to the client ✓"); },
          function () { prompt("Copy this read-only link:", url); }
        );
      })
      .catch(function (e) { toast(e.message, true); })
      .finally(function () { busy(btn, false); });
  });

  $("#btnRevokeShare").addEventListener("click", function () {
    if (!confirm("Disable the shared link? The client will lose access until you share a new one.")) return;
    var btn = this;
    busy(btn, true);
    api("/api/clients?id=" + state.clientId + "&share=revoke", { method: "POST", body: {} })
      .then(function () {
        state.detail.client.share_token = null;
        $("#btnRevokeShare").hidden = true;
        toast("Share link disabled");
      })
      .catch(function (e) { toast(e.message, true); })
      .finally(function () { busy(btn, false); });
  });

  $("#btnEditClient").addEventListener("click", function () {
    var form = $("#editClientForm");
    var c = state.detail.client;
    form.hidden = !form.hidden;
    if (!form.hidden) {
      ["name", "phone", "email", "gender", "nationality", "transaction_type", "notes"].forEach(function (k) {
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
    delete b.proof;
    var file = form.elements.proof.files[0];

    var ready = Promise.resolve();
    if (file) {
      if (file.size > 3 * 1024 * 1024) { toast("Attachment is too large (max 3 MB)", true); return; }
      ready = readFileB64(file).then(function (b64) {
        b.proof_base64 = b64;
        b.proof_name = file.name;
        b.proof_type = file.type;
      });
    }
    busy(btn, true);
    ready
      .then(function () { return api("/api/packages", { method: "POST", body: b }); })
      .then(function () { form.reset(); toast("Hours added ✓"); return openClient(state.clientId); })
      .catch(function (e) { toast(e.message, true); })
      .finally(function () { busy(btn, false); });
  });

  $("#addSessionForm").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var form = this;
    var btn = $("#btnSessionSubmit");
    var editingId = state.editingSessionId;
    var b = formData(form);
    b.client_id = state.clientId;
    delete b.pdf;
    var file = form.elements.pdf.files[0];

    var ready = Promise.resolve();
    if (file) {
      if (file.size > 3 * 1024 * 1024) { toast("PDF is too large (max 3 MB)", true); return; }
      ready = readFileB64(file).then(function (b64) {
        b.pdf_base64 = b64;
        b.pdf_name = file.name;
      });
    }
    busy(btn, true);
    ready
      .then(function () {
        return editingId
          ? api("/api/sessions?id=" + editingId, { method: "PATCH", body: b })
          : api("/api/sessions", { method: "POST", body: b });
      })
      .then(function () { toast(editingId ? "Session updated ✓" : "Session recorded ✓"); return openClient(state.clientId); })
      .catch(function (e) { toast(e.message, true); })
      .finally(function () { busy(btn, false); });
  });

  /* ---------------- balance chart (shared renderer in chart.js) ---------------- */

  function renderChart(timeline) {
    window.renderBalanceChart($("#chart"), $("#chartTip"), timeline);
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
