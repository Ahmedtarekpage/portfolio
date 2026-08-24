/* "TRACKS NOT COURSES", drawn out of noise, awake under the cursor.

   The words are rasterised once into a grid of on/off cells, and every cell
   that is on gets a random character. At rest the grid barely moves — a few
   characters swapping every so often, faint enough to read as texture. Near
   the pointer the characters churn and brighten, so the phrase surfaces where
   the mouse is and settles again behind it.

   It costs almost nothing when nobody is looking at it: an observer stops the
   loop the moment the band scrolls off screen, the idle shimmer is a handful
   of cells rather than a repaint, and a device without a real pointer gets a
   single static frame. Anyone who has asked for less motion gets that frame
   and nothing else. */
(function () {
  "use strict";

  var CHARS = "01<>{}[]()/\\|-_+=*&^%$#@!?;:,.~ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  var PHRASE = "TRACKS NOT COURSES";
  var WRAPPED = ["TRACKS", "NOT COURSES"];

  var CELL_W = 6;         // one character cell, css pixels
  var CELL_H = 8;
  var RADIUS = 110;       // how far from the pointer the churn reaches
  var IDLE_SWAPS = 14;    // cells re-rolled per idle tick — texture, not motion

  function make(host) {
    // The band's height comes from a stylesheet the design tool's runtime
    // applies, so on the first run there is nothing to measure yet. Leave
    // without a trace and let the retry after the repaint do it — appending
    // a canvas first would leave a dead one behind on every failed attempt.
    var box = host.getBoundingClientRect();
    if (!box.width || !box.height) return false;

    var canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    canvas.style.cssText = "display:block;width:100%;height:100%;";
    host.appendChild(canvas);

    var ctx = canvas.getContext("2d", { alpha: true });
    var cols = 0, rows = 0, on = null, glyph = null, heat = null, shade = null, tint = null;
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var px = -1e6, py = -1e6;
    var live = false, queued = false, idleTimer = null;

    var reduced = false;
    try { reduced = matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}
    var fine = true;
    try { fine = matchMedia("(hover: hover) and (pointer: fine)").matches; } catch (e) {}

    function rand() { return CHARS.charAt((Math.random() * CHARS.length) | 0); }

    /* Rasterise the words once: draw them big on an offscreen canvas, then
       ask which cells the ink landed in. Reading the shape back from pixels
       is what keeps the letterforms real rather than hand-plotted. */
    function build(w, h) {
      cols = Math.max(8, Math.floor(w / CELL_W));
      rows = Math.max(4, Math.floor(h / CELL_H));

      var off = document.createElement("canvas");
      off.width = cols;
      off.height = rows;
      var o = off.getContext("2d");
      o.clearRect(0, 0, cols, rows);
      o.fillStyle = "#fff";
      o.textAlign = "center";
      o.textBaseline = "middle";

      /* Two lines, always. Eighteen characters in a row leaves each letter
         too few columns to hold its shape — the block reads as a smear
         rather than a word. Stacked, the longest line is eleven and every
         letter gets room. */
      var lines = WRAPPED;

      /* The biggest type that fits both ways. Measured once at 100px and
         scaled, rather than guessed at and shrunk in a loop — a loop that
         only ever shrinks leaves the words far narrower than the space when
         height is the binding constraint, which is most of the time here. */
      var lineH = rows / (lines.length + 0.28);
      o.font = "700 100px 'Arial Black', Impact, system-ui, sans-serif";
      var widest100 = 0;
      for (var i = 0; i < lines.length; i++) widest100 = Math.max(widest100, o.measureText(lines[i]).width);
      var byWidth = widest100 ? (cols * 0.96) / widest100 * 100 : lineH;
      var byHeight = lineH * 1.3;          // Arial Black caps sit at about .72em
      var size = Math.min(byWidth, byHeight);
      o.font = "700 " + size + "px 'Arial Black', Impact, system-ui, sans-serif";
      var top = (rows - lines.length * lineH) / 2;
      for (var j = 0; j < lines.length; j++) {
        o.fillText(lines[j], cols / 2, top + (j + 0.5) * lineH);
      }

      var data = o.getImageData(0, 0, cols, rows).data;
      on = new Uint8Array(cols * rows);
      glyph = new Array(cols * rows);
      heat = new Float32Array(cols * rows);
      // A flat wash of identical characters reads as a grey box. Fixed
      // per-cell weight and a scattering of accent-coloured ones give the
      // block the grain that makes the word legible at this opacity.
      shade = new Float32Array(cols * rows);
      tint = new Uint8Array(cols * rows);
      for (var k = 0; k < cols * rows; k++) {
        on[k] = data[k * 4 + 3] > 40 ? 1 : 0;
        glyph[k] = on[k] ? rand() : "";
        shade[k] = 0.55 + Math.random() * 0.7;
        tint[k] = Math.random() < 0.18 ? 1 : 0;
      }
    }

    function resize() {
      var r = host.getBoundingClientRect();
      if (!r.width || !r.height) return false;
      canvas.width = Math.round(r.width * dpr);
      canvas.height = Math.round(r.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      build(r.width, r.height);
      return true;
    }

    function draw() {
      queued = false;
      if (!on) return;
      var r = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, r.width, r.height);
      ctx.font = "500 " + (CELL_H - 1) + "px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      ctx.textBaseline = "top";

      for (var y = 0; y < rows; y++) {
        for (var x = 0; x < cols; x++) {
          var i = y * cols + x;
          if (!on[i]) continue;
          var a = 0.34 * shade[i] + heat[i] * 0.62;
          // warm cells take the accent; so do the scattered ones at rest
          ctx.fillStyle = (heat[i] > 0.05 || tint[i])
            ? "rgba(114, 99, 201, " + a + ")"
            : "rgba(23, 24, 31, " + a + ")";
          ctx.fillText(glyph[i], x * CELL_W, y * CELL_H);
        }
      }
    }

    function schedule() {
      if (queued) return;
      queued = true;
      requestAnimationFrame(draw);
    }

    /* Warm the cells under the pointer and re-roll them; cool everything else
       a little. Only cells that changed cost anything. */
    function stir() {
      if (!on) return;
      var r = canvas.getBoundingClientRect();
      var mx = px - r.left, my = py - r.top;
      var touched = false;

      for (var y = 0; y < rows; y++) {
        for (var x = 0; x < cols; x++) {
          var i = y * cols + x;
          if (!on[i]) continue;
          var dx = x * CELL_W + CELL_W / 2 - mx;
          var dy = y * CELL_H + CELL_H / 2 - my;
          var d = Math.sqrt(dx * dx + dy * dy);
          if (d < RADIUS) {
            var want = 1 - d / RADIUS;
            if (want > heat[i]) { heat[i] = want; touched = true; }
            if (Math.random() < want * 0.5) { glyph[i] = rand(); touched = true; }
          } else if (heat[i] > 0) {
            heat[i] = Math.max(0, heat[i] - 0.06);
            touched = true;
          }
        }
      }
      if (touched) schedule();
      // keep cooling until everything is cold again
      for (var k = 0; k < heat.length; k++) if (heat[k] > 0) return true;
      return false;
    }

    var cooling = false;
    function cool() {
      if (!live) { cooling = false; return; }
      cooling = stir();
      if (cooling) requestAnimationFrame(cool);
    }

    function onMove(e) {
      if (!live || reduced || !fine) return;
      px = e.clientX; py = e.clientY;
      if (!cooling) { cooling = true; requestAnimationFrame(cool); }
    }

    function idle() {
      if (!live || !on) return;
      for (var n = 0; n < IDLE_SWAPS; n++) {
        var i = (Math.random() * on.length) | 0;
        if (on[i]) glyph[i] = rand();
      }
      schedule();
    }

    function startIdle() {
      stopIdle();
      // A phone has no cursor to reveal anything with, so the shimmer would
      // be a timer running for no one — and a timer running for no one on a
      // phone is battery. It gets the single static frame.
      if (reduced || !fine) return;
      idleTimer = setInterval(idle, 420);
    }
    function stopIdle() { if (idleTimer) { clearInterval(idleTimer); idleTimer = null; } }

    if (!resize()) return false;
    draw();

    // Nothing runs while the band is not on screen.
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) {
        live = entries[0].isIntersecting;
        if (live) startIdle(); else { stopIdle(); px = py = -1e6; }
      }, { rootMargin: "80px" }).observe(host);
    } else {
      live = true;
      startIdle();
    }

    window.addEventListener("pointermove", onMove, { passive: true });

    var rt = null;
    window.addEventListener("resize", function () {
      clearTimeout(rt);
      rt = setTimeout(function () { if (resize()) draw(); }, 200);
    }, { passive: true });

    return true;
  }

  function start() {
    var hosts = document.querySelectorAll("[data-ascii]");
    for (var i = 0; i < hosts.length; i++) {
      if (hosts[i].dataset.asciiReady) continue;
      if (make(hosts[i])) hosts[i].dataset.asciiReady = "1";
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
  // the page is repainted by the design tool's runtime after this first runs
  document.addEventListener("cms:applied", start);
})();
