/* Light/dark toggle shared by /admin, /dashboard and /time.

   The choice is one preference across all three — signing into one tool and
   finding it in the other theme reads as two different products. The pre-paint
   snippet in each page's <head> sets data-theme before CSS applies; this file
   only wires the button and keeps everything in sync afterwards.

   Exposes window.Theme = { current, apply, onChange } — /time hooks onChange to
   redraw its charts, which read their colours from CSS at render time. */
(function () {
  "use strict";

  // a page that loads this file without i18n.js (the client's share page) stays English
  var I18N = window.I18N || { ar: false, loc: function (l) { return l || "en-GB"; }, N: function (n, one, many) { return n + " " + (n === 1 ? one : many); } };
  var T = window.T || function (en) { return en; };

  var KEY = "tools-theme";
  var listeners = [];

  function current() {
    return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
  }

  function apply(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    var btn = document.getElementById("btnTheme");
    if (btn) {
      btn.textContent = theme === "light" ? "☀️" : "🌙";
      btn.setAttribute("aria-label", theme === "light" ? T("Switch to dark theme", "حوّل للوضع الغامق") : T("Switch to light theme", "حوّل للوضع الفاتح"));
    }
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", theme === "light" ? "#f4f8ff" : "#0b1220");
    try { localStorage.setItem(KEY, theme); } catch (e) {}
    listeners.forEach(function (fn) { try { fn(theme); } catch (e) {} });
  }

  window.Theme = {
    current: current,
    apply: apply,
    onChange: function (fn) { listeners.push(fn); },
  };

  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function wire() {
    apply(current()); // sync the button's icon to whatever the pre-paint snippet set
    var btn = document.getElementById("btnTheme");
    if (!btn) return;
    btn.addEventListener("click", function () {
      apply(current() === "light" ? "dark" : "light");
      if (reduceMotion) return;
      btn.classList.remove("theme-toggle--spin");
      void btn.offsetWidth; // restart the animation on repeat clicks
      btn.classList.add("theme-toggle--spin");
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire);
  else wire();
})();
