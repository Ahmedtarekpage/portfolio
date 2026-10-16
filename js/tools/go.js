/* The "go" kit for the signed-in tools: sound, tile pickers and wizards.

   GoBachaloria's house style, brought here on request (owner, 2026-10-16):
   every press makes a soft sound, choices are big tiles rather than
   dropdowns, and a form asks one question at a time and ends on a review.

   It sits on top of the pages' own markup and logic. A wizard only shows and
   hides the fields its form already has, and a tile picker writes into the
   select or input it stands for, so every submit handler, name and value in
   admin.js stays exactly as it was.

   Exposes window.Go = { play, wizard: { restart, review, sync }, sync }. */
(function () {
  "use strict";

  /* ---------------- sound ----------------
     Synthesised, not downloaded: two or three notes each. Built on the first
     press, which is the only moment a browser lets audio start. */
  var KEY = "tools-sound";
  var NOTE = 0.13;
  var RECIPES = {
    tap: { type: "triangle", gain: 0.035, notes: [[784, 0]] },
    open: { type: "sine", gain: 0.04, notes: [[523.25, 0], [783.99, 0.05]] },
    success: { type: "sine", gain: 0.05, notes: [[523.25, 0], [659.25, 0.08], [783.99, 0.16], [1046.5, 0.24]] },
    coin: { type: "square", gain: 0.028, notes: [[987.77, 0], [1318.51, 0.07]] },
    error: { type: "sawtooth", gain: 0.035, notes: [[196, 0], [164.81, 0.09]] },
  };
  var ctx = null;
  var lastAsked = 0;
  var lastClick = 0;
  var on = (function () { try { return localStorage.getItem(KEY) !== "off"; } catch (e) { return true; } })();

  function paperTurn(c) {
    var now = c.currentTime, len = 0.42;
    var buf = c.createBuffer(1, Math.floor(c.sampleRate * len), c.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (Math.random() < 0.08 ? 1 : 0.45);
    [[0, 0.3, 900, 4200, 0.16], [0.22, 0.18, 2600, 1200, 0.07]].forEach(function (l) {
      var src = c.createBufferSource(); src.buffer = buf;
      var band = c.createBiquadFilter(); band.type = "bandpass"; band.Q.value = 0.9;
      band.frequency.setValueAtTime(l[2], now + l[0]);
      band.frequency.exponentialRampToValueAtTime(l[3], now + l[0] + l[1]);
      var high = c.createBiquadFilter(); high.type = "highpass"; high.frequency.value = 500;
      var env = c.createGain();
      env.gain.setValueAtTime(0.0001, now + l[0]);
      env.gain.exponentialRampToValueAtTime(l[4], now + l[0] + l[1] * 0.3);
      env.gain.exponentialRampToValueAtTime(0.0001, now + l[0] + l[1]);
      src.connect(band).connect(high).connect(env).connect(c.destination);
      src.start(now + l[0], 0, l[1] + 0.02);
    });
  }

  function play(name) {
    lastAsked = performance.now();
    if (!on) return;
    try {
      var Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return;
      ctx = ctx || new Ctor();
      if (ctx.state === "suspended") ctx.resume();
      if (name === "page") { paperTurn(ctx); return; }
      var r = RECIPES[name];
      if (!r) return;
      var now = ctx.currentTime;
      r.notes.forEach(function (n) {
        var o = ctx.createOscillator(), g = ctx.createGain();
        o.type = r.type; o.frequency.value = n[0];
        var start = now + n[1], end = start + NOTE;
        g.gain.setValueAtTime(0.0001, start);
        g.gain.exponentialRampToValueAtTime(r.gain, start + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, end);
        o.connect(g).connect(ctx.destination);
        o.start(start); o.stop(end + 0.02);
      });
    } catch (e) { /* no sound is not a broken page */ }
  }
  var justPlayed = function () { return performance.now() - lastAsked < 120; };

  function setSound(v) {
    on = v;
    try { localStorage.setItem(KEY, v ? "on" : "off"); } catch (e) {}
    syncSoundButtons();
    if (v) play("tap");
  }
  function syncSoundButtons() {
    document.querySelectorAll(".go-sound").forEach(function (b) {
      b.textContent = on ? "🔊" : "🔇";
      b.setAttribute("aria-label", on ? "Turn sounds off" : "Turn sounds on");
      b.title = b.getAttribute("aria-label");
    });
  }
  /* a sound switch beside every theme switch, and wherever a page asks for one */
  function addSoundButtons() {
    document.querySelectorAll(".theme-toggle").forEach(function (t) {
      if (t.previousElementSibling && t.previousElementSibling.classList.contains("go-sound")) return;
      var b = document.createElement("button");
      b.type = "button";
      b.className = "btn btn--ghost btn--sm go-sound";
      t.parentNode.insertBefore(b, t);
    });
    document.addEventListener("click", function (ev) {
      var b = ev.target.closest(".go-sound");
      if (b) { ev.preventDefault(); setSound(!on); lastAsked = performance.now(); }
    }, true);
    syncSoundButtons();
  }

  /* every press makes a sound, unless the thing pressed already made its own */
  document.addEventListener("click", function (ev) {
    var el = ev.target.closest("button, a.btn, a.go-home__tile, summary, [role=tab], .client-card, .chip, .go-pick, .iconbtn");
    if (!el) return;
    lastClick = performance.now();
    if (el.disabled || el.classList.contains("go-sound")) return;
    setTimeout(function () {
      if (justPlayed()) return;
      var s = el.getAttribute("data-sound");
      if (!s) s = el.tagName === "SUMMARY" ? (el.parentNode.open ? "open" : "tap") : el.classList.contains("go-home__tile") || el.classList.contains("client-card") ? "open" : "tap";
      play(s);
    }, 0);
  });

  /* the toast says how things went, so it carries the sound of it */
  function watchToast() {
    var t = document.getElementById("toast");
    if (!t) return;
    var last = "";
    new MutationObserver(function () {
      if (t.hidden) { last = ""; return; }
      var key = t.className + "|" + t.textContent;
      if (key === last) return;
      last = key;
      var bad = /toast--error/.test(t.className);
      play(bad ? "error" : "success");
      t.classList.remove("go-pop"); void t.offsetWidth; t.classList.add("go-pop");
      if (bad) shake(t);
      else {
        // from the press that saved it, if there was one just now
        var r = t.getBoundingClientRect();
        var fresh = performance.now() - lastPoint.t < 4000;
        burst(fresh ? lastPoint.x : r.left + r.width / 2, fresh ? lastPoint.y : r.top, 26, ["🎉", "✨"]);
      }
    }).observe(t, { attributes: true, attributeFilter: ["hidden", "class"], childList: true, characterData: true, subtree: true });
  }

  /* a new screen the reader asked for turns like a page */
  function watchViews() {
    document.querySelectorAll(".view").forEach(function (v) {
      new MutationObserver(function () {
        if (v.hidden || v.id === "view-loading") return;
        if (performance.now() - lastClick < 2500 && performance.now() - lastAsked > 250) play("page");
      }).observe(v, { attributes: true, attributeFilter: ["hidden"] });
    });
  }

  /* ---------------- tile pickers ----------------
     <select data-picks> becomes a row of big tiles (option data-glyph adds an
     emoji); <input data-quick="1,5,10"> gets quick-answer chips under it. The
     original field stays in the form, hidden or not, and keeps the value. */
  function fire(el) {
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function buildPicks(sel) {
    var box = sel._goPicks;
    if (!box) {
      box = document.createElement("div");
      box.className = "go-picks";
      box.setAttribute("role", "group");
      sel.insertAdjacentElement("afterend", box);
      sel.hidden = true;
      sel._goPicks = box;
      box.addEventListener("click", function (ev) {
        var b = ev.target.closest(".go-pick");
        if (!b) return;
        sel.value = b.getAttribute("data-value");
        fire(sel);
        syncPicks(sel);
        play("tap");
      });
    }
    var opts = Array.prototype.slice.call(sel.options).filter(function (o) { return o.value !== "" || sel.hasAttribute("data-picks-empty"); });
    var sig = opts.map(function (o) { return o.value + "=" + o.text; }).join("|");
    if (box._sig !== sig) {
      box._sig = sig;
      box.innerHTML = opts.map(function (o) {
        var g = o.getAttribute("data-glyph");
        return '<button type="button" class="go-pick" aria-pressed="false" data-value="' + esc(o.value) + '">' +
          (g ? '<span class="go-pick__glyph" aria-hidden="true">' + esc(g) + "</span>" : "") + "<span>" + esc(o.text) + "</span></button>";
      }).join("");
    }
    syncPicks(sel);
  }
  function syncPicks(sel) {
    if (!sel._goPicks) return;
    sel._goPicks.querySelectorAll(".go-pick").forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.getAttribute("data-value") === sel.value));
    });
  }

  function buildQuick(input) {
    var box = input._goQuick;
    if (!box) {
      box = document.createElement("div");
      box.className = "go-quick";
      var suffix = input.getAttribute("data-quick-suffix") || "";
      box.innerHTML = input.getAttribute("data-quick").split(",").map(function (v) {
        v = v.trim();
        return '<button type="button" class="chip" aria-pressed="false" data-value="' + esc(v) + '">' + esc(v + suffix) + "</button>";
      }).join("");
      (input.closest("label") || input).insertAdjacentElement("afterend", box);
      input._goQuick = box;
      box.addEventListener("click", function (ev) {
        var b = ev.target.closest(".chip");
        if (!b) return;
        input.value = b.getAttribute("data-value");
        fire(input);
        syncQuick(input);
        play("tap");
      });
      input.addEventListener("input", function () { syncQuick(input); });
    }
    syncQuick(input);
  }
  function syncQuick(input) {
    if (!input._goQuick) return;
    input._goQuick.querySelectorAll(".chip").forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.getAttribute("data-value").toLowerCase() === String(input.value).toLowerCase()));
    });
  }

  function sync(root) {
    (root || document).querySelectorAll("select[data-picks]").forEach(buildPicks);
    (root || document).querySelectorAll("input[data-quick]").forEach(buildQuick);
  }

  /* ---------------- wizards ----------------
     <form data-wizard> whose children are <fieldset class="go-wiz__step"
     data-title data-hint data-glyph [data-optional] [data-two]>. The last
     child with .go-wiz__actions holds the submit button (and any extra
     buttons); it moves into the review step. */
  var wizards = [];

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function visibleIn(el, step) {
    for (var n = el; n && n !== step; n = n.parentElement) {
      if (n.hidden && !(n.tagName === "SELECT" && n._goPicks)) return false;
      if (n.classList && n.classList.contains("is-off")) return false;
    }
    return true;
  }

  function fieldsOf(step) {
    return Array.prototype.slice.call(step.querySelectorAll("input, select, textarea")).filter(function (el) {
      return el.type !== "hidden" && visibleIn(el, step);
    });
  }

  function answerOf(el) {
    if (el.tagName === "SELECT") return el.value === "" ? "" : (el.options[el.selectedIndex] || {}).text || "";
    if (el.type === "file") return Array.prototype.map.call(el.files || [], function (f) { return "📎 " + f.name; }).join(", ");
    if (el.type === "checkbox" || el.type === "radio") return el.checked ? "Yes" : "";
    if (el.type === "date" && el.value) {
      var d = new Date(el.value + "T00:00:00Z");
      return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
    }
    var v = String(el.value || "").trim();
    var suffix = el.getAttribute("data-quick-suffix");
    return v && suffix ? v + suffix : v;
  }

  function Wizard(form) {
    var self = this;
    this.form = form;
    this.steps = Array.prototype.slice.call(form.querySelectorAll(":scope > .go-wiz__step"));
    this.i = 0;
    form.classList.add("go-wiz");
    form.noValidate = true;

    this.steps.forEach(function (step) {
      var body = document.createElement("div");
      body.className = "go-wiz__fields" + (step.hasAttribute("data-two") ? " go-wiz__fields--two" : "");
      while (step.firstChild) body.appendChild(step.firstChild);
      var opt = step.hasAttribute("data-optional");
      var head = document.createElement("div");
      head.className = "go-wiz__head";
      head.innerHTML = '<span class="go-wiz__glyph" aria-hidden="true">' + esc(step.getAttribute("data-glyph") || "✏️") + "</span>" +
        '<div><div class="go-wiz__title">' + esc(step.getAttribute("data-title")) +
        '<span class="go-tag ' + (opt ? "go-tag--opt" : "go-tag--req") + '">' + (opt ? "Optional" : "Required") + "</span></div>" +
        (step.getAttribute("data-hint") ? '<p class="go-wiz__hint">' + esc(step.getAttribute("data-hint")) + "</p>" : "") + "</div>";
      step.appendChild(head);
      step.appendChild(body);
    });

    // the review: every answer, each with a Change button
    var review = document.createElement("div");
    review.className = "go-wiz__step";
    review.innerHTML = '<div class="go-wiz__head"><span class="go-wiz__glyph" aria-hidden="true">✅</span><div><div class="go-wiz__title">' +
      esc(form.getAttribute("data-review-title") || "All good?") + '</div><p class="go-wiz__hint">' +
      esc(form.getAttribute("data-review-hint") || "Check your answers. Tap Change to fix one.") + "</p></div></div>" +
      '<div class="go-wiz__review"></div>';
    this.reviewEl = review;
    this.actions = form.querySelector(":scope > .go-wiz__actions");
    form.insertBefore(review, this.actions);
    // anything a page puts in a step's .go-wiz__after (a live preview) shows again on the review
    this.extras = Array.prototype.slice.call(form.querySelectorAll("[data-wiz-review]"));

    var top = document.createElement("div");
    top.className = "go-wiz__top";
    top.innerHTML = '<span class="go-wiz__count"></span><span class="go-wiz__bar"><i></i></span>';
    form.insertBefore(top, form.firstChild);
    this.count = top.querySelector(".go-wiz__count");
    this.bar = top.querySelector("i");

    var nav = document.createElement("div");
    nav.className = "go-wiz__nav";
    nav.innerHTML = '<button type="button" class="btn btn--ghost go-wiz__back" data-sound="page">← Back</button>' +
      '<button type="button" class="btn btn--primary go-wiz__next">Continue →</button>';
    form.insertBefore(nav, this.actions);
    this.nav = nav;
    this.back = nav.querySelector(".go-wiz__back");
    this.next = nav.querySelector(".go-wiz__next");
    // the page's own buttons (submit, cancel) live in the nav; submit only on the review
    this.send = this.actions ? this.actions.querySelector('[type="submit"]') : null;
    if (this.actions) {
      Array.prototype.slice.call(this.actions.children).forEach(function (b) { nav.appendChild(b); });
      this.actions.remove();
    }
    if (this.send) { this.send.classList.add("btn--hero", "go-wiz__send"); this.send.classList.remove("btn--primary"); }

    this.back.addEventListener("click", function () { self.go(self.i - 1, -1); });
    this.next.addEventListener("click", function () { self.forward(); });
    review.addEventListener("click", function (ev) {
      var b = ev.target.closest("[data-goto]");
      if (b) self.go(Number(b.getAttribute("data-goto")), -1);
    });
    // after a reset, back to the first question — unless the page says where to go next (same tick)
    form.addEventListener("reset", function () { clearTimeout(self._t); self._t = setTimeout(function () { self.go(0, 0, true); }, 0); });
    form.addEventListener("change", function () { sync(form); });
    form._goWizard = this;
    wizards.push(this);
    this.go(0, 0, true);
  }

  Wizard.prototype.atReview = function () { return this.i === this.steps.length; };

  Wizard.prototype.valid = function () {
    var step = this.steps[this.i];
    if (!step) return true;
    var bad = fieldsOf(step).filter(function (el) { return !el.checkValidity(); })[0];
    if (!bad) return true;
    play("error");
    shake(step);
    if (bad.hidden && bad._goPicks) {
      bad._goPicks.classList.remove("go-pop"); void bad._goPicks.offsetWidth; bad._goPicks.classList.add("go-pop");
    } else bad.reportValidity();
    return false;
  };

  Wizard.prototype.forward = function () {
    if (!this.valid()) return;
    this.go(this.i + 1, 1);
  };

  // a step with nothing to answer right now (editing one meeting of a series
  // has no repeat question) is stepped over, both ways
  Wizard.prototype.empty = function (k) {
    return k < this.steps.length && !fieldsOf(this.steps[k]).length;
  };

  Wizard.prototype.go = function (i, dir, quiet) {
    var self = this;
    var last = this.steps.length;
    i = Math.max(0, Math.min(last, i));
    var step = dir < 0 ? -1 : 1;
    while (this.empty(i) && i + step >= 0 && i + step <= last) i += step;
    if (this.empty(i)) while (this.empty(i) && i < last) i++;
    this.i = i;
    this.steps.concat([this.reviewEl]).forEach(function (s, k) {
      s.hidden = k !== i;
      s.classList.remove("is-in");
    });
    var cur = i === last ? this.reviewEl : this.steps[i];
    cur.style.setProperty("--go-step-from", (dir < 0 ? -36 : 36) + "px");
    void cur.offsetWidth;
    cur.classList.add("is-in");
    if (i === last) this.renderReview();
    this.extras.forEach(function (x) {
      // a live preview sits in its own step; on the review it is shown under the answers
      if (i === last) self.reviewEl.appendChild(x); else if (x._home) x._home.appendChild(x);
    });
    var live = this.steps.map(function (s, k) { return k; }).filter(function (k) { return !self.empty(k); });
    var at = live.indexOf(i);
    this.count.textContent = i === last ? "Last check" : "Step " + (at + 1) + " of " + live.length;
    this.bar.style.width = (i === last ? 100 : Math.round((at / live.length) * 100)) + "%";
    var first = 0;
    while (this.empty(first)) first++;
    this.back.hidden = i <= first;
    this.next.hidden = i === last;
    if (this.send) this.send.hidden = i !== last;
    sync(this.form);
    if (!quiet) {
      play(dir > 0 && i === last ? "coin" : "page");
      var focus = cur.querySelector("input:not([hidden]):not([type=file]), .go-pick, .chip, select:not([hidden])");
      if (focus && window.matchMedia("(pointer: fine)").matches) focus.focus({ preventScroll: true });
      var r = this.form.getBoundingClientRect();
      if (r.top < 0 || r.top > window.innerHeight * 0.6) this.form.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  Wizard.prototype.renderReview = function () {
    var self = this;
    this.reviewEl.querySelector(".go-wiz__review").innerHTML = this.steps.map(function (step, k) {
      if (self.empty(k)) return "";
      var answers = fieldsOf(step).map(answerOf).filter(Boolean);
      var empty = !answers.length;
      return '<div class="go-wiz__row' + (empty ? " go-wiz__row--empty" : "") + '"><b>' + esc(step.getAttribute("data-title")) + "</b>" +
        "<span>" + (empty ? "Skipped" : esc(answers.join("  ·  "))) + "</span>" +
        '<button type="button" class="btn btn--ghost btn--sm" data-goto="' + k + '">Change</button></div>';
    }).join("");
  };

  // a submit before the review (Enter in a field) just moves on a step
  document.addEventListener("submit", function (ev) {
    var w = ev.target._goWizard;
    if (w && !w.atReview()) {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      w.forward();
    }
  }, true);

  /* ---------------- motion pack (owner, 2026-10-16: "a lot of motion graphics and sound") ----------------
     Everything here answers something the reader did or something that just
     changed: a press ripples, a save bursts, numbers count up, a ticked task
     pops. With reduced motion asked for, none of it runs. */
  var calm = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var lastPoint = { x: innerWidth / 2, y: innerHeight / 2, t: 0 };

  // a ring of ink from where the finger landed
  function ripple(ev) {
    var el = ev.target.closest(".btn, .go-pick, .chip, .go-home__tile, .client-card, .tab");
    if (!el || el.disabled) return;
    var r = el.getBoundingClientRect();
    var size = Math.max(r.width, r.height) * 2.2;
    var ink = document.createElement("span");
    ink.className = "go-ripple";
    ink.style.width = ink.style.height = size + "px";
    ink.style.left = ev.clientX - r.left - size / 2 + "px";
    ink.style.top = ev.clientY - r.top - size / 2 + "px";
    el.appendChild(ink);
    setTimeout(function () { ink.remove(); }, 650);
  }

  // confetti: dots in the brand colours and a few sparkles, from a point
  var BITS = ["#2563eb", "#ffb020", "#1fa876", "#5b93ff", "#ffcf6b"];
  function burst(x, y, n, glyphs) {
    if (calm) return;
    n = n || 22;
    var layer = document.createElement("div");
    layer.className = "go-burst";
    layer.setAttribute("aria-hidden", "true");
    document.body.appendChild(layer);
    for (var i = 0; i < n; i++) {
      var b = document.createElement("i");
      var glyph = glyphs && i % 4 === 0 ? glyphs[i % glyphs.length] : null;
      if (glyph) { b.textContent = glyph; b.className = "go-burst__glyph"; }
      else {
        b.style.background = BITS[i % BITS.length];
        var s = 5 + Math.random() * 6;
        b.style.width = s + "px"; b.style.height = (Math.random() < 0.5 ? s : s * 0.45) + "px";
        if (Math.random() < 0.5) b.style.borderRadius = "50%";
      }
      b.style.left = x + "px"; b.style.top = y + "px";
      layer.appendChild(b);
      var a = Math.random() * Math.PI * 2, d = 60 + Math.random() * 120;
      var dx = Math.cos(a) * d, dy = Math.sin(a) * d - 40;
      b.animate([
        { transform: "translate(-50%,-50%) scale(0.4) rotate(0deg)", opacity: 1 },
        { transform: "translate(calc(-50% + " + dx + "px), calc(-50% + " + dy + "px)) scale(1) rotate(" + (Math.random() * 360) + "deg)", opacity: 1, offset: 0.55 },
        { transform: "translate(calc(-50% + " + dx * 1.15 + "px), calc(-50% + " + (dy + 90) + "px)) scale(0.8) rotate(" + (Math.random() * 720) + "deg)", opacity: 0 },
      ], { duration: 900 + Math.random() * 400, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "forwards" });
    }
    setTimeout(function () { layer.remove(); }, 1500);
  }

  // numbers that changed count up to their new value: "8.5h", "500 USD", "14h"
  function countUp(el) {
    if (calm || el._goCounted === el.textContent) return;
    var text = el.textContent;
    var m = /^([^\d-]*)(-?[\d,]*\.?\d+)(.*)$/.exec(text);
    if (!m) return;
    var target = Number(m[2].replace(/,/g, ""));
    if (!isFinite(target) || target === 0) { el._goCounted = text; return; }
    var decimals = (m[2].split(".")[1] || "").length;
    var commas = m[2].indexOf(",") !== -1;
    var t0 = performance.now(), dur = 700;
    el._goCounted = text;
    (function frame(now) {
      var k = Math.min(1, (now - t0) / dur);
      var v = target * (1 - Math.pow(1 - k, 3));
      var shown = decimals ? v.toFixed(decimals) : String(Math.round(v));
      if (commas) shown = Number(shown).toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
      el.textContent = m[1] + shown + m[3];
      el._goCounted = el.textContent;
      if (k < 1) requestAnimationFrame(frame);
      else { el.textContent = text; el._goCounted = text; }
    })(t0);
  }
  function watchCounts() {
    var sel = ".tile__value, .client-card__hours b, .chip__n";
    var run = function (root) { (root.querySelectorAll ? root : document).querySelectorAll(sel).forEach(countUp); };
    new MutationObserver(function (list) {
      list.forEach(function (r) {
        r.addedNodes.forEach(function (n) {
          if (n.nodeType !== 1) return;
          if (n.matches && n.matches(sel)) countUp(n); else run(n);
        });
      });
    }).observe(document.body, { childList: true, subtree: true });
  }

  // cards lean toward the pointer, a little
  function tilt(ev) {
    var el = ev.target.closest && ev.target.closest(".go-home__tile, .client-card, .tile, .countdown");
    document.querySelectorAll(".go-tilting").forEach(function (o) {
      if (o !== el) { o.classList.remove("go-tilting"); o.style.transform = ""; }
    });
    if (!el) return;
    var r = el.getBoundingClientRect();
    var px = (ev.clientX - r.left) / r.width - 0.5, py = (ev.clientY - r.top) / r.height - 0.5;
    el.classList.add("go-tilting");
    el.style.transform = "perspective(900px) rotateX(" + (-py * 5).toFixed(2) + "deg) rotateY(" + (px * 6).toFixed(2) + "deg) translateY(-3px)";
  }

  // a shake for "no"
  function shake(el) {
    if (calm || !el) return;
    el.classList.remove("go-shake"); void el.offsetWidth; el.classList.add("go-shake");
    setTimeout(function () { el.classList.remove("go-shake"); }, 500);
  }

  // the loader says something new while it waits
  function loaderTalk() {
    var lines = ["Loading…", "Climbing to your data…", "Almost at the top…", "Nearly there…"];
    var i = 0;
    setInterval(function () {
      document.querySelectorAll(".go-loader-view:not([hidden]) .go-loader__text").forEach(function (p) {
        i = (i + 1) % lines.length;
        p.classList.remove("go-swap"); void p.offsetWidth; p.classList.add("go-swap");
        p.textContent = lines[i];
      });
    }, 1400);
  }

  function setupMotion() {
    document.addEventListener("pointerdown", function (ev) {
      lastPoint = { x: ev.clientX, y: ev.clientY, t: performance.now() };
      if (!calm) ripple(ev);
    }, true);
    if (!calm && window.matchMedia("(pointer: fine)").matches) {
      document.addEventListener("pointermove", tilt, { passive: true });
      document.addEventListener("pointerleave", function () { tilt({ target: document.body }); });
    }
    watchCounts();
    loaderTalk();
    // a ticked box is a small win: a coin and a pop of confetti
    document.addEventListener("change", function (ev) {
      var t = ev.target;
      if (t.type !== "checkbox" || !t.checked || t.closest(".go-sound")) return;
      if (!t.matches(".task-row__check, .milestone-row__check")) return;
      var r = t.getBoundingClientRect();
      play("coin");
      burst(r.left + r.width / 2, r.top + r.height / 2, 16, ["✨", "⭐"]);
      var row = t.closest("li, .task-row, tr");
      if (row && !calm) { row.classList.remove("go-done"); void row.offsetWidth; row.classList.add("go-done"); }
    });
    // switching theme makes a sound and sweeps the page
    document.addEventListener("click", function (ev) {
      if (!ev.target.closest(".theme-toggle")) return;
      setTimeout(function () { play("open"); }, 0);
      if (calm) return;
      var sweep = document.createElement("div");
      sweep.className = "go-sweep";
      sweep.style.setProperty("--x", ev.clientX + "px");
      sweep.style.setProperty("--y", ev.clientY + "px");
      document.body.appendChild(sweep);
      setTimeout(function () { sweep.remove(); }, 700);
    });
  }

  function init() {
    document.querySelectorAll("[data-wiz-review]").forEach(function (x) { x._home = x.parentNode; });
    document.querySelectorAll("form[data-wizard]").forEach(function (f) { if (!f._goWizard) new Wizard(f); });
    sync();
    setupMotion();
    addSoundButtons();
    watchToast();
    watchViews();
  }

  window.Go = {
    play: play,
    burst: burst,
    shake: shake,
    sync: sync,
    wizard: {
      restart: function (form) { var w = form && form._goWizard; if (w) { clearTimeout(w._t); w.go(0, 0, true); } },
      review: function (form) { var w = form && form._goWizard; if (w) { clearTimeout(w._t); w.go(w.steps.length, 0, true); } },
    },
  };

  // loaded at the end of <body>, before the page's own script: the forms are there
  init();
})();
