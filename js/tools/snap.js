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

  // ---- Camera first -------------------------------------------------------
  // The owner asked for the camera to be allowed as soon as a tool page opens,
  // not only once something has gone wrong: a prompt that first appears after
  // two failures is a prompt an intruder simply declines. So the page asks on
  // load, and the sign-in button stays locked until the answer is yes.
  //
  // The lock applies only where a camera exists. A desktop with no camera
  // must still be able to sign in (it uses the phone's passkey by QR code),
  // so "no camera here" is not treated as a refusal.
  var tr = function (en, ar) { return window.T ? window.T(en, ar) : en; };

  function hasCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !navigator.mediaDevices.enumerateDevices) return Promise.resolve(false);
    return navigator.mediaDevices.enumerateDevices().then(function (list) {
      for (var i = 0; i < list.length; i++) if (list[i].kind === "videoinput") return true;
      return false;
    }).catch(function () { return false; });
  }

  function ask() {
    // open and close straight away: the point is the permission, not a picture
    return navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false }).then(function (stream) {
      stream.getTracks().forEach(function (t) { t.stop(); });
      return true;
    }).catch(function () { return false; });
  }

  function gate(locked) {
    var btn = document.getElementById("btnLogin");
    if (!btn) return;
    var note = document.getElementById("camGate");
    if (!locked) {
      btn.disabled = false;
      if (note) note.parentNode.removeChild(note);
      return;
    }
    btn.disabled = true;
    if (note) return;
    note = document.createElement("p");
    note.id = "camGate";
    note.style.cssText = "margin:12px 0 0;font-size:.9rem;line-height:1.5";
    var again = document.createElement("button");
    again.type = "button";
    again.textContent = tr("Allow camera", "اسمح بالكاميرا");
    again.style.cssText = "margin-inline-start:8px;padding:4px 12px;border-radius:999px;border:1px solid currentColor;background:none;color:inherit;font:inherit;font-weight:700;cursor:pointer";
    again.addEventListener("click", function () { ask().then(function (yes) { gate(!yes); }); });
    note.appendChild(document.createTextNode(tr(
      "📷 Allow the camera to sign in. If you blocked it, turn it back on in the browser's site settings.",
      "📷 لازم تسمح بالكاميرا عشان تدخل. لو قفلتها قبل كده، افتحها من إعدادات الموقع في المتصفح.")));
    note.appendChild(again);
    btn.parentNode.insertBefore(note, btn.nextSibling);
  }

  function prime() {
    hasCamera().then(function (cam) {
      if (!cam) return;          // nothing to allow on this device
      gate(true);                // locked until the answer comes back
      ask().then(function (yes) { gate(!yes); });
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", prime);
  else prime();

  window.Snap = { take: take, fail: fail, ok: ok, prime: prime };
})();
