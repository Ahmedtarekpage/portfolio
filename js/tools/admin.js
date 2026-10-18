/* Admin panel logic: passkey auth, clients, hour packages, sessions, balance chart. */
(function () {
  "use strict";

  var $ = function (sel) { return document.querySelector(sel); };
  var state = {
    clientId: null, detail: null, editingSessionId: null, chartFrom: null, chartTo: null,
    clients: [], agenda: [], settings: null, editingMeetingId: null,
    daysTouched: false, seriesPlan: null, seriesSeq: 0,
    route: "home", loaded: false,
    // every visit opens on Today (owner, 2026-10-16); another filter lasts for the visit
    agendaRange: "today",
    agendaAll: false,
  };
  var Meet = window.Meet;

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
    ["view-loading", "view-login", "view-setup", "view-home", "view-list", "view-client"].forEach(function (v) {
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

  // centre-crop to a square and JPEG-compress client-side, so what reaches the
  // API is a few tens of KB however large the original was
  function squarePhoto(file, size, quality) {
    return new Promise(function (resolve, reject) {
      if (!/^image\//.test(file.type)) { reject(new Error("That file is not an image")); return; }
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var side = Math.min(img.width, img.height);
        var out = Math.min(size, side);
        var canvas = document.createElement("canvas");
        canvas.width = out; canvas.height = out;
        var ctx = canvas.getContext("2d");
        ctx.fillStyle = "#fff"; // JPEG has no alpha — a transparent PNG would otherwise turn black
        ctx.fillRect(0, 0, out, out);
        ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, out, out);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("Could not read that image")); };
      img.src = url;
    });
  }

  function avatarHtml(client, extraClass) {
    var cls = "avatar " + (extraClass || "");
    if (client.photo) {
      return '<span class="' + cls + '"><img src="' + esc(client.photo) + '" alt="" /></span>';
    }
    if (client.gender === "male" || client.gender === "female") {
      return '<span class="' + cls + '"><img src="/assets/avatar-' + client.gender + '.svg?v=2" alt="" /></span>';
    }
    var initial = String(client.name || "?").trim().charAt(0).toUpperCase();
    return '<span class="' + cls + ' avatar--initial">' + esc(initial) + "</span>";
  }

  /* ---------------- auth ---------------- */

  function boot() {
    api("/api/auth?action=me").then(function (me) {
      if (me.authed) return nav(routeFromHash(), false);
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

  function logout() {
    api("/api/auth?action=logout", { method: "POST", body: {} }).then(function () { show("view-login"); });
  }
  $("#btnLogout").addEventListener("click", logout);
  $("#btnLogoutHome").addEventListener("click", logout);

  /* ---------------- routes: home → clients → one client ----------------
     /admin opens on a home screen that asks where to go: Clients or Time
     (owner, 2026-10-16). #clients and #client/N keep the back button and a
     reload where they were. */

  function routeFromHash() {
    var m = /^#client\/(\d+)$/.exec(location.hash);
    if (m) return { name: "client", id: Number(m[1]) };
    return { name: location.hash === "#clients" ? "clients" : "home" };
  }

  function hashFor(r) {
    return r.name === "client" ? "#client/" + r.id : r.name === "clients" ? "#clients" : "";
  }

  function nav(r, push, fresh) {
    if (push) {
      var url = location.pathname + hashFor(r);
      if (url !== location.pathname + location.hash) history.pushState(null, "", url);
    }
    state.route = r.name;
    if (r.name === "client") return openClient(r.id);
    state.clientId = null;
    if (!state.loaded || fresh) return loadClients();
    if (r.name === "home") renderHome();
    show(r.name === "home" ? "view-home" : "view-list");
    window.scrollTo(0, 0);
  }

  window.addEventListener("popstate", function () {
    if (!$("#view-login").hidden || !$("#view-setup").hidden) return;
    nav(routeFromHash(), false, true);
  });

  $("#btnHome").addEventListener("click", function () { nav({ name: "home" }, true); });
  $("#goClients").addEventListener("click", function () { nav({ name: "clients" }, true); });

  function renderHome() {
    var now = new Date();
    var hour = Number(Meet.fmt(now, myZone(), { hour: "numeric", hourCycle: "h23" }));
    $("#homeHello").textContent = (hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening") + ", Ahmed";
    $("#homeDate").textContent = Meet.fmt(now, myZone(), { weekday: "long", day: "numeric", month: "long" });
    var facts = ['<span class="go-home__fact">' + state.clients.length + " client" + (state.clients.length === 1 ? "" : "s") + "</span>"];
    var left = state.clients.reduce(function (sum, c) { return sum + Math.max(0, Number(c.totals && c.totals.available) || 0); }, 0);
    if (left > 0) facts.push('<span class="go-home__fact">' + esc(fmtH(left)) + " left in all</span>");
    var next = state.agenda.filter(function (m) { return Meet.status(m, now) !== "past"; })[0];
    if (next) {
      facts.push('<span class="go-home__fact go-home__fact--blue">Next: ' + esc(firstName(next.client_name) || "a meeting") + " · " +
        esc(Meet.dayLabel(new Date(next.starts_at), now, myZone()) + " " + Meet.fmtTime(new Date(next.starts_at), myZone())) + "</span>");
    }
    $("#homeClientFacts").innerHTML = facts.join("");
  }

  /* ---------------- client list ---------------- */

  /* The zone every time on this screen is printed in: the one chosen in
     settings, or wherever this device says it is. */
  function myZone() {
    var s = state.settings;
    if (s && s.timezone && s.timezone !== "auto" && Meet.isZone(s.timezone)) return s.timezone;
    return Meet.deviceZone();
  }

  function useSettings(settings) {
    state.settings = settings;
    $("#zoneNow").textContent = Meet.zoneLabel(myZone());
    // "Automatic" only means something to the reminder emails if the server
    // knows where this device is, so tell it when that changes.
    var here = Meet.deviceZone();
    if (settings && settings.detected_timezone !== here) {
      settings.detected_timezone = here;
      api("/api/sessions?resource=settings", { method: "PUT", body: { detected_timezone: here } }).catch(function () {});
    }
  }

  function firstName(name) {
    return String(name || "").trim().split(/\s+/)[0] || "";
  }

  function nextMeetingFor(clientId) {
    return state.agenda.filter(function (m) { return m.client_id === clientId; })[0] || null;
  }

  function clientCardHtml(c) {
    var t = c.totals || {};
    var chips = "";
    var next = nextMeetingFor(c.id);
    if (next) {
      var now = new Date();
      var live = Meet.status(next, now) === "live";
      var d = Meet.dayDiff(new Date(next.starts_at), now, myZone());
      var tone = live ? "live" : d === 0 ? "today" : d === 1 ? "tomorrow" : "later";
      chips += '<span class="pill pill--' + tone + '">' + (live ? '<i class="pill__dot"></i>Now' :
        esc(Meet.dayLabel(new Date(next.starts_at), now, myZone()) + " " + Meet.fmtTime(new Date(next.starts_at), myZone()))) + "</span>";
    }
    if (t.nextExpiry && t.nextExpiry.hours > 0) {
      var days = Math.round((new Date(t.nextExpiry.date) - new Date(todayISO())) / 86400000);
      if (days <= 7) chips += '<span class="badge badge--warn">' + fmtH(t.nextExpiry.hours) + " expire in " + days + "d</span>";
    }
    if (t.overdraft > 0) chips += '<span class="badge badge--danger">unpaid ' + fmtH(t.overdraft) + "</span>";
    var where = Country.of(c);

    return '<button type="button" class="client-card" data-id="' + Number(c.id) + '">' +
      '<span class="client-card__head"><span class="client-card__pic">' + avatarHtml(c, "avatar--md") +
        (where ? '<span class="flag-sticker" title="' + esc(where.name) + '" aria-hidden="true">' + where.flag + "</span>" : "") + "</span>" +
        '<span class="client-card__id"><strong>' + esc(c.name) + "</strong>" +
        '<span class="muted">' + esc([c.phone, c.email].filter(Boolean)[0] || c.nationality || "No contact details") + "</span></span>" +
        '<span class="client-card__hours' + (Number(t.available) > 0 ? "" : " client-card__hours--none") + '"><b>' + fmtH(t.available) + "</b><span>left</span></span>" +
      "</span>" +
      '<span class="client-card__foot">' +
        (chips || '<span class="muted">' + (t.nextExpiry ? "Expires " + fmtDate(t.nextExpiry.date) : "No meeting scheduled") + "</span>") +
        '<span class="client-card__end">' +
          (where ? '<span class="country-chip"><span aria-hidden="true">' + where.flag + "</span>" + esc(where.name) + "</span>" : "") +
          (c.transaction_type ? '<span class="client-card__type">' + esc(c.transaction_type) + "</span>" : "") +
        "</span>" +
      "</span></button>";
  }

  // `animate` is for the first drawing of a list only; see .stagger in app.css
  function renderClientGrid(animate) {
    var q = $("#clientSearch").value.trim().toLowerCase();
    $("#clientGrid").classList.toggle("stagger", animate === true);
    var shown = state.clients.filter(function (c) {
      if (!q) return true;
      var where = Country.of(c);
      return [c.name, c.phone, c.email, c.nationality, where ? where.name : ""].join(" ").toLowerCase().indexOf(q) !== -1;
    });
    $("#clientGrid").innerHTML = shown.map(clientCardHtml).join("");
    $("#clientCount").textContent = state.clients.length ? String(state.clients.length) : "";
    $("#clientsEmpty").hidden = state.clients.length > 0;
    $("#clientsNoMatch").hidden = !(state.clients.length > 0 && shown.length === 0);
    $("#clientSearch").hidden = state.clients.length < 2;
  }

  /* Upcoming meetings, by when (owner, 2026-10-16: "today, this week etc
     filter"). Weeks run Monday to Sunday on your own calendar. */
  var AGENDA_LIMIT = 12;
  var AGENDA_EMPTY = {
    today: "Nothing left today 🎉 Enjoy the free time.",
    tomorrow: "Nothing tomorrow yet.",
    week: "Nothing more this week.",
    next: "Nothing booked for next week yet.",
    month: "Nothing more this month.",
    all: "Nothing scheduled.",
  };

  function agendaTest(range, now) {
    var tz = myZone();
    var today = Meet.localFields(now, tz).date;
    var dow = (new Date(today + "T00:00:00Z").getUTCDay() + 6) % 7; // Monday is 0
    return function (m) {
      var d = Meet.dayDiff(new Date(m.starts_at), now, tz);
      if (range === "today") return d <= 0;
      if (range === "tomorrow") return d === 1;
      if (range === "week") return d <= 6 - dow;
      if (range === "next") return d > 6 - dow && d <= 13 - dow;
      if (range === "month") return Meet.localFields(new Date(m.starts_at), tz).date.slice(0, 7) === today.slice(0, 7);
      return true;
    };
  }

  function meetingTitle(m, name) {
    return (m.topic ? m.topic + " · " : "Meeting · ") + name;
  }

  function googleButton(m, name) {
    return '<a class="btn btn--ghost btn--sm" data-sound="open" target="_blank" rel="noopener" title="Add this one meeting to Google Calendar" href="' +
      esc(Meet.googleUrl(m, meetingTitle(m, name), "With " + name + ".")) + '">📅 Google</a>';
  }

  function renderAgenda(animate) {
    var now = new Date();
    var byId = {};
    $("#agendaList").classList.toggle("stagger", animate === true);
    state.clients.forEach(function (c) { byId[c.id] = c; });
    $("#agendaFilter").querySelectorAll(".chip").forEach(function (b) {
      var r = b.getAttribute("data-range");
      var n = state.agenda.filter(agendaTest(r, now)).length;
      b.querySelector(".chip__n").textContent = n ? String(n) : "";
      b.setAttribute("aria-pressed", String(r === state.agendaRange));
    });
    var all = state.agenda.filter(agendaTest(state.agendaRange, now));
    var list = state.agendaAll ? all : all.slice(0, AGENDA_LIMIT);
    $("#agenda").hidden = state.agenda.length === 0;
    $("#agendaEmpty").hidden = all.length > 0;
    $("#agendaEmpty").textContent = AGENDA_EMPTY[state.agendaRange] || "";
    $("#agendaMore").hidden = all.length <= list.length;
    $("#agendaMore").textContent = "Show all " + all.length;
    $("#agendaZone").textContent = "Times in " + Meet.zoneLabel(myZone());
    $("#agendaList").innerHTML = list.map(function (m) {
      var c = byId[m.client_id] || { name: m.client_name, photo: m.client_photo, gender: m.client_gender };
      return Meet.cardHtml(m, now, {
        tz: myZone(),
        otherTz: m.timezone,
        otherName: firstName(c.name),
        who: { name: c.name, avatarHtml: avatarHtml(c, "avatar--sm") },
        noLinkText: "No link yet",
        actions: function (mm, st) {
          if (st === "past") return "";
          return googleButton(mm, c.name) +
            '<button type="button" class="btn btn--ghost btn--sm" data-act="reschedule">↻ Reschedule</button>' +
            '<button type="button" class="btn btn--danger btn--sm" data-act="cancel">✕ Cancel</button>';
        },
      });
    }).join("");
  }

  $("#agendaFilter").addEventListener("click", function (ev) {
    var b = ev.target.closest(".chip");
    if (!b) return;
    state.agendaRange = b.getAttribute("data-range");
    state.agendaAll = false;
    renderAgenda(true);
  });
  $("#agendaMore").addEventListener("click", function () { state.agendaAll = true; renderAgenda(); });

  $("#agendaList").addEventListener("click", function (ev) {
    var btn = ev.target.closest("[data-act]");
    if (!btn) return;
    var id = Number(btn.closest(".meet").getAttribute("data-id"));
    var m = state.agenda.filter(function (x) { return x.id === id; })[0];
    if (!m) return;
    var act = btn.getAttribute("data-act");
    if (act === "open") return openClient(m.client_id);
    if (act === "reschedule") {
      // the meeting form lives on the client's page: go there, open it on "when"
      return openClient(m.client_id).then(function () {
        var mm = meetingById(m.id);
        if (mm) openMeetingForm(mm, true);
      });
    }
    if (act === "cancel") {
      cancelMeeting(m, state.agenda, function (gone) {
        state.agenda = state.agenda.filter(function (x) { return gone.indexOf(x.id) === -1; });
        renderAgenda();
        renderClientGrid();
        renderHome();
      });
    }
  });

  /* Cancelling: one meeting, or it and the rest of its series. `pool` is the
     list the meeting came from, to count what follows it. */
  function cancelMeeting(m, pool, done) {
    var rest = m.series_id ? pool.filter(function (x) {
      return x.series_id === m.series_id && new Date(x.starts_at) > new Date(m.starts_at);
    }) : [];
    var when = Meet.dayLabel(new Date(m.starts_at), new Date(), myZone()) + " " + Meet.fmtTime(new Date(m.starts_at), myZone());
    var choice = rest.length
      ? ask("Cancel " + when + "?", "It is part of a repeating series. The client will no longer see what you cancel, and it leaves your calendar on its next refresh.", [
          { value: "one", label: "Only this one", cls: "btn--danger" },
          { value: "following", label: "This and the " + rest.length + " after it", cls: "btn--danger" },
          { value: "cancel", label: "Keep them" },
        ])
      : ask("Cancel " + when + "?", "The client will no longer see it, and it leaves your calendar on its next refresh.", [
          { value: "one", label: "Yes, cancel it", cls: "btn--danger" },
          { value: "cancel", label: "Keep it" },
        ]);
    return choice.then(function (scope) {
      if (!scope) return;
      return api("/api/sessions?resource=meetings&id=" + m.id + (scope === "following" ? "&scope=following" : ""), { method: "DELETE" })
        .then(function (r) {
          var gone = r.deleted || [m.id];
          done(gone);
          toast(gone.length > 1 ? gone.length + " meetings cancelled" : "Meeting cancelled");
        });
    }).catch(function (e) { toast(e.message, true); });
  }

  $("#clientGrid").addEventListener("click", function (ev) {
    var card = ev.target.closest(".client-card");
    if (card) openClient(Number(card.getAttribute("data-id")));
  });

  $("#clientSearch").addEventListener("input", function () { renderClientGrid(); });

  function loadClients() {
    show("view-loading");
    return api("/api/clients").then(function (data) {
      state.clients = data.clients;
      state.agenda = data.meetings || [];
      useSettings(data.settings);
      state.loaded = true;
      renderAgenda(true);
      renderClientGrid(true);
      renderHome();
      show(state.route === "home" ? "view-home" : "view-list");
    }).catch(function (e) { toast(e.message, true); show(state.route === "home" ? "view-home" : "view-list"); });
  }

  /* ---------------- settings: my time zone, usual link, reminder address ---------------- */

  function openSettings(open) {
    var card = $("#settingsCard");
    card.hidden = !open;
    $("#btnZone").setAttribute("aria-expanded", open ? "true" : "false");
    if (!open) return;
    var s = state.settings || {};
    var form = $("#settingsForm");
    var here = Meet.deviceZone();
    Meet.fillZoneSelect(form.elements.timezone, s.timezone || "auto", [here], {
      value: "auto",
      label: "Automatic, from this device's location (" + Meet.city(here) + ", " + Meet.offsetLabel(here) + ")",
    });
    form.elements.default_link.value = s.default_link || "";
    form.elements.notify_email.value = s.notify_email || "";
    form.elements.notify_email.placeholder = s.notify_email_effective || "";
    // nothing about email is shown while reminder emails are switched off
    $("#notifyField").hidden = !s.reminders_enabled;
    var note = $("#mailStatus");
    note.hidden = !s.reminders_enabled;
    note.className = "span2 form__note " + (s.mail_configured ? "form__note--ok" : "form__note--warn");
    note.textContent = s.mail_configured
      ? "Reminder emails are on: you and the client each get one a day before and one 2 hours before."
      : "Reminder emails are not being sent yet. No email service key is set on the server (BREVO_API_KEY or RESEND_API_KEY in Vercel). Meetings still show on the client's page.";
  }

  $("#btnZone").addEventListener("click", function () { openSettings($("#settingsCard").hidden); });
  $("#btnCloseSettings").addEventListener("click", function () { openSettings(false); });

  $("#settingsForm").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var form = this;
    var btn = form.querySelector("button[type=submit]");
    busy(btn, true);
    api("/api/sessions?resource=settings", {
      method: "PUT",
      body: {
        timezone: form.elements.timezone.value,
        default_link: form.elements.default_link.value.trim(),
        notify_email: form.elements.notify_email.value.trim(),
        detected_timezone: Meet.deviceZone(),
      },
    })
      .then(function (r) {
        useSettings(r.settings);
        renderAgenda();
        renderClientGrid();
        openSettings(false);
        toast("Settings saved ✓");
      })
      .catch(function (e) { toast(e.message, true); })
      .finally(function () { busy(btn, false); });
  });

  $("#addClientForm").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var form = this;
    var btn = form.querySelector("button[type=submit]");
    var b = formData(form);
    var file = form.elements.photo.files[0];
    busy(btn, true);
    (file ? squarePhoto(file, 320, 0.82) : Promise.resolve(null))
      .then(function (photo) {
        if (photo) b.photo = photo;
        return api("/api/clients", { method: "POST", body: b });
      })
      .then(function () { form.reset(); $("#addClientBox").open = false; toast("Client added ✓"); state.route = "clients"; return loadClients(); })
      .catch(function (e) { toast(e.message, true); })
      .finally(function () { busy(btn, false); });
  });

  /* ---------------- client detail ---------------- */

  $("#btnBack").addEventListener("click", function () { nav({ name: "clients" }, true, true); });

  // the add-client wizard starts from its first question every time it opens
  $("#addClientBox").addEventListener("toggle", function () {
    if (this.open) { Go.wizard.restart($("#addClientForm")); Go.play("open"); }
  });

  function openClient(id) {
    // Reading the same client again after a save is a refresh, not a new page:
    // the loading screen stays away and the page keeps its place, so saving a
    // photo on a phone no longer throws you back to the top (owner, 2026-10-16).
    var refresh = state.clientId === id && state.detail && !$("#view-client").hidden;
    // hold on to the card nearest the top of the screen, and where on the screen
    // it sits: cards change height as forms reopen, so a raw offset is not enough
    var anchor = refresh ? keepPlace() : null;
    if (state.clientId !== id) {
      state.chartFrom = null;
      state.chartTo = null;
      chartRangeCtl.reset();
    }
    state.clientId = id;
    state.route = "client";
    var url = location.pathname + "#client/" + id;
    if (location.pathname + location.hash !== url) history.pushState(null, "", url);
    if (!refresh) show("view-loading");
    return api("/api/clients?id=" + id).then(function (data) {
      state.detail = data;
      if (data.settings) useSettings(data.settings);
      renderClient(data);
      renderMeetings(!refresh);
      show("view-client");
      renderChart(data.timeline);
      if (anchor) anchor();
    }).catch(function (e) { toast(e.message, true); nav({ name: "clients" }, true, true); });
  }

  /* Returns a function that puts the page back where it was, measured against
     the card nearest the top of the screen rather than the page's own offset. */
  function keepPlace() {
    var top = null, best = Infinity;
    // only the cards: the tiles are built again on every render, so they are gone
    // by the time we measure, and a vanished anchor tells us nothing
    document.querySelectorAll("#view-client .card").forEach(function (el) {
      var r = el.getBoundingClientRect();
      var d = Math.abs(r.top);
      if (r.height && d < best) { best = d; top = el; }
    });
    if (!top) return null;
    var was = top.getBoundingClientRect().top;
    var scroll = window.scrollY;
    return function () {
      var put = function () {
        // after the new layout, move by however far that card has shifted
        var move = top.isConnected ? top.getBoundingClientRect().top - was : 0;
        var to = Math.max(0, (top.isConnected ? window.scrollY : scroll) + move);
        if (Math.abs(to - window.scrollY) > 1) window.scrollTo(0, to);
      };
      put();
      // a phone scrolls the file input back into view once its picker closes,
      // and the new picture lands a frame later: hold the place through both
      requestAnimationFrame(put);
      setTimeout(put, 120);
      setTimeout(put, 400);
    };
  }

  function renderClient(data) {
    var c = data.client, t = data.totals;
    $("#btnRevokeShare").hidden = !c.share_token;
    $("#cAvatar").outerHTML = avatarHtml(c, "avatar--lg").replace('class="', 'id="cAvatar" class="');
    $("#btnPhoto").title = c.photo ? "Change photo" : "Upload a photo";
    $("#btnPhoto").setAttribute("aria-label", $("#btnPhoto").title);
    $("#btnRemovePhoto").hidden = !c.photo;
    $("#cName").textContent = c.name;
    // the country from the phone's code leads; a nationality saying something else still shows
    var where = Country.of(c);
    var said = Country.fromName(c.nationality);
    var chips = [[where ? where.flag : "", where ? where.name : ""], ["📞", c.phone], ["✉️", c.email],
      [said ? said.flag : "🌍", c.nationality && (!where || !said || said.iso !== where.iso) ? c.nationality : ""],
      ["💳", c.transaction_type], ["📝", c.notes]]
      .filter(function (x) { return x[1]; })
      .map(function (x, i) { return '<span class="client-chip' + (i === 0 && where ? " client-chip--country" : "") + '"><span aria-hidden="true">' + x[0] + "</span>" + esc(x[1]) + "</span>"; });
    $("#cMeta").innerHTML = chips.join("") || '<span class="client-chip client-chip--empty">No contact details yet</span>';
    $("#editClientForm").hidden = true;
    state.editingMeetingId = null;
    $("#meetingForm").hidden = true;
    $("#btnNewMeeting").hidden = false;
    $("#linkAllForm").hidden = true;

    var tiles = [
      { label: "Available now", value: fmtH(t.available), cls: "tile--accent", sub: t.nextExpiry ? fmtH(t.nextExpiry.hours) + " expire " + fmtDate(t.nextExpiry.date) : "" },
      { label: "Purchased", value: fmtH(t.purchased), sub: "" },
      { label: "Used", value: fmtH(t.used), sub: data.sessions.length + " session" + (data.sessions.length === 1 ? "" : "s") },
      { label: "Expired", value: fmtH(t.expired), cls: t.expired > 0 ? "tile--warn" : "", sub: "" },
    ];
    if (t.overdraft > 0) tiles.push({ label: "Unpaid hours", value: fmtH(t.overdraft), cls: "tile--danger", sub: "sessions beyond balance" });

    // total paid, grouped by currency (admin-only — never sent to the share page)
    var paidTotals = {};
    data.packages.forEach(function (p) {
      if (p.amount_paid == null) return;
      var cur = String(p.currency || "").trim().toUpperCase() || "?";
      paidTotals[cur] = (paidTotals[cur] || 0) + Number(p.amount_paid);
    });
    var paidCurs = Object.keys(paidTotals).sort(function (a, b) { return paidTotals[b] - paidTotals[a]; });
    if (paidCurs.length) {
      tiles.push({
        label: "Total paid",
        value: paidTotals[paidCurs[0]].toLocaleString() + " " + paidCurs[0],
        cls: "tile--good",
        sub: paidCurs.slice(1).map(function (c) { return "+ " + paidTotals[c].toLocaleString() + " " + c; }).join("  ·  "),
      });
    }
    $("#tiles").innerHTML = tiles.map(function (x) {
      return '<div class="tile ' + (x.cls || "") + '"><div class="tile__label">' + esc(x.label) +
        '</div><div class="tile__value">' + esc(x.value) + "</div>" +
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
        '<td data-label="Bought">' + fmtDate(p.purchased_at) + (p.note ? '<div class="muted" style="font-size:.78rem">' + esc(p.note) + "</div>" : "") + "</td>" +
        '<td class="num" data-label="Hours"><strong>' + fmtH(p.hours) + "</strong></td>" +
        '<td class="num muted" data-label="Paid">' + paid + "</td>" +
        '<td class="muted" data-label="Expires">' + fmtDate(p.expires_at) + (expired ? ' <span class="badge badge--warn">expired</span>' : "") + "</td>" +
        '<td class="row-act"><button class="iconbtn" title="Delete purchase" aria-label="Delete purchase">✕</button></td>';
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
        '<td data-label="Date">' + fmtDate(s.session_date) + "</td>" +
        '<td class="num" data-label="Hours"><strong>' + fmtH(s.hours) + "</strong></td>" +
        '<td class="row-wide" data-label="Topic">' + esc(s.topic || "—") + "</td>" +
        '<td class="row-file">' + (s.has_pdf ? fileChip(s) : "") + "</td>" +
        '<td class="num row-act">' +
          '<button class="iconbtn iconbtn--edit" title="Edit session">✎</button>' +
          '<button class="iconbtn iconbtn--del" title="Delete session">✕</button></td>';
      tr.querySelector(".iconbtn--edit").addEventListener("click", function () { startEditSession(s); });
      var chip = tr.querySelector("[data-file]");
      if (chip) chip.addEventListener("click", function () {
        chip.classList.add("is-busy");
        Files.open("/api/pdf?id=" + s.id, { size: s.file_size, name: s.pdf_name, type: s.file_type })
          .catch(function (e) { toast(e.message, true); })
          .then(function () { chip.classList.remove("is-busy"); });
      });
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
    Go.wizard.restart($("#addPackageForm"));
    Go.wizard.restart($("#addSessionForm"));
  }

  // a session's minutes or slides: an icon for the kind, its name and size
  function fileChip(s) {
    var k = Files.kind(s.pdf_name);
    return '<button type="button" class="file-chip file-chip--' + k.tone + '" data-file="' + Number(s.id) + '" title="Open ' + esc(s.pdf_name || "the file") + '">' +
      '<span class="file-chip__icon" aria-hidden="true">' + k.glyph + "</span>" +
      '<span class="file-chip__text"><b>' + esc(s.pdf_name || "File") + "</b><small>" + esc(k.label + (s.file_size ? " · " + Files.size(s.file_size) : "")) + "</small></span></button>";
  }

  function startEditSession(s) {
    state.editingSessionId = s.id;
    var form = $("#addSessionForm");
    form.elements.session_date.value = String(s.session_date).slice(0, 10);
    form.elements.hours.value = Number(s.hours);
    form.elements.topic.value = s.topic || "";
    form.elements.pdf.value = "";
    // the drop box says which file is there now; a new one replaces it
    form.elements.pdf.setAttribute("data-current", s.has_pdf ? (s.pdf_name || "a file") : "");
    Go.sync(form);
    $("#btnSessionSubmit").textContent = "Update session";
    $("#btnCancelEdit").hidden = false;
    Go.wizard.review(form);
    form.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function stopEditSession() {
    state.editingSessionId = null;
    var form = $("#addSessionForm");
    form.reset();
    form.elements.session_date.value = todayISO();
    form.elements.pdf.setAttribute("data-current", "");
    $("#btnSessionSubmit").textContent = "Record session";
    $("#btnCancelEdit").hidden = true;
  }

  $("#btnCancelEdit").addEventListener("click", stopEditSession);

  /* ---------------- meetings: what is scheduled, as opposed to what happened ---------------- */

  function renderMeetings(animate) {
    var data = state.detail;
    if (!data) return;
    $("#meetingsUpcoming").classList.toggle("stagger", animate === true);
    var now = new Date();
    var all = data.meetings || [];
    var ahead = all.filter(function (m) { return Meet.status(m, now) !== "past"; })
      .sort(function (a, b) { return new Date(a.starts_at) - new Date(b.starts_at); });
    var past = all.filter(function (m) { return Meet.status(m, now) === "past"; })
      .sort(function (a, b) { return new Date(b.starts_at) - new Date(a.starts_at); });
    // where each meeting stands in its repeating series: "2 of 5"
    var seriesPos = {};
    var bySeries = {};
    all.forEach(function (m) { if (m.series_id) (bySeries[m.series_id] = bySeries[m.series_id] || []).push(m); });
    Object.keys(bySeries).forEach(function (k) {
      var list = bySeries[k].sort(function (a, b) { return new Date(a.starts_at) - new Date(b.starts_at); });
      if (list.length < 2) return;
      list.forEach(function (m, i) { seriesPos[m.id] = { n: i + 1, total: list.length }; });
    });
    var opts = {
      tz: myZone(),
      otherName: firstName(data.client.name),
      seriesOf: function (m) { return seriesPos[m.id] || null; },
      copy: true,
      reminders: !!(state.settings && state.settings.reminders_enabled),
      noLinkText: "No link yet",
      actions: function (m, st) {
        if (st === "past") {
          return '<button type="button" class="btn btn--ghost btn--sm" data-act="record">Record as session</button>' +
            '<button type="button" class="iconbtn iconbtn--edit" data-act="edit" title="Edit meeting" aria-label="Edit meeting">✎</button>' +
            '<button type="button" class="iconbtn iconbtn--del" data-act="delete" title="Delete meeting" aria-label="Delete meeting">✕</button>';
        }
        return googleButton(m, data.client.name) +
          '<button type="button" class="btn btn--ghost btn--sm" data-act="reschedule">↻ Reschedule</button>' +
          '<button type="button" class="iconbtn iconbtn--edit" data-act="edit" title="Edit link, topic or length" aria-label="Edit meeting">✎</button>' +
          '<button type="button" class="btn btn--danger btn--sm" data-act="delete">✕ Cancel</button>';
      },
    };
    var card = function (m) { opts.otherTz = m.timezone; return Meet.cardHtml(m, now, opts); };
    $("#meetingsUpcoming").innerHTML = ahead.map(card).join("");
    $("#meetingsPast").innerHTML = past.map(card).join("");
    $("#btnLinkAll").hidden = ahead.length === 0 || !$("#linkAllForm").hidden;
    $("#meetingsEmpty").hidden = ahead.length > 0 || !$("#meetingForm").hidden || !$("#linkAllForm").hidden;
    $("#meetingsPastBox").hidden = past.length === 0;
    $("#meetingsPastSummary").textContent = "Earlier meetings (" + past.length + ")";
  }

  function meetingById(id) {
    return ((state.detail && state.detail.meetings) || []).filter(function (m) { return m.id === id; })[0];
  }

  function showMeetingPreview() {
    var form = $("#meetingForm");
    var box = $("#meetingPreview");
    var tz = form.elements.timezone.value;
    var start = Meet.zonedToUtc(form.elements.date.value + "T" + form.elements.time.value, tz);
    if (!start) { box.hidden = true; return; }
    var now = new Date();
    var mine = myZone();
    var line = function (zone) {
      var label = Meet.dayLabel(start, now, zone);
      // further out the label is already the date; nearer, "Tomorrow" wants one beside it
      var day = /\d/.test(label) ? label : label + ", " + Meet.fmt(start, zone, { day: "numeric", month: "short" });
      return day + " at " + Meet.fmtTime(start, zone) + " (" + Meet.zoneLabel(zone, start) + ")";
    };
    var html = "<b>For you:</b> " + esc(line(mine));
    if (tz !== mine) html += "<br /><b>For " + esc(firstName(state.detail.client.name) || "the client") + ":</b> " + esc(line(tz));
    if (start < now) html += '<br /><span class="meet-preview__warn">That time has already passed.</span>';
    box.innerHTML = html;
    box.hidden = false;
  }

  function openMeetingForm(m, reschedule) {
    var form = $("#meetingForm");
    var client = state.detail.client;
    var s = state.settings || {};
    state.editingMeetingId = m ? m.id : null;
    form.reset();
    var tz = m ? m.timezone : (client.timezone || myZone());
    Meet.fillZoneSelect(form.elements.timezone, tz, [client.timezone, myZone(), Meet.deviceZone()]);
    if (m) {
      var f = Meet.localFields(new Date(m.starts_at), m.timezone);
      form.elements.date.value = f.date;
      form.elements.time.value = f.time;
      form.elements.duration_min.value = String(m.duration_min);
      if (form.elements.duration_min.value !== String(m.duration_min)) {
        form.elements.duration_min.insertAdjacentHTML("beforeend", '<option value="' + Number(m.duration_min) + '">' + Number(m.duration_min) + " minutes</option>");
        form.elements.duration_min.value = String(m.duration_min);
      }
      form.elements.link.value = m.link || "";
      form.elements.topic.value = m.topic || "";
    } else {
      form.elements.date.value = Meet.localFields(new Date(), tz).date;
      form.elements.link.value = s.default_link || "";
    }
    // a repeat rule makes new meetings; editing changes the one that was clicked
    form.querySelectorAll(".repeat-only").forEach(function (el) { el.classList.toggle("is-off", !!m); });
    state.daysTouched = false;
    state.seriesPlan = null;
    syncRepeatFields();
    $("#btnMeetingSubmit").textContent = reschedule ? "Save the new time ✓" : m ? "Update meeting" : "Schedule meeting";
    form.hidden = false;
    $("#btnNewMeeting").hidden = true;
    $("#meetingsEmpty").hidden = true;
    showMeetingPreview();
    if (m && !reschedule) Go.wizard.review(form); else Go.wizard.restart(form);
    Go.play("open");
    if (m) form.scrollIntoView({ behavior: "smooth", block: "center" });
    if (!m || reschedule) form.elements.time.focus({ preventScroll: !!m });
  }

  function closeMeetingForm() {
    state.editingMeetingId = null;
    $("#meetingForm").hidden = true;
    $("#btnNewMeeting").hidden = false;
    renderMeetings();
  }

  /* ---------------- one new link for everything still to come ----------------
     Owner, 2026-10-18: "change url of meeting for all meeting for one client".
     A new Zoom room or Meet code should not mean editing twelve cards. */

  function upcomingMeetings() {
    var now = new Date();
    return ((state.detail && state.detail.meetings) || [])
      .filter(function (m) { return Meet.status(m, now) !== "past"; })
      .sort(function (a, b) { return new Date(a.starts_at) - new Date(b.starts_at); });
  }

  function showLinkAllApp() {
    var form = $("#linkAllForm");
    var box = $("#linkAllApp");
    var link = form.elements.link.value.trim();
    if (!link) { box.hidden = true; return; }
    var app = Meet.platform(link);
    var ok = /^https?:\/\/\S+$/i.test(link);
    box.innerHTML = !ok ? '<span class="meet-preview__warn">A link starts with https://</span>'
      : app ? "That is a <b>" + esc(app) + "</b> link." : "The join button will say <b>Join meeting</b>.";
    box.hidden = false;
  }

  function openLinkAll() {
    var form = $("#linkAllForm");
    var list = upcomingMeetings();
    if (!list.length) return;
    // start from the link they share, if they share one; else the usual one
    var links = {};
    list.forEach(function (m) { if (m.link) links[m.link] = (links[m.link] || 0) + 1; });
    var common = Object.keys(links).sort(function (a, b) { return links[b] - links[a]; })[0] || "";
    form.reset();
    form.elements.link.value = common || ((state.settings && state.settings.default_link) || "");
    $("#linkAllTitle").textContent = "New link for " + (list.length === 1 ? "the upcoming meeting" : "all " + list.length + " upcoming meetings");
    $("#btnLinkAllSubmit").textContent = "Change the link on " + list.length + " meeting" + (list.length === 1 ? "" : "s") + " ✓";
    showLinkAllApp();
    form.hidden = false;
    $("#btnLinkAll").hidden = true;
    Go.play("open");
    form.elements.link.focus();
    form.elements.link.select();
  }

  function closeLinkAll() {
    $("#linkAllForm").hidden = true;
    renderMeetings();
  }

  $("#btnLinkAll").addEventListener("click", openLinkAll);
  $("#btnLinkAllCancel").addEventListener("click", closeLinkAll);
  $("#linkAllForm").elements.link.addEventListener("input", showLinkAllApp);

  $("#linkAllForm").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var form = this;
    var btn = $("#btnLinkAllSubmit");
    var link = form.elements.link.value.trim();
    var saveDefault = form.elements.save_default.checked;
    busy(btn, true);
    api("/api/sessions?resource=meetings&client_id=" + state.clientId + "&scope=upcoming", { method: "PATCH", body: { link: link } })
      .then(function (r) {
        state.detail.meetings = r.meetings;
        // the list page's agenda carries the same meetings; keep it honest
        var byId = {};
        r.meetings.forEach(function (m) { byId[m.id] = m; });
        state.agenda = state.agenda.map(function (m) { return byId[m.id] ? Object.assign({}, m, { link: byId[m.id].link, platform: byId[m.id].platform }) : m; });
        var next = saveDefault && link
          ? api("/api/sessions?resource=settings", { method: "PUT", body: { default_link: link } }).then(function (s) { useSettings(s.settings); })
          : Promise.resolve();
        return next.then(function () {
          toast(link
            ? "Link changed on " + r.changed + " meeting" + (r.changed === 1 ? "" : "s") + (saveDefault ? ", and saved as your usual one ✓" : " ✓")
            : "Link removed from " + r.changed + " meeting" + (r.changed === 1 ? "" : "s"));
          Go.play("success");
          closeLinkAll();
        });
      })
      .catch(function (e) { toast(e.message, true); Go.play("error"); })
      .finally(function () { busy(btn, false); });
  });

  $("#btnNewMeeting").addEventListener("click", function () { openMeetingForm(null); });
  $("#btnCancelMeeting").addEventListener("click", closeMeetingForm);
  ["date", "time", "timezone"].forEach(function (k) {
    $("#meetingForm").elements[k].addEventListener("input", showMeetingPreview);
    $("#meetingForm").elements[k].addEventListener("change", showMeetingPreview);
  });

  /* ---------------- repeating: every Tuesday until the credit runs out ---------------- */

  var DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  function chosenDays() {
    return Array.prototype.filter.call($("#dayChips").children, function (c) {
      return c.getAttribute("aria-pressed") === "true";
    }).map(function (c) { return Number(c.getAttribute("data-day")); });
  }

  function setDays(days) {
    Array.prototype.forEach.call($("#dayChips").children, function (c) {
      var on = days.indexOf(Number(c.getAttribute("data-day"))) !== -1;
      c.setAttribute("aria-pressed", on ? "true" : "false");
      c.classList.toggle("chip--on", on);
    });
  }

  /* null when the meeting does not repeat, else the rule as the API takes it */
  function repeatRule() {
    var f = $("#meetingForm").elements;
    if (state.editingMeetingId || f.repeat.value === "none") return null;
    var rule = { interval: Number(f.repeat.value), days: chosenDays(), until: f.until.value };
    if (rule.until === "count") rule.count = Number(f.count.value);
    if (rule.until === "date") rule.until_date = f.until_date.value;
    return rule;
  }

  function meetingBody() {
    var f = $("#meetingForm").elements;
    return {
      client_id: state.clientId,
      local: f.date.value + "T" + f.time.value,
      timezone: f.timezone.value,
      duration_min: Number(f.duration_min.value),
      link: f.link.value.trim(),
      topic: f.topic.value.trim(),
    };
  }

  function syncRepeatFields() {
    var f = $("#meetingForm").elements;
    var repeating = !state.editingMeetingId && f.repeat.value !== "none";
    $("#untilField").hidden = !repeating;
    $("#daysField").hidden = !repeating;
    $("#countField").hidden = !(repeating && f.until.value === "count");
    $("#untilDateField").hidden = !(repeating && f.until.value === "date");
    // until someone picks days by hand, the day follows the date
    if (repeating && !state.daysTouched && f.date.value) {
      setDays([new Date(f.date.value + "T00:00:00Z").getUTCDay()]);
    }
    if (!repeating) {
      state.seriesPlan = null;
      $("#seriesPreview").hidden = true;
      $("#btnMeetingSubmit").textContent = state.editingMeetingId ? "Update meeting" : "Schedule meeting";
      $("#btnMeetingSubmit").disabled = false;
      return;
    }
    planSeries();
  }

  function renderSeries(plan, error) {
    var box = $("#seriesPreview");
    var btn = $("#btnMeetingSubmit");
    box.hidden = false;
    if (error) {
      box.className = "span2 series series--error";
      box.textContent = error;
      btn.textContent = "Schedule meetings";
      btn.disabled = true;
      return;
    }
    var tz = myZone();
    var rule = repeatRule() || { days: [], interval: 1 };
    var days = rule.days.slice().sort(function (a, b) { return ((a + 6) % 7) - ((b + 6) % 7); })
      .map(function (d) { return DAY_NAMES[d]; });
    var every = (rule.interval === 2 ? "every 2 weeks on " : "every ") + days.join(" and ");
    var list = plan.occurrences;
    var first = new Date(list[0].starts_at), last = new Date(list[list.length - 1].starts_at);
    var span = list.length > 1
      ? Meet.fmt(first, tz, { day: "numeric", month: "short" }) + " to " + Meet.fmt(last, tz, { day: "numeric", month: "short", year: "numeric" })
      : Meet.fmt(first, tz, { day: "numeric", month: "short", year: "numeric" });
    box.className = "span2 series";
    box.innerHTML =
      '<div class="series__head"><b>' + list.length + " session" + (list.length === 1 ? "" : "s") + "</b>" +
      '<span class="muted">' + esc(every + " · " + span) + "</span></div>" +
      '<ol class="series__list">' + list.map(function (o) {
        var d = new Date(o.starts_at);
        return "<li>" + esc(Meet.fmt(d, tz, { weekday: "short", day: "numeric", month: "short" })) +
          '<span class="muted">' + esc(Meet.fmtTime(d, tz)) + "</span>" +
          (o.covered ? "" : '<span class="badge badge--warn">no credit</span>') + "</li>";
      }).join("") + "</ol>" +
      '<p class="series__note">' + esc(plan.series.note || "") + "</p>";
    btn.textContent = "Schedule " + list.length + " meeting" + (list.length === 1 ? "" : "s");
    btn.disabled = false;
  }

  /* Asks the server what the rule would make — it owns the credit arithmetic,
     so the list shown is exactly the list that will be saved. */
  var seriesTimer;
  function planSeries() {
    var rule = repeatRule();
    var f = $("#meetingForm").elements;
    clearTimeout(seriesTimer);
    if (!rule) return;
    var seq = ++state.seriesSeq;
    if (!f.date.value || !f.time.value) {
      state.seriesPlan = null;
      $("#seriesPreview").hidden = true;
      return;
    }
    if (!rule.days.length) return renderSeries(null, "Pick at least one day of the week.");
    if (rule.until === "date" && !rule.until_date) return renderSeries(null, "Pick the last date of the series.");
    seriesTimer = setTimeout(function () {
      var body = meetingBody();
      body.repeat = rule;
      body.preview = true;
      api("/api/sessions?resource=meetings", { method: "POST", body: body })
        .then(function (plan) {
          if (seq !== state.seriesSeq) return; // an older answer, overtaken
          state.seriesPlan = plan.error ? null : plan;
          renderSeries(plan, plan.error);
        })
        .catch(function (e) {
          if (seq !== state.seriesSeq) return;
          state.seriesPlan = null;
          renderSeries(null, e.message);
        });
    }, 250);
  }

  $("#dayChips").addEventListener("click", function (ev) {
    var chip = ev.target.closest(".chip");
    if (!chip) return;
    var on = chip.getAttribute("aria-pressed") !== "true";
    chip.setAttribute("aria-pressed", on ? "true" : "false");
    chip.classList.toggle("chip--on", on);
    state.daysTouched = true;
    planSeries();
  });

  ["repeat", "until", "date"].forEach(function (k) {
    $("#meetingForm").elements[k].addEventListener("change", syncRepeatFields);
  });
  ["time", "timezone", "duration_min", "count", "until_date"].forEach(function (k) {
    $("#meetingForm").elements[k].addEventListener("input", planSeries);
    $("#meetingForm").elements[k].addEventListener("change", planSeries);
  });

  /* A question with more than two answers, which confirm() cannot ask.
     Resolves to the chosen button's value, or null if it was dismissed. */
  function ask(title, text, buttons) {
    return new Promise(function (resolve) {
      var dlg = $("#askDialog");
      $("#askTitle").textContent = title;
      $("#askText").textContent = text;
      $("#askActions").innerHTML = buttons.map(function (b) {
        return '<button type="button" class="btn ' + (b.cls || "btn--ghost") + '" value="' + esc(b.value) + '">' + esc(b.label) + "</button>";
      }).join("");
      var done = function (v) {
        dlg.removeEventListener("click", onClick);
        dlg.removeEventListener("close", onClose);
        if (dlg.open) dlg.close();
        resolve(v);
      };
      var onClick = function (ev) {
        var b = ev.target.closest("button[value]");
        if (b) done(b.value === "cancel" ? null : b.value);
        else if (ev.target === dlg) done(null); // a click on the backdrop
      };
      var onClose = function () { done(null); };
      dlg.addEventListener("click", onClick);
      dlg.addEventListener("close", onClose);
      dlg.showModal();
    });
  }

  $("#meetingForm").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var form = this;
    var btn = $("#btnMeetingSubmit");
    var editingId = state.editingMeetingId;
    var body = meetingBody();
    var rule = repeatRule();
    if (rule) body.repeat = rule;
    busy(btn, true);
    (editingId
      ? api("/api/sessions?resource=meetings&id=" + editingId, { method: "PATCH", body: body })
      : api("/api/sessions?resource=meetings", { method: "POST", body: body }))
      .then(function (r) {
        var made = r.meetings || [r.meeting];
        var ids = made.map(function (m) { return m.id; });
        state.detail.meetings = state.detail.meetings
          .filter(function (m) { return ids.indexOf(m.id) === -1; })
          .concat(made);
        state.detail.client.timezone = made[0].timezone;
        toast(editingId ? "Meeting updated ✓"
          : made.length > 1 ? made.length + " meetings scheduled ✓" : "Meeting scheduled ✓");
        closeMeetingForm();
      })
      .catch(function (e) { toast(e.message, true); })
      .finally(function () { busy(btn, false); });
  });

  $("#meetingsCard").addEventListener("click", function (ev) {
    var btn = ev.target.closest("[data-act]");
    if (!btn) return;
    var m = meetingById(Number(btn.closest(".meet").getAttribute("data-id")));
    if (!m) return;
    var act = btn.getAttribute("data-act");
    if (act === "edit") return openMeetingForm(m);
    if (act === "reschedule") return openMeetingForm(m, true);
    if (act === "copy") {
      return navigator.clipboard.writeText(m.link).then(
        function () { toast("Meeting link copied ✓"); },
        function () { prompt("Copy the meeting link:", m.link); }
      );
    }
    if (act === "record") {
      // a meeting that happened becomes a session record, which is what uses hours
      var form = $("#addSessionForm");
      stopEditSession();
      form.elements.session_date.value = Meet.localFields(new Date(m.starts_at), myZone()).date;
      form.elements.hours.value = Math.max(0.25, Math.round(m.duration_min / 15) / 4);
      form.elements.topic.value = m.topic || "";
      Go.wizard.review(form);
      form.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (act === "delete") {
      cancelMeeting(m, state.detail.meetings, function (gone) {
        state.detail.meetings = state.detail.meetings.filter(function (x) { return gone.indexOf(x.id) === -1; });
        state.agenda = state.agenda.filter(function (x) { return gone.indexOf(x.id) === -1; });
        if (gone.indexOf(state.editingMeetingId) !== -1) closeMeetingForm();
        else renderMeetings();
      });
    }
  });

  // "in 2h 15m" goes stale; so does "today" at midnight
  setInterval(function () {
    if (document.hidden) return;
    if (!$("#view-client").hidden && $("#meetingForm").hidden) renderMeetings();
    if (!$("#view-list").hidden) { renderAgenda(); }
  }, 60000);

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

  $("#btnPhoto").addEventListener("click", function () { $("#photoInput").click(); });

  $("#photoInput").addEventListener("change", function () {
    var input = this;
    var file = input.files[0];
    if (!file) return;
    var btn = $("#btnPhoto");
    // the picker leaves the hidden input focused, and a phone then scrolls to it
    input.blur();
    var hold = keepPlace();
    Go.play("coin"); // the picture was chosen: the same sound the drop box makes
    busy(btn, true);
    squarePhoto(file, 320, 0.82)
      .then(function (photo) {
        return api("/api/clients?id=" + state.clientId, { method: "PATCH", body: { photo: photo } });
      })
      .then(function () {
        toast("Photo saved ✓");
        // the new picture arrives with a little party around it
        var r = btn.getBoundingClientRect();
        Go.burst(r.left + r.width / 2, r.top + r.height / 2, 18, ["📸", "✨"]);
        return openClient(state.clientId);
      })
      .catch(function (e) { toast(e.message, true); })
      .finally(function () { busy(btn, false); input.value = ""; if (hold) hold(); });
  });

  $("#btnRemovePhoto").addEventListener("click", function () {
    if (!confirm("Remove this client's photo?")) return;
    var btn = this;
    busy(btn, true);
    api("/api/clients?id=" + state.clientId, { method: "PATCH", body: { photo: "" } })
      .then(function () { toast("Photo removed"); return openClient(state.clientId); })
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
      Go.wizard.review(form);
      Go.play("open");
    }
  });
  $("#btnCancelEditClient").addEventListener("click", function () { $("#editClientForm").hidden = true; });

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
    if (!confirm('Delete "' + c.name + '" and ALL their purchases, sessions and scheduled meetings? This cannot be undone.')) return;
    api("/api/clients?id=" + state.clientId, { method: "DELETE" })
      .then(function () { toast("Client deleted"); return nav({ name: "clients" }, true, true); })
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
    var label = btn.textContent;
    if (file) {
      var problem = Files.check(file);
      if (problem) { toast(problem, true); return; }
      // sent ahead in pieces, so slides bigger than one request still go
      ready = Files.upload(file, function (p) { btn.textContent = "Uploading " + p + "%…"; }).then(function (id) {
        b.file_upload_id = id;
        b.file_name = file.name;
        btn.textContent = "Saving…";
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
      .finally(function () { busy(btn, false); if (/Uploading|Saving/.test(btn.textContent)) btn.textContent = label; });
  });

  /* ---------------- balance chart (shared renderer in chart.js) ---------------- */

  function renderChart(timeline) {
    hidePointDetail();
    window.renderBalanceChart($("#chart"), $("#chartTip"), timeline, {
      from: state.chartFrom,
      to: state.chartTo,
      onPointClick: showPointDetail,
    });
  }

  var chartRangeCtl = window.chartRangeControls($("#chartFilter"), function (from, to) {
    state.chartFrom = from;
    state.chartTo = to;
    if (state.detail) renderChart(state.detail.timeline);
  });

  function hidePointDetail() {
    $("#chartDetail").hidden = true;
  }

  function detailRow(label, valueHtml) {
    return '<div class="muted">' + label + "</div><div>" + valueHtml + "</div>";
  }

  function showPointDetail(p) {
    var rows = [
      detailRow("Date", fmtDate(p.date) + (p.future ? ' <span class="badge badge--warn">upcoming</span>' : "")),
      detailRow("Event", esc(p.label)),
      detailRow("Change", (p.delta > 0 ? "+" : "−") + fmtH(Math.abs(p.delta))),
      detailRow("Balance after", "<strong>" + fmtH(p.balance) + "</strong>"),
    ];
    if (p.uncovered > 0) rows.push(detailRow("Not covered", '<span style="color:#ff9aa7">' + fmtH(p.uncovered) + "</span>"));

    if (p.kind === "purchase" || p.kind === "expiry") {
      var pkg = (state.detail.packages || []).filter(function (x) { return x.id === p.packageId; })[0];
      if (pkg) {
        if (p.kind === "purchase") {
          var paid = pkg.amount_paid != null ? Number(pkg.amount_paid).toLocaleString() + " " + esc(pkg.currency || "") : "—";
          if (pkg.has_proof) paid += ' <a href="/api/pdf?proof=' + pkg.id + '" target="_blank" rel="noopener">📷 proof</a>';
          rows.push(detailRow("Amount paid", paid));
        }
        rows.push(detailRow("Package", fmtH(pkg.hours) + " bought " + fmtDate(pkg.purchased_at) + ", expires " + fmtDate(pkg.expires_at)));
        if (pkg.note) rows.push(detailRow("Note", esc(pkg.note)));
      }
    }
    if (p.kind === "session") {
      var s = (state.detail.sessions || []).filter(function (x) { return x.id === p.sessionId; })[0];
      if (s) {
        if (s.topic) rows.push(detailRow("Topic", esc(s.topic)));
        if (s.has_pdf) rows.push(detailRow("Minutes", '<a href="/api/pdf?id=' + s.id + '" target="_blank" rel="noopener">📄 PDF</a>'));
      }
    }

    var box = $("#chartDetail");
    box.innerHTML = '<button type="button" class="chart-detail__close" aria-label="Close">✕</button>' +
      '<div class="chart-detail__grid">' + rows.join("") + "</div>";
    box.querySelector(".chart-detail__close").addEventListener("click", hidePointDetail);
    box.hidden = false;
  }

  var resizeTimer;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      if (state.detail && !$("#view-client").hidden) renderChart(state.detail.timeline);
    }, 150);
  });

  /* ---------------- the calendar feed: subscribe once, stays in step ---------------- */

  function calendarUrl() {
    var t = state.settings && state.settings.calendar_token;
    return t ? location.origin + "/cal/" + t + ".ics" : "";
  }

  function renderCalendar() {
    var url = calendarUrl();
    $("#calOff").hidden = !!url;
    $("#calOn").hidden = !url;
    if (!url) return;
    $("#calUrl").value = url;
    $("#calGoogle").href = "https://calendar.google.com/calendar/r?cid=" + encodeURIComponent(url.replace(/^https?:/, "webcal:"));
    $("#calApple").href = url.replace(/^https?:/, "webcal:");
  }

  function calendarSetting(what) {
    return api("/api/sessions?resource=settings", { method: "PUT", body: { calendar: what } })
      .then(function (r) { useSettings(r.settings); renderCalendar(); });
  }

  $("#btnCalendar").addEventListener("click", function () {
    renderCalendar();
    $("#calDialog").showModal();
  });
  $("#calClose").addEventListener("click", function () { $("#calDialog").close(); });
  $("#calDialog").addEventListener("click", function (ev) { if (ev.target === this) this.close(); });
  $("#calMake").addEventListener("click", function () {
    var btn = this;
    busy(btn, true);
    calendarSetting("create").then(function () { Go.play("coin"); }).catch(function (e) { toast(e.message, true); }).finally(function () { busy(btn, false); });
  });
  $("#calRotate").addEventListener("click", function () {
    if (!confirm("Make a new calendar link? The old one stops working, and calendars subscribed to it stop updating.")) return;
    calendarSetting("rotate").then(function () { toast("New calendar link ✓ Subscribe again with it."); }).catch(function (e) { toast(e.message, true); });
  });
  $("#calCopy").addEventListener("click", function () {
    var url = $("#calUrl").value;
    navigator.clipboard.writeText(url).then(function () { toast("Calendar link copied ✓"); }, function () { $("#calUrl").select(); });
  });

  /* ---------------- go ---------------- */
  boot();
})();
