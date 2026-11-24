/* time-fx.js — the playful layer on /time (owner, 2026-11-21: "interactive everything,
   with comedian feedback"). It only watches what the page already does and reacts:
     · tiles and prayer cards tilt toward the pointer (3D)
     · buttons ripple; a tiny vibration on the phone
     · ticking a task: an emoji burst + a short Egyptian joke in a bubble
       (prayers and azkar get kind lines — never a joke about the prayer itself)
     · 100% day: a big celebration; the mascot bounces on every win
   Nothing here changes data. Respects reduced motion. */
(function () {
  "use strict";
  var T = window.T || function (en) { return en; };
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var fine = window.matchMedia && matchMedia("(hover: hover) and (pointer: fine)").matches;
  var pick = function (list) { return list[Math.floor(Math.random() * list.length)]; };

  var JOKES = {
    done: [
      T("Beast mode! ✅", "عاش يا وحش! ✅"),
      T("Done? Strong strong 🔥", "شطّبت؟ يا جامد يا جامد 🔥"),
      T("One more and you're a legend 😎", "واحدة كمان وتبقى أسطورة 😎"),
      T("That's how the day moves 🚀", "كده الدنيا بتمشي 🚀"),
      T("Who's like you today? 💪", "مين قدّك النهارده؟ 💪"),
      T("What an achievement, boss 👑", "إيه الإنجاز ده يا باشا 👑"),
      T("Smooth like molokhia 🥬", "ناعمة زي الملوخية 🥬"),
      T("The to-do list is scared of you now 😱", "قايمة المهام بقت بتخاف منك 😱"),
    ],
    prayer: [
      T("May Allah accept it 🤲", "تقبّل الله يا بطل 🤲"),
      T("On time! The day has baraka now ✨", "في وقتها! كده اليوم فيه بركة ✨"),
      T("May Allah accept — the rest gets easier 🕌", "ربنا يتقبّل.. والباقي هيبقى أسهل إن شاء الله 🕌"),
    ],
    azkar: [
      T("Azkar done — fully protected 🛡️", "الأذكار خلصت؟ اتحصّنت يا معلم 🛡️"),
      T("A strong fortress ✨", "حصن حصين ✨"),
    ],
    undo: [
      T("Changed your mind? No worries 😅", "رجعت في كلامك؟ ولا يهمك 😅"),
      T("Wait, were you joking? 🙃", "إيه يا عم، كنت بتهزر؟ 🙃"),
    ],
    half: [
      T("Half half… better than nothing 🌓", "نص نص.. أحسن من مفيش 🌓"),
      T("Half a win is still a win 🍕", "نص الانتصار انتصار برضه 🍕"),
    ],
    add: [
      T("New task? Big ambitions, chief 📈", "مهمة جديدة؟ طموحك عالي يا كبير 📈"),
      T("Added… let's crush it 💥", "اتضافت.. يلا نقضي عليها 💥"),
      T("The list grows, and so do you 🌱", "القايمة بتكبر وإنت كمان بتكبر 🌱"),
    ],
    del: [
      T("Deleted… like it never existed 🫥", "اتمسحت.. ولا كأنها كانت 🫥"),
      T("Bye bye, task 👋", "مع السلامة يا مهمة 👋"),
    ],
    all: [
      T("100% day! You're unreal 🎉", "يوم كامل 100%! ده إنت جامد جامد 🎉"),
      T("All done? Sleep like a champion 😴🏆", "خلّصت كله؟ نام وإنت مرتاح يا بطل 😴🏆"),
    ],
  };
  var BITS = { done: ["✨", "🎉", "⭐", "💥", "🔥"], prayer: ["🤍", "✨", "🌙", "⭐"], azkar: ["✨", "🌿", "🤍"], all: ["🎉", "🏆", "🥳", "✨", "💯", "🎊"], half: ["🌓", "✨"], add: ["➕", "✨"] };

  /* a tiny tap on the phone: vibrate where it exists, the iOS 18 switch trick on iPhone */
  var sw = null;
  function haptic() {
    try {
      if (navigator.vibrate) { navigator.vibrate(12); return; }
      if (!sw) {
        var lab = document.createElement("label"), inp = document.createElement("input");
        inp.type = "checkbox"; inp.setAttribute("switch", ""); lab.appendChild(inp);
        lab.style.cssText = "position:fixed;left:-99px;top:0;opacity:0;pointer-events:none"; document.body.appendChild(lab); sw = lab;
      }
      sw.click();
    } catch (e) {}
  }

  /* the joke bubble, next to where it happened */
  var quipEl = null, quipTimer = 0;
  function quip(text, at) {
    if (quipEl) quipEl.remove();
    clearTimeout(quipTimer);
    var q = document.createElement("div");
    q.className = "t3-quip"; q.textContent = text; q.setAttribute("role", "status");
    document.body.appendChild(q);
    var r = at && at.getBoundingClientRect ? at.getBoundingClientRect() : { left: innerWidth / 2, top: innerHeight / 2, width: 0 };
    var x = Math.min(innerWidth - q.offsetWidth - 12, Math.max(12, r.left + r.width / 2 - 20));
    var y = Math.max(12, r.top - q.offsetHeight - 12);
    q.style.left = x + "px"; q.style.top = y + "px";
    quipEl = q;
    quipTimer = setTimeout(function () { q.classList.add("out"); setTimeout(function () { q.remove(); }, 360); }, 2400);
  }

  /* emoji burst from a point */
  function burst(at, kind, n) {
    if (reduce) return;
    var r = at.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    var set = BITS[kind] || BITS.done;
    for (var i = 0; i < (n || 12); i++) {
      var b = document.createElement("span");
      b.className = "t3-bit"; b.textContent = pick(set);
      b.style.left = cx - 11 + "px"; b.style.top = cy - 11 + "px";
      document.body.appendChild(b);
      var ang = Math.random() * Math.PI * 2, dist = 50 + Math.random() * 90;
      var dx = Math.cos(ang) * dist, dy = Math.sin(ang) * dist - 40;
      b.animate([
        { transform: "translate(0,0) scale(.3) rotate(0deg)", opacity: 1 },
        { transform: "translate(" + dx * .7 + "px," + (dy * .7) + "px) scale(1.2) rotate(" + (Math.random() * 180 - 90) + "deg)", opacity: 1, offset: .55 },
        { transform: "translate(" + dx + "px," + (dy + 70) + "px) scale(.6) rotate(" + (Math.random() * 360 - 180) + "deg)", opacity: 0 },
      ], { duration: 900 + Math.random() * 400, easing: "cubic-bezier(.2,.7,.3,1)" }).onfinish = function () { this.effect.target.remove(); };
    }
  }

  function boing() {
    var m = document.getElementById("mascotChar");
    if (!m || reduce) return;
    m.classList.remove("t3-boing"); void m.offsetWidth; m.classList.add("t3-boing");
    window.dispatchEvent(new CustomEvent("time:cheer"));
  }

  function kindOf(title) {
    title = String(title || "");
    if (/azkar|adhkar|أذكار|اذكار/i.test(title)) return "azkar";
    if (/fajr|dohr|dhuhr|zuhr|\basr\b|maghrib|isha|pray|صلا|فجر|ظهر|عصر|مغرب|عشاء/i.test(title)) return "prayer";
    return "done";
  }

  /* ---- what the person does ---- */
  document.addEventListener("change", function (ev) {
    var c = ev.target;
    if (!c.classList || !c.classList.contains("task-row__check")) return;
    var row = c.closest(".task-row"), title = row && row.querySelector(".task-row__title") ? row.querySelector(".task-row__title").textContent : "";
    haptic();
    if (c.checked) { var k = kindOf(title); burst(c, k); quip(pick(JOKES[k]), c); boing(); }
    else quip(pick(JOKES.undo), c);
  }, true);

  var lastClick = { kind: "", at: 0 };
  document.addEventListener("click", function (ev) {
    var b = ev.target.closest && ev.target.closest("button, .btn, .tab");
    if (!b) return;
    // ripple from the finger
    if (!reduce && (b.classList.contains("btn") || b.classList.contains("tab"))) {
      var r = b.getBoundingClientRect(), s = Math.max(r.width, r.height);
      var rp = document.createElement("span"); rp.className = "t3-ripple";
      rp.style.cssText = "width:" + s + "px;height:" + s + "px;left:" + (ev.clientX - r.left - s / 2) + "px;top:" + (ev.clientY - r.top - s / 2) + "px";
      if (getComputedStyle(b).position === "static") b.style.position = "relative";
      b.style.overflow = "hidden"; b.appendChild(rp); setTimeout(function () { rp.remove(); }, 600);
    }
    if (b.classList.contains("tab")) haptic();
    if (b.classList.contains("iconbtn--half") && b.getAttribute("aria-pressed") !== "true") { burst(b, "half", 6); quip(pick(JOKES.half), b); haptic(); }
    if (b.id === "btnTaskSubmit") lastClick = { kind: "add", at: Date.now(), el: b };
    if (b.closest(".task-row") && b.title && /delete|مسح/i.test(b.title)) lastClick = { kind: "del", at: Date.now(), el: b.closest(".task-list") };
  }, true);

  /* the list grew or shrank right after Add / ✕ → the matching joke */
  var lastCount = -1;
  function watchList() {
    var list = document.getElementById("taskList");
    if (!list) return;
    new MutationObserver(function () {
      var n = list.querySelectorAll(".task-row").length;
      var recent = Date.now() - lastClick.at < 5000;
      if (recent && lastClick.kind === "add" && n > lastCount && lastCount >= 0) { quip(pick(JOKES.add), lastClick.el); burst(lastClick.el, "add", 6); lastClick.at = 0; }
      if (recent && lastClick.kind === "del" && n < lastCount) { quip(pick(JOKES.del), lastClick.el); lastClick.at = 0; }
      lastCount = n;
    }).observe(list, { childList: true });
  }

  /* 100%: the big moment, once per climb */
  var wasAll = null;
  window.addEventListener("time:day", function (e) {
    var all = e.detail.total > 0 && e.detail.pct >= 100;
    if (all && wasAll === false) {
      var box = document.getElementById("dayPercent") || document.body;
      setTimeout(function () { burst(box, "all", 28); quip(pick(JOKES.all), box); boing(); haptic(); }, 350);
    }
    wasAll = all;
  });

  /* 3D tilt toward the pointer: tiles, prayer cards */
  if (fine && !reduce) {
    var TILT = ".tile, .prayer-bar__t";
    document.addEventListener("pointermove", function (ev) {
      var el = ev.target.closest && ev.target.closest(TILT);
      if (!el) return;
      var r = el.getBoundingClientRect();
      var px = (ev.clientX - r.left) / r.width - .5, py = (ev.clientY - r.top) / r.height - .5;
      el.style.setProperty("--ry", (px * 14).toFixed(2) + "deg");
      el.style.setProperty("--rx", (-py * 14).toFixed(2) + "deg");
    }, { passive: true });
    document.addEventListener("pointerout", function (ev) {
      var el = ev.target.closest && ev.target.closest(TILT);
      if (el && !el.contains(ev.relatedTarget)) { el.style.removeProperty("--rx"); el.style.removeProperty("--ry"); }
    }, { passive: true });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", watchList); else watchList();
  window.TimeFX = { quip: quip, burst: burst, haptic: haptic };
})();
