# Admin panel — setup guide

A private client-hours CRM at **`/admin`**, protected by iPhone passkeys (Face ID).
Static frontend + Vercel serverless functions in [api/](api/) + Neon Postgres.

## What it does
- **Passkey login, one device only** — no passwords, no secrets. The FIRST device to
  register (your iPhone) becomes the only key; registration then locks permanently,
  enforced in the database. On the iPhone it's Face ID; when you open `/admin` on a
  laptop, the browser shows a QR code you scan with the iPhone (built into passkeys).
- **Clients** — name, phone, email, nationality, transaction type (Direct / PayPal / …), notes.
- **Hour packages** — e.g. client pays for 30 hours on 1 Jan; they expire after 1 month
  (configurable 1–24 months per purchase).
- **Sessions** — date, duration, topic, and an optional meeting-minutes **PDF** (stored in
  the database, max 3 MB).
- **Balance graph** — per client: goes **up** on purchase, **down** per session, and
  **drops** when a package expires. Upcoming expiries are drawn dashed after the
  "today" line. Sessions always consume from the package that expires soonest.

## Site content dashboard — `/dashboard`

Edit every word, picture and link on the public pages without touching code or
redeploying. Same passkey as `/admin`; there is a **Site content** button in the
admin topbar.

**How it finds the content.** Nothing is tagged by hand. [cms.js](cms.js) runs on
`/`, `/full`, `/product` and `/educator`, walks the rendered page, and gives every
run of text, every image and every outbound link a stable key. The dashboard loads
each page in a hidden iframe and reads that same list back, so it can only ever
show what the page actually renders — around 220 items on the home page and 250–460
on the journey pages.

Keys come from the template runtime's `data-dc-tpl` id where there is one
(`index.html`), and otherwise from a hash of the original content (the journey
pages, whose cards `main.js` generates). Hashing the *original* rather than what is
on screen is what lets an override survive the very edit it applies. Change the
source text of an element and its override is dropped, which is the intended
behaviour — the page goes back to speaking for itself.

**Editing.** Type in a field and press *Save changes*; the live site picks it up on
the next load. Clear a field to revert that one item to whatever the page ships
with. Overrides live in the `site_content` table; nothing is written back to the
HTML.

**Media.** The *Media library* tab takes images and short clips up to **3 MB**
(Vercel caps a function request body at ~4.5 MB and base64 adds a third). They are
stored in `site_media` and served from `/api/cms?resource=media&id=N`. For real video, upload to
YouTube and paste the link into the relevant field instead. A picked file is stored
as `media:<id>` and resolved at render time.

**Photos are dashboard-only.** The `image-slot` component ships as a live drop
target — click an empty one and it opens a file picker, drag a file onto it and it
takes it. That belongs in a design tool, not on a public page, so `cms.js` makes
every slot inert and removes empty ones from the layout entirely (collapsing the
grid rows they were holding open). A slot reappears the moment a photo is set for
it from the dashboard. Visitors cannot upload anything.

**Limits worth knowing**
- A sentence with styling inside it is shown as plain words with the styled run in
  `**asterisks**` — no markup anywhere in the dashboard. Keep the same number of
  asterisk pairs and the styling survives the edit; change how many there are and
  there is no way to tell which run is which, so the words are kept and the styling
  is dropped.
- A one-emoji `<span>` counts as a styled run, so a few fields read like
  `**🇸🇦**Saudi Gov projects`. Harmless, and the asterisks stay out of the page.
- Short labels, buttons and links start out folded away behind *Show everything* —
  roughly 70 of 240 items on the home page are shown by default.
- A page-structure change in `index.html` or `main.js` can orphan overrides that
  pointed at the old content. They stay in the database, harmless, and the page
  falls back to source. Clear them with `DELETE /api/cms?all=1`.

## One-time setup (≈5 minutes)

1. **Deploy the repo on Vercel** (it already is, if the site is live).

2. **Add a database**: Vercel dashboard → your project → **Storage** →
   **Create Database → Neon (Postgres)** → accept defaults.
   This automatically adds `DATABASE_URL` to the project.
   Tables are created automatically on first use — no SQL to run.

3. **Add one environment variable** (Project → Settings → Environment Variables):

   | Name | Value |
   |---|---|
   | `SESSION_SECRET` | a long random string — run `openssl rand -hex 32` |

4. **Redeploy** (Deployments → ⋯ → Redeploy) so the env var takes effect.

5. **Register your iPhone** (do this promptly after deploying — first device wins):
   open `https://your-domain/admin` → *Create passkey*.
   - On the iPhone: confirm with Face ID, done.
   - On a computer: the browser shows a **QR code** → scan it with the iPhone camera →
     Face ID. The passkey lives on the iPhone either way.
   After this, setup is locked: no other device can ever register, and every login
   (including on computers, via QR) must be approved by that iPhone.

### Lost the phone / want to change the device?
Open the Neon database (Vercel → Storage → your DB → Query) and run
`DELETE FROM wa_credentials;` — `/admin` then offers first-time setup again.

## Local development

Passkeys require HTTPS or `localhost`, and the API needs the Vercel runtime:

```bash
npm i -g vercel
vercel link           # once
vercel env pull       # pulls DATABASE_URL etc. into .env.local
vercel dev            # http://localhost:3000/admin
```

## How hours are counted

- A purchase creates a **package**: N hours, purchase date, expiry date
  (default: purchase date + 1 month; the expiry date is the **last usable day**).
- A session deducts its duration from the **soonest-expiring active package** first.
- On the day after a package's expiry date, whatever is left in it becomes
  **expired hours** (the red/amber drop in the graph).
- If a session can't be covered by any active package, the uncovered time shows up
  as **Unpaid hours** on the client page.

## The booking calendar link

Nine buttons across the site say "Book a free consultation" or "Book a call".
They all read one setting: **/dashboard → Your links → Booking calendar**, the
first thing on the page. Change it once and every button follows.

The link is also hard-coded into the buttons themselves, so they still work
before the dashboard's script has loaded. If you ever change it in the HTML,
change `SITE_CONFIG.BOOKING_URL` in journey.html and the `fallback` in cms.js's
`SITEWIDE` list to match — otherwise the dashboard will show the old one until
you save over it.

## The video hub — /dashboard → Videos

There are three videos, all of them in the list. The big frame is not a fourth
one: it shows whichever list video is chosen, and the first one to begin with.
Click any of them and it plays there, with that video's own title above it.

The dashboard's **Videos** group is one box per video. Paste a YouTube link and
save — any shape works (`youtube.com/watch?v=…`, `youtu.be/…`, `/shorts/…`, or
the bare eleven-character id). Nothing else has to be entered.

**Titles and channel names come from YouTube too**, through its oEmbed
endpoint — no API key, and it sends an `Access-Control-Allow-Origin` for this
site, so there is no server in the middle. A video that is already up also
stops saying "Coming soon".

**Thumbnails come from YouTube.** `maxresdefault.jpg` is tried first and
measured, because asking for one that does not exist hands back a 120px grey
placeholder rather than a 404; anything smaller falls back to `hqdefault.jpg`,
which every video has. So the pictures are never uploaded and never go stale —
which is why the thumbnails, titles, channel names and the big
heading are all marked `data-cms-skip` and no longer appear in the dashboard.
A field that is always overwritten is a trap, not a feature — the link is the
only thing to enter.

A video with no link yet keeps the shipped placeholder, and clicking it goes to
the YouTube channel — the section is never half-broken while it is filled in.

The player is `youtube-nocookie.com`, so nothing is set until someone presses
play.

**Subscribe** opens YouTube's own subscribe dialog in a 560×660 window rather
than sending the visitor away — the page they came from is still behind it.
Nobody can be subscribed without confirming with their own Google account;
that is YouTube's rule. If the browser blocks the popup the link behaves the
way it always did.

The keys are hand-given (`data-cms-key="video-1"`…) rather than hashed from
content, because a field that starts out empty hashes the same as every other
empty field. cms.js fires a `cms:applied` event once overrides have landed,
which is how videos.js knows the links have arrived.

## Newsletter — /dashboard → Newsletter

The **Subscribe to The Track** box on the home page writes to
`newsletter_subscribers`. The dashboard's Newsletter tab shows who is on the
list, exports it as CSV, removes an address, and is where an email is written
and sent.

Writing an email is plain text: a blank line starts a new paragraph,
`**asterisks**` make a word bold, a line starting with `-` becomes a bullet,
and `[words](https://link)` becomes a link. **See how it looks** renders the
real email — the same code that sends it — so nothing is a surprise.

### Switching sending on

Two providers are understood, and whichever key is present is the one used.
Set the variables in the Vercel project (Settings → Environment Variables),
then redeploy.

**Brevo — the one that can be sending today.** It verifies a single sender
address by emailing you a link, so no DNS record has to exist first. Free tier
is 300 emails a day.

| Variable | Value |
| --- | --- |
| `BREVO_API_KEY` | `xkeysib-…` from app.brevo.com → SMTP & API → API keys |
| `NEWSLETTER_FROM` | `Ahmed Tarek <the address you verified>` |

**Resend — better once the domain is set up.** Needs `ahmedtarek.tech`
verified with DNS records before it will send from an address on it. Free tier
is 3,000 a month.

| Variable | Value |
| --- | --- |
| `RESEND_API_KEY` | `re_…` from resend.com/api-keys |
| `NEWSLETTER_FROM` | `Ahmed Tarek <newsletter@ahmedtarek.tech>` |

If both keys are set, Brevo wins. `NEWSLETTER_REPLY_TO` overrides the
reply-to address, which otherwise goes to the Gmail account.

Whichever is chosen, `NEWSLETTER_FROM` has to be an address that provider has
accepted, or it refuses the send and the tab shows the refusal verbatim. Until
a key is there everything else — collecting subscribers, writing, previewing —
still works.

A send goes out in chunks of 60: the browser asks for one chunk, the function
sends it and says where it got to, and the loop repeats. That is what keeps a
list of any size inside a serverless request's time limit, and why a send that
fails partway can still say how many went out.

Every copy carries a personal `/unsubscribe?token=…` link and a
`List-Unsubscribe` header. Unsubscribing flips the row's status rather than
deleting it.

## Performance and hardening

**The home page went from 6.75 MB to 0.74 MB.** Six PNGs were doing 5.5 MB of
that — photographs saved as PNG, at up to 2730px for a slot that shows them at
700. They are WebP now, alpha intact, at twice their displayed size and no
more. The rest of the referenced images were re-encoded in place, same
filenames, so nothing in the markup could end up pointing at a file that is
not there.

**Nothing on the public pages comes from someone else's CDN any more.** The
page's own runtime fetched React from unpkg at load; with unpkg unreachable
the home page rendered *blank* — no nav, no text, nothing. React and ReactDOM
are now served from `/vendor`, byte-identical to the versions `support.js`
pins by SHA-384 (verified against those hashes), wired through the runtime's
own `window.__resources` override. The 220 KB Phosphor icon stylesheet and
webfont are replaced by `icons.css`: the 24 icons this site actually uses, as
CSS masks, 18 KB, same `<i class="ph ph-play">` markup, and `star-fill` now
renders — it never had a glyph in the regular webfont.

`.image-slots.state.json` was a 404 on every single page load: a sidecar only
the design tool writes. It is not requested outside that tool now. An
`<img src="">` in the lightbox made the browser download the whole page a
second time each time the lightbox closed.

### Security

| | |
| --- | --- |
| Headers | CSP (`frame-ancestors`, `base-uri`, `object-src`, `form-action`), `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` |
| Uploaded files | served with `sandbox` CSP + `nosniff`, so an SVG cannot run script on this origin |
| Saved links | must be http(s)/mailto/tel/relative/anchor — `javascript:` and `data:` are refused on save *and* on the way onto the page |
| Public sign-up | five per hour per address, plus a hidden field no person fills in |
| Unsubscribing | the GET asks, the POST acts, so a corporate mail scanner opening every link cannot unsubscribe the person it is protecting |
| Server errors | the reason goes to the Vercel log; the response says only that something went wrong |
| `/admin`, `/dashboard`, `/time` | `Cache-Control: private, no-store` |

All twelve API routes were checked for an auth guard ahead of any data access.
Everything private answers 401 without a session. Queries are tagged
templates throughout, so there is no string-built SQL anywhere.

## The twelve-function ceiling

Vercel's Hobby plan allows **12 Serverless Functions per deployment**, and this
project sits exactly on the line — `ls api/*.js | wc -l` must not exceed 12. Going
over does not fail the build; the build completes and the *deployment* is never
published, so the live site silently keeps serving the previous commit and every
new route 404s. That is what it looks like when it happens.

It has bitten twice: once when a Health tab added two endpoints (fixed by folding
them into one `health.js`), and again when the content dashboard did. Content and
media therefore share `api/cms.js`, and the single-client detail route lives inside
`api/clients.js` as `GET ?id=N` rather than in its own file. Adding a new endpoint
means merging it into an existing one.

## Files

| Path | Role |
|---|---|
| `admin.html` / `admin.css` / `admin.js` | the admin app (list, detail, chart, forms) |
| `api/auth.js` | WebAuthn passkey register / login / logout |
| `api/clients.js`, `api/client.js` | clients CRUD + per-client detail & timeline |
| `api/packages.js`, `api/sessions.js`, `api/pdf.js` | purchases, session records, PDF download |
| `api/_lib/hours.js` | the balance/expiry engine (single source of truth) |
| `api/_lib/db.js`, `api/_lib/util.js` | Neon client + schema, cookies/sessions |

## Security notes

- All data endpoints require a valid passkey session (7-day signed, HttpOnly cookie).
- Exactly one passkey can ever exist; the guarded INSERT in `api/auth.js` makes a
  second registration impossible until you wipe `wa_credentials` yourself.
- Passkeys created on iPhone sync via iCloud Keychain, so your other Apple devices
  signed into the same Apple ID can also answer the QR — that's still only you.
- `/admin` is `noindex` and never linked from the public site.
