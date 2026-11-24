/* Content dashboard: passkey gate, per-element editing, media library.

   The list of editable things is not maintained here. Each page is loaded
   into a hidden iframe with #cms-index, where the site's cms.js walks the
   rendered DOM and posts back everything it found. That keeps this dashboard honest —
   it can only ever show what the page actually renders.

   Everything on screen is written for a person, not a developer: no keys,
   no tags, no markup. A sentence with styling in it arrives as plain words
   with **asterisks** around the highlighted part, and a picture is a
   thumbnail with a button. */
(function () {
  "use strict";

  if (I18N.ar) document.title = "المحتوى — Ahmed Tarek";

  var PAGES = [
    { id: "home", label: T("Home page", "الصفحة الرئيسية"), url: "/" },
    { id: "full", label: T("Full story", "القصة الكاملة"), url: "/full" },
    { id: "educator", label: T("Educator", "المعلّم"), url: "/educator" },
    { id: "product", label: T("Product", "المنتج"), url: "/product" },
  ];

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var current = PAGES[0];
  var items = [];      // discovered, for the current page
  var saved = {};      // key -> {kind, value} straight from the database
  var edits = {};      // key -> value, unsaved
  var media = [];
  var pickerTarget = null;
  var showAll = false;

  /* ---------- plumbing ---------- */

  function api(path, opts) {
    opts = opts || {};
    return fetch(path, {
      method: opts.method || "GET",
      headers: opts.body ? { "Content-Type": "application/json" } : undefined,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      credentials: "same-origin",
    }).then(function (r) {
      if (r.status === 401) { show("view-login"); throw new Error(T("Not signed in", "مش مسجّل دخول")); }
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok) throw new Error(d.error || T("Request failed (" + r.status + ")", "الطلب فشل (" + r.status + ")"));
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
    toastTimer = setTimeout(function () { t.hidden = true; }, 3600);
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
      .then(function (r) { return start(r); })
      .catch(function (e) {
        if (e.name === "NotAllowedError") return;
        err.textContent = e.message || T("Sign-in failed", "الدخول فشل");
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
    return api("/api/cms?index=1").then(function (d) {
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

  /* Plain-language names for the parts of each page. */
  var SECTION_NAMES = {
    "dc-root": T("Header, hero and menu", "الهيدر والواجهة والقايمة"), "page": T("Page", "الصفحة"), "content": T("Videos and content hub", "الفيديوهات ومركز المحتوى"),
    "about": T("Who I am", "أنا مين"), "help": T("How I can help", "أقدر أساعد إزاي"), "platform": T("Platform", "المنصة"),
    "track-rail": T("The track method", "طريقة التراك"), "testimonials": T("What people say", "الناس بتقول إيه"),
    "resources": T("Free downloads", "تحميلات مجانية"), "newsletter": T("Newsletter sign-up", "الاشتراك في النشرة"),
    "contact": T("Contact and footer", "التواصل والفوتر"), "nav": T("Top menu", "القايمة اللي فوق"),
    "hero": T("Hero — name and buttons", "الواجهة — الاسم والزراير"), "educator": T("Educator chapter", "فصل المعلّم"),
    "eduTimeline": T("Teaching entries", "محطات التدريس"), "builder": T("Builder chapter", "فصل البنّاء"),
    "buildTimeline": T("Engineering entries", "محطات الهندسة"), "work": T("Products chapter", "فصل المنتجات"),
    "timeline": T("Product entries", "محطات المنتجات"), "skills": T("Skills", "المهارات"), "skillsGrid": T("Skill groups", "مجموعات المهارات"),
    "contactForm": T("Contact form", "فورم التواصل"), "lightbox": T("Photo viewer", "عارض الصور"),
    "site-settings": T("Your links", "لينكاتك"), "cookieBanner": T("Cookie notice", "إشعار الكوكيز"), "langToggle": T("Language button", "زرار اللغة"),
  };
  function sectionName(id) { return SECTION_NAMES[id] || id; }

  /* Short strings are almost always a button or a one-word label. Real
     sentences and pictures are what someone actually opens this to change,
     so the rest starts out folded away. */
  function isMinor(it) {
    if (it.pinned || it.video) return false;
    if (it.kind === "src") return false;
    if (it.kind === "href") return true;
    return String(it.original || "").trim().length < 25;
  }

  function render() {
    var q = $("#filter").value.trim().toLowerCase();
    var pool = items.filter(function (it) {
      if (q) return (it.label + " " + it.original + " " + sectionName(it.section)).toLowerCase().indexOf(q) > -1;
      return showAll || !isMinor(it) || isSet(it);
    });

    var hidden = items.length - pool.length;
    $("#itemCount").textContent = T(pool.length + " of " + items.length, pool.length + " من " + items.length);
    $("#btnShowAll").textContent = showAll ? T("Show the main things", "اعرض الأساسي بس") : T("Show everything", "اعرض كل حاجة");

    // Pictures first — they are the hardest thing to find otherwise, and the
    // empty slots are invisible on the page itself.
    var pinned = pool.filter(function (it) { return it.pinned; });
    var vids = pool.filter(function (it) { return !it.pinned && it.video; });
    var pics = pool.filter(function (it) { return !it.pinned && !it.video && it.kind === "src"; });
    var rest = pool.filter(function (it) { return !it.pinned && !it.video && it.kind !== "src"; });

    var order = [], bySection = {};
    rest.forEach(function (it) {
      if (!bySection[it.section]) { bySection[it.section] = []; order.push(it.section); }
      bySection[it.section].push(it);
    });

    var html = "";
    if (pinned.length) {
      html += groupHTML(T("Your links", "لينكاتك"), pinned, true,
        T("Set once here, and every button on the site that uses it follows.", "ظبّطه هنا مرة واحدة، وكل زرار في الموقع بيستخدمه هيمشي وراه."));
    }
    if (vids.length) {
      html += groupHTML(T("Videos", "الفيديوهات"), vids, true,
        T("Paste a YouTube link for each one. On the site, clicking any of them plays it in the big player \u2014 " +
        "the pictures and titles stay as they are.", "الصق لينك يوتيوب لكل واحد. في الموقع، الضغط على أي واحد بيشغّله في المشغّل الكبير \u2014 " +
        "والصور والعناوين بتفضل زي ما هي."));
    }
    if (pics.length) {
      html += groupHTML(T("Photos on this page", "صور الصفحة دي"), pics, true,
        T("Every picture here, including empty slots waiting for one.", "كل الصور اللي هنا، ومعاها الأماكن الفاضية اللي مستنية صورة."));
    }
    order.forEach(function (sec, i) {
      html += groupHTML(sectionName(sec), bySection[sec],
        (!pics.length && !vids.length && !pinned.length && i === 0) || !!q);
    });
    $("#groups").innerHTML = html || '<p class="muted">' + T("Nothing matches that.", "مفيش حاجة مطابقة.") + "</p>";

    var note = $("#hiddenNote");
    note.hidden = !(hidden > 0 && !q && !showAll);
    note.textContent = T(hidden + " buttons, links and short labels are folded away. " +
      "Use “Show everything” if you need one of them.",
      hidden + " من الزراير واللينكات والعناوين القصيرة متخبّيين. " +
      "استخدم «اعرض كل حاجة» لو محتاج واحد منهم.");

    bindFields();
    updateSaveButton();
  }

  function groupHTML(name, list, open, sub) {
    var nSet = list.filter(isSet).length;
    return '<section class="grp' + (open ? " is-open" : "") + '">' +
      '<button class="grp__head"><span class="grp__caret">▶</span>' + esc(name) +
        (nSet ? ' <span class="grp__edited">' + T(nSet + " changed", nSet + " اتغيّر") + "</span>" : "") +
        '<span class="grp__n">' + list.length + "</span></button>" +
      '<div class="grp__body">' +
        (sub ? '<p class="grp__sub">' + esc(sub) + "</p>" : "") +
        list.map(fieldHTML).join("") +
      "</div></section>";
  }

  function mediaUrl(v) {
    return /^media:\d+$/.test(v) ? "/api/cms?resource=media&id=" + v.slice(6) : v;
  }

  // Name a field by what it says, not by where it lives.
  function shortLabel(it) {
    var t = String(it.original || "").replace(/\*\*/g, "").trim();
    if (!t) return T("Empty photo slot", "مكان صورة فاضي");
    return t.length <= 44 ? t : t.slice(0, 44) + "…";
  }

  function fieldHTML(it) {
    var v = valueOf(it);
    var cls = "fld" + (isDirty(it) ? " is-dirty" : "") + (isSet(it) ? " is-set" : "");
    var undo = isSet(it) ? '<button class="fld__revert" data-revert="' + esc(it.key) + '">' + T("undo", "تراجع") + "</button>" : "";

    if (it.kind === "src") {
      var url = mediaUrl(v);
      var thumb = !url
        ? '<div class="fld__thumb fld__thumb--empty">' + T("No photo yet", "مفيش صورة لسه") + "</div>"
        : /\.(mp4|webm)(\?|$)/i.test(url)
          ? '<div class="fld__thumb fld__thumb--empty">' + T("Video", "فيديو") + "</div>"
          : '<img class="fld__thumb" src="' + esc(url) + '" alt="" loading="lazy" onerror="this.style.opacity=.2" />';
      return '<div class="' + cls + '"><div class="fld__label">' +
        esc(it.label || shortLabel(it)) + undo + "</div>" +
        '<div class="fld__media">' + thumb +
          '<div class="fld__mediaval"><button class="btn btn--sm" data-pick="' + esc(it.key) + '">' +
            (url ? T("Change photo", "غيّر الصورة") : T("Add a photo", "ضيف صورة")) + "</button></div>" +
        "</div></div>";
    }

    if (it.kind === "href") {
      return '<div class="' + cls + '"><div class="fld__label">' +
        (it.pinned || it.video ? "" : T("Link \u2014 ", "لينك \u2014 ")) + esc(it.label || T("link", "لينك")) + undo + "</div>" +
        (it.hint ? '<p class="fld__hint">' + esc(it.hint) + "</p>" : "") +
        '<input type="text" data-in="' + esc(it.key) + '" value="' + esc(v) + '" placeholder="' +
        (it.video ? "https://www.youtube.com/watch?v=\u2026" : "https://\u2026") + '" />' +
        "</div>";
    }

    var rows = Math.min(9, Math.max(1, Math.ceil(v.length / 70)));
    var hint = it.kind === "rich"
      ? '<p class="fld__hint">' + T("Words between **asterisks** are the highlighted part — keep the asterisks to keep the styling.",
          "الكلام اللي بين **نجمتين** هو الجزء المميّز — سيب النجوم عشان الشكل يفضل زي ما هو.") + "</p>"
      : "";
    return '<div class="' + cls + '"><div class="fld__label">' + esc(shortLabel(it)) + undo + "</div>" +
      hint + '<textarea data-in="' + esc(it.key) + '" rows="' + rows + '">' + esc(v) + "</textarea></div>";
  }

  function bindFields() {
    Array.prototype.forEach.call(document.querySelectorAll("[data-in]"), function (el) {
      el.addEventListener("input", function () {
        edits[el.getAttribute("data-in")] = el.value;
        el.closest(".fld").classList.add("is-dirty");
        updateSaveButton();
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-pick]"), function (b) {
      b.addEventListener("click", function () { openPicker(b.getAttribute("data-pick")); });
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-revert]"), function (b) {
      b.addEventListener("click", function () { edits[b.getAttribute("data-revert")] = ""; save(); });
    });
    Array.prototype.forEach.call(document.querySelectorAll(".grp__head"), function (h) {
      h.addEventListener("click", function () { h.parentElement.classList.toggle("is-open"); });
    });
  }

  function byKey(k) {
    for (var i = 0; i < items.length; i++) if (items[i].key === k) return items[i];
    return null;
  }

  function dirtyKeys() {
    return Object.keys(edits).filter(function (k) {
      var it = byKey(k);
      if (!it) return false;
      return edits[k] !== (saved[k] ? saved[k].value : it.original);
    });
  }

  function updateSaveButton() {
    var n = dirtyKeys().length;
    var b = $("#btnSave");
    b.disabled = n === 0;
    b.textContent = n
      ? T("Save " + n + " change" + (n === 1 ? "" : "s"), "احفظ " + I18N.N(n, "change", "changes", ["تغيير واحد", "تغييرين", "تغييرات", "تغيير"]))
      : T("Save changes", "حفظ التغييرات");
  }

  function save() {
    var keys = dirtyKeys();
    if (!keys.length) return;
    var payload = keys.map(function (k) {
      var it = byKey(k);
      var value = edits[k];
      // Empty tells the API to drop the row, so the page goes back to normal.
      if (value.trim() === "" || value === it.original) value = "";
      return { key: k, kind: it.kind, value: value, page: it.page, section: it.section, label: it.label };
    });
    $("#btnSave").disabled = true;
    api("/api/cms", { method: "PUT", body: { items: payload } })
      .then(function () { edits = {}; return loadSaved(); })
      .then(function () { toast(T("Saved — your site is updated", "اتحفظ — موقعك اتحدّث")); loadPage(current); })
      .catch(function (e) { toast(e.message, true); updateSaveButton(); });
  }

  $("#btnSave").addEventListener("click", save);
  $("#filter").addEventListener("input", render);
  $("#btnShowAll").addEventListener("click", function () { showAll = !showAll; render(); });
  $("#pagePicker").addEventListener("click", function (e) {
    var b = e.target.closest("[data-page]");
    if (!b) return;
    if (dirtyKeys().length && !confirm(T("You have unsaved changes. Leave this page?", "عندك تغييرات مش محفوظة. تسيب الصفحة؟"))) return;
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
      $("#tab-news").hidden = t.dataset.tab !== "news";
      if (t.dataset.tab === "media") renderMedia();
      if (t.dataset.tab === "news") loadNewsletter();
    });
  });

  /* ---------- media ---------- */


  /* ---------- newsletter ----------

     Two jobs on one screen: who is on the list, and what to send them. The
     email is written as plain text — blank line for a new paragraph,
     **asterisks** for bold, a leading dash for a bullet — and the preview
     is rendered by the same code that will send it, so what is on screen is
     what arrives.

     A send goes out in chunks. The server takes one chunk per request and
     says where it got to; this loops until it is done. That is what lets a
     list of any size go out inside a serverless request's time limit, and it
     is why a send that fails halfway can still report what it delivered. */

  var subs = [];
  var campaigns = [];
  var mailCfg = { configured: false, from: "" };
  var subsLoaded = false;
  var sending = false;

  function loadNewsletter(force) {
    if (subsLoaded && !force) return;
    $("#subsCount").textContent = T("Loading…", "بيحمّل…");
    api("/api/cms?resource=newsletter").then(function (d) {
      subs = d.subscribers || [];
      campaigns = d.campaigns || [];
      mailCfg = d.mail || mailCfg;
      subsLoaded = true;
      renderSubs();
      renderCampaigns();
      var st = $("#mailState");
      if (mailCfg.configured) {
        st.innerHTML = T("Sending from <strong>" + esc(mailCfg.from) + "</strong> through " +
          esc(mailCfg.provider === "brevo" ? "Brevo" : "Resend") +
          ". Send yourself a test first — it proves the address is accepted.",
          "الإرسال من <strong>" + esc(mailCfg.from) + "</strong> عن طريق " +
          esc(mailCfg.provider === "brevo" ? "Brevo" : "Resend") +
          ". ابعت لنفسك تجربة الأول — عشان تتأكد إن العنوان مقبول.");
        st.style.color = "";
      } else {
        st.innerHTML = T(
          "Sending is not switched on yet — you can still collect subscribers and write and preview. " +
          '<a href="https://app.brevo.com/settings/keys/api" target="_blank" rel="noopener">Get a free Brevo key</a>' +
          ", verify your sending address there, and the three things below go into Vercel \u2192 Settings " +
          "\u2192 Environment Variables:<br />" +
          "<code>BREVO_API_KEY</code> \u00b7 <code>NEWSLETTER_FROM</code> \u00b7 redeploy.",
          "الإرسال لسه مش متفعّل — بس تقدر تجمع مشتركين وتكتب وتشوف المعاينة. " +
          '<a href="https://app.brevo.com/settings/keys/api" target="_blank" rel="noopener">هات مفتاح Brevo مجاني</a>' +
          "، وأكّد عنوان الإرسال هناك، والحاجات دي بتتحط في <span dir=\"ltr\">Vercel \u2192 Settings " +
          "\u2192 Environment Variables</span>:<br />" +
          "<code>BREVO_API_KEY</code> \u00b7 <code>NEWSLETTER_FROM</code> \u00b7 وبعدين redeploy.");
        st.style.color = "var(--c-danger, #e5484d)";
      }
    }).catch(function (e) { $("#subsCount").textContent = e.message; });
  }

  function activeSubs() { return subs.filter(function (x) { return x.status === "active"; }); }

  function when(iso) {
    var d = new Date(iso);
    return isNaN(d) ? "" : d.toLocaleDateString(I18N.ar ? I18N.loc() : undefined, { day: "numeric", month: "short", year: "numeric" });
  }

  function renderSubs() {
    var q = ($("#subsFilter").value || "").trim().toLowerCase();
    var list = subs.filter(function (x) {
      return !q || ((x.email || "") + " " + (x.name || "")).toLowerCase().indexOf(q) > -1;
    });
    var n = activeSubs().length;
    $("#subsCount").textContent = n === 0
      ? T("Nobody has subscribed yet.", "لسه محدش اشترك.")
      : T(n + (n === 1 ? " person is" : " people are") + " subscribed", I18N.N(n, "person", "people", ["شخص واحد", "شخصين", "أشخاص", "شخص"]) + " مشتركين") +
        (subs.length > n ? " · " + T((subs.length - n) + " unsubscribed", (subs.length - n) + " لغوا الاشتراك") : "");

    $("#subsList").innerHTML = list.length
      ? list.map(function (x) {
          return '<div class="sub-row' + (x.status === "active" ? "" : " is-out") + '">' +
            '<div class="sub-row__who">' +
              '<div class="sub-row__mail">' + esc(x.email) + "</div>" +
              '<div class="sub-row__meta">' + esc(x.name || "") + (x.name ? " · " : "") +
                when(x.created_at) + (x.source ? " · " + T("from the " + esc(x.source), "من " + esc(x.source)) : "") +
                (x.status === "active" ? "" : " · " + T("unsubscribed", "لغى الاشتراك")) + "</div>" +
            "</div>" +
            '<button class="sub-row__x" data-del="' + x.id + '" title="' + T("Remove from the list", "شيله من القايمة") + '">✕</button>' +
          "</div>";
        }).join("")
      : '<p class="muted">' + T("Nothing matches that.", "مفيش حاجة مطابقة.") + "</p>";

    Array.prototype.forEach.call($("#subsList").querySelectorAll("[data-del]"), function (b) {
      b.addEventListener("click", function () {
        var id = b.getAttribute("data-del");
        var row = subs.filter(function (x) { return String(x.id) === id; })[0];
        if (!confirm(T("Remove " + (row ? row.email : "this address") + " from the list?", "تشيل " + (row ? row.email : "العنوان ده") + " من القايمة؟"))) return;
        api("/api/cms?resource=newsletter&id=" + id, { method: "DELETE" })
          .then(function () { loadNewsletter(true); toast(T("Removed", "اتشال")); })
          .catch(function (e) { toast(e.message, true); });
      });
    });
  }

  function renderCampaigns() {
    $("#campaigns").innerHTML = campaigns.length
      ? campaigns.map(function (c) {
          return '<div class="camp"><span class="camp__subject">' + esc(c.subject) + "</span>" +
            '<span class="camp__meta">' + T(c.recipients + " sent", "اتبعت لـ " + c.recipients) +
              (c.failed ? " · " + T(c.failed + " failed", c.failed + " فشلوا") : "") + " · " + when(c.created_at) + "</span>" +
            (c.errors ? '<span class="camp__err">' + esc(c.errors) + "</span>" : "") +
          "</div>";
        }).join("")
      : '<p class="muted">' + T("No emails sent yet.", "لسه مفيش إيميلات اتبعتت.") + "</p>";
  }

  function draft() {
    return {
      subject: $("#mSubject").value.trim(),
      heading: $("#mHeading").value.trim(),
      body: $("#mBody").value,
      ctaLabel: $("#mCtaLabel").value.trim(),
      ctaUrl: $("#mCtaUrl").value.trim(),
      preheader: $("#mBody").value.replace(/\*\*/g, "").trim().slice(0, 120),
    };
  }

  $("#subsFilter").addEventListener("input", renderSubs);
  $("#btnReloadSubs").addEventListener("click", function () { loadNewsletter(true); });

  $("#btnExport").addEventListener("click", function () {
    var rows = [["email", "name", "status", "source", "subscribed"]].concat(
      subs.map(function (x) { return [x.email, x.name || "", x.status, x.source || "", x.created_at]; })
    );
    var csv = rows.map(function (r) {
      return r.map(function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(",");
    }).join("\n");
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "subscribers.csv";
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  });

  $("#btnPreview").addEventListener("click", function () {
    api("/api/cms?resource=newsletter&action=preview", { method: "POST", body: draft() })
      .then(function (d) {
        $("#mailPreview").hidden = false;
        $("#previewFrame").srcdoc = d.html;
      })
      .catch(function (e) { toast(e.message, true); });
  });
  $("#previewClose").addEventListener("click", function () { $("#mailPreview").hidden = true; });
  $("#mailPreview").addEventListener("click", function (e) {
    if (e.target === $("#mailPreview")) $("#mailPreview").hidden = true;
  });

  $("#btnTest").addEventListener("click", function () {
    var to = prompt(T("Send a test copy to which address?", "تبعت نسخة تجربة لأنهي عنوان؟"), mailCfg.replyTo || "");
    if (!to) return;
    var d = draft();
    d.testTo = to;
    $("#btnTest").disabled = true;
    api("/api/cms?resource=newsletter&action=send", { method: "POST", body: d })
      .then(function () { toast(T("Test sent to " + to, "التجربة اتبعتت لـ " + to)); })
      .catch(function (e) { toast(e.message, true); })
      .then(function () { $("#btnTest").disabled = false; });
  });

  $("#btnSend").addEventListener("click", function () {
    if (sending) return;
    var d = draft();
    var n = activeSubs().length;
    if (!d.subject) return toast(T("Give the email a subject line first.", "اكتب عنوان للرسالة الأول."), true);
    if (!d.body.trim()) return toast(T("The email has no text in it.", "الإيميل مفيهوش كلام."), true);
    if (!n) return toast(T("Nobody is subscribed yet.", "لسه محدش مشترك."), true);
    if (!confirm(T("Send “" + d.subject + "” to " + n + (n === 1 ? " person" : " people") +
                 "?\n\nThis cannot be taken back.",
                 "تبعت «" + d.subject + "» لـ " + I18N.N(n, "person", "people", ["شخص واحد", "شخصين", "أشخاص", "شخص"]) +
                 "؟\n\nمش هينفع ترجع فيها."))) return;

    sending = true;
    $("#btnSend").disabled = true;
    var state = $("#sendState");
    state.hidden = false;
    state.style.color = "";

    var totalSent = 0;
    var campaignId = 0;

    function chunk(offset) {
      state.textContent = T("Sending… " + totalSent + " of " + n + " so far.", "بيبعت… " + totalSent + " من " + n + " لحد دلوقتي.");
      var payload = {};
      for (var k in d) payload[k] = d[k];
      payload.offset = offset;
      payload.campaignId = campaignId;
      return api("/api/cms?resource=newsletter&action=send", { method: "POST", body: payload })
        .then(function (r) {
          campaignId = r.campaignId || campaignId;
          totalSent += r.sent || 0;
          if (r.error) throw new Error(r.error);
          if (!r.done) return chunk(r.nextOffset);
        });
    }

    chunk(0)
      .then(function () {
        state.textContent = T("Sent to " + totalSent + (totalSent === 1 ? " person." : " people."),
          "اتبعت لـ " + I18N.N(totalSent, "person", "people", ["شخص واحد", "شخصين", "أشخاص", "شخص"]) + ".");
        toast(T("Newsletter sent", "النشرة اتبعتت"));
        loadNewsletter(true);
      })
      .catch(function (e) {
        state.style.color = "var(--c-danger, #e5484d)";
        state.textContent = T("Stopped after " + totalSent + " — " + e.message, "وقف بعد " + totalSent + " — " + e.message);
      })
      .then(function () { sending = false; $("#btnSend").disabled = false; });
  });

  function loadMedia() {
    return api("/api/cms?resource=media").then(function (d) { media = d.media || []; });
  }

  function mediaCardHTML(m, pick) {
    var url = "/api/cms?resource=media&id=" + m.id;
    return '<div class="media-card" data-id="' + m.id + '">' +
      (/^image\//.test(m.mime)
        ? '<img class="media-card__img" src="' + url + '" alt="" loading="lazy" />'
        : '<div class="media-card__vid">▶</div>') +
      '<div class="media-card__meta"><div class="media-card__name" title="' + esc(m.name) + '">' + esc(m.name) + "</div>" +
        (m.bytes / 1024).toFixed(0) + " KB</div>" +
      (pick ? "" : '<div class="media-card__row"><button class="btn btn--sm btn--danger" data-del="' + m.id + '">' + T("Delete", "مسح") + "</button></div>") +
      "</div>";
  }

  function renderMedia() {
    var g = $("#mediaGrid");
    g.innerHTML = media.length
      ? media.map(function (m) { return mediaCardHTML(m, false); }).join("")
      : '<p class="muted">' + T("Nothing uploaded yet. Use the button above, or add a photo straight from the Content tab.",
        "لسه مفيش حاجة مرفوعة. استخدم الزرار اللي فوق، أو ضيف صورة على طول من تبويب المحتوى.") + "</p>";
    Array.prototype.forEach.call(g.querySelectorAll("[data-del]"), function (b) {
      b.addEventListener("click", function () {
        if (!confirm(T("Delete this file? Anywhere it is used will go blank.", "تمسح الملف ده؟ أي مكان مستخدم فيه هيبقى فاضي."))) return;
        api("/api/cms?resource=media&id=" + b.getAttribute("data-del"), { method: "DELETE" })
          .then(loadMedia).then(renderMedia).then(function () { toast(T("Deleted", "اتمسح")); })
          .catch(function (e) { toast(e.message, true); });
      });
    });
  }

  function readAsDataUrl(file) {
    return new Promise(function (res, rej) {
      var fr = new FileReader();
      fr.onload = function () { res(fr.result); };
      fr.onerror = function () { rej(new Error(T("Could not read " + file.name, "مقدرناش نقرا " + file.name))); };
      fr.readAsDataURL(file);
    });
  }

  /* A photo off a phone is four thousand pixels wide and several megabytes,
     and it lands on a page that shows it at six hundred. Shrinking it here
     means the visitor downloads what the page needs, not what the camera
     produced — and it happens before the upload, so the wait is shorter too.

     Anything that is not a plain photo is passed through untouched: a video
     has no canvas to draw to, a PNG may be a logo whose transparency matters,
     and an SVG must not be turned into pixels. */
  var MAX_EDGE = 1600;
  function shrink(file) {
    if (!/^image\/(jpeg|jpg|webp)$/i.test(file.type)) return readAsDataUrl(file);
    return readAsDataUrl(file).then(function (dataUrl) {
      return new Promise(function (res) {
        var img = new Image();
        img.onload = function () {
          var scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
          if (scale === 1 && dataUrl.length < 400000) return res(dataUrl);
          var c = document.createElement("canvas");
          c.width = Math.round(img.width * scale);
          c.height = Math.round(img.height * scale);
          c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
          var out;
          try { out = c.toDataURL("image/webp", 0.82); } catch (e) { out = null; }
          // A browser that cannot write WebP still writes JPEG.
          if (!out || out.indexOf("data:image/webp") !== 0) out = c.toDataURL("image/jpeg", 0.82);
          res(out.length < dataUrl.length ? out : dataUrl);
        };
        img.onerror = function () { res(dataUrl); };   // not decodable here — let the server judge
        img.src = dataUrl;
      });
    });
  }

  function upload(file, errEl) {
    errEl.hidden = true;
    return shrink(file)
      .then(function (dataUrl) { return api("/api/cms?resource=media", { method: "POST", body: { name: file.name, dataUrl: dataUrl } }); })
      .then(function (d) { return loadMedia().then(function () { return d.media; }); })
      .catch(function (e) { errEl.textContent = e.message; errEl.hidden = false; throw e; });
  }

  $("#mediaUpload").addEventListener("change", function (e) {
    var files = Array.prototype.slice.call(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;
    files.reduce(function (chain, f) {
      return chain.then(function () { return upload(f, $("#mediaError")); });
    }, Promise.resolve())
      .then(function () { renderMedia(); toast(T("Uploaded", "اترفع")); })
      .catch(function () { renderMedia(); });
  });

  /* ---------- picker ---------- */

  function openPicker(key) {
    pickerTarget = key;
    var it = byKey(key);
    $("#pickerTitle").textContent = it ? T("Photo for: " + shortLabel(it), "صورة لـ: " + shortLabel(it)) : T("Choose a photo", "اختار صورة");
    $("#pickerUrl").value = it ? valueOf(it) : "";
    $("#pickerError").hidden = true;
    $("#pickerGrid").innerHTML = media.length
      ? media.map(function (m) { return mediaCardHTML(m, true); }).join("")
      : '<p class="muted">' + T("Nothing uploaded yet — use the button above.", "لسه مفيش حاجة مرفوعة — استخدم الزرار اللي فوق.") + "</p>";
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

  function closePicker() { $("#picker").hidden = true; pickerTarget = null; }
  $("#pickerClose").addEventListener("click", closePicker);
  $("#picker").addEventListener("click", function (e) { if (e.target === $("#picker")) closePicker(); });
  $("#pickerUseUrl").addEventListener("click", function () { setPicked($("#pickerUrl").value.trim()); });
  $("#pickerUpload").addEventListener("change", function (e) {
    var f = (e.target.files || [])[0];
    e.target.value = "";
    if (!f) return;
    upload(f, $("#pickerError")).then(function (m) { setPicked("media:" + m.id); toast(T("Uploaded", "اترفع")); }).catch(function () {});
  });

  window.addEventListener("beforeunload", function (e) {
    if (dirtyKeys().length) { e.preventDefault(); e.returnValue = ""; }
  });

  boot();
})();
