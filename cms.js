/* =========================================================
   cms.js — makes every piece of the public pages addressable.

   It walks the rendered DOM, gives each editable thing a stable key,
   and swaps in whatever /api/cms holds for that key. Nothing is
   marked up by hand: the pages stay plain HTML and this layer finds
   the content in them.

   Keys, in order of preference:
     1. t<n>      the template runtime's data-dc-tpl id (index.html).
                  Deterministic across renders, and it survives the text
                  itself changing.
     2. h<hash>   a hash of the *original* content (the journey pages,
                  whose cards main.js generates). Survives reordering,
                  which a positional path would not.
   Each gets a #<kind> suffix, plus a :<n> occurrence index when one key
   would otherwise cover several nodes.

   The hash must come from what the page ships, never from what is on
   screen — once an override is applied the visible text differs from
   source, and re-hashing it would orphan the very override that changed
   it. Originals are therefore cached per element the first time it is
   seen, and every later scan re-reads that cache.

   The dashboard loads these pages in an iframe with #cms-index and
   reads the same index back over postMessage, so what it lists is
   always what the page actually renders.
   ========================================================= */
(function () {
  "use strict";

  var API = "/api/cms";
  var PAGE = /\/(full|product|educator|journey)/.test(location.pathname) ? "journey" : "home";

  // Anything that opens a new box on the page. An element is one editable
  // run of text only when it contains none of these.
  var BLOCK = /^(div|section|article|main|header|footer|nav|aside|figure|figcaption|ul|ol|li|dl|dt|dd|table|thead|tbody|tr|td|th|form|fieldset|video|audio|img|svg|canvas|iframe|picture|source|hr|script|style|noscript|template|image-slot|details|summary|h1|h2|h3|h4|h5|h6|p|blockquote|pre)$/;
  var SKIP_IN = /^(script|style|noscript|template|svg)$/;
  // The CMS's own furniture must never become editable content.
  var SKIP_CLASS = /(^|\s)cms-/;
  // Tags that can sit inside one editable run of text.
  var FORMATTING = /^(strong|em|b|i|u|s|small|sup|sub|code|mark|br|abbr|span|a|label|button|time)$/;

  var index = [];        // [{key, kind, page, section, label, original}]
  var nodes = {};        // key -> [element, ...]
  var overrides = null;  // key -> {kind, value}
  var observer = null;
  var scans = 0;
  // Hard ceiling on re-scans. The idempotency checks in applyOne should stop
  // things on their own, but an innerHTML round-trip can re-serialise into a
  // string that never compares equal to what we wrote, and a runaway rescan
  // loop on a visitor's page is not a failure worth risking.
  var MAX_SCANS = 12;

  /* ---------- helpers ---------- */

  function hash(str) {
    // FNV-1a in base36 — short, stable, and plenty to separate content runs.
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return h.toString(36);
  }

  function norm(s) { return String(s == null ? "" : s).replace(/\s+/g, " ").trim(); }

  /* What this element held before the CMS touched it. Cached on the element
     the first time we see it, so applying an override never moves its key. */
  function original(el, kind, current) {
    var store = el.__cmsOrig || (el.__cmsOrig = {});
    if (!(kind in store)) store[kind] = current;
    return store[kind];
  }

  function tplId(el) {
    var n = el;
    while (n && n.nodeType === 1) {
      if (n.hasAttribute("data-dc-tpl")) return n.getAttribute("data-dc-tpl");
      n = n.parentElement;
    }
    return null;
  }

  // The nearest thing a person would name when hunting for this on the page.
  function sectionOf(el) {
    var n = el;
    while (n && n.nodeType === 1 && n !== document.body) {
      if (n.id && n.id.indexOf("cms") !== 0) return n.id;
      n = n.parentElement;
    }
    return "page";
  }

  function skip(el) {
    var n = el;
    while (n && n.nodeType === 1) {
      if (SKIP_IN.test(n.tagName.toLowerCase())) return true;
      var c = n.getAttribute("class");
      if (c && SKIP_CLASS.test(c)) return true;
      if (n.hasAttribute("data-cms-skip")) return true;
      n = n.parentElement;
    }
    return false;
  }

  /* ---------- discovery ---------- */

  var seen, claimed;

  function keyFor(el, kind, orig) {
    // A hand-given key survives an edit that changes the content it would
    // otherwise be hashed from — which matters most for a field that starts
    // out empty, where the hash is the same for every one of them.
    var fixed = el.getAttribute("data-cms-key");
    var t = tplId(el);
    var base = fixed ? "k" + fixed : t ? "t" + t : "h" + hash(norm(orig));
    var k = PAGE + ":" + base + "#" + kind;
    seen[k] = (seen[k] || 0) + 1;
    if (seen[k] > 1) k += ":" + seen[k];
    return k;
  }

  /* Name a picture the way a person would look for it. A file path is the
     last resort, not the first: alt text and the slot's own placeholder are
     already written for a reader, and failing those the caption or heading
     it sits next to says more than "assets/logo-udacity.png" ever will. */
  function pictureLabel(el, orig) {
    var a = norm(el.getAttribute("alt") || el.getAttribute("placeholder") || "");
    if (a) return a.slice(0, 70);
    var p = el.parentElement;
    for (var i = 0; i < 3 && p; i++, p = p.parentElement) {
      var t = norm(p.textContent);
      if (t && t.length < 70) return t;
    }
    var f = String(orig || "").split("/").pop().split("?")[0].replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ").trim();
    if (!f) return "Empty photo slot";
    return f.charAt(0).toUpperCase() + f.slice(1);
  }

  /* A few things are one setting, not one field per place they turn up. The
     booking link sits behind nine buttons across two pages; editing it nine
     times is a way to get it wrong eight times. These carry a fixed key that
     does not depend on the page or on where the button sits, so the dashboard
     shows them once, near the top, and every button follows. */
  var SITEWIDE = [{
    key: "site:booking#href",
    kind: "href",
    sel: '[data-cta="book"], [data-book]',
    label: "Booking calendar",
    hint: "Where every \u201cBook a free consultation\u201d button sends people \u2014 paste the link to your calendar page.",
    fallback: "https://tidycal.com/ahmedtarek/vip-booking",
  }];

  var defaults = {};

  function addSitewide() {
    for (var i = 0; i < SITEWIDE.length; i++) {
      var s = SITEWIDE[i];
      var list = document.querySelectorAll(s.sel);
      if (!list.length) continue;
      // Whatever the page itself ships with wins over the constant, so the
      // dashboard never shows a link the site is not actually using.
      var live = "";
      for (var j = 0; j < list.length; j++) {
        var el = list[j];
        el.__cmsFixed = true;
        el.setAttribute("data-cms-" + s.kind, s.key);
        var h = norm(el.getAttribute("href") || "");
        if (!live && h && h.charAt(0) !== "#") live = h;
      }
      var cfg = (window.SITE_CONFIG || {}).BOOKING_URL;
      var orig = live || (cfg && cfg.indexOf("XXX") < 0 ? cfg : "") || s.fallback;
      defaults[s.key] = orig;
      nodes[s.key] = Array.prototype.slice.call(list);
      index.push({
        key: s.key, kind: s.kind, page: PAGE, section: "site-settings",
        label: s.label, hint: s.hint, pinned: true, original: orig,
      });
    }
  }

  function add(el, kind, currentValue) {
    var orig = original(el, kind, currentValue);
    var video = el.hasAttribute("data-yt");
    // An empty picture or video slot is the one thing worth listing precisely
    // because it has no content yet — that is how one gets filled at all.
    if (!norm(orig) && kind !== "src" && !video) return;
    var key = keyFor(el, kind, orig);
    (nodes[key] || (nodes[key] = [])).push(el);
    el.setAttribute("data-cms-" + kind, key);
    index.push({
      key: key,
      kind: kind,
      page: PAGE,
      section: sectionOf(el),
      label: video
        ? (el.getAttribute("data-yt-label") || "Video")
        : kind === "src"
          ? pictureLabel(el, orig)
          : (norm(el.textContent).slice(0, 90) || norm(orig).slice(0, 90)),
      video: video || undefined,
      hint: video
        ? "Paste the YouTube link for this video. Clicking it on the site plays it in the big player."
        : undefined,
      original: orig,
    });
  }

  /* What kind of editable run this element is, or null if it is really a
     container and its children should each be their own.

     The pages built by the design tool use <span> as a layout box, not as
     inline formatting, so "contains only inline tags" is not enough: a
     header <div> of two styled spans would otherwise surface as one field
     full of markup. An element only speaks for a whole run when it
     contributes text of its own. */
  /* A sentence with styling inside it, written the way a person would type
     it: plain words, with each styled run wrapped in **asterisks**. Editing
     markup is not something anyone should have to do to fix a typo. */
  function richOf(el) {
    var out = "";
    for (var n = el.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === 3) out += n.nodeValue;
      else if (n.nodeType === 1 && n.textContent) out += "**" + n.textContent + "**";
    }
    return norm(out);
  }

  function applyRich(el, value) {
    var parts = String(value).split("**");
    var kids = [];
    for (var c = el.firstElementChild; c; c = c.nextElementSibling) kids.push(c);
    var marked = Math.floor(parts.length / 2);
    // Asterisk pairs no longer line up with the styled runs, so there is no
    // way to know which is which. Keep the words, drop the styling.
    if (marked !== kids.length) { el.textContent = parts.join(""); return; }
    var frag = document.createDocumentFragment(), mi = 0;
    for (var j = 0; j < parts.length; j++) {
      if (j % 2 === 0) { if (parts[j]) frag.appendChild(document.createTextNode(parts[j])); }
      else { kids[mi].textContent = parts[j]; frag.appendChild(kids[mi++]); }
    }
    el.textContent = "";
    el.appendChild(frag);
  }

  function ownText(el) {
    var t = "";
    for (var n = el.firstChild; n; n = n.nextSibling) if (n.nodeType === 3) t += n.nodeValue;
    return norm(t);
  }

  /* Whether an element's subtree holds anything that is not inline
     formatting, and whether it holds any text at all. Both are worked out
     for the whole page in one reverse pass over document order — children
     always come after their parent there, so walking backwards means a
     parent can read results its children already produced. Asking each
     element about its own descendants instead would be quadratic, and on
     the journey pages that was enough to keep the page busy forever. */
  var blocked, hasText;

  function measure(all) {
    blocked = new Map();
    hasText = new Map();
    for (var i = all.length - 1; i >= 0; i--) {
      var el = all[i];
      var bad = false, text = !!ownText(el);
      for (var c = el.firstElementChild; c; c = c.nextElementSibling) {
        if (!FORMATTING.test(c.tagName.toLowerCase()) || blocked.get(c)) bad = true;
        if (hasText.get(c)) text = true;
      }
      blocked.set(el, bad);
      hasText.set(el, text);
    }
  }

  function textUnitKind(el) {
    if (!hasText.get(el)) return null;
    if (!el.firstElementChild) return "text";
    if (blocked.get(el)) return null;
    var childText = false;
    for (var c = el.firstElementChild; c; c = c.nextElementSibling) {
      if (hasText.get(c)) { childText = true; break; }
    }
    // Decorative children only (an icon, a rule): the words are editable on
    // their own and the decoration is left in place.
    if (!childText) return "text";
    // Mixed text and formatting: editable as one plain sentence, with the
    // styled runs marked by asterisks rather than shown as tags.
    return ownText(el) ? "rich" : null;
  }

  function ancestorClaimed(el, root) {
    var p = el.parentElement;
    while (p && p !== root) {
      if (claimed.has(p)) return true;
      p = p.parentElement;
    }
    return false;
  }

  function scan(root) {
    seen = {};
    claimed = new Set();
    index = [];
    nodes = {};

    addSitewide();

    var all = root.querySelectorAll("*");
    measure(all);
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      var tag = el.tagName.toLowerCase();
      if (skip(el)) continue;

      // Pictures, uploads and embedded players.
      if (tag === "img" && el.getAttribute("src")) { add(el, "src", el.getAttribute("src")); continue; }
      if (tag === "image-slot") { add(el, "src", el.getAttribute("src") || ""); continue; }
      if (tag === "video" && el.getAttribute("src")) { add(el, "src", el.getAttribute("src")); continue; }
      if (el.hasAttribute("data-yt")) { add(el, "href", el.getAttribute("data-yt")); continue; }
      if (el.hasAttribute("data-mp4")) { add(el, "src", el.getAttribute("data-mp4")); continue; }

      // A link's destination is editable separately from its label —
      // in-page anchors included, since "Book a free consultation" ships
      // pointing at #contact and the whole point is to be able to send it
      // to a booking page instead.
      if (tag === "a") {
        var href = el.getAttribute("href") || "";
        if (href && !el.__cmsFixed) add(el, "href", href);
      }

      // One run of text, taken as high as it goes, so a paragraph wins over
      // the <strong> inside it.
      var kind = textUnitKind(el);
      if (kind && !ancestorClaimed(el, root)) {
        claimed.add(el);
        add(el, kind, kind === "rich" ? richOf(el) : (el.children.length ? ownText(el) : el.textContent));
      }
    }
    return index;
  }

  /* ---------- applying ---------- */

  function resolve(value) {
    // Media ids picked in the dashboard resolve to the media endpoint.
    return /^media:\d+$/.test(value) ? "/api/cms?resource=media&id=" + value.slice(6) : value;
  }

  /* Writing a value that is already in place would still register as a DOM
     mutation, and the observer would call us straight back — so every branch
     below no-ops when there is nothing to change. That is what lets the
     observer stay connected for the life of the page instead of being timed
     out, which in turn is what keeps overrides applied after a late re-render
     (the journey pages redraw all their text on the Arabic toggle). */
  function applyOne(el, kind, value) {
    if (kind === "text") {
      if ((el.children.length ? ownText(el) : el.textContent) === value) return;
      // With decorative children present, rewrite only the element's own text
      // nodes so the icon (or rule, or <br>) survives the edit.
      if (el.children.length) {
        var first = null;
        for (var n = el.firstChild; n; n = n.nextSibling) if (n.nodeType === 3) { first = n; break; }
        for (var m = el.firstChild, next; m; m = next) {
          next = m.nextSibling;
          if (m.nodeType === 3 && m !== first) el.removeChild(m);
        }
        if (first) first.nodeValue = value;
        else el.insertBefore(document.createTextNode(value), el.firstChild);
      } else {
        el.textContent = value;
      }
      return;
    }
    if (kind === "rich") { if (richOf(el) !== norm(value)) applyRich(el, value); return; }
    if (kind === "src") {
      var url = resolve(value);
      var a = el.hasAttribute("data-mp4") ? "data-mp4" : "src";
      if (el.getAttribute(a) !== url) el.setAttribute(a, url);
      return;
    }
    if (kind === "href") {
      var b = el.hasAttribute("data-yt") ? "data-yt" : "href";
      var v = b === "href" ? resolve(value) : value;
      if (el.getAttribute(b) !== v) el.setAttribute(b, v);
    }
  }

  function apply() {
    // A shared setting still has to reach the buttons that have never been
    // edited — that is what makes one field speak for all of them.
    for (var s = 0; s < SITEWIDE.length; s++) {
      var sw = SITEWIDE[s], sl = nodes[sw.key];
      if (!sl || (overrides && overrides[sw.key])) continue;
      for (var n = 0; n < sl.length; n++) {
        try { applyOne(sl[n], sw.kind, defaults[sw.key]); } catch (e) {}
      }
    }
    if (!overrides) { if (observer) observer.takeRecords(); return; }
    for (var key in overrides) {
      var list = nodes[key];
      if (!list) continue;
      for (var i = 0; i < list.length; i++) {
        // One bad key must not stop the rest of the page.
        try { applyOne(list[i], overrides[key].kind, overrides[key].value); } catch (e) {}
      }
    }
    // Drop the mutation records our own writes just produced, so they do not
    // schedule another scan. A boolean flag cannot do this job: observer
    // callbacks are delivered as microtasks, by which point it would already
    // have been cleared.
    if (observer) observer.takeRecords();
  }

  /* The picture component ships as a live drop target: click an empty one
     and it opens a file picker, drag onto it and it takes the file. That is
     right inside a design tool and wrong on a public page, where it reads as
     an unfinished admin screen a visitor is invited to write to.

     So every slot is made inert, and empty ones leave the layout altogether —
     a photo shows up here when one is set from the dashboard, and until then
     there is simply nothing there. An explicit grid holds on to the rows it
     was given even when they are empty, so those collapse too. */
  function lockPictures() {
    var slots = document.getElementsByTagName("image-slot");
    var grids = [];
    for (var i = 0; i < slots.length; i++) {
      var el = slots[i];
      el.style.pointerEvents = "none";
      if (norm(el.getAttribute("src"))) { el.style.display = ""; continue; }
      // The tile wrapper carries the rounded corners and shadow, so hiding
      // the slot alone would leave an empty card behind.
      var tile = (el.parentElement && el.parentElement.children.length === 1) ? el.parentElement : el;
      tile.style.display = "none";
      var grid = tile.parentElement;
      if (grid && grids.indexOf(grid) < 0) grids.push(grid);
    }
    for (var g = 0; g < grids.length; g++) {
      try {
        if (getComputedStyle(grids[g]).display === "grid") grids[g].style.gridTemplateRows = "auto";
      } catch (e) {}
    }
  }

  function run() {
    scans++;
    scan(document.body);
    apply();
    lockPictures();
    // Anything that reads a value the dashboard can change — the video hub
    // reading its YouTube links, say — needs to know when those values have
    // landed, which is not any of the browser's own ready events.
    try { document.dispatchEvent(new CustomEvent("cms:applied")); } catch (e) {}
    if (location.hash === "#cms-index" || location.search.indexOf("cmsindex=1") > -1) {
      try {
        parent.postMessage({ type: "cms-index", page: PAGE, items: index }, location.origin);
      } catch (e) { /* not framed */ }
    }
  }

  /* ---------- boot ----------
     Both pages paint asynchronously — index.html through its template
     runtime, the journey pages through main.js — so there is no one
     "ready" moment. Fetch the overrides once, then re-scan whenever the
     DOM settles, and stop once it clearly has. */

  /* These pages never stop animating — counters tick, reveals fade, the
     scroll rail redraws — so a mutation observer left running would re-scan
     for the life of the tab and never let the page go idle. Watch only while
     the initial render settles, then disconnect and re-scan on the one event
     that genuinely rebuilds text afterwards: the Arabic toggle. */
  var timer = null;
  function schedule() {
    if (scans >= MAX_SCANS) return;
    clearTimeout(timer);
    timer = setTimeout(run, 200);
  }

  fetch(API, { credentials: "same-origin" })
    .then(function (r) { return r.ok ? r.json() : { content: {} }; })
    .then(function (d) { overrides = d.content || {}; })
    .catch(function () { overrides = {}; })
    .then(function () {
      run();
      observer = new MutationObserver(schedule);
      observer.observe(document.body, { childList: true, subtree: true });
      setTimeout(function () {
        observer.disconnect();
        observer = null;
        clearTimeout(timer);
        run();
      }, 6000);

      // main.js rewrites every data-i18n string on language change.
      document.addEventListener("click", function (e) {
        if (e.target && e.target.closest && e.target.closest("#langToggle")) {
          setTimeout(function () { scans = 0; run(); }, 80);
          setTimeout(run, 600);
        }
      });
    });

  window.__cms = {
    index: function () { return index; },
    rescan: function () { scans = 0; run(); },
    page: PAGE,
  };
})();
