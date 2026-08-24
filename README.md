# ahmedtarek.tech

The personal site of Ahmed Tarek Mourssi, and the private tools that run behind
it: a client-hours CRM, a content dashboard, a newsletter and a time tracker.

**Live:** <https://ahmedtarek.tech>

There is no build step. What is in this repository is what is served — HTML,
CSS and plain browser JavaScript, plus a small set of serverless functions.
Clone it, serve the folder, and you are looking at the site.

---

## Contents

- [Stack](#stack)
- [Quick start](#quick-start)
- [Repository layout](#repository-layout)
- [Pages and routing](#pages-and-routing)
- [How the public site is put together](#how-the-public-site-is-put-together)
- [The content overlay](#the-content-overlay)
- [The private tools](#the-private-tools)
- [API](#api)
- [Database](#database)
- [Authentication](#authentication)
- [The newsletter](#the-newsletter)
- [Environment variables](#environment-variables)
- [Deploying](#deploying)
- [Findability (SEO and AI search)](#findability-seo-and-ai-search)
- [Conventions](#conventions)
- [Things that have bitten us](#things-that-have-bitten-us)

---

## Stack

| Layer | What it is |
|---|---|
| Pages | Static HTML. The landing page is a design tool export; the rest is hand-written |
| Styles | Plain CSS with custom properties. No preprocessor |
| Browser JS | ES5-flavoured vanilla JS in IIFEs. No framework, no bundler, no transpiler |
| Server | Vercel serverless functions (Node 22, ES modules) in [`api/`](api/) |
| Database | Neon Postgres, over `@neondatabase/serverless` |
| Auth | WebAuthn passkeys, via `@simplewebauthn/server` |
| Email | Brevo (or Resend) transactional API |
| Hosting | Vercel |

The only npm dependencies are the two used by the functions. Nothing is
installed to build the front end, because nothing builds it.

## Quick start

```bash
git clone <this repo>
cd portfolio
npm install          # only needed for the functions
```

**Pages only** — fastest, but `/api` will 404, so the content overlay, the
newsletter form and every private tool will fail:

```bash
python3 -m http.server 5173      # then open http://localhost:5173
```

**The whole thing**, functions included:

```bash
npx vercel dev
```

That needs the environment variables below. Ask for a `.env` rather than
pointing it at production — the database holds real client records.

## Repository layout

```
.
├── index.html            the landing page  (design tool export — see below)
├── journey.html          /product, /educator and /full: one file, three views
├── dashboard.html        content + newsletter dashboard   (passkey)
├── admin.html            client CRM                       (passkey)
├── time.html             time and goals tracker           (passkey)
├── share.html            a client's read-only hours view  (token in the URL)
│
├── css/
│   ├── site/             the public pages
│   │   ├── journey.css     everything journey.html looks like
│   │   └── icons.css       29 Phosphor icons as CSS masks (see Conventions)
│   └── tools/            the private pages
│       ├── app.css         the shared shell: palette, buttons, tables, toasts
│       ├── dashboard.css   additions for /dashboard
│       └── time.css        additions for /time
│
├── js/
│   ├── site/             the public pages
│   │   ├── cms.js          applies dashboard edits over the rendered page
│   │   ├── journey.js      all of journey.html: data, cards, reveals, lightbox
│   │   ├── newsletter.js   the sign-up form
│   │   ├── tabbar.js       the phone tab bar's active state
│   │   └── videos.js       the content hub: YouTube thumbnails, titles, playback
│   ├── tools/            the private pages
│   │   ├── admin.js  dashboard.js  time.js  share.js
│   │   └── chart.js        the hours-balance chart, shared by three pages
│   └── runtime/          GENERATED — the design tool's runtime for index.html
│       ├── support.js
│       └── image-slot.js
│
├── api/                  serverless functions — one file per endpoint group
│   └── _lib/             shared server code (db, auth, hours engine, email)
│
├── assets/               photographs, video, client logos, CV PDFs
├── logo/                 the site's mark in the sizes browsers and email want,
│                        plus og-card.jpg, the link preview
├── vendor/               React, pinned and self-hosted (see Conventions)
├── _ds/                  GENERATED — the design tool's bundle for index.html
├── docs/ARCHITECTURE.md  the long version: CMS internals, admin tools, operations
├── robots.txt            crawl rules — read the comment before editing
├── sitemap.xml           the four public URLs
└── vercel.json           routing, security headers, caching
```

Anything marked GENERATED is written by the design tool. Do not hand-edit it;
a re-export will discard the work.

## Pages and routing

Friendly URLs are rewrites in [`vercel.json`](vercel.json) — the files stay at
the root.

| URL | File | Access |
|---|---|---|
| `/` | `index.html` | public |
| `/product`, `/educator`, `/full` | `journey.html` | public |
| `/c/:token` | `share.html` | anyone holding the token |
| `/unsubscribe` | → `api/cms.js` | public |
| `/dashboard` | `dashboard.html` | passkey |
| `/admin` | `admin.html` | passkey |
| `/time` | `time.html` | passkey |

`journey.html` decides which of the three views to render from the URL it was
served under. The private pages are `noindex` and never linked from the public
site.

## How the public site is put together

The landing page is unusual and worth understanding before editing it.

`index.html` is exported from a design tool. Its markup carries inline styles,
and `js/runtime/support.js` paints it in the browser. Three consequences:

1. **The runtime repaints `<body>` after the deferred scripts have run.**
   Every element in the page is replaced. Anything that grabbed a node early —
   an observer, an event listener — is left holding an orphan. This is why the
   site's scripts use event delegation on `document`, and why `cms.js` fires a
   `cms:applied` event that `tabbar.js` and `videos.js` listen for to rebuild.
2. **The runtime drops boolean attributes it does not recognise**, `hidden`
   among them. Use `style.display` to hide something, never `hidden`.
3. **Hand edits to that file survive only until the next export.** The parts
   added on top — the `<script>` tags, the `window.__resources` map, the
   `<style>` block inside `<helmet>`, and the `data-*` attributes the dashboard
   reads — are listed in a comment at the top of the file.

`journey.html` has none of this. It is an ordinary page driven by
`js/site/journey.js`, and the résumé data lives at the top of that file.

## The content overlay

The words, pictures, links, booking URL and video list on the public pages are
**not** edited in these files. They are edited at `/dashboard`, stored in
Postgres and applied over the page at load by `js/site/cms.js`.

Roughly how it works — [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) has the
full account:

- Nothing is tagged by hand. `cms.js` walks the rendered DOM and decides what
  is editable from what it finds.
- Each editable thing gets a stable key. By default that is a hash of the
  element's *original* text, so the key survives reordering and restyling; an
  explicit `data-cms-key` pins one that must not move.
- One page fetch (`GET /api/cms`, public, no auth) returns every override, and
  they are applied before the first paint the visitor notices.
- `cms.js` then dispatches `cms:applied` on `document`.
- Link values are checked against a scheme allowlist before being written, so a
  compromised override cannot inject `javascript:`.

What is in the HTML is therefore the **default**: what shows before anyone has
overridden it, and what shows if the database cannot be reached.

Special cases worth knowing:

- **The booking URL** is one sitewide setting (`site:booking#href`) that drives
  every "Book a free consultation" button — anything matching
  `[data-cta="book"], [data-book]`.
- **Videos** carry `data-yt`. Paste a YouTube link in the dashboard and
  `videos.js` fetches the thumbnail, title and channel from YouTube itself.

## The private tools

| Page | What it is for |
|---|---|
| `/admin` | Clients, hour packages, sessions, payment proofs, and a balance chart that rises on purchase, falls per session and drops on expiry |
| `/dashboard` | Editing the public pages, the media library, and writing/sending the newsletter |
| `/time` | Days, tasks, quarterly categories, goals and the hours behind them |
| `/c/:token` | What a client sees: their own hours, no notes, no contact details |

The hours arithmetic — balances, expiry, which package a session consumes —
lives in one place, [`api/_lib/hours.js`](api/_lib/hours.js), and nothing else
recomputes it.

## API

Every endpoint is `api/<name>.js`. All of them require a valid session except
where marked PUBLIC. Each file opens with its own route list; this is the map.

| Endpoint | What it covers |
|---|---|
| `auth.js` | passkey register / login / logout / recovery reset |
| `clients.js` | clients CRUD, per-client detail and timeline, share tokens |
| `packages.js` | hour purchases, with payment proof |
| `sessions.js` | session records, with meeting-minutes PDF |
| `pdf.js` | streams a stored PDF or payment proof |
| `cms.js` | **PUBLIC** content read; authed content write; media library; the whole newsletter |
| `share.js` | **PUBLIC** read-only client view, gated by share token |
| `tasks.js`, `quarters.js`, `goals.js`, `ideas.js`, `day-photos.js` | the time tracker |

`api/_lib/` holds what they share: `db.js` (Neon client and schema),
`util.js` (signed cookies, the auth guard, request helpers), `hours.js`,
`quarter.js` and `mail.js`.

> **Before adding an endpoint, read [Things that have bitten us](#things-that-have-bitten-us).**
> The function count is capped and `api/` is at the cap.

## Database

Neon Postgres. The schema is created lazily by `api/_lib/db.js` on first use —
there are no migration files, and adding a column means an
`ALTER TABLE ... ADD COLUMN IF NOT EXISTS` there.

Tables: `wa_credentials`, `clients`, `hour_packages`, `client_sessions`,
`quarters`, `quarter_categories`, `tasks`, `goals`, `ideas`, `day_photos`,
`site_content`, `site_media`, `newsletter_subscribers`, `newsletter_campaigns`.

Uploaded files (PDFs, payment proofs, photographs, media library images) are
stored in Postgres rather than object storage. Sizes are capped at the API.

## Authentication

One passkey. No passwords, and no second account.

- The **first** device to register becomes the only one that can ever log in.
  Registration then locks permanently, enforced by a guarded `INSERT` in
  `api/auth.js` rather than by a flag in the app.
- Sessions are a 7-day signed, `HttpOnly` cookie.
- On a laptop the browser shows a QR code to scan with the registered phone —
  that is passkeys working as designed, not a workaround.
- Losing the phone means `POST /api/auth?action=reset` with `ADMIN_RESET_SECRET`,
  which wipes registered credentials and leaves client data untouched.

## The newsletter

All of it rides on `api/cms.js` (see the function cap). Sign-up is public and
protected by a honeypot field named `website` plus a limit of five sign-ups an
hour from one IP. Every subscriber gets their own unsubscribe token, and every
email carries their own unsubscribe link — which is also what keeps the mail
out of spam folders.

Sending goes through whichever provider has a key set: **Brevo** if
`BREVO_API_KEY` is present, otherwise **Resend**. Brevo is the default because
it verifies a single sender address by email, so nothing has to be proven in
DNS first. Campaigns are sent in chunks of 60 with the dashboard driving the
loop, so a large list cannot time out a single request.

## Environment variables

Set in the Vercel project. `vercel env pull` writes them to `.env.local` for
`vercel dev`.

| Variable | Required | What it is |
|---|---|---|
| `DATABASE_URL` | yes | Neon connection string |
| `SESSION_SECRET` | yes | signs the session cookie |
| `ADMIN_RESET_SECRET` | recommended | allows the passkey recovery reset |
| `BREVO_API_KEY` | for sending | Brevo transactional API key |
| `RESEND_API_KEY` | alternative | used only when there is no Brevo key |
| `NEWSLETTER_FROM` | for sending | `Name <address>`; must be a sender the provider has verified |
| `NEWSLETTER_REPLY_TO` | optional | defaults to the site's contact address |

Without a mail key the dashboard still collects subscribers and previews
emails, and says plainly that sending is off.

## Deploying

Push to the default branch. Vercel builds and deploys; there is nothing to
compile, so a deploy is a copy plus the functions.

[`vercel.json`](vercel.json) carries three things worth knowing:

- **Rewrites** — the friendly URLs, and `/unsubscribe` straight into the
  newsletter function.
- **Security headers** — CSP (`frame-ancestors`, `base-uri`, `object-src`,
  `form-action`), `X-Frame-Options`, `nosniff`, `Referrer-Policy` and a
  `Permissions-Policy` that turns off camera, microphone, geolocation and
  payment. `/api/*` gets its own stricter policy; the private pages get
  `no-store`.
- **Caching** — `/assets`, `/logo` and `/vendor` are immutable for a year.
  `css/` and `js/` are not, because they change; they are cache-busted by the
  `?v=` on each tag instead.

## Findability (SEO and AI search)

The site is written to be found two ways: by search engines, and by the
assistants people increasingly ask instead of searching. Both are served by
the same thing — clear answers, in the words people use to ask, marked up so a
machine can tell what it is looking at.

What is in place:

- **`robots.txt`** — open to everyone, including the AI crawlers, each named
  explicitly. Note the comment in that file: a bot that finds a group with its
  own name ignores `User-agent: *` entirely, so the private paths are repeated
  in every group. Removing that repetition would hand those bots `/admin` and
  the client share links.
- **`sitemap.xml`** — the four public URLs, each self-canonical.
- **Per-page metadata** — title, description, canonical, Open Graph and Twitter
  cards on every public page. `logo/og-card.jpg` is the 1200×630 preview.
- **`journey.html` serves three URLs**, so it cannot ship three `<head>`s.
  `applyViewMeta()` in `js/site/journey.js` rewrites the title, description,
  canonical and preview tags per view. Google renders JavaScript and sees them;
  several AI crawlers do not, which is why the markup's own `<head>` describes
  a real view (`/product`) rather than a placeholder.
- **JSON-LD in `index.html`** — a `@graph` of `Person`, `ProfessionalService`
  with an offer catalogue of the three things he actually does, `WebSite`, and
  `FAQPage`. This is the file that tells an assistant who he is, what he sells,
  and to whom.
- **A visible FAQ (`#faq`)** whose answers are written to stand on their own out
  of context, because that is the form an assistant can quote. The JSON-LD is
  generated from that markup, so the two cannot drift — if you edit an answer,
  edit the schema block to match, or Google will treat the mismatch as a
  violation.

When editing any of this, keep one rule: **the structured data must describe
what is visibly on the page.** Marking up an FAQ that a visitor cannot read is
a manual-action risk, not a shortcut.

## Conventions

- **No build step, and no framework.** Browser JS is written as an IIFE, in the
  conservative dialect the rest of the file uses. If you find yourself wanting
  a bundler, that is a discussion, not a commit.
- **Bump the `?v=` when you change a CSS or JS file.** It is the only
  cache-busting there is.
- **Comment the *why*.** Every file opens with what it is and why it exists;
  inline comments explain decisions and traps, not syntax. A comment that
  restates the code is noise — one that says why the obvious approach failed is
  the reason the next person does not repeat it.
- **Delegate events on `document`** for anything inside runtime-painted markup,
  and rebuild on `cms:applied`.
- **Icons are CSS masks** in `css/site/icons.css` — the 29 the site uses, at
  22 KB, in place of a 220 KB icon font. `@supports` hides them where masks are
  unsupported rather than showing squares.
- **React is pinned in `vendor/`** and mapped in by `window.__resources` in
  `index.html`. The design runtime would otherwise fetch it from unpkg, and an
  unreachable CDN would render a blank page. The copies are byte-identical to
  the SHA-384 hashes the runtime pins.
- **Never `src=""`.** An empty `src` is not "no picture" — the browser resolves
  it to the current page and downloads the whole document to try to decode it.
  Use `removeAttribute("src")`.
- The public pages are English only. The translation layer in `journey.js` is
  still there and inert; do not wire it back up without asking.

## Things that have bitten us

- **Vercel's Hobby plan allows 12 serverless functions, and `api/` is at
  exactly 12.** A thirteenth builds cleanly, reports success, and is then
  silently never published — the deployment simply does not go live, with no
  error anywhere. This is why content, media and the newsletter all share
  `api/cms.js`, and why the single-client detail route lives inside
  `api/clients.js` as `GET ?id=N`. **New endpoints go inside an existing
  function.**
- **The design runtime replaces every node in `<body>`** after the deferred
  scripts run. Listeners and observers attached before that are watching
  elements no longer in the document. Delegate, and rebuild on `cms:applied`.
- **The runtime drops unknown boolean attributes**, `hidden` included.
- **A masked icon paints with `background-color`**, so it cannot also have a
  background of its own. A filled pill behind a mask icon needs a second
  element.
- **Invisible overlays eat clicks.** A hero button was unclickable for a while
  because a transparent quote layer sat over it at a higher `z-index`. If a
  button does nothing, check `document.elementFromPoint` before checking the
  handler.
- **A missing YouTube `maxresdefault.jpg` is not a 404** — it is a 120 px grey
  placeholder. Measure `naturalWidth` to decide whether to fall back to
  `hqdefault.jpg`.

---

Further reading: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — how the
content overlay decides what is editable, what each admin tool does, and how
the newsletter and hours engines work in detail.
