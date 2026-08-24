/* The newsletter sign-up on the landing page.

   The page is painted by the design tool's runtime, which builds the form
   some time after this file has run — so there is nothing to attach a
   listener to at load, and a node captured early can be the wrong one. The
   handler therefore lives on the document and finds its elements when the
   submit actually happens. That also survives a re-render.

   The same runtime drops attributes it does not know, `hidden` among them,
   so the status line is shown and hidden through style.display instead. */
(function () {
  "use strict";

  var busy = false;

  function say(text, ok) {
    var msg = document.getElementById("subMsg");
    if (!msg) return;
    msg.textContent = text;
    msg.style.display = text ? "block" : "none";
    msg.style.color = ok ? "var(--color-accent-300)" : "#b23c4b";
  }

  document.addEventListener("submit", function (e) {
    var form = e.target;
    if (!form || form.id !== "subForm") return;
    e.preventDefault();
    if (busy) return;

    var input = document.getElementById("subEmail");
    var btn = document.getElementById("subBtn");
    var email = ((input && input.value) || "").trim();

    if (!/^[^\s@,;]+@[^\s@,;]+\.[a-z]{2,}$/i.test(email)) {
      say("That does not look like an email address.", false);
      if (input) input.focus();
      return;
    }

    busy = true;
    var label = btn ? btn.textContent : "";
    if (btn) { btn.textContent = "Sending…"; btn.disabled = true; }
    say("", true);

    fetch("/api/cms?resource=newsletter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: email,
        source: "landing",
        // Empty for a person; a script that fills every field gives itself away.
        website: (document.getElementById("subWebsite") || {}).value || "",
      }),
    })
      .then(function (r) {
        return r.json().catch(function () { return {}; })
          .then(function (d) { return { ok: r.ok, d: d }; });
      })
      .then(function (r) {
        if (!r.ok) throw new Error(r.d.error || "Something went wrong. Try again in a moment.");
        if (input) input.value = "";
        say("You're on the list — the next one lands in your inbox.", true);
      })
      .catch(function (err) {
        say(err.message || "Something went wrong. Try again in a moment.", false);
      })
      .then(function () {
        busy = false;
        if (btn) { btn.textContent = label; btn.disabled = false; }
      });
  });
})();
