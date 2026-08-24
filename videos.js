/* The content hub, behaving the way a video page should.

   There are three videos, all of them in the list. The big frame is not a
   fourth one — it shows whichever list video is chosen, and the first one to
   begin with. Click any of them and it plays there, with that video's own
   title above it.

   Thumbnails come from YouTube. Nothing to upload: paste a link in the
   dashboard and the picture and the player both follow it. Until a link is
   there the shipped placeholder stays, and a click goes to the channel the
   way it always did, so the section is never half-broken.

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
    var h = document.querySelector("[data-video-title]");
    var t = titleOf(item);
    if (h && t) h.textContent = t;
  }

  function sync() {
    var list = items();
    if (!list.length) return;
    list.forEach(function (item) {
      var id = videoId(item.getAttribute("data-yt"));
      if (!id) return;
      thumbnail(id, function (url) {
        setSrc(item.querySelector("[data-video-thumb]"), url);
        // The first item is what the big frame shows until something is
        // clicked, so its picture has to follow along.
        if (!playing && chosen === item) mirror(item);
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
    var h = document.querySelector("[data-video-title]");
    var t = titleOf(item);
    if (h && t) h.textContent = t;

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

  document.addEventListener("cms:applied", sync);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", sync);
  else sync();
})();
