// Language switch for the private tools (/admin, /dashboard, /time): English
// (left to right) or Arabic (right to left).
//
// Why it works the way it does:
// - There is no build step, so there is no message catalogue. Each string
//   carries its own Arabic next to the English, at the place it is used:
//   T("Save", "حفظ") in scripts, data-ar="حفظ" in markup. Nothing can drift
//   out of sync with a separate file, and an untranslated string simply stays
//   English instead of showing a key.
// - Switching language reloads the page. The tools paint most of their markup
//   from scripts, and re-running every painter in place would mean touching
//   each one; a reload is one line and cannot leave half a page in the old
//   language.
// - This file is loaded in <head>, not deferred, so <html lang dir> is set
//   before the first paint and an Arabic page never flashes left-to-right.
// - English is the default and is untouched: with no saved choice, T() returns
//   its first argument and no attribute is rewritten.
(function () {
  "use strict";

  var KEY = "tools.lang";
  var lang = "en";
  try { if (localStorage.getItem(KEY) === "ar") lang = "ar"; } catch (e) { /* private mode: stay English */ }
  var ar = lang === "ar";

  var root = document.documentElement;
  root.lang = lang;
  root.dir = ar ? "rtl" : "ltr";

  /** T("English", "عربي") — the Arabic when the tools are in Arabic, else the English. */
  function T(en, arText) {
    return ar && arText != null ? arText : en;
  }

  /** Arabic counted noun: plural(3, "يوم", "يومين", "أيام", "يوم") → "3 أيام". */
  function plural(n, one, two, few, many) {
    if (n === 1) return one;
    if (n === 2) return two;
    return n + " " + (n >= 3 && n <= 10 ? few : many);
  }

  /** Counted noun in the active language: N(3, "day", "days", ["يوم","يومين","أيام","يوم"]) */
  function N(n, enOne, enMany, arForms) {
    if (ar && arForms) return plural(n, arForms[0], arForms[1], arForms[2], arForms[3]);
    return n + " " + (n === 1 ? enOne : enMany);
  }

  /** Locale for dates and numbers: pass the English one the code already used. */
  function loc(enLocale) {
    // -u-nu-latn keeps Western digits, which is what the rest of the UI shows
    return ar ? "ar-EG-u-nu-latn" : (enLocale || "en-GB");
  }

  function set(next) {
    try { localStorage.setItem(KEY, next === "ar" ? "ar" : "en"); } catch (e) { /* nothing to remember it in */ }
    location.reload();
  }

  // Markup: data-ar swaps the text, data-ar-html the inner HTML, and
  // data-ar-placeholder / -title / -aria-label the matching attribute.
  var ATTRS = ["placeholder", "title", "aria-label", "value", "alt"];
  function apply(scope) {
    if (!ar) return;
    var i, j, list, el, v;
    list = scope.querySelectorAll("[data-ar]");
    for (i = 0; i < list.length; i++) {
      el = list[i];
      if (el.__ar) continue;
      el.__ar = true;
      el.textContent = el.getAttribute("data-ar");
    }
    list = scope.querySelectorAll("[data-ar-html]");
    for (i = 0; i < list.length; i++) {
      el = list[i];
      if (el.__arh) continue;
      el.__arh = true;
      el.innerHTML = el.getAttribute("data-ar-html");
    }
    for (j = 0; j < ATTRS.length; j++) {
      list = scope.querySelectorAll("[data-ar-" + ATTRS[j] + "]");
      for (i = 0; i < list.length; i++) {
        v = list[i].getAttribute("data-ar-" + ATTRS[j]);
        if (list[i].getAttribute(ATTRS[j]) !== v) list[i].setAttribute(ATTRS[j], v);
      }
    }
  }

  // The switch itself: one small fixed button, added here so that every tool
  // page and every view inside it (the login screen included) has it without
  // each page having to place one.
  function addSwitch() {
    if (document.getElementById("langSwitch")) return;
    var b = document.createElement("button");
    b.id = "langSwitch";
    b.type = "button";
    b.textContent = ar ? "English" : "عربي";
    b.setAttribute("aria-label", ar ? "Switch to English" : "حوّل للعربي");
    b.title = b.getAttribute("aria-label");
    b.style.cssText = "position:fixed;bottom:14px;inset-inline-start:14px;z-index:9999;padding:7px 14px;border-radius:999px;" +
      "border:1px solid rgba(127,127,127,.4);background:rgba(20,20,28,.82);color:#fff;font:600 13px/1 system-ui,sans-serif;" +
      "cursor:pointer;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)";
    b.addEventListener("click", function () { set(ar ? "en" : "ar"); });
    document.body.appendChild(b);
  }

  function start() {
    apply(document);
    addSwitch();
    if (ar && window.MutationObserver) {
      // markup painted later by the tools may carry data-ar too
      new MutationObserver(function (list) {
        for (var i = 0; i < list.length; i++) {
          for (var k = 0; k < list[i].addedNodes.length; k++) {
            var n = list[i].addedNodes[k];
            if (n.nodeType === 1) apply(n.parentNode || document);
          }
        }
      }).observe(document.body, { childList: true, subtree: true });
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();

  window.T = T;
  window.I18N = { lang: lang, ar: ar, dir: ar ? "rtl" : "ltr", T: T, N: N, plural: plural, loc: loc, set: set, apply: apply };
})();
