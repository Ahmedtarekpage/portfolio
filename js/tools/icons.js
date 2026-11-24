/* One icon language for every private tool.

   The pages were written with emoji as icons, and emoji come in every colour
   and every drawing style the phone maker chose. This file turns them into one
   family at display time, without touching the words in the source:

     1. the icons that carry the interface (tabs, tiles, buttons: ticket,
        calendar, coin, chart...) are redrawn as two-tone line icons, the same
        weight and corner everywhere; the second tone is the brand coral
     2. every other emoji (faces, food, small decorations) is kept but tinted
        into the same warm tone, so nothing arrives in a foreign colour
     3. flags and the coloured status dots are left exactly as they are: their
        colours ARE the information

   The original character stays in the page, hidden, so anything that reads a
   button's text (the sound toggle, the theme toggle) and anything copied to
   the clipboard still gets the emoji. Runs on what is in the page at load and
   on whatever the page draws later. */
(function () {
  "use strict";
  if (window.__tideIcons) return;
  window.__tideIcons = true;

  var C9 = "M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z";
  // name: [main strokes, accent strokes]
  var D = {
    ticket: ["M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4z", "M14 6v2M14 11v2M14 16v2"],
    calendar: ["M6 5h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM8 3v4M16 3v4", "M4 10h16M8 14h3"],
    wrench: ["M15 4a5 5 0 0 0-4.6 6.9L4 17.3V20h2.7l6.4-6.4A5 5 0 0 0 20 9l-3 3-3-1-1-3 3-3", "M6 18h.01"],
    hourglass: ["M7 3h10M7 21h10M8 3v3a4 4 0 0 0 1.6 3.2L12 12l2.4-2.8A4 4 0 0 0 16 6V3M8 21v-3a4 4 0 0 1 1.6-3.2L12 12l2.4 2.8A4 4 0 0 1 16 18v3", "M10 18h4"],
    chartLine: ["M4 19h16M4 5v14", "M6 15l4-4 3 3 6-7M16 7h3v3"],
    chartBar: ["M4 20h16M7 20v-7M17 20V10", "M12 20V6"],
    check: [C9, "M8 12.5l3 3 5-6"],
    box: ["M4 8l8-4 8 4v8l-8 4-8-4z", "M4 8l8 4 8-4M12 12v8"],
    gear: ["M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1", "M12 9a3 3 0 1 0 0 6a3 3 0 0 0 0-6z"],
    people: ["M9 11a3 3 0 1 0 0-6a3 3 0 0 0 0 6zM3 19a6 6 0 0 1 12 0", "M16 5.5a3 3 0 0 1 0 5.5M17.5 14a6 6 0 0 1 3.5 5"],
    person: ["M4 20a8 8 0 0 1 16 0", "M12 4a4 4 0 1 0 0 8a4 4 0 0 0 0-8z"],
    clock: ["M12 5a8 8 0 1 0 0 16a8 8 0 0 0 0-16zM10 2h4", "M12 9v4l3 2"],
    coin: [C9, "M12 7.5a4.5 4.5 0 1 0 0 9a4.5 4.5 0 0 0 0-9z"],
    bag: ["M9 4h6l-1.5 3h-3zM10.5 7C7 9 5 12.5 5 15.5c0 3 2.500 4.500 7 4.500s7-1.500 7-4.500c0-3-2-6.500-5.500-8.500", "M12 11v6M14 12.5h-3a1.250 1.250 0 0 0 0 2.500h2a1.250 1.250 0 0 1 0 2.500h-3"],
    card: ["M4 6h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1zM7 15h4", "M3 10h18"],
    cash: ["M3 7h18v10H3zM6 10v4M18 10v4", "M12 9.500a2.500 2.500 0 1 0 0 5a2.500 2.500 0 0 0 0-5z"],
    target: [C9 + "M12 7a5 5 0 1 0 0 10a5 5 0 0 0 0-10z", "M12 11a1 1 0 1 0 0 2a1 1 0 0 0 0-2z"],
    pin: ["M12 21s-6-5.500-6-10.500a6 6 0 0 1 12 0C18 15.500 12 21 12 21z", "M12 8a2.500 2.500 0 1 0 0 5a2.500 2.500 0 0 0 0-5z"],
    pushpin: ["M9 4h6l-1 5 3 3H7l3-3z", "M12 12v8"],
    receipt: ["M6 3h12v18l-3-2-3 2-3-2-3 2z", "M9 8h6M9 12h6M9 16h3"],
    pencil: ["M4 20l1-4L16 5l3 3L8 19z", "M14 7l3 3"],
    plus: ["M12 5v14M5 12h14", ""],
    trash: ["M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5", "M5 7h14"],
    bell: ["M6 16v-5a6 6 0 0 1 12 0v5l2 2H4z", "M10 21h4"],
    link: ["M10 14a4 4 0 0 0 5.700 0l3-3a4 4 0 0 0-5.700-5.700l-1 1", "M14 10a4 4 0 0 0-5.700 0l-3 3a4 4 0 0 0 5.700 5.700l1-1"],
    lock: ["M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3", "M12 14v3"],
    shield: ["M12 3l8 3v6c0 4.500-3.500 7.500-8 9-4.500-1.500-8-4.500-8-9V6z", "M9 12l2 2 4-4"],
    home: ["M4 11l8-7 8 7M6 10v10h12V10", "M10 20v-6h4v6"],
    search: ["M11 4a7 7 0 1 0 0 14a7 7 0 0 0 0-14z", "M16 16l4 4"],
    speaker: ["M4 9h4l5-4v14l-5-4H4z", "M16 9a4 4 0 0 1 0 6M18.500 6.500a8 8 0 0 1 0 11"],
    mute: ["M4 9h4l5-4v14l-5-4H4z", "M16 9l5 6M21 9l-5 6"],
    moon: ["M20 14.500A8 8 0 0 1 9.500 4a8 8 0 1 0 10.500 10.500z", ""],
    sun: ["M12 2v3M12 19v3M2 12h3M19 12h3M4.900 4.900l2.100 2.100M17 17l2.100 2.100M4.900 19.100l2.100-2.100M17 7l2.100-2.100", "M12 8a4 4 0 1 0 0 8a4 4 0 0 0 0-8z"],
    refresh: ["M4 12a8 8 0 0 1 14-5l2 2M20 12a8 8 0 0 1-14 5l-2-2", "M20 4v5h-5M4 20v-5h5"],
    download: ["M4 20h16", "M12 4v11M7 11l5 5 5-5"],
    upload: ["M4 20h16", "M12 16V5M7 9l5-5 5 5"],
    rocket: ["M12 3c3 2 5 5.500 5 9l-2 3H9l-2-3c0-3.500 2-7 5-9zM9 15l-3 4 4-1M15 15l3 4-4-1", "M12 8a1.500 1.500 0 1 0 0 3a1.500 1.500 0 0 0 0-3z"],
    bulb: ["M12 3a6 6 0 0 0-4 10.500c.700.700 1 1.500 1 2.500v1h6v-1c0-1 .300-1.800 1-2.500A6 6 0 0 0 12 3z", "M10 21h4"],
    flame: ["M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9z", ""],
    star: ["M12 3l2.700 5.600 6.100.800-4.500 4.300 1.100 6.100L12 16.900l-5.400 2.900 1.100-6.100-4.500-4.300 6.100-.800z", ""],
    sparkle: ["M10 4l1.800 4.700L16.500 10.500l-4.700 1.800L10 17l-1.800-4.700L3.500 10.500l4.700-1.800z", "M18 14l.900 2.100L21 17l-2.100.900L18 20l-.900-2.100L15 17l2.100-.900z"],
    trophy: ["M8 4h8v5a4 4 0 0 1-8 0zM12 13v4M9 17h6v3H9z", "M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4"],
    briefcase: ["M4 8h16v11H4zM9 8V5h6v3", "M4 13h16"],
    phone: ["M8 3h8a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z", "M11 18h2"],
    camera: ["M4 8h3l2-3h6l2 3h3v11H4z", "M12 10a3.500 3.500 0 1 0 0 7a3.500 3.500 0 0 0 0-7z"],
    warning: ["M12 4l9 16H3z", "M12 10v5M12 17.500v.500"],
    cross: ["M6 6l12 12M18 6L6 18", ""],
    tag: ["M4 4h8l8 8-8 8-8-8z", "M8 7a1 1 0 1 0 0 2a1 1 0 0 0 0-2z"],
    cart: ["M3 4h3l2 11h10l2-8H7", "M9 19a1 1 0 1 0 0 2a1 1 0 0 0 0-2zM17 19a1 1 0 1 0 0 2a1 1 0 0 0 0-2z"],
    plane: ["M3 13l18-8-6 16-3-7z", "M12 14l4-4"],
    bolt: ["M13 3L5 14h6l-1 7 8-11h-6z", ""],
    save: ["M5 4h11l3 3v13H5z", "M8 4v5h7V4M8 20v-6h8v6"],
    compass: [C9, "M15 9l-2 4-4 2 2-4z"],
    calc: ["M6 3h12v18H6zM9 7h6", "M9 12h.010M12 12h.010M15 12h.010M9 16h.010M12 16h.010M15 16h.010"],
    globe: [C9, "M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"],
    building: ["M5 21V5h9v16M14 9h5v12M3 21h18", "M8 9h3M8 13h3M8 17h3"],
    book: ["M5 4h10a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z", "M5 17a3 3 0 0 1 3-3h10"],
    mic: ["M12 3a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z", "M6 11a6 6 0 0 0 12 0M12 17v4"],
    robot: ["M6 9h12v10H6zM3 13v3M21 13v3", "M12 9V5M9.500 13v2M14.500 13v2"],
    sliders: ["M5 4v16M12 4v16M19 4v16", "M3 9h4M10 15h4M17 8h4"],
    buoy: [C9, "M12 8a4 4 0 1 0 0 8a4 4 0 0 0 0-8zM5.600 5.600l3.600 3.600M14.800 14.800l3.600 3.600M18.400 5.600l-3.600 3.600M9.200 14.800l-3.600 3.600"],
    party: ["M4 20l4-12 8 8z", "M14 4v3M19 6l-2 2M20 11h-3"],
    brain: ["M9 4a3 3 0 0 0-3 3 3 3 0 0 0-1 5.500A3 3 0 0 0 8 17a3 3 0 0 0 4 2V5a3 3 0 0 0-3-1z", "M15 4a3 3 0 0 1 3 3 3 3 0 0 1 1 5.500A3 3 0 0 1 16 17a3 3 0 0 1-4 2"],
    cloud: ["M7 18a4 4 0 0 1 0-8 5 5 0 0 1 9.600-1A4.500 4.500 0 0 1 17 18z", ""],
    scale: ["M12 4v16M7 20h10M5 7h14", "M5 7l-2 6a3 3 0 0 0 4 0zM19 7l-2 6a3 3 0 0 0 4 0z"],
    wallet: ["M4 7a2 2 0 0 1 2-2h11v4M4 7v10a2 2 0 0 0 2 2h14V9H6a2 2 0 0 1-2-2z", "M16 14h.010"],
    cap: ["M2 9l10-5 10 5-10 5zM6 11v5c2 2 10 2 12 0v-5", "M22 9v5"],
    play: ["M7 4l13 8-13 8z", ""],
    gamepad: ["M6 8h12a4 4 0 0 1 0 8l-2-2H8l-2 2a4 4 0 0 1 0-8z", "M8 11v2M7 12h2M16 12h.010"]
  };

  var MAP = {
    "🎫": "ticket", "📅": "calendar", "📆": "calendar", "🗓": "calendar", "🛠": "wrench", "🔧": "wrench",
    "⏳": "hourglass", "⌛": "hourglass", "📈": "chartLine", "📊": "chartBar", "✅": "check", "☑": "check",
    "📦": "box", "⚙": "gear", "👥": "people", "👫": "people", "👤": "person", "⏱": "clock", "🕒": "clock", "⏰": "clock",
    "🪙": "coin", "💰": "bag", "💳": "card", "💵": "cash", "💸": "cash", "💱": "cash", "🎯": "target", "📍": "pin", "📌": "pushpin",
    "🧾": "receipt", "📜": "receipt", "📋": "receipt", "📝": "receipt", "📒": "receipt", "✏": "pencil", "✍": "pencil",
    "➕": "plus", "🗑": "trash", "🔔": "bell", "🔗": "link", "📎": "link", "🔒": "lock", "🔐": "lock", "🛡": "shield",
    "🏠": "home", "🔍": "search", "🔊": "speaker", "🔇": "mute", "🌙": "moon", "☀": "sun", "🔁": "refresh", "🔄": "refresh",
    "📥": "download", "⬇": "download", "⬆": "upload", "🚀": "rocket", "💡": "bulb", "🔥": "flame", "⭐": "star", "✨": "sparkle",
    "🏆": "trophy", "🥇": "trophy", "🏅": "trophy", "👑": "trophy", "💼": "briefcase", "📞": "phone", "📱": "phone",
    "📷": "camera", "🖼": "camera", "⚠": "warning", "🚨": "warning", "❌": "cross", "🏷": "tag", "🛒": "cart", "✈": "plane",
    "⚡": "bolt", "💾": "save", "🧭": "compass", "🧮": "calc", "🌍": "globe", "🏢": "building", "🏦": "building",
    "📚": "book", "🎙": "mic", "🤖": "robot", "🎛": "sliders", "🛟": "buoy", "🎉": "party", "🧠": "brain", "☁": "cloud",
    "⚖": "scale", "👛": "wallet", "🎓": "cap", "▶": "play", "🎮": "gamepad"
  };
  // colour is the message: leave these alone
  var KEEP = { "🟢": 1, "🟡": 1, "🔴": 1, "🟠": 1, "🔵": 1, "⚪": 1, "⚫": 1, "🟣": 1, "🟤": 1 };
  var TONE = { check: "ok", warning: "warn", cross: "bad" };

  var RE;
  try {
    RE = new RegExp("([\\u{1F1E6}-\\u{1F1FF}]{2})|((?:\\p{Emoji_Presentation}|\\p{Extended_Pictographic}\\uFE0F)[\\u{1F3FB}-\\u{1F3FF}]?(?:\\u200D(?:\\p{Emoji_Presentation}|\\p{Extended_Pictographic})\\uFE0F?)*)", "gu");
  } catch (e) { return; } // an old browser keeps its emoji

  var css = document.createElement("style");
  /* Sizes are in em on the icon itself and marked !important: a page rule such as
     ".label span { display: inline }" must never be able to un-box an icon, or
     its drawing stretches to the width of whatever card it sits in. The class is
     "tdi" (not "ti") because Floosy already uses "ti" for its own timeline dots. */
  css.textContent =
    ".tdi.tdi.tdi{display:inline-block!important;position:relative!important;width:1.15em!important;height:1.15em!important;min-width:0!important;max-width:none!important;flex:none!important;padding:0!important;margin:0;vertical-align:-0.2em;line-height:1!important;background:none!important;--tdi-accent:var(--coral,#FF6B5B)}" +
    ".tdi.tdi.tdi>svg{display:block!important;position:static!important;width:1.15em!important;height:1.15em!important;max-width:none!important;fill:none!important;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round;overflow:visible;animation:none!important;transform:none!important;filter:none!important}" +
    ".tdi>svg .a{stroke:var(--tdi-accent)}" +
    ".tdi--ok{--tdi-accent:#3aa682}.tdi--warn{--tdi-accent:#d9a441}.tdi--bad{--tdi-accent:#e2586a}" +
    ".tdi__src.tdi__src.tdi__src{position:absolute!important;display:block!important;width:1px!important;height:1px!important;overflow:hidden!important;clip:rect(0 0 0 0)!important;clip-path:inset(50%)!important;white-space:nowrap!important;font-size:1px!important;padding:0!important;margin:0!important;border:0!important}" +
    /* on a coral fill the second tone would vanish: draw the whole icon in the writing colour */
    ".btn--primary .tdi,.btn--hero .tdi,.tab--active .tdi,.chip--on .tdi,[aria-pressed='true'] .tdi,.tile--accent .tdi,.msg.me .tdi,.btn.primary .tdi,.main-cta .tdi,.week-day.is-on .tdi{--tdi-accent:currentColor}" +
    /* the desk's icon chips are light in both themes */
    ".desk-ico .tdi{color:#14213D}" +
    ".tdi-emo{filter:grayscale(1) sepia(1) saturate(2.400) hue-rotate(-24deg) brightness(1.040)}";
  (document.head || document.documentElement).appendChild(css);

  var SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, INPUT: 1, OPTION: 1, SELECT: 1, TITLE: 1, NOSCRIPT: 1, CODE: 1, PRE: 1 };
  var NS = "http://www.w3.org/2000/svg";

  function icon(name, ch) {
    var w = document.createElement("span");
    w.className = "tdi" + (TONE[name] ? " tdi--" + TONE[name] : "");
    w.setAttribute("aria-hidden", "true");
    var s = document.createElementNS(NS, "svg");
    s.setAttribute("viewBox", "0 0 24 24");
    var d = D[name];
    for (var i = 0; i < 2; i++) {
      if (!d[i]) continue;
      var p = document.createElementNS(NS, "path");
      p.setAttribute("d", d[i]);
      if (i === 1) p.setAttribute("class", "a");
      s.appendChild(p);
    }
    w.appendChild(s);
    var src = document.createElement("span");
    src.className = "tdi__src";
    src.textContent = ch;
    w.appendChild(src);
    return w;
  }

  function skipped(el) {
    for (var n = el; n && n.nodeType === 1; n = n.parentNode) {
      if (SKIP[n.nodeName] || n.namespaceURI === NS || n.isContentEditable) return true;
      var c = n.className;
      if (typeof c === "string" && c.indexOf("tdi") >= 0 && /(^| )(tdi|tdi-emo|tdi__src)( |$)/.test(c)) return true;
      if (typeof c === "string" && /(^| )no-icons( |$)/.test(c)) return true;
    }
    return false;
  }

  function swapText(t) {
    var v = t.nodeValue;
    if (!v || v.length < 1 || !/[^\u0000-⁯]/.test(v)) return;
    var p = t.parentNode;
    if (!p || p.nodeType !== 1 || skipped(p)) return;
    RE.lastIndex = 0;
    var m, last = 0, frag = null;
    while ((m = RE.exec(v))) {
      if (m[1]) continue;                       // a flag
      var ch = m[2], key = ch.replace(/️/g, "");
      if (KEEP[key]) continue;
      if (!frag) frag = document.createDocumentFragment();
      if (m.index > last) frag.appendChild(document.createTextNode(v.slice(last, m.index)));
      if (MAP[key]) frag.appendChild(icon(MAP[key], ch));
      else { var e = document.createElement("span"); e.className = "tdi-emo"; e.textContent = ch; frag.appendChild(e); }
      last = m.index + ch.length;
    }
    if (!frag) return;
    if (last < v.length) frag.appendChild(document.createTextNode(v.slice(last)));
    p.replaceChild(frag, t);
  }

  function sweep(root) {
    if (!root) return;
    if (root.nodeType === 3) return swapText(root);
    if (root.nodeType !== 1 || skipped(root)) return;
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null), list = [], n;
    while ((n = w.nextNode())) if (/[^\u0000-⁯]/.test(n.nodeValue)) list.push(n);
    for (var i = 0; i < list.length; i++) swapText(list[i]);
  }

  function start() {
    sweep(document.body);
    new MutationObserver(function (recs) {
      for (var i = 0; i < recs.length; i++) {
        var r = recs[i];
        if (r.type === "characterData") swapText(r.target);
        else for (var j = 0; j < r.addedNodes.length; j++) sweep(r.addedNodes[j]);
      }
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
  }
  if (document.body) start(); else document.addEventListener("DOMContentLoaded", start);
})();
