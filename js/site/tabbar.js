/* The phone tab bar's "you are here".

   An app's tab bar always says which tab you are on. A page of stacked
   sections has to work that out from the scroll position, so each tab names
   the section it points at and the section that owns the middle of the screen
   wins. Home lights up until the first section reaches that line.

   Sections are watched with an observer rather than a scroll handler: this
   page already animates continuously, and one more thing running on every
   frame is one more thing making it stutter. */
(function () {
  "use strict";

  var io = null;

  function start() {
    var bar = document.querySelector(".tabbar");
    if (!bar) return;

    // The design tool's runtime repaints the body after this file first runs,
    // which replaces every section with a fresh node. An observer attached
    // before that is left watching elements no longer in the document — so
    // this runs again when the page settles and rebuilds from what is there
    // now, rather than refusing because it has run once already.
    if (io) io.disconnect();

    var tabs = Array.prototype.slice.call(bar.querySelectorAll("[data-tab-for]"));
    var home = bar.querySelector("[data-tab-top]");
    var byId = {};
    var watched = [];

    tabs.forEach(function (a) {
      var el = document.getElementById(a.getAttribute("data-tab-for"));
      if (!el) return;
      byId[a.getAttribute("data-tab-for")] = a;
      watched.push(el);
    });
    if (!watched.length) return;

    var visible = {};

    function paint() {
      // The lowest section that has reached the middle of the screen is the
      // one being read.
      var best = null;
      for (var i = 0; i < watched.length; i++) {
        var id = watched[i].id;
        if (visible[id]) best = id;
      }
      tabs.forEach(function (a) { a.classList.toggle("is-on", a.getAttribute("data-tab-for") === best); });
      if (home) home.classList.toggle("is-on", !best);
    }

    io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { visible[e.target.id] = e.isIntersecting; });
      paint();
    }, {
      // a band across the middle of the viewport, so a section counts as
      // "the one you are reading" only once it is genuinely in front of you
      rootMargin: "-45% 0px -45% 0px",
      threshold: 0,
    });
    watched.forEach(function (el) { io.observe(el); });

    // "Home" means the top of this page, not a reload of it.
    if (home) {
      home.addEventListener("click", function (e) {
        if (location.pathname === "/" || location.pathname === "/index.html") {
          e.preventDefault();
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
      });
    }

    paint();
  }

  // The page is painted by the design tool's runtime, so the sections the
  // observer needs are not there when this file first runs.
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
  document.addEventListener("cms:applied", start);
})();
