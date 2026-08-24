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

Nothing is sent until two environment variables exist in the Vercel project
(Settings → Environment Variables), after which the project needs a redeploy:

| Variable | Value |
| --- | --- |
| `RESEND_API_KEY` | `re_…` from resend.com/api-keys |
| `NEWSLETTER_FROM` | `Ahmed Tarek <newsletter@ahmedtarek.tech>` |

The from-address has to sit on a domain verified in Resend, or Resend refuses
the send. Until the key is there the tab says so plainly and everything else —
collecting subscribers, writing, previewing — still works.

A send goes out in chunks of 60: the browser asks for one chunk, the function
sends it and says where it got to, and the loop repeats. That is what keeps a
list of any size inside a serverless request's time limit, and why a send that
fails partway can still say how many went out.

Every copy carries a personal `/unsubscribe?token=…` link and a
`List-Unsubscribe` header. Unsubscribing flips the row's status rather than
deleting it.

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
