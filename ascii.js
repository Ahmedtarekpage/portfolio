/* "TRACKS NOT COURSES", written in noise, sliding with the mouse.

   The words are rasterised once into a grid of characters. The grid is drawn
   wider than the band that holds it, and the band clips it — so as the pointer
   moves left and right the whole block slides with it, and more of the phrase
   comes out from behind the edge it was hiding under.

   Following the mouse is a transform, not a repaint: the characters are drawn
   once and the browser slides the finished canvas, so a move costs a
   compositor frame and nothing else. The only redraws are the slow shimmer, a
   handful of cells at a time, which is what keeps it looking alive rather
   than printed.

   It costs nothing when nobody is looking at it: an observer stops everything
   the moment the band leaves the screen, and a device with no real pointer —
   or anyone who has asked for less motion — gets one still frame and no
   timers at all. */
(function () {
  "use strict";

  var CHARS = "01<>{}[]()/\\|-_+=*&^%$#@!?;:,.~ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  var LINES = ["TRACKS", "NOT COURSES"];

  var CELL_W = 6;         // one character cell, css pixels
  var CELL_H = 8;
  var WIDE = 1.42;        // how much wider than the band the grid is drawn
  var EASE = 0.09;        // how lazily it catches up with the pointer
  var IDLE_SWAPS = 14;    // cells re-rolled per shimmer tick

  function make(host) {
    // The band's height comes from a stylesheet the design tool's runtime
    // applies, so on the first run there is nothing to measure yet. Leave
    // without a trace and let the retry after the repaint do it — appending
    // a canvas first would leave a dead one behind on every failed attempt.
    var box = host.getBoundingClientRect();
    if (!box.width || !box.height) return false;

    var canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    canvas.style.cssText =
      "position:absolute;top:0;left:50%;height:100%;" +
      "width:" + (WIDE * 100) + "%;margin-left:" + (-WIDE * 50) + "%;" +
      "will-change:transform;";
    host.appendChild(canvas);

    var ctx = canvas.getContext("2d", { alpha: true });
    var cols = 0, rows = 0, on = null, glyph = null, shade = null, tint = null;
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var span = 0;                    // how far it can travel each way
    var target = 0, current = 0;
    var live = false, queued = false, sliding = false, idleTimer = null;

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
      o.fillStyle = "#fff";
      o.textAlign = "center";
      o.textBaseline = "middle";

      /* The biggest type that fits both ways. Measured once at 100px and
         scaled, rather than guessed at and shrunk in a loop — a loop that
         only ever shrinks leaves the words far narrower than the space when
         height is the binding constraint, which here it always is. The width
         allowance is the visible band, not the wider grid, so the phrase
         still fits on screen when the block is sitting at either end. */
      var lineH = rows / (LINES.length + 0.28);
      o.font = "700 100px 'Arial Black', Impact, system-ui, sans-serif";
      var widest100 = 0;
      for (var i = 0; i < LINES.length; i++) widest100 = Math.max(widest100, o.measureText(LINES[i]).width);
      var byWidth = widest100 ? (cols / WIDE * 0.94) / widest100 * 100 : lineH;
      var byHeight = lineH * 1.3;          // Arial Black caps sit at about .72em
      var size = Math.min(byWidth, byHeight);

      o.font = "700 " + size + "px 'Arial Black', Impact, system-ui, sans-serif";
      var top = (rows - LINES.length * lineH) / 2;
      for (var j = 0; j < LINES.length; j++) {
        o.fillText(LINES[j], cols / 2, top + (j + 0.5) * lineH);
      }

      var data = o.getImageData(0, 0, cols, rows).data;
      on = new Uint8Array(cols * rows);
      glyph = new Array(cols * rows);
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
      var w = r.width * WIDE;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(r.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // the overhang is split between the two sides, so that is the travel
      span = (w - r.width) / 2;
      build(w, r.height);
      return true;
    }

    function draw() {
      queued = false;
      if (!on) return;
      ctx.clearRect(0, 0, (cols + 1) * CELL_W, (rows + 1) * CELL_H);
      ctx.font = "500 " + (CELL_H - 1) + "px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      ctx.textBaseline = "top";
      for (var y = 0; y < rows; y++) {
        for (var x = 0; x < cols; x++) {
          var i = y * cols + x;
          if (!on[i]) continue;
          var a = 0.4 * shade[i];
          ctx.fillStyle = tint[i]
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

    /* Catching up with the pointer is a transform on an already-drawn canvas,
       so a frame here costs the compositor and nothing else. */
    function slide() {
      if (!live) { sliding = false; return; }
      current += (target - current) * EASE;
      canvas.style.transform = "translate3d(" + current.toFixed(2) + "px,0,0)";
      if (Math.abs(target - current) > 0.25) requestAnimationFrame(slide);
      else sliding = false;
    }

    function onMove(e) {
      if (!live || reduced || !fine || !span) return;
      // where the pointer is across the window: -1 at the left edge, 1 at the right
      var t = (e.clientX / window.innerWidth) * 2 - 1;
      target = Math.max(-1, Math.min(1, t)) * span;
      if (!sliding) { sliding = true; requestAnimationFrame(slide); }
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
      // A phone has no cursor to move it with, so the shimmer would be a
      // timer running for no one — and a timer running for no one on a phone
      // is battery. It gets the single still frame.
      if (reduced || !fine) return;
      idleTimer = setInterval(idle, 420);
    }
    function stopIdle() { if (idleTimer) { clearInterval(idleTimer); idleTimer = null; } }

    if (!resize()) return false;
    draw();

    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) {
        live = entries[0].isIntersecting;
        if (live) startIdle(); else stopIdle();
      }, { rootMargin: "80px" }).observe(host);
    } else {
      live = true;
      startIdle();
    }

    window.addEventListener("pointermove", onMove, { passive: true });

    var rt = null;
    window.addEventListener("resize", function () {
      clearTimeout(rt);
      rt = setTimeout(function () {
        if (!resize()) return;
        current = target = 0;
        canvas.style.transform = "translate3d(0,0,0)";
        draw();
      }, 200);
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
