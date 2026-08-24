// Site CMS — content overrides and the media library behind them.
//
// Content:
//   GET    /api/cms                       -> { content: { key: {kind, value} } }   PUBLIC
//   GET    /api/cms?index=1               -> { items: [...] } full rows            (authed)
//   PUT    /api/cms                       -> { items: [...] }; empty value reverts (authed)
//   DELETE /api/cms?key=K | ?all=1                                                 (authed)
// Newsletter (?resource=newsletter):
//   POST   /api/cms?resource=newsletter               -> { email, name }   PUBLIC
//   GET    /api/cms?resource=newsletter&action=unsubscribe&token=T  PUBLIC (html)
//   GET    /api/cms?resource=newsletter               -> list + campaigns  (authed)
//   POST   /api/cms?resource=newsletter&action=preview -> { html }         (authed)
//   POST   /api/cms?resource=newsletter&action=send    -> one chunk        (authed)
//   DELETE /api/cms?resource=newsletter&id=N                               (authed)
// Media (?resource=media):
//   GET    /api/cms?resource=media&id=N   -> the file, immutable-cached            PUBLIC
//   GET    /api/cms?resource=media        -> { media: [...] } metadata             (authed)
//   POST   /api/cms?resource=media        -> { name, dataUrl } -> { media }        (authed)
//   DELETE /api/cms?resource=media&id=N                                            (authed)
//
// Content and media share one function on purpose: the Hobby plan allows
// twelve Serverless Functions per deployment and the project was already at
// the line. Splitting them back out will fail the deploy.
import crypto from "node:crypto";
import { db } from "./_lib/db.js";
import { withErrors, json, requireAuth } from "./_lib/util.js";
import { mailConfig, renderEmail, renderText, sendBatch } from "./_lib/mail.js";

const KINDS = new Set(["text", "rich", "html", "src", "href"]);

/* A link the dashboard saves ends up as an href on a public page. Anything
   that is not a way of addressing a document — javascript:, data:, vbscript:
   — is a way of running code, and there is no reason for one to be here. */
const SAFE_LINK = /^(https?:\/\/|mailto:|tel:|\/|#|\.\.?\/|media:\d+$|[\w.-]+\/)/i;
function unsafeLink(kind, value) {
  if (kind !== "href" && kind !== "src") return false;
  const v = value.trim();
  if (!v) return false;
  return !SAFE_LINK.test(v);
}
const MAX_VALUE = 200_000;

// Vercel caps a serverless request body at ~4.5 MB, and base64 inflates by a
// third, so the largest file that can actually arrive is around 3 MB.
const MAX_BYTES = 3 * 1024 * 1024;
const ALLOWED = /^(image\/(png|jpeg|jpg|webp|gif|svg\+xml|avif)|video\/(mp4|webm))$/;

async function handleMedia(req, res, sql) {

  // Public read: this is how the live site loads anything you upload.
  if (req.method === "GET" && req.query.id) {
    const id = Number(req.query.id);
    if (!id) return json(res, 400, { error: "id is required" });
    const [row] = await sql`SELECT mime, data FROM site_media WHERE id = ${id}`;
    if (!row) return json(res, 404, { error: "Not found" });
    const buf = Buffer.isBuffer(row.data) ? row.data : Buffer.from(row.data);
    res.setHeader("Content-Type", row.mime);
    res.setHeader("Content-Length", String(buf.length));
    // Rows are never rewritten in place — a replacement gets a new id — so the
    // bytes behind an id really are immutable.
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    // An uploaded file is served from the same origin as /admin, so it must
    // not be able to run anything. An SVG opened directly in a tab would
    // otherwise execute its own script with this site's origin.
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; sandbox");
    return res.status(200).end(buf);
  }

  if (!requireAuth(req, res)) return;

  if (req.method === "GET") {
    const media = await sql`SELECT id, name, mime, bytes, created_at
      FROM site_media ORDER BY created_at DESC`;
    return json(res, 200, { media });
  }

  if (req.method === "POST") {
    const b = req.body || {};
    const name = String(b.name || "upload").slice(0, 200);
    const dataUrl = String(b.dataUrl || "");
    const m = /^data:([^;,]+);base64,(.+)$/s.exec(dataUrl);
    if (!m) return json(res, 400, { error: "dataUrl must be a base64 data: URL" });
    const mime = m[1].toLowerCase();
    if (!ALLOWED.test(mime)) return json(res, 400, { error: `Unsupported file type: ${mime}` });
    const buf = Buffer.from(m[2], "base64");
    if (!buf.length) return json(res, 400, { error: "Empty file" });
    if (buf.length > MAX_BYTES) {
      return json(res, 413, {
        error: `That file is ${(buf.length / 1048576).toFixed(1)} MB. The limit is 3 MB — ` +
               `compress it, or host video elsewhere and paste the URL instead.`,
      });
    }
    const [row] = await sql`INSERT INTO site_media (name, mime, bytes, data)
      VALUES (${name}, ${mime}, ${buf.length}, ${buf})
      RETURNING id, name, mime, bytes, created_at`;
    return json(res, 201, { media: { ...row, url: `/api/cms?resource=media&id=${row.id}` } });
  }

  if (req.method === "DELETE") {
    const id = Number(req.query.id);
    if (!id) return json(res, 400, { error: "id is required" });
    await sql`DELETE FROM site_media WHERE id = ${id}`;
    return json(res, 200, { ok: true });
  }

  return json(res, 405, { error: "Method not allowed" });
}


/* ---------------------------------------------------------------
   Newsletter
   --------------------------------------------------------------- */

const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[a-z]{2,}$/i;

// Resend takes at most 100 messages per batch call, and a serverless request
// has to finish inside its time limit — so the dashboard sends one chunk at a
// time and comes back for the next. A list of any size gets through, and a
// send that dies halfway has already recorded what it delivered.
const CHUNK = 60;

function siteUrl(req) {
  const host = req.headers["x-forwarded-host"] || req.headers.host || "ahmedtarek.tech";
  const proto = req.headers["x-forwarded-proto"] || (String(host).startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

function page(res, status, title, message, confirmToken) {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  return res.status(status).end(`<!doctype html><html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" /><title>${title}</title></head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f4f4f9;font-family:Inter,Helvetica,Arial,sans-serif;color:#17181f;padding:24px;">
<div style="max-width:460px;text-align:center;background:#fff;border:1px solid #e4e5ee;border-radius:18px;padding:40px 32px;">
<h1 style="margin:0 0 12px;font-size:22px;font-weight:600;">${title}</h1>
<p style="margin:0 0 22px;font-size:15px;line-height:1.7;color:#5c5e70;">${message}</p>
${confirmToken ? `<form method="POST" action="/unsubscribe?token=${encodeURIComponent(confirmToken)}" style="margin:0 0 14px;">
<button type="submit" style="padding:12px 24px;border:0;border-radius:999px;background:#7263c9;color:#fff;font-size:14px;font-weight:600;cursor:pointer;">Yes, unsubscribe me</button>
</form>` : ""}
<a href="/" style="display:inline-block;padding:12px 24px;border-radius:999px;${confirmToken ? "background:transparent;color:#5c5e70;border:1px solid #e4e5ee;" : "background:#7263c9;color:#fff;"}font-size:14px;font-weight:600;text-decoration:none;">${confirmToken ? "No, keep me subscribed" : "Back to the site"}</a>
</div></body></html>`);
}

async function handleNewsletter(req, res, sql) {
  const action = String(req.query.action || "");

  // --- public: someone unsubscribing from a link in an email ---
  //
  // Corporate mail filters open every link in a message to check it. If the
  // GET did the unsubscribing, they would quietly unsubscribe the person they
  // are protecting. So the GET asks, and the POST acts — which is also the
  // method a mail client's own one-click unsubscribe uses.
  if (action === "unsubscribe" && (req.method === "GET" || req.method === "POST")) {
    const token = String(req.query.token || req.body?.token || "");
    if (!token) return page(res, 400, "Link incomplete", "That unsubscribe link is missing its code.");

    if (req.method === "GET") {
      const [row] = await sql`SELECT status FROM newsletter_subscribers WHERE token = ${token}`;
      if (!row) return page(res, 404, "Nothing to do", "That link is not one of ours, or the address is no longer on the list.");
      if (row.status !== "active") return page(res, 200, "Already unsubscribed", "You are not on the list. Nothing more to do.");
      return page(res, 200, "Unsubscribe?", "One click and no more emails come to you.", token);
    }

    const [row] = await sql`UPDATE newsletter_subscribers
      SET status = 'unsubscribed', unsubscribed_at = now()
      WHERE token = ${token} RETURNING email`;
    if (!row) return page(res, 404, "Nothing to do", "That link has already been used, or the address is no longer on the list.");
    return page(res, 200, "You're unsubscribed", "No more emails will come to you. Thanks for reading.");
  }

  // --- public: subscribing from the site ---
  if (req.method === "POST" && (!action || action === "subscribe")) {
    const b = req.body || {};

    // A field no person can see and no person fills in. A script that posts
    // every input it finds fills it, and is told the same thing a success is
    // told — there is nothing to learn from the answer.
    if (String(b.website || "").trim()) return json(res, 201, { ok: true });

    const email = String(b.email || "").trim().toLowerCase().slice(0, 254);
    if (!EMAIL_RE.test(email)) return json(res, 400, { error: "That does not look like an email address." });

    // Anyone can post here, so anyone can fill the table, burn the daily
    // sending quota, and sign up addresses that are not theirs. A handful an
    // hour from one address is more than a real person needs.
    const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim().slice(0, 45) || null;
    if (ip) {
      const [{ count }] = await sql`SELECT count(*)::int AS count FROM newsletter_subscribers
        WHERE ip = ${ip} AND created_at > now() - interval '1 hour'`;
      if (count >= 5) {
        return json(res, 429, { error: "That is a lot of sign-ups from one place. Try again in an hour." });
      }
    }
    const name = String(b.name || "").trim().slice(0, 120) || null;
    const source = String(b.source || "site").trim().slice(0, 60);
    const token = crypto.randomBytes(24).toString("base64url");

    // Someone re-subscribing after opting out is asking to come back, and the
    // row keeps its original token so old unsubscribe links still work.
    await sql`INSERT INTO newsletter_subscribers (email, name, source, token, ip)
      VALUES (${email}, ${name}, ${source}, ${token}, ${ip})
      ON CONFLICT (email) DO UPDATE SET
        status = 'active',
        unsubscribed_at = NULL,
        name = COALESCE(EXCLUDED.name, newsletter_subscribers.name)`;
    return json(res, 201, { ok: true });
  }

  if (!requireAuth(req, res)) return;

  if (req.method === "GET") {
    const subscribers = await sql`SELECT id, email, name, source, status, created_at
      FROM newsletter_subscribers ORDER BY created_at DESC`;
    const campaigns = await sql`SELECT id, subject, recipients, failed, errors, created_at
      FROM newsletter_campaigns ORDER BY created_at DESC LIMIT 25`;
    return json(res, 200, { subscribers, campaigns, mail: mailConfig() });
  }

  if (req.method === "DELETE") {
    const id = Number(req.query.id);
    if (!id) return json(res, 400, { error: "id is required" });
    await sql`DELETE FROM newsletter_subscribers WHERE id = ${id}`;
    return json(res, 200, { ok: true });
  }

  if (req.method === "POST" && action === "preview") {
    const b = req.body || {};
    return json(res, 200, {
      html: renderEmail({ ...b, siteUrl: siteUrl(req), unsubUrl: siteUrl(req) + "/unsubscribe?token=preview" }),
    });
  }

  if (req.method === "POST" && action === "send") {
    const b = req.body || {};
    const subject = String(b.subject || "").trim();
    if (!subject) return json(res, 400, { error: "The email needs a subject line." });
    if (!String(b.body || "").trim()) return json(res, 400, { error: "The email has no text in it." });

    const cfg = mailConfig();
    if (!cfg.configured) {
      return json(res, 400, {
        error: "Email sending is not switched on yet. Add RESEND_API_KEY (and NEWSLETTER_FROM) " +
               "to the project's environment variables in Vercel, then redeploy.",
      });
    }

    const base = siteUrl(req);
    const build = (to, token) => {
      // /unsubscribe is a rewrite onto this same function — a link someone
      // reads in an email should look like a link, not a query string.
      const unsubUrl = `${base}/unsubscribe?token=${encodeURIComponent(token)}`;
      return {
        from: cfg.from,
        to: [to],
        reply_to: cfg.replyTo,
        subject,
        html: renderEmail({ ...b, unsubUrl, siteUrl: base }),
        text: renderText({ ...b, unsubUrl }),
        headers: { "List-Unsubscribe": `<${unsubUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
      };
    };

    // A test goes to one address and is not recorded as a campaign.
    if (b.testTo) {
      const to = String(b.testTo).trim().toLowerCase();
      if (!EMAIL_RE.test(to)) return json(res, 400, { error: "That test address is not valid." });
      const r = await sendBatch([build(to, "preview")]);
      if (r.error) return json(res, 502, { error: r.error });
      return json(res, 200, { ok: true, test: true, sent: r.sent });
    }

    const offset = Math.max(0, Number(b.offset) || 0);
    const rows = await sql`SELECT email, token FROM newsletter_subscribers
      WHERE status = 'active' ORDER BY id LIMIT ${CHUNK} OFFSET ${offset}`;
    const [{ count }] = await sql`SELECT count(*)::int AS count FROM newsletter_subscribers WHERE status = 'active'`;

    if (!count) return json(res, 400, { error: "There is nobody on the list yet." });

    let campaignId = Number(b.campaignId) || 0;
    if (!campaignId) {
      const [c] = await sql`INSERT INTO newsletter_campaigns (subject, html, recipients)
        VALUES (${subject}, ${renderEmail({ ...b, siteUrl: base })}, 0) RETURNING id`;
      campaignId = c.id;
    }

    const r = rows.length ? await sendBatch(rows.map((x) => build(x.email, x.token))) : { sent: 0, failed: 0 };
    await sql`UPDATE newsletter_campaigns
      SET recipients = recipients + ${r.sent}, failed = failed + ${r.failed},
          errors = COALESCE(${r.error || null}, errors)
      WHERE id = ${campaignId}`;

    const nextOffset = offset + rows.length;
    return json(res, 200, {
      ok: !r.error, campaignId, total: count, sent: r.sent, failed: r.failed,
      error: r.error || null, nextOffset, done: nextOffset >= count || !rows.length,
    });
  }

  return json(res, 405, { error: "Method not allowed" });
}

export default withErrors(async (req, res) => {
  const sql = await db();
  if (req.query.resource === "media") return handleMedia(req, res, sql);
  if (req.query.resource === "newsletter") return handleNewsletter(req, res, sql);

  if (req.method === "GET" && !req.query.index) {
    const rows = await sql`SELECT key, kind, value FROM site_content`;
    const content = {};
    for (const r of rows) content[r.key] = { kind: r.kind, value: r.value };
    // Short cache: edits should show up quickly, but repeat visitors in one
    // session shouldn't refetch on every page.
    res.setHeader("Cache-Control", "public, max-age=0, s-maxage=30, stale-while-revalidate=300");
    return json(res, 200, { content });
  }

  if (!requireAuth(req, res)) return;

  if (req.method === "GET") {
    const items = await sql`SELECT key, kind, value, page, section, label, updated_at
      FROM site_content ORDER BY page, section, key`;
    return json(res, 200, { items });
  }

  if (req.method === "PUT") {
    const body = req.body || {};
    const items = Array.isArray(body.items) ? body.items : [];
    if (!items.length) return json(res, 400, { error: "items is required" });

    let saved = 0;
    let reverted = 0;
    for (const it of items) {
      const key = String(it.key || "").trim();
      if (!key || key.length > 512) continue;
      const kind = KINDS.has(it.kind) ? it.kind : "text";
      const value = it.value == null ? "" : String(it.value);
      if (value.length > MAX_VALUE) return json(res, 400, { error: `Value for ${key} is too large` });
      if (unsafeLink(kind, value)) {
        return json(res, 400, {
          error: "That link is not a web address. Start it with https://, mailto:, tel:, / or #.",
        });
      }

      // An empty value is "put it back the way the page ships it", not "blank it out".
      if (!value.trim()) {
        await sql`DELETE FROM site_content WHERE key = ${key}`;
        reverted++;
        continue;
      }
      await sql`INSERT INTO site_content (key, kind, value, page, section, label, updated_at)
        VALUES (${key}, ${kind}, ${value}, ${it.page || null}, ${it.section || null}, ${it.label || null}, now())
        ON CONFLICT (key) DO UPDATE SET
          kind = EXCLUDED.kind, value = EXCLUDED.value,
          page = COALESCE(EXCLUDED.page, site_content.page),
          section = COALESCE(EXCLUDED.section, site_content.section),
          label = COALESCE(EXCLUDED.label, site_content.label),
          updated_at = now()`;
      saved++;
    }
    return json(res, 200, { ok: true, saved, reverted });
  }

  if (req.method === "DELETE") {
    if (req.query.all) {
      await sql`DELETE FROM site_content`;
      return json(res, 200, { ok: true });
    }
    const key = String(req.query.key || "");
    if (!key) return json(res, 400, { error: "key is required" });
    await sql`DELETE FROM site_content WHERE key = ${key}`;
    return json(res, 200, { ok: true });
  }

  return json(res, 405, { error: "Method not allowed" });
});
