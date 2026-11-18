// Security snapshot: after repeated failed attempts to get in, take one camera
// frame and send it, with what happened, to the security log (/security).
//
// Why it is built this way:
// - The browser decides whether the camera may be used, and asks the person in
//   front of it. Someone who refuses is still recorded — just without a photo —
//   so a "no" never hides the attempt.
// - One small frame, not a stream: the camera is opened, a single JPEG is
//   taken once the picture has settled, and every track is stopped again.
// - Nothing here can throw into the page that calls it. A missing camera, a
//   denied prompt or a failed upload must never break logging in.
// - Callers count their own failures and call Snap.fail(kind); the photo is
//   taken from the second failure on, so one mistyped digit is not an alarm.
(function () {
  "use strict";

  var fails = {};
  var busy = false;

  function post(kind, photo, note) {
    try {
      return fetch("/api/auth?action=snap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: kind, page: location.pathname, photo: photo || null, note: note || null }),
        keepalive: !photo // a photo is too large for keepalive; a bare record is not
      }).catch(function () {});
    } catch (e) { return Promise.resolve(); }
  }

  function frame() {
    return new Promise(function (resolve) {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return resolve({ photo: null, note: "no camera API" });
      var done = false;
      function finish(v) { if (!done) { done = true; resolve(v); } }
      // never leave the caller waiting on a prompt nobody answers
      setTimeout(function () { finish({ photo: null, note: "camera timed out" }); }, 15000);
      navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 480 } }, audio: false }).then(function (stream) {
        var v = document.createElement("video");
        v.muted = true; v.playsInline = true; v.setAttribute("playsinline", "");
        v.srcObject = stream;
        function stop() { stream.getTracks().forEach(function (t) { t.stop(); }); }
        v.play().then(function () {
          // the first frames are often black while exposure settles
          setTimeout(function () {
            try {
              var w = 360, h = Math.round(w * (v.videoHeight || 3) / (v.videoWidth || 4));
              var c = document.createElement("canvas");
              c.width = w; c.height = h;
              c.getContext("2d").drawImage(v, 0, 0, w, h);
              finish({ photo: c.toDataURL("image/jpeg", 0.6), note: null });
            } catch (e) { finish({ photo: null, note: "capture failed" }); }
            stop();
          }, 700);
        }).catch(function () { stop(); finish({ photo: null, note: "video failed" }); });
      }).catch(function (err) {
        finish({ photo: null, note: "camera " + ((err && err.name) || "refused") });
      });
    });
  }

  /** Record one attempt now, with a photo if the camera can be had. */
  function take(kind, note) {
    if (busy) return Promise.resolve();
    busy = true;
    return frame().then(function (r) {
      return post(kind, r.photo, [note, r.note].filter(Boolean).join(" · "));
    }).then(function () { busy = false; }, function () { busy = false; });
  }

  /** Count a failure of this kind; from the second one on, record it. */
  function fail(kind, note) {
    fails[kind] = (fails[kind] || 0) + 1;
    if (fails[kind] >= 2) return take(kind, (note ? note + " · " : "") + "attempt " + fails[kind]);
    return Promise.resolve();
  }

  function ok(kind) { fails[kind] = 0; }

  window.Snap = { take: take, fail: fail, ok: ok };
})();
