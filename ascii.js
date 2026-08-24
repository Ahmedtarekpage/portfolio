/* "TRACKS NOT COURSES", written in noise — a little window you can move
   around and zoom.

   The words are rasterised once into a grid of characters. The grid is drawn
   larger than the band that holds it in both directions, and the band clips
   it, so the band is a window onto something bigger: move the pointer and the
   whole block drifts with it, up, down and sideways, and more of the phrase
   comes out from behind whichever edge it was hiding under. It rests pulled
   back, showing the whole phrase; click and it zooms in among the characters,
   where there is far more room to move, and click again to pull back out. A
   click also lays a running track down where you clicked — lanes, drawn in
   the same characters, opening out and fading.

   Moving and zooming are a transform, not a repaint: the characters are drawn
   once and the browser slides and scales the finished canvas, so a move costs
   a compositor frame and nothing else. The redraws are the slow shimmer — a
   handful of cells at a time, which is what keeps it looking alive rather
   than printed — and the track, which is a second canvas carrying a few
   hundred characters rather than the whole grid.

   It costs nothing when nobody is looking at it: an observer stops everything
   the moment the band leaves the screen, and a device with no real pointer
   gets the zoom and the track but no drift and no shimmer. Anyone who has
   asked for less motion gets one still frame, a zoom that simply cuts between
   the two sizes, and no timers at all. */
(function () {
  "use strict";

  var CHARS = "01<>{}[]()/\\|-_+=*&^%$#@!?;:,.~ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  var LINES = ["TRACKS", "NOT COURSES"];

  var CELL_W = 6;         // one character cell, css pixels
  var CELL_H = 8;
  var WIDE = 1.45;        // how much wider than the band the grid is drawn
  var TALL = 1.5;         // and how much taller
  var REST = 1;           // pulled back: the whole phrase, with room to move
  var ZOOM = 1.45;        // and what a click takes you in to
  var EASE = 0.09;        // how lazily it catches up
  var IDLE_SWAPS = 14;    // cells re-rolled per shimmer tick
  var TRACK_MS = 1250;    // how long a track takes to open out and fade
  var LANES = [1, 0.72, 0.46];
  var LANE_W = 5;         // half the width of a painted lane, css pixels
  var TRACK_W = 9;        // the track is written in bigger characters than the
  var TRACK_H = 12;       // words, so it reads as a thing laid over them

  function make(host) {
    // The band's height comes from a stylesheet the design tool's runtime
    // applies, so on the first run there is nothing to measure yet. Leave
    // without a trace and let the retry after the repaint do it — appending
    // a canvas first would leave a dead one behind on every failed attempt.
    var box = host.getBoundingClientRect();
    if (!box.width || !box.height) return false;

    var reduced = false;
    try { reduced = matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}
    var fine = true;
    try { fine = matchMedia("(hover: hover) and (pointer: fine)").matches; } catch (e) {}

    /* Both canvases ride on one element, so one transform moves the words and
       anything drawn over them together and the track stays where it was put
       rather than swimming about as the block drifts. */
    var stage = document.createElement("div");
    stage.style.cssText = "position:absolute;left:0;top:0;transform-origin:50% 50%;will-change:transform;";

    function sheet() {
      var c = document.createElement("canvas");
      c.setAttribute("aria-hidden", "true");
      c.style.cssText = "position:absolute;left:0;top:0;width:100%;height:100%;";
      stage.appendChild(c);
      return c;
    }
    var base = sheet();
    var fxc = sheet();
    host.appendChild(stage);

    var ctx = base.getContext("2d", { alpha: true });
    var fx = fxc.getContext("2d", { alpha: true });

    // The words are rasterised at the resting size, so what you normally see
    // is one-to-one. Zooming in enlarges an already-drawn canvas, so the grid
    // is rendered with enough headroom that the characters stay crisp when it
    // does rather than turning into soft blocks.
    var dpr = Math.min(2.2, (window.devicePixelRatio || 1) * 1.4);
    var fdpr = Math.min(1.8, (window.devicePixelRatio || 1) * 1.2);

    var cols = 0, rows = 0, on = null, glyph = null, shade = null, tint = null;
    var bandW = 0, bandH = 0, gridW = 0, gridH = 0;
    var nx = 0, ny = 0;                       // where the pointer is, -1..1 each way
    var cx = 0, cy = 0;                       // where the block actually is
    var scale = REST, scaleTo = REST, zoomed = false;
    var live = false, queued = false, running = false, idleTimer = null;
    var track = null;

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

      /* The biggest type that fills the band when zoomed in. Measured once at
         100px and scaled, rather than guessed at and shrunk in a loop — a
         loop that only ever shrinks leaves the words far narrower than the
         space when height is the binding constraint, which here it always is.
         Both allowances are the visible band, not the whole grid, so the
         phrase fills the band at rest and the rest of the grid is the room it
         has to move in. */
      var visCols = cols / WIDE, visRows = rows / TALL;
      var lineH = visRows / (LINES.length + 0.28);
      o.font = "700 100px 'Arial Black', Impact, system-ui, sans-serif";
      var widest100 = 0;
      for (var i = 0; i < LINES.length; i++) widest100 = Math.max(widest100, o.measureText(LINES[i]).width);
      var byWidth = widest100 ? (visCols * 0.94) / widest100 * 100 : lineH;
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
      bandW = r.width;
      bandH = r.height;
      gridW = bandW * WIDE;
      gridH = bandH * TALL;
      stage.style.width = gridW + "px";
      stage.style.height = gridH + "px";
      stage.style.left = ((bandW - gridW) / 2) + "px";
      stage.style.top = ((bandH - gridH) / 2) + "px";
      base.width = Math.round(gridW * dpr);
      base.height = Math.round(gridH * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      fxc.width = Math.round(gridW * fdpr);
      fxc.height = Math.round(gridH * fdpr);
      fx.setTransform(fdpr, 0, 0, fdpr, 0, 0);
      build(gridW, gridH);
      return true;
    }

    /* How far it may travel: the overhang at the size it is now, capped so
       that pulled back it drifts rather than flies about, and only really
       opens up once you have zoomed in and there is somewhere to go. */
    function spanX(s) { return Math.min((gridW * s - bandW) / 2, bandW * 0.24 * s); }
    function spanY(s) { return Math.min((gridH * s - bandH) / 2, bandH * 0.2 * s); }

    function apply() {
      stage.style.transform =
        "translate3d(" + cx.toFixed(2) + "px," + cy.toFixed(2) + "px,0) scale(" + scale.toFixed(4) + ")";
    }

    function draw() {
      queued = false;
      if (!on) return;
      ctx.clearRect(0, 0, gridW + CELL_W, gridH + CELL_H);
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

    /* A running track: lanes around a straight, opening out from where the
       click landed and fading. It has its own coarser grid — same characters,
       written larger — so it reads as something laid over the words rather
       than dissolving into them. Only cells on a lane are touched, so this is
       a few hundred characters a frame on its own canvas rather than the
       thousands the words are made of. */
    function drawTrack(now) {
      var t = (now - track.t0) / TRACK_MS;
      fx.clearRect(0, 0, gridW + CELL_W, gridH + CELL_H);
      if (t >= 1) { track = null; return; }

      var grow = 1 - Math.pow(1 - t, 2.2);
      var R = track.max * grow;
      var straight = R * 0.9;                        // the two long sides
      var fade = Math.pow(1 - t, 1.15);

      fx.font = "600 " + (TRACK_H - 2) + "px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      fx.textBaseline = "top";

      var reach = R + straight + LANE_W + TRACK_W;
      var tc = Math.floor(gridW / TRACK_W), tr = Math.floor(gridH / TRACK_H);
      var x0 = Math.max(0, Math.floor((track.x - reach) / TRACK_W));
      var x1 = Math.min(tc - 1, Math.ceil((track.x + reach) / TRACK_W));
      var y0 = Math.max(0, Math.floor((track.y - R - LANE_W - TRACK_H) / TRACK_H));
      var y1 = Math.min(tr - 1, Math.ceil((track.y + R + LANE_W + TRACK_H) / TRACK_H));

      for (var y = y0; y <= y1; y++) {
        var dy = (y * TRACK_H + TRACK_H / 2) - track.y;
        for (var x = x0; x <= x1; x++) {
          // distance to the straight down the middle: a stadium, not a circle
          var dx = Math.abs((x * TRACK_W + TRACK_W / 2) - track.x) - straight;
          if (dx < 0) dx = 0;
          var d = Math.sqrt(dx * dx + dy * dy);
          for (var l = 0; l < LANES.length; l++) {
            if (Math.abs(d - R * LANES[l]) > LANE_W) continue;
            fx.fillStyle = "rgba(94, 80, 181, " + (fade * (0.92 - l * 0.19)).toFixed(3) + ")";
            fx.fillText(rand(), x * TRACK_W, y * TRACK_H);
            break;
          }
        }
      }
    }

    /* Catching up with the pointer is a transform on an already-drawn canvas,
       so a frame here costs the compositor and nothing else. */
    function step() {
      running = false;
      if (!live) return;
      var now = (window.performance && performance.now) ? performance.now() : +new Date();

      scale += (scaleTo - scale) * EASE;
      if (Math.abs(scaleTo - scale) < 0.002) scale = scaleTo;
      var tx = nx * spanX(scale);
      var ty = ny * spanY(scale);
      cx += (tx - cx) * EASE;
      cy += (ty - cy) * EASE;
      apply();

      if (track) drawTrack(now);
      var moving = Math.abs(tx - cx) > 0.3 || Math.abs(ty - cy) > 0.3 || scale !== scaleTo;
      if (moving || track) run();
    }

    function run() {
      if (running) return;
      running = true;
      requestAnimationFrame(step);
    }

    function onMove(e) {
      if (!live || reduced || !fine) return;
      // where the pointer is on screen: -1 at the left and top edges, 1 at the
      // right and bottom
      nx = Math.max(-1, Math.min(1, (e.clientX / window.innerWidth) * 2 - 1));
      ny = Math.max(-1, Math.min(1, (e.clientY / window.innerHeight) * 2 - 1));
      run();
    }

    function zoom(clientX, clientY) {
      zoomed = !zoomed;
      scaleTo = zoomed ? ZOOM : REST;
      host.style.cursor = zoomed ? "zoom-out" : "zoom-in";

      var r = stage.getBoundingClientRect();
      var k = r.width ? gridW / r.width : 0;

      /* Zooming in goes in on what was clicked, not on the middle. A pointer
         takes over again the moment it moves, so this is really for a finger:
         without it a tap on a phone would zoom into whatever happened to be
         in the centre and leave no way to go and look at anything else. */
      if (k) {
        if (zoomed) {
          var px = (clientX - r.left) * k - gridW / 2;
          var py = (clientY - r.top) * k - gridH / 2;
          nx = Math.max(-1, Math.min(1, -px * scaleTo / spanX(scaleTo)));
          ny = Math.max(-1, Math.min(1, -py * scaleTo / spanY(scaleTo)));
        } else if (!fine) {
          nx = ny = 0;                 // pulled back out, and nothing steering it
        }
      }

      if (!reduced) {
        // the click point, in the block's own unscaled coordinates, so the
        // track stays anchored to the characters as the block moves
        if (k) {
          track = {
            t0: (window.performance && performance.now) ? performance.now() : +new Date(),
            x: (clientX - r.left) * k,
            y: (clientY - r.top) * k,
            // a whole track, sitting inside the band rather than arcs of
            // something too big to recognise
            max: Math.min(bandW, bandH) * 0.44,
          };
        }
        run();
        return;
      }
      // less motion asked for: cut between the two sizes, do not travel
      scale = scaleTo;
      cx = nx * spanX(scale);
      cy = ny * spanY(scale);
      apply();
    }

    // A drag over the band is somebody scrolling the page, not somebody
    // asking for a different size.
    var down = null;
    host.addEventListener("pointerdown", function (e) {
      down = { x: e.clientX, y: e.clientY, t: (window.performance && performance.now) ? performance.now() : +new Date() };
    }, { passive: true });
    host.addEventListener("pointerup", function (e) {
      if (!down) return;
      var slip = Math.abs(e.clientX - down.x) + Math.abs(e.clientY - down.y);
      var quick = ((window.performance && performance.now) ? performance.now() : +new Date()) - down.t < 700;
      down = null;
      if (slip <= 14 && quick) zoom(e.clientX, e.clientY);
    }, { passive: true });
    host.addEventListener("pointercancel", function () { down = null; }, { passive: true });

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
      // is battery. It gets the still frame, and the tap.
      if (reduced || !fine) return;
      idleTimer = setInterval(idle, 420);
    }
    function stopIdle() { if (idleTimer) { clearInterval(idleTimer); idleTimer = null; } }

    if (!resize()) return false;
    apply();
    draw();

    // Only now is it worth clicking on — the stylesheet leaves the band
    // inert, so if any of this failed it stays the decoration it was.
    host.style.pointerEvents = "auto";
    host.style.cursor = "zoom-in";
    host.style.touchAction = "manipulation";

    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) {
        live = entries[0].isIntersecting;
        if (live) { startIdle(); run(); } else stopIdle();
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
        cx = cy = 0;
        track = null;
        apply();
        draw();
      }, 200);
    }, { passive: true });

    return true;
  }

  function start() {
    var hosts = document.querySelectorAll("[data-ascii]");
    for (var i = 0; i < hosts.length; i++) {
      var host = hosts[i];
      if (host.dataset.asciiReady) {
        if (!host.querySelector("canvas")) {
          delete host.dataset.asciiReady;         // repainted out from under us
        } else {
          // the repaint can leave the element but drop what was written on it
          if (host.style.pointerEvents !== "auto") host.style.pointerEvents = "auto";
          if (!/^zoom-/.test(host.style.cursor)) host.style.cursor = "zoom-in";
          continue;
        }
      }
      if (make(host)) host.dataset.asciiReady = "1";
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
  // the page is repainted by the design tool's runtime after this first runs
  document.addEventListener("cms:applied", start);
})();
