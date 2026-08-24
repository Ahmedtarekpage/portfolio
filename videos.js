/* The content hub, behaving the way a video page should.

   There are three videos, all of them in the list. The big frame is not a
   fourth one — it shows whichever list video is chosen, and the first one to
   begin with. Click any of them and it plays there.

   Everything else about a video comes from the video. Paste a YouTube link in
   the dashboard and the picture, the title and the channel name all follow
   it: thumbnails straight off i.ytimg.com, the rest from YouTube's oEmbed
   endpoint, which needs no API key and allows this origin. Until a link is
   there the shipped placeholder stays and a click goes to the channel, so the
   section is never half-broken.

   The Subscribe button opens YouTube's subscribe dialog in a small window
   rather than sending the visitor away. Nobody can be subscribed without
   confirming it with their own Google account — that is YouTube's rule, not a
   shortcut not taken — but they never leave the page to do it.

   Clicks and the initial sync are both hung off the document, because the
   page is painted by the design tool's runtime and the links arrive later
   still, from cms.js — which says so with a cms:applied event. */
(function () {
  "use strict";

  var ID = /(?:youtu\.be\/|v=|\/embed\/|\/shorts\/|\/live\/)([A-Za-z0-9_-]{11})/;

  var chosen = null;   // the list item the big frame is showing
  var playing = false;
  var thumbs = {};     // video id -> resolved thumbnail url

  /** The 11-character video id inside any shape of YouTube link, or "". */
  function videoId(url) {
    var s = String(url || "").trim();
    if (!s) return "";
    var m = ID.exec(s);
    if (m) return m[1];
    return /^[A-Za-z0-9_-]{11}$/.test(s) ? s : "";
  }

  /* YouTube always has hqdefault; maxresdefault exists only for videos
     uploaded above 720p, and asking for a missing one hands back a 120px grey
     placeholder rather than a 404. So the big one is tried and measured. */
  function thumbnail(id, done) {
    if (thumbs[id]) return done(thumbs[id]);
    var max = "https://i.ytimg.com/vi/" + id + "/maxresdefault.jpg";
    var hq = "https://i.ytimg.com/vi/" + id + "/hqdefault.jpg";
    var probe = new Image();
    probe.onload = function () { done((thumbs[id] = probe.naturalWidth > 200 ? max : hq)); };
    probe.onerror = function () { done((thumbs[id] = hq)); };
    probe.src = max;
  }

  /* Title and channel, straight from YouTube. oEmbed wants no key and sends
     an Access-Control-Allow-Origin for this site, so there is no server in
     the middle and nothing to configure. One request per video, cached, and
     a failure simply leaves the shipped placeholder in place. */
  var facts = {};
  function about(id, done) {
    if (facts[id]) return done(facts[id]);
    if (facts[id] === null) return;                       // in flight
    facts[id] = null;
    fetch("https://www.youtube.com/oembed?format=json&url=" +
          encodeURIComponent("https://www.youtube.com/watch?v=" + id))
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { if (d) { facts[id] = d; done(d); } })
      .catch(function () { /* leave what the page shipped with */ });
  }

  function setText(el, text) {
    if (el && text && el.textContent.trim() !== text) el.textContent = text;
  }

  function setSrc(slot, url) {
    if (slot && url && slot.getAttribute("src") !== url) slot.setAttribute("src", url);
  }

  function items() {
    return Array.prototype.slice.call(document.querySelectorAll("[data-video-item]"));
  }
  function titleOf(item) {
    var t = item.querySelector("[data-video-item-title]");
    return t ? t.textContent.trim() : "";
  }

  /** Point the big frame's picture and heading at one list item. */
  function mirror(item) {
    chosen = item;
    var main = document.querySelector("[data-video-main]");
    if (!main || !item) return;
    var from = item.querySelector("[data-video-thumb]");
    if (from) setSrc(main.querySelector("[data-video-main-thumb]"), from.getAttribute("src"));
    setText(document.querySelector("[data-video-title]"), titleOf(item));
    var author = item.querySelector("[data-video-author]");
    if (author) setText(main.parentElement.querySelector("[data-video-main-author]"), author.textContent.trim());
    var soon = main.parentElement.querySelector("[data-video-soon]");
    if (soon) soon.style.display = videoId(item.getAttribute("data-yt")) ? "none" : "";
  }

  function sync() {
    var list = items();
    if (!list.length) return;
    list.forEach(function (item) {
      var id = videoId(item.getAttribute("data-yt"));
      if (!id) return;
      // "Coming soon" is not true of a video that is already up.
      var soon = item.querySelector("[data-video-soon]");
      if (soon) soon.style.display = "none";
      thumbnail(id, function (url) {
        setSrc(item.querySelector("[data-video-thumb]"), url);
        // The first item is what the big frame shows until something is
        // clicked, so its picture has to follow along.
        if (!playing && chosen === item) mirror(item);
      });
      about(id, function (d) {
        setText(item.querySelector("[data-video-item-title]"), d.title);
        setText(item.querySelector("[data-video-author]"), d.author_name);
        if (chosen === item) mirror(item);
      });
    });
    if (!playing && (!chosen || list.indexOf(chosen) < 0)) mirror(list[0]);
  }

  function stageFor(main) {
    var existing = main.parentElement.querySelector(".yt-stage");
    if (existing) return existing;
    var stage = document.createElement("div");
    stage.className = "yt-stage";
    stage.style.cssText =
      "position: relative; border-radius: 12px; overflow: hidden; " +
      "background: #000; aspect-ratio: 16 / 9;";
    main.parentElement.insertBefore(stage, main);
    return stage;
  }

  function play(item) {
    var id = videoId(item.getAttribute("data-yt"));
    var main = document.querySelector("[data-video-main]");
    if (!id || !main) return false;

    var stage = stageFor(main);
    var src = "https://www.youtube-nocookie.com/embed/" + id + "?autoplay=1&rel=0&modestbranding=1";
    var frame = stage.querySelector("iframe");
    if (!frame) {
      frame = document.createElement("iframe");
      frame.style.cssText = "position: absolute; inset: 0; width: 100%; height: 100%; border: 0;";
      frame.setAttribute("allow",
        "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture");
      frame.setAttribute("allowfullscreen", "");
      frame.setAttribute("title", "YouTube video player");
      stage.appendChild(frame);
    }
    if (frame.getAttribute("src") !== src) frame.setAttribute("src", src);

    main.style.display = "none";
    playing = true;
    chosen = item;
    setText(document.querySelector("[data-video-title]"), titleOf(item));

    // On a phone the list sits under the player, so a tap on the third item
    // would otherwise start something playing off-screen.
    if (window.innerWidth < 900) stage.scrollIntoView({ behavior: "smooth", block: "center" });
    return true;
  }

  document.addEventListener("click", function (e) {
    if (!e.target.closest) return;
    var item = e.target.closest("[data-video-item]");
    // The big frame plays whatever it is currently showing.
    if (!item && e.target.closest("[data-video-main]")) item = chosen;
    if (!item) return;
    if (play(item)) e.preventDefault();     // no link yet — let it go to the channel
  });

  /* YouTube's own subscribe dialog, in a window the size of a dialog. The
     visitor confirms with their Google account — there is no way around that
     — but the page they came from is still there behind it. If the browser
     blocks the popup, the link does what it always did. */
  document.addEventListener("click", function (e) {
    if (!e.target.closest) return;
    var link = e.target.closest("[data-yt-subscribe]");
    if (!link) return;
    var url = (link.getAttribute("href") || "").split("?")[0].replace(/\/$/, "") + "?sub_confirmation=1";
    var w = 560, h = 660;
    var x = Math.max(0, (screen.width - w) / 2), y = Math.max(0, (screen.height - h) / 2);
    var win = window.open(url, "yt-subscribe",
      "width=" + w + ",height=" + h + ",left=" + x + ",top=" + y + ",menubar=no,toolbar=no,location=yes");
    if (win) { e.preventDefault(); win.focus(); }
  });

  document.addEventListener("cms:applied", sync);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", sync);
  else sync();
})();
