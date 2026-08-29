/* Light/dark toggle shared by /admin, /dashboard and /time.

   The choice is one preference across all three — signing into one tool and
   finding it in the other theme reads as two different products. The pre-paint
   snippet in each page's <head> sets data-theme before CSS applies; this file
   only wires the button and keeps everything in sync afterwards.

   Exposes window.Theme = { current, apply, onChange } — /time hooks onChange to
   redraw its charts, which read their colours from CSS at render time. */
(function () {
  "use strict";

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
      btn.setAttribute("aria-label", theme === "light" ? "Switch to dark theme" : "Switch to light theme");
    }
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", theme === "light" ? "#ffffff" : "#161826");
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
