/* Content dashboard: passkey gate, per-element editing, media library.

   The list of editable things is not maintained here. Each page is loaded
   into a hidden iframe with #cms-index, where cms.js walks the rendered DOM
   and posts back everything it found. That keeps this dashboard honest —
   it can only ever show what the page actually renders. */
(function () {
  "use strict";

  var PAGES = [
    { id: "home", label: "Home", url: "/" },
    { id: "full", label: "Full story", url: "/full" },
    { id: "educator", label: "Educator", url: "/educator" },
    { id: "product", label: "Product", url: "/product" },
  ];

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var current = PAGES[0];
  var items = [];      // discovered, for the current page
  var saved = {};      // key -> {kind, value} straight from the database
  var edits = {};      // key -> value, unsaved
  var media = [];
  var pickerTarget = null;

  /* ---------- plumbing ---------- */

  function api(path, opts) {
    opts = opts || {};
    return fetch(path, {
      method: opts.method || "GET",
      headers: opts.body ? { "Content-Type": "application/json" } : undefined,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      credentials: "same-origin",
    }).then(function (r) {
      if (r.status === 401) { show("view-login"); throw new Error("Not signed in"); }
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok) throw new Error(d.error || ("Request failed (" + r.status + ")"));
        return d;
      });
    });
  }

  function show(id) {
    ["view-loading", "view-login", "view-locked", "view-app"].forEach(function (v) {
      var el = document.getElementById(v);
      if (el) el.hidden = v !== id;
    });
  }

  var toastTimer;
  function toast(msg, bad) {
    var t = $("#toast");
    t.textContent = msg;
    t.hidden = false;
    t.style.borderColor = bad ? "var(--c-danger)" : "";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 3200);
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /* ---------- auth ---------- */

  function boot() {
    api("/api/auth?action=me").then(function (me) {
      if (me.authed) return start();
      show(me.hasCredentials ? "view-login" : "view-locked");
    }).catch(function () { show("view-login"); });
  }

  $("#btnLogin").addEventListener("click", function () {
    var err = $("#loginError");
    err.hidden = true;
    api("/api/auth?action=login-options", { method: "POST", body: {} })
      .then(function (options) { return SimpleWebAuthnBrowser.startAuthentication({ optionsJSON: options }); })
      .then(function (response) { return api("/api/auth?action=login-verify", { method: "POST", body: { response: response } }); })
      .then(start)
      .catch(function (e) {
        if (e.name === "NotAllowedError") return;
        err.textContent = e.message || "Sign-in failed";
        err.hidden = false;
      });
  });

  $("#btnLogout").addEventListener("click", function () {
    api("/api/auth?action=logout", { method: "POST", body: {} }).then(function () { show("view-login"); });
  });

  function start() {
    show("view-app");
    renderPagePicker();
    Promise.all([loadSaved(), loadMedia()]).then(function () { loadPage(current); });
  }

  /* ---------- content ---------- */

  function loadSaved() {
    return api("/api/content?index=1").then(function (d) {
      saved = {};
      (d.items || []).forEach(function (r) { saved[r.key] = { kind: r.kind, value: r.value }; });
    });
  }

  function renderPagePicker() {
    $("#pagePicker").innerHTML = PAGES.map(function (p) {
      return '<button class="dash-page' + (p.id === current.id ? " is-on" : "") + '" data-page="' + p.id + '">' + esc(p.label) + "</button>";
    }).join("");
  }

  function loadPage(page) {
    current = page;
    renderPagePicker();
    items = [];
    $("#groups").innerHTML = "";
    $("#loadingPage").hidden = false;
    // cms.js posts its index back on every settle, so the last message wins.
    $("#probe").src = page.url + (page.url.indexOf("?") > -1 ? "&" : "?") + "cmsindex=1#cms-index";
  }

  window.addEventListener("message", function (ev) {
    if (ev.origin !== location.origin) return;
    var d = ev.data;
    if (!d || d.type !== "cms-index") return;
    items = d.items || [];
    $("#loadingPage").hidden = true;
    render();
  });

  function valueOf(it) {
    if (it.key in edits) return edits[it.key];
    if (saved[it.key]) return saved[it.key].value;
    return it.original;
  }

  function isDirty(it) { return it.key in edits && edits[it.key] !== (saved[it.key] ? saved[it.key].value : it.original); }
  function isSet(it) { return !!saved[it.key]; }

  function render() {
    var q = $("#filter").value.trim().toLowerCase();
    var shown = items.filter(function (it) {
      if (!q) return true;
      return (it.label + " " + it.original + " " + it.section).toLowerCase().indexOf(q) > -1;
    });

    $("#itemCount").textContent = shown.length + (q ? " of " + items.length : "") + " items";

    var order = [];
    var bySection = {};
    shown.forEach(function (it) {
      if (!bySection[it.section]) { bySection[it.section] = []; order.push(it.section); }
      bySection[it.section].push(it);
    });

    var openFirst = !!q;
    $("#groups").innerHTML = order.map(function (sec, i) {
      var list = bySection[sec];
      var nSet = list.filter(isSet).length;
      return '<section class="grp' + (openFirst || i === 0 ? " is-open" : "") + '" data-sec="' + esc(sec) + '">' +
        '<button class="grp__head"><span class="grp__caret">▶</span>' + esc(sectionName(sec)) +
          (nSet ? ' <span class="fld__kind" data-k="set">' + nSet + " edited</span>" : "") +
          '<span class="grp__n">' + list.length + "</span></button>" +
        '<div class="grp__body">' + list.map(fieldHTML).join("") + "</div>" +
      "</section>";
    }).join("") || '<p class="muted">Nothing matches that filter.</p>';

    bindFields();
    updateSaveButton();
  }

  var SECTION_NAMES = {
    "dc-root": "Header & hero", "page": "Page", "content": "Content hub",
    "about": "My story", "help": "How I can help", "platform": "Platform",
    "track-rail": "The track method", "testimonials": "Testimonials",
    "resources": "Free resources", "newsletter": "Newsletter", "contact": "Contact",
    "nav": "Navigation", "hero": "Hero", "educator": "Educator chapter",
    "eduTimeline": "Educator entries", "builder": "Builder chapter",
    "buildTimeline": "Builder entries", "work": "Products chapter",
    "timeline": "Product entries", "skills": "Skills", "skillsGrid": "Skill groups",
    "contactForm": "Contact form", "lightbox": "Lightbox", "cookieBanner": "Cookie banner",
    "langToggle": "Language toggle",
  };
  function sectionName(id) { return SECTION_NAMES[id] || id; }

  function fieldHTML(it) {
    var v = valueOf(it);
    var cls = "fld" + (isDirty(it) ? " is-dirty" : "") + (isSet(it) ? " is-set" : "");
    var head = '<div class="fld__top">' +
      '<span class="fld__kind" data-k="' + it.kind + '">' + it.kind + "</span>" +
      (isSet(it) ? '<button class="fld__revert" data-revert="' + esc(it.key) + '">revert to original</button>' : "") +
      '<span class="fld__where">' + esc(it.label.slice(0, 46)) + "</span></div>";

    if (it.kind === "src") {
      var url = /^media:\d+$/.test(v) ? "/api/media?id=" + v.slice(6) : v;
      var isVid = /\.(mp4|webm)(\?|$)/i.test(url) || /video/.test(url);
      var thumb = !url
        ? '<div class="fld__thumb fld__thumb--empty">empty</div>'
        : isVid
          ? '<div class="fld__thumb fld__thumb--empty">video</div>'
          : '<img class="fld__thumb" src="' + esc(url) + '" alt="" loading="lazy" onerror="this.style.opacity=.25" />';
      return '<div class="' + cls + '" data-key="' + esc(it.key) + '">' + head +
        '<div class="fld__media">' + thumb +
        '<div class="fld__mediaval">' +
          '<button class="btn btn--sm" data-pick="' + esc(it.key) + '">Choose or upload…</button>' +
          '<span class="fld__path">' + esc(v || "(empty)") + "</span>" +
        "</div></div></div>";
    }

    if (it.kind === "href") {
      return '<div class="' + cls + '" data-key="' + esc(it.key) + '">' + head +
        '<input type="url" data-in="' + esc(it.key) + '" value="' + esc(v) + '" />' +
        (/^(https?:|mailto:|tel:)/.test(v) ? "" : '<span class="fld__path">relative link</span>') +
        "</div>";
    }

    var rows = Math.min(10, Math.max(2, Math.ceil(v.length / 78)));
    return '<div class="' + cls + '" data-key="' + esc(it.key) + '">' + head +
      '<textarea data-in="' + esc(it.key) + '" data-k="' + it.kind + '" rows="' + rows + '">' + esc(v) + "</textarea>" +
      "</div>";
  }

  function bindFields() {
    Array.prototype.forEach.call(document.querySelectorAll("[data-in]"), function (el) {
      el.addEventListener("input", function () {
        var key = el.getAttribute("data-in");
        edits[key] = el.value;
        el.closest(".fld").classList.add("is-dirty");
        updateSaveButton();
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-pick]"), function (b) {
      b.addEventListener("click", function () { openPicker(b.getAttribute("data-pick")); });
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-revert]"), function (b) {
      b.addEventListener("click", function () {
        var key = b.getAttribute("data-revert");
        edits[key] = "";
        save();
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll(".grp__head"), function (h) {
      h.addEventListener("click", function () { h.parentElement.classList.toggle("is-open"); });
    });
  }

  function dirtyKeys() {
    return Object.keys(edits).filter(function (k) {
      var it = byKey(k);
      if (!it) return false;
      var base = saved[k] ? saved[k].value : it.original;
      return edits[k] !== base;
    });
  }

  function byKey(k) {
    for (var i = 0; i < items.length; i++) if (items[i].key === k) return items[i];
    return null;
  }

  function updateSaveButton() {
    var n = dirtyKeys().length;
    var b = $("#btnSave");
    b.disabled = n === 0;
    b.textContent = n ? "Save " + n + " change" + (n === 1 ? "" : "s") : "Save changes";
  }

  function save() {
    var keys = dirtyKeys();
    if (!keys.length) return;
    var payload = keys.map(function (k) {
      var it = byKey(k);
      // An empty value tells the API to drop the row, so the page falls back
      // to what it ships with.
      var value = edits[k];
      if (value.trim() === "" || value === it.original) value = "";
      return { key: k, kind: it.kind, value: value, page: it.page, section: it.section, label: it.label };
    });
    $("#btnSave").disabled = true;
    api("/api/content", { method: "PUT", body: { items: payload } })
      .then(function () {
        edits = {};
        return loadSaved();
      })
      .then(function () {
        toast("Saved — the live site is updated");
        loadPage(current);
      })
      .catch(function (e) { toast(e.message, true); updateSaveButton(); });
  }

  $("#btnSave").addEventListener("click", save);
  $("#filter").addEventListener("input", render);
  $("#pagePicker").addEventListener("click", function (e) {
    var b = e.target.closest("[data-page]");
    if (!b) return;
    if (dirtyKeys().length && !confirm("You have unsaved changes. Leave this page?")) return;
    edits = {};
    var p = PAGES.filter(function (x) { return x.id === b.getAttribute("data-page"); })[0];
    if (p) loadPage(p);
  });

  /* ---------- tabs ---------- */

  Array.prototype.forEach.call(document.querySelectorAll(".dash-tab"), function (t) {
    t.addEventListener("click", function () {
      Array.prototype.forEach.call(document.querySelectorAll(".dash-tab"), function (x) { x.classList.toggle("is-on", x === t); });
      $("#tab-content").hidden = t.dataset.tab !== "content";
      $("#tab-media").hidden = t.dataset.tab !== "media";
      if (t.dataset.tab === "media") renderMedia();
    });
  });

  /* ---------- media ---------- */

  function loadMedia() {
    return api("/api/media").then(function (d) { media = d.media || []; });
  }

  function mediaCardHTML(m, pick) {
    var url = "/api/media?id=" + m.id;
    var isImg = /^image\//.test(m.mime);
    return '<div class="media-card" data-id="' + m.id + '">' +
      (isImg
        ? '<img class="media-card__img" src="' + url + '" alt="" loading="lazy" />'
        : '<div class="media-card__vid">▶</div>') +
      '<div class="media-card__meta"><div class="media-card__name" title="' + esc(m.name) + '">' + esc(m.name) + "</div>" +
        (m.bytes / 1024).toFixed(0) + " KB</div>" +
      (pick ? "" :
        '<div class="media-card__row">' +
          '<button class="btn btn--sm" data-copy="' + m.id + '">Copy ref</button>' +
          '<button class="btn btn--sm btn--danger" data-del="' + m.id + '">Delete</button>' +
        "</div>") +
      "</div>";
  }

  function renderMedia() {
    var g = $("#mediaGrid");
    g.innerHTML = media.length
      ? media.map(function (m) { return mediaCardHTML(m, false); }).join("")
      : '<p class="muted">Nothing uploaded yet.</p>';
    Array.prototype.forEach.call(g.querySelectorAll("[data-copy]"), function (b) {
      b.addEventListener("click", function () {
        var ref = "media:" + b.getAttribute("data-copy");
        navigator.clipboard.writeText(ref).then(function () { toast("Copied " + ref); });
      });
    });
    Array.prototype.forEach.call(g.querySelectorAll("[data-del]"), function (b) {
      b.addEventListener("click", function () {
        if (!confirm("Delete this file? Anything still pointing at it will break.")) return;
        api("/api/media?id=" + b.getAttribute("data-del"), { method: "DELETE" })
          .then(loadMedia).then(renderMedia).then(function () { toast("Deleted"); })
          .catch(function (e) { toast(e.message, true); });
      });
    });
  }

  function readAsDataUrl(file) {
    return new Promise(function (res, rej) {
      var fr = new FileReader();
      fr.onload = function () { res(fr.result); };
      fr.onerror = function () { rej(new Error("Could not read " + file.name)); };
      fr.readAsDataURL(file);
    });
  }

  function upload(file, errEl) {
    errEl.hidden = true;
    return readAsDataUrl(file)
      .then(function (dataUrl) { return api("/api/media", { method: "POST", body: { name: file.name, dataUrl: dataUrl } }); })
      .then(function (d) { return loadMedia().then(function () { return d.media; }); })
      .catch(function (e) { errEl.textContent = e.message; errEl.hidden = false; throw e; });
  }

  $("#mediaUpload").addEventListener("change", function (e) {
    var files = Array.prototype.slice.call(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;
    files.reduce(function (chain, f) {
      return chain.then(function () { return upload(f, $("#mediaError")); });
    }, Promise.resolve()).then(function () {
      renderMedia();
      toast("Uploaded");
    }).catch(function () { renderMedia(); });
  });

  /* ---------- picker ---------- */

  function openPicker(key) {
    pickerTarget = key;
    var it = byKey(key);
    $("#pickerTitle").textContent = "Choose a file for: " + (it ? it.label.slice(0, 40) : "");
    $("#pickerUrl").value = it ? valueOf(it) : "";
    $("#pickerError").hidden = true;
    $("#pickerGrid").innerHTML = media.length
      ? media.map(function (m) { return mediaCardHTML(m, true); }).join("")
      : '<p class="muted">Nothing uploaded yet — use the button above.</p>';
    Array.prototype.forEach.call($("#pickerGrid").querySelectorAll(".media-card"), function (c) {
      c.addEventListener("click", function () { setPicked("media:" + c.getAttribute("data-id")); });
    });
    $("#picker").hidden = false;
  }

  function setPicked(value) {
    if (!pickerTarget) return;
    edits[pickerTarget] = value;
    $("#picker").hidden = true;
    pickerTarget = null;
    render();
  }

  $("#pickerClose").addEventListener("click", function () { $("#picker").hidden = true; pickerTarget = null; });
  $("#picker").addEventListener("click", function (e) { if (e.target === $("#picker")) { $("#picker").hidden = true; pickerTarget = null; } });
  $("#pickerUseUrl").addEventListener("click", function () { setPicked($("#pickerUrl").value.trim()); });
  $("#pickerUpload").addEventListener("change", function (e) {
    var f = (e.target.files || [])[0];
    e.target.value = "";
    if (!f) return;
    upload(f, $("#pickerError")).then(function (m) { setPicked("media:" + m.id); toast("Uploaded"); }).catch(function () {});
  });

  window.addEventListener("beforeunload", function (e) {
    if (dirtyKeys().length) { e.preventDefault(); e.returnValue = ""; }
  });

  boot();
})();
