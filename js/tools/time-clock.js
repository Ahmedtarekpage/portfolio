/* time-clock.js — every time field on /time picks its time on a 3D clock (owner, 2026-11-21: "time has to be 3D clock").
   Tap a time box → a clay clock opens: tap (or drag round) the hour, then the minutes (5-minute steps),
   AM / PM, Set. The box keeps its normal value ("HH:MM") and gets the same input/change events as
   typing, so everything that listens to it keeps working. Typing with the keyboard still works:
   the clock opens on a tap or a click, not on Tab. */
(function () {
  "use strict";
  var T = window.T || function (en) { return en; };
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var el = null, target = null, mode = "h", h = 9, m = 0, pm = false, cleared = false;

  function build() {
    el = document.createElement("div");
    el.className = "clk"; el.hidden = true; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true");
    el.innerHTML =
      '<div class="clk__card">' +
        '<div class="clk__read"><button type="button" class="clk__hh" data-mode="h"></button><span>:</span><button type="button" class="clk__mm" data-mode="m"></button>' +
          '<div class="clk__ap"><button type="button" data-ap="am">' + T("AM", "ص") + '</button><button type="button" data-ap="pm">' + T("PM", "م") + '</button></div></div>' +
        '<p class="clk__hint"></p>' +
        '<div class="clk__stage"><div class="clk__face">' +
          '<div class="clk__rim"></div><div class="clk__nums"></div>' +
          '<div class="clk__hand"><i></i></div><div class="clk__pin"></div>' +
        '</div></div>' +
        '<div class="clk__btns"><button type="button" class="btn btn--ghost btn--sm" data-clk="clear">' + T("Clear", "امسح") + '</button>' +
          '<span></span><button type="button" class="btn btn--ghost btn--sm" data-clk="cancel">' + T("Cancel", "إلغاء") + '</button>' +
          '<button type="button" class="btn btn--primary btn--sm" data-clk="set">' + T("Set", "تمام") + '</button></div>' +
      '</div>';
    document.body.appendChild(el);
    el.addEventListener("click", function (ev) {
      if (ev.target === el) return close(false);
      var b = ev.target.closest("button"); if (!b) return;
      if (b.dataset.mode) { mode = b.dataset.mode; draw(); }
      if (b.dataset.ap) { pm = b.dataset.ap === "pm"; draw(); tick(); }
      if (b.dataset.clk === "cancel") close(false);
      if (b.dataset.clk === "clear") { cleared = true; close(true); }
      if (b.dataset.clk === "set") close(true);
      if (b.dataset.n != null) { pick(+b.dataset.n, true); }
    });
    // drag round the face
    var face = el.querySelector(".clk__face"), dragging = false;
    var fromPoint = function (ev) {
      var r = face.getBoundingClientRect(), x = ev.clientX - (r.left + r.width / 2), y = ev.clientY - (r.top + r.height / 2);
      var ang = (Math.atan2(x, -y) * 180 / Math.PI + 360) % 360;
      return mode === "h" ? (Math.round(ang / 30) % 12 || 12) : (Math.round(ang / 6) % 60);
    };
    face.addEventListener("pointerdown", function (ev) { if (ev.target.closest("[data-n]")) return; dragging = true; face.setPointerCapture(ev.pointerId); pick(fromPoint(ev), false); });
    face.addEventListener("pointermove", function (ev) {
      if (dragging) pick(fromPoint(ev), false);
      if (!reduce && ev.pointerType === "mouse") { // the face leans toward the pointer
        var r = face.getBoundingClientRect();
        face.style.setProperty("--ry", (((ev.clientX - r.left) / r.width - .5) * 16).toFixed(1) + "deg");
        face.style.setProperty("--rx", (-((ev.clientY - r.top) / r.height - .5) * 16).toFixed(1) + "deg");
      }
    });
    face.addEventListener("pointerleave", function () { face.style.removeProperty("--rx"); face.style.removeProperty("--ry"); });
    face.addEventListener("pointerup", function () { if (dragging) { dragging = false; if (mode === "h") { mode = "m"; draw(); } } });
    document.addEventListener("keydown", function (ev) { if (!el.hidden && ev.key === "Escape") close(false); if (!el.hidden && ev.key === "Enter") close(true); });
  }

  function tick() { try { if (navigator.vibrate) navigator.vibrate(6); } catch (e) {} }
  function pick(n, advance) {
    if (mode === "h") { h = n; if (advance) mode = "m"; }
    else { m = n; }
    tick(); draw();
  }
  var pad = function (n) { return String(n).padStart(2, "0"); };
  function draw() {
    el.querySelector(".clk__hh").textContent = h;
    el.querySelector(".clk__mm").textContent = pad(m);
    el.querySelector(".clk__hh").classList.toggle("is-on", mode === "h");
    el.querySelector(".clk__mm").classList.toggle("is-on", mode === "m");
    el.querySelectorAll("[data-ap]").forEach(function (b) { b.classList.toggle("is-on", (b.dataset.ap === "pm") === pm); });
    el.querySelector(".clk__hint").textContent = mode === "h" ? T("Pick the hour", "اختار الساعة") : T("Now the minutes", "دلوقتي الدقايق");
    var nums = el.querySelector(".clk__nums"), html = "";
    for (var i = 0; i < 12; i++) {
      var v = mode === "h" ? (i || 12) : i * 5, ang = i * 30 * Math.PI / 180;
      var x = 50 + 39 * Math.sin(ang), y = 50 - 39 * Math.cos(ang);
      var on = mode === "h" ? v === h : v === m;
      html += '<button type="button" class="clk__n' + (on ? " is-on" : "") + '" data-n="' + v + '" style="left:' + x + '%;top:' + y + '%">' + (mode === "h" ? v : pad(v)) + '</button>';
    }
    nums.innerHTML = html;
    var deg = mode === "h" ? (h % 12) * 30 : m * 6;
    el.querySelector(".clk__hand").style.transform = "rotate(" + deg + "deg)";
    el.querySelector(".clk__face").classList.toggle("is-min", mode === "m");
  }

  function open(input) {
    if (!el) build();
    target = input; cleared = false; mode = "h";
    var v = input.value;
    if (!/^\d\d:\d\d/.test(v)) { var d = new Date(); v = pad(d.getHours()) + ":" + pad(Math.ceil(d.getMinutes() / 5) * 5 % 60); }
    var hh = +v.slice(0, 2); m = Math.round(+v.slice(3, 5) / 5) * 5 % 60; pm = hh >= 12; h = hh % 12 || 12;
    el.hidden = false; draw();
    requestAnimationFrame(function () { el.classList.add("is-open"); });
    var set = el.querySelector('[data-clk="set"]'); if (set) set.focus({ preventScroll: true });
  }
  function close(apply) {
    if (!el || el.hidden) return;
    if (apply && target) {
      var hh = h % 12 + (pm ? 12 : 0);
      target.value = cleared ? "" : pad(hh) + ":" + pad(m);
      target.dispatchEvent(new Event("input", { bubbles: true }));
      target.dispatchEvent(new Event("change", { bubbles: true }));
    }
    el.classList.remove("is-open");
    var t = target; target = null;
    setTimeout(function () { el.hidden = true; if (t && t.focus) t.focus({ preventScroll: true }); }, reduce ? 0 : 180);
  }

  // a tap or click on any time box opens the clock instead of the browser's own picker
  document.addEventListener("pointerdown", function (ev) {
    var inp = ev.target.closest && ev.target.closest('input[type="time"]');
    if (!inp || inp.disabled || inp.readOnly || (el && el.contains(inp))) return;
    ev.preventDefault();
    open(inp);
  }, true);
  window.TimeClock = { open: open };
})();
