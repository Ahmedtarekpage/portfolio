/* The content hub, behaving the way a video page should.

   Each of the four videos carries a data-yt attribute that the dashboard
   fills in with a YouTube link. Click any of them and it plays in the big
   frame at the top — the list item's own title moves up with it, so the
   heading always names what is actually playing.

   A video with no link yet keeps the behaviour it shipped with: the anchor's
   href, which points at the channel. So the section is never broken, it just
   gets better as links are added.

   Clicks are handled on the document because the page is painted by the
   design tool's runtime, which builds this section after this file has run. */
(function () {
  "use strict";

  var ID = /(?:youtu\.be\/|v=|\/embed\/|\/shorts\/|\/live\/)([A-Za-z0-9_-]{11})/;

  /** The 11-character video id inside any shape of YouTube link, or "". */
  function videoId(url) {
    var s = String(url || "").trim();
    if (!s) return "";
    var m = ID.exec(s);
    if (m) return m[1];
    return /^[A-Za-z0-9_-]{11}$/.test(s) ? s : "";
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

  function play(main, id, title) {
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
    if (title) {
      var h = document.querySelector("[data-video-title]");
      if (h) h.textContent = title;
    }
    // On a phone the list sits under the player, so a tap on the third item
    // would otherwise start something playing off-screen.
    if (window.innerWidth < 900) stage.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  document.addEventListener("click", function (e) {
    if (!e.target.closest) return;
    var link = e.target.closest("[data-video-main], [data-video-item]");
    if (!link) return;

    var id = videoId(link.getAttribute("data-yt"));
    if (!id) return;                       // no link set yet — let it go to the channel

    var main = document.querySelector("[data-video-main]");
    if (!main) return;

    e.preventDefault();
    var titleEl = link.querySelector("[data-video-item-title]");
    play(main, id, titleEl ? titleEl.textContent.trim() : "");
  });
})();
