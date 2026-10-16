/* Session files in the browser: what kind a file is (an icon and a name),
   sending a big one up in pieces, and opening one however big it is.
   Used by /admin and by the client's share page. See api/_lib/files.js for why
   files travel in pieces (Vercel's 4.5 MB limit on a request and a response).

   Exposes window.Files = { kind, size, accept, check, upload, open }. */
(function () {
  "use strict";

  var CHUNK = 2.5 * 1024 * 1024;
  var WHOLE = 4 * 1024 * 1024;
  var MAX = 20 * 1024 * 1024;

  var KINDS = {
    pdf: { glyph: "📕", label: "PDF", tone: "pdf" },
    pptx: { glyph: "📊", label: "PowerPoint", tone: "ppt" },
    ppsx: { glyph: "📊", label: "PowerPoint", tone: "ppt" },
    ppt: { glyph: "📊", label: "PowerPoint", tone: "ppt" },
    key: { glyph: "🎞", label: "Keynote", tone: "key" },
    odp: { glyph: "📽", label: "Slides", tone: "key" },
    docx: { glyph: "📝", label: "Word", tone: "doc" },
    doc: { glyph: "📝", label: "Word", tone: "doc" },
  };
  var accept = ".pdf,.pptx,.ppsx,.ppt,.key,.odp,.docx,.doc,application/pdf," +
    "application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.ms-powerpoint," +
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword";

  function ext(name) { return ((/\.([a-z0-9]+)$/i.exec(String(name || "")) || [])[1] || "").toLowerCase(); }

  function kind(name) {
    return KINDS[ext(name)] || { glyph: "📎", label: "File", tone: "other" };
  }

  function size(bytes) {
    bytes = Number(bytes) || 0;
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + " KB";
    return (bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0) + " MB";
  }

  /* An error message, or null when the file can go. */
  function check(file) {
    if (!KINDS[ext(file.name)]) return "Upload a PDF, PowerPoint, Keynote or Word file";
    if (file.size > MAX) return "That file is " + size(file.size) + " — the most is 20 MB";
    return null;
  }

  function readB64(blob) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(String(fr.result).split(",")[1] || ""); };
      fr.onerror = reject;
      fr.readAsDataURL(blob);
    });
  }

  function randomId() {
    var a = new Uint8Array(18);
    crypto.getRandomValues(a);
    return btoa(String.fromCharCode.apply(null, a)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  /* Sends the file up in pieces; resolves with the upload id to save with. */
  function upload(file, onProgress) {
    var id = randomId();
    var pieces = Math.max(1, Math.ceil(file.size / CHUNK));
    var i = 0;
    var next = function () {
      if (i >= pieces) return Promise.resolve(id);
      var piece = file.slice(i * CHUNK, (i + 1) * CHUNK);
      return readB64(piece).then(function (b64) {
        return fetch("/api/sessions?resource=upload", {
          method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ upload_id: id, index: i, data_base64: b64 }),
        });
      }).then(function (r) {
        if (!r.ok) return r.json().catch(function () { return {}; }).then(function (d) { throw new Error(d.error || "Upload failed"); });
        i++;
        if (onProgress) onProgress(Math.round((i / pieces) * 100));
        return next();
      });
    };
    if (onProgress) onProgress(0);
    return next();
  }

  /* Opens a stored file: a PDF in a new tab, anything else as a download.
     `base` is the file's address (/api/pdf?id=N or the share page's). */
  function open(base, meta, onProgress) {
    meta = meta || {};
    var isPdf = (meta.type || "application/pdf") === "application/pdf" && ext(meta.name || "x.pdf") === "pdf";
    if (Number(meta.size) <= WHOLE) {
      if (isPdf) { var w = window.open(base, "_blank"); if (w) w.opener = null; return Promise.resolve(); }
      return save(base, meta.name);
    }
    // a tab opened now, inside the tap, is not blocked when the file is ready later
    var tab = isPdf ? window.open("", "_blank") : null;
    return fetch(base + "&info=1", { credentials: "same-origin" }).then(function (r) { return r.json(); }).then(function (info) {
      var parts = [], k = 0;
      var more = function () {
        if (k >= info.parts) return Promise.resolve();
        return fetch(base + "&part=" + k, { credentials: "same-origin" }).then(function (r) {
          if (!r.ok) throw new Error("Could not read the file");
          return r.arrayBuffer();
        }).then(function (buf) {
          parts.push(buf); k++;
          if (onProgress) onProgress(Math.round((k / info.parts) * 100));
          return more();
        });
      };
      return more().then(function () {
        var url = URL.createObjectURL(new Blob(parts, { type: info.type }));
        if (tab) tab.location.href = url;
        else save(url, info.name);
        setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
      });
    }).catch(function (e) { if (tab) tab.close(); throw e; });
  }

  function save(url, name) {
    var a = document.createElement("a");
    a.href = url;
    a.download = name || "";
    document.body.appendChild(a);
    a.click();
    a.remove();
    return Promise.resolve();
  }

  window.Files = { kind: kind, size: size, accept: accept, check: check, upload: upload, open: open, max: MAX };
})();
