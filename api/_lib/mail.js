// The newsletter: what an email looks like, and how it leaves the building.
//
// Sending goes through Resend, which needs two things set in the Vercel
// project (Settings -> Environment Variables):
//
//   RESEND_API_KEY    re_...            from resend.com/api-keys
//   NEWSLETTER_FROM   Ahmed Tarek <newsletter@ahmedtarek.tech>
//
// The from-address has to be on a domain verified in Resend, otherwise Resend
// refuses the send. Without the key nothing is sent and the dashboard says so
// in plain words rather than failing silently.

const ACCENT = "#7263c9";
const ACCENT_DARK = "#5e50b5";
const INK = "#17181f";
const MUTED = "#5c5e70";
const LINE = "#e4e5ee";
const TINT = "#efedfb";

export function mailConfig() {
  const from = process.env.NEWSLETTER_FROM || "Ahmed Tarek <newsletter@ahmedtarek.tech>";
  return {
    configured: !!process.env.RESEND_API_KEY,
    from,
    replyTo: process.env.NEWSLETTER_REPLY_TO || "se.ahmedtprofile@gmail.com",
  };
}

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* Body text is written as plain paragraphs separated by blank lines — the way
   anyone writes an email. Bold is **asterisks**, the same convention the
   content dashboard already uses, and a line that is just "- something"
   becomes a bullet. Nothing here asks anyone to write HTML. */
function inline(s) {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, `<strong style="font-weight:600;color:${INK};">$1</strong>`)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      `<a href="$2" style="color:${ACCENT_DARK};text-decoration:underline;">$1</a>`)
    .replace(/\n/g, "<br />");
}

function paragraphs(body) {
  const blocks = String(body || "").replace(/\r\n/g, "\n").split(/\n{2,}/);
  const out = [];
  for (const raw of blocks) {
    const block = raw.trim();
    if (!block) continue;
    const lines = block.split("\n");
    if (lines.every((l) => /^\s*[-•]\s+/.test(l))) {
      const li = lines
        .map((l) => `<li style="margin:0 0 8px 0;">${inline(l.replace(/^\s*[-•]\s+/, ""))}</li>`)
        .join("");
      out.push(
        `<ul style="margin:0 0 20px 0;padding:0 0 0 22px;font-size:16px;line-height:1.7;color:${MUTED};">${li}</ul>`
      );
      continue;
    }
    out.push(
      `<p style="margin:0 0 20px 0;font-size:16px;line-height:1.7;color:${MUTED};">${inline(block)}</p>`
    );
  }
  return out.join("");
}

/**
 * The full email. `unsubUrl` is per-recipient, so every copy carries its own
 * one-click way out — which is also what keeps the mail out of spam folders.
 */
export function renderEmail({ heading, body, ctaLabel, ctaUrl, preheader, unsubUrl, siteUrl }) {
  const site = siteUrl || "https://ahmedtarek.tech";
  const cta = ctaLabel && ctaUrl
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 28px 0;">
         <tr><td style="border-radius:999px;background:${ACCENT};">
           <a href="${esc(ctaUrl)}" style="display:inline-block;padding:14px 30px;font-family:Inter,Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:999px;">${esc(ctaLabel)}</a>
         </td></tr>
       </table>`
    : "";

  const unsub = unsubUrl
    ? `<a href="${esc(unsubUrl)}" style="color:${MUTED};text-decoration:underline;">Unsubscribe</a>`
    : "";

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${esc(heading || "The Track")}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f9;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader || "")}</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f4f4f9;padding:32px 16px;">
<tr><td align="center">

  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:100%;max-width:600px;background:#ffffff;border:1px solid ${LINE};border-radius:18px;overflow:hidden;font-family:Inter,Helvetica,Arial,sans-serif;">

    <tr><td style="padding:26px 36px 22px 36px;border-bottom:1px solid ${LINE};background:${TINT};">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td style="padding-right:10px;">
          <img src="${site}/logo/favicon-64.png" width="34" height="34" alt="" style="display:block;border-radius:8px;" />
        </td>
        <td style="font-size:15px;font-weight:600;color:${INK};">
          Ahmed Tarek
          <div style="font-size:12px;font-weight:400;color:${MUTED};letter-spacing:.06em;text-transform:uppercase;">The Track</div>
        </td>
      </tr></table>
    </td></tr>

    <tr><td style="padding:36px 36px 8px 36px;">
      ${heading ? `<h1 style="margin:0 0 20px 0;font-size:27px;line-height:1.25;font-weight:600;color:${INK};">${inline(heading)}</h1>` : ""}
      ${paragraphs(body)}
      ${cta}
    </td></tr>

    <tr><td style="padding:22px 36px 30px 36px;border-top:1px solid ${LINE};font-size:12px;line-height:1.7;color:${MUTED};">
      You are getting this because you subscribed at
      <a href="${site}" style="color:${ACCENT_DARK};text-decoration:none;">ahmedtarek.tech</a>.
      ${unsub ? unsub + " any time." : ""}
      <div style="margin-top:8px;">© Ahmed Tarek · Dubai, working globally</div>
    </td></tr>

  </table>

</td></tr></table>
</body></html>`;
}

/** Plain-text twin, so the message is readable anywhere and scores better. */
export function renderText({ heading, body, ctaLabel, ctaUrl, unsubUrl }) {
  const lines = [];
  if (heading) lines.push(heading, "");
  lines.push(String(body || "").replace(/\*\*/g, ""));
  if (ctaLabel && ctaUrl) lines.push("", `${ctaLabel}: ${ctaUrl}`);
  lines.push("", "—", "You subscribed at ahmedtarek.tech.");
  if (unsubUrl) lines.push(`Unsubscribe: ${unsubUrl}`);
  return lines.join("\n");
}

/**
 * Hand a batch to Resend. Up to 100 messages per call is Resend's limit, so
 * the caller chunks; each message carries its own html and unsubscribe header.
 * Returns { sent, failed, error } and never throws for a rejected send —
 * a campaign half-delivered still needs to report what it managed.
 */
export async function sendBatch(messages) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { sent: 0, failed: messages.length, error: "RESEND_API_KEY is not set" };
  if (!messages.length) return { sent: 0, failed: 0 };

  let r;
  try {
    r = await fetch("https://api.resend.com/emails/batch", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(messages),
    });
  } catch (e) {
    return { sent: 0, failed: messages.length, error: `Could not reach Resend: ${e.message}` };
  }

  const text = await r.text();
  if (!r.ok) {
    let msg = text.slice(0, 300);
    try { msg = JSON.parse(text).message || msg; } catch { /* keep the raw body */ }
    return { sent: 0, failed: messages.length, error: `Resend refused the send (${r.status}): ${msg}` };
  }
  return { sent: messages.length, failed: 0 };
}
