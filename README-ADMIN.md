# Admin panel — setup guide

A private client-hours CRM at **`/admin`**, protected by iPhone passkeys (Face ID).
Static frontend + Vercel serverless functions in [api/](api/) + Neon Postgres.

## What it does
- **Passkey login** — no passwords. On the iPhone it's Face ID; when you open `/admin`
  on a laptop, the browser shows a QR code you scan with the iPhone (built into passkeys).
- **Clients** — name, phone, email, nationality, transaction type (Direct / PayPal / …), notes.
- **Hour packages** — e.g. client pays for 30 hours on 1 Jan; they expire after 1 month
  (configurable 1–24 months per purchase).
- **Sessions** — date, duration, topic, and an optional meeting-minutes **PDF** (stored in
  the database, max 3 MB).
- **Balance graph** — per client: goes **up** on purchase, **down** per session, and
  **drops** when a package expires. Upcoming expiries are drawn dashed after the
  "today" line. Sessions always consume from the package that expires soonest.

## One-time setup (≈5 minutes)

1. **Deploy the repo on Vercel** (it already is, if the site is live).

2. **Add a database**: Vercel dashboard → your project → **Storage** →
   **Create Database → Neon (Postgres)** → accept defaults.
   This automatically adds `DATABASE_URL` to the project.
   Tables are created automatically on first use — no SQL to run.

3. **Add two environment variables** (Project → Settings → Environment Variables):

   | Name | Value |
   |---|---|
   | `SESSION_SECRET` | a long random string — run `openssl rand -hex 32` |
   | `ADMIN_SETUP_SECRET` | a passphrase you choose — only needed when registering a new device |

4. **Redeploy** (Deployments → ⋯ → Redeploy) so the env vars take effect.

5. **Register your iPhone**: open `https://your-domain/admin` **on the iPhone** →
   *First-time setup* → enter the `ADMIN_SETUP_SECRET` → confirm with Face ID. Done.
   - To add a laptop later: log in there via QR + iPhone, then use **“+ Passkey”**, or
     use *First-time setup* with the secret on that device.

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
- Registering a new passkey requires either an existing session or `ADMIN_SETUP_SECRET`.
- `/admin` is `noindex` and never linked from the public site.
