// Security log — who tried to get in and failed.
//
// When a login fails twice, or the finance PIN is entered wrong twice, the
// page asks the browser for the camera, takes one small frame, and posts it
// here with what happened. The owner reads the log at /security.
//
// Routed through api/auth.js (?action=snap|snaps|snaps-clear) because api/ is
// at the 12-function limit, and because recording has to work for someone who
// is NOT logged in — that is the whole point — which auth.js already allows.
//
// An endpoint that accepts writes from anyone is an invitation to fill the
// database, so it is boxed in on every side: one small JPEG per request, a
// ceiling on entries per hour across everyone, and only the newest rows kept.
import crypto from "node:crypto";
import { json, isAuthed, hasUnlock, createUnlockToken, safeEqual } from "./util.js";

// The log, clearing it and blocking all need a signed-in owner AND a passkey
// passcode entered just now on the security page (util.js hasUnlock). 423 tells the
// page to ask for the passcode; 401 sends it to /admin to sign in.
function ownerUnlocked(req, res) {
  if (!isAuthed(req)) { json(res, 401, { error: "Not authenticated" }); return false; }
  if (!hasUnlock(req)) { json(res, 423, { error: "Passcode needed" }); return false; }
  return true;
}

const KINDS = ["login", "pin"];
const MAX_PHOTO_CHARS = 220_000;   // ~160 KB of JPEG as a data: URL
const MAX_PER_HOUR = 20;
const KEEP = 60;

let _ready = null;
function ensure(sql) {
  if (!_ready) {
    _ready = sql`CREATE TABLE IF NOT EXISTS security_snaps (
      id SERIAL PRIMARY KEY,
      kind TEXT NOT NULL,
      page TEXT,
      photo TEXT,
      note TEXT,
      ua TEXT,
      ip TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`.then(() => sql`CREATE TABLE IF NOT EXISTS security_blocks (
      ip TEXT PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`).then(() => sql`CREATE TABLE IF NOT EXISTS security_code_fails (
      id SERIAL PRIMARY KEY,
      ip TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`).catch((err) => { _ready = null; throw err; });
  }
  return _ready;
}

const clip = (v, n) => (v == null ? null : String(v).slice(0, n));

/** The caller's address as Vercel reports it (first hop of x-forwarded-for). */
export const ipOf = (req) => clip(String(req.headers["x-forwarded-for"] || "").split(",")[0].trim(), 64) || "";

/** True when the owner has blocked this address from the sign-in endpoints. */
export async function isBlocked(req, sql) {
  const ip = ipOf(req);
  if (!ip) return false;
  await ensure(sql);
  const rows = await sql`SELECT 1 FROM security_blocks WHERE ip = ${ip}`;
  return rows.length > 0;
}

/** POST ?action=snap — open to anyone; see the limits above. */
export async function snapSave(req, res, sql) {
  const b = req.body || {};
  if (!KINDS.includes(b.kind)) return json(res, 400, { error: "bad kind" });
  let photo = null;
  if (b.photo != null) {
    photo = String(b.photo);
    if (!photo.startsWith("data:image/jpeg;base64,") || photo.length > MAX_PHOTO_CHARS) {
      return json(res, 400, { error: "bad photo" });
    }
  }
  await ensure(sql);
  const [{ n }] = await sql`SELECT count(*)::int AS n FROM security_snaps WHERE created_at > now() - interval '1 hour'`;
  if (n >= MAX_PER_HOUR) return json(res, 429, { error: "too many" });

  const ip = ipOf(req) || null;
  await sql`INSERT INTO security_snaps (kind, page, photo, note, ua, ip)
    VALUES (${b.kind}, ${clip(b.page, 120)}, ${photo}, ${clip(b.note, 200)}, ${clip(req.headers["user-agent"], 300)}, ${ip})`;
  await sql`DELETE FROM security_snaps WHERE id NOT IN (SELECT id FROM security_snaps ORDER BY id DESC LIMIT ${KEEP})`;
  return json(res, 201, { ok: true });
}

/** GET ?action=snaps — the owner's view of the log. */
export async function snapList(req, res, sql) {
  if (!ownerUnlocked(req, res)) return;
  await ensure(sql);
  const snaps = await sql`SELECT id, kind, page, photo, note, ua, ip, created_at FROM security_snaps ORDER BY id DESC`;
  const blocks = await sql`SELECT ip, created_at FROM security_blocks ORDER BY created_at DESC`;
  res.setHeader("Cache-Control", "private, no-store");
  // `you` lets the page mark the owner's own address, so it is not blocked by mistake
  return json(res, 200, { snaps, blocks, you: ipOf(req) });
}

/** POST ?action=snaps-clear — empty the log. */
export async function snapClear(req, res, sql) {
  if (!ownerUnlocked(req, res)) return;
  await ensure(sql);
  await sql`DELETE FROM security_snaps`;
  return json(res, 200, { ok: true });
}

/** POST ?action=block { ip, on } — block or unblock an address. Owner only. */
export async function blockSet(req, res, sql) {
  if (!ownerUnlocked(req, res)) return;
  const b = req.body || {};
  const ip = clip(b.ip, 64);
  if (!ip || !/^[0-9a-fA-F:.]+$/.test(ip)) return json(res, 400, { error: "bad ip" });
  await ensure(sql);
  if (b.on === false) {
    await sql`DELETE FROM security_blocks WHERE ip = ${ip}`;
    return json(res, 200, { ok: true });
  }
  // Blocking the address you are signed in from would lock you out the moment
  // this session ends, with no way back in from the same network.
  if (ip === ipOf(req)) return json(res, 409, { error: "That is the address you are using now" });
  await sql`INSERT INTO security_blocks (ip) VALUES (${ip}) ON CONFLICT (ip) DO NOTHING`;
  return json(res, 200, { ok: true });
}

// The security-log passcode (owner, 2026-11-18). Only its SHA-256 is kept here;
// set SECURITY_PASSCODE in Vercel to change it without touching code.
const PASSCODE_SHA256 = "81e94e735f39887ded997fa2e7aaaf319416006ac6252fbb9010197f8facc2da";
const CODE_FAILS_PER_HOUR = 5; // a 6-digit code must not be guessable by trying

function passcodeOk(code) {
  const env = process.env.SECURITY_PASSCODE;
  if (env) return safeEqual(code, env);
  return safeEqual(crypto.createHash("sha256").update(code).digest("hex"), PASSCODE_SHA256);
}

/** POST ?action=security-unlock { code } — owner only; returns { unlock }. */
export async function securityUnlock(req, res, sql) {
  if (!isAuthed(req)) return json(res, 401, { error: "Not authenticated" });
  await ensure(sql);
  const ip = ipOf(req) || null;
  const [{ n }] = await sql`SELECT count(*)::int AS n FROM security_code_fails
    WHERE ip IS NOT DISTINCT FROM ${ip} AND created_at > now() - interval '1 hour'`;
  if (n >= CODE_FAILS_PER_HOUR) return json(res, 429, { error: "Too many wrong codes — try again in an hour" });
  const code = String((req.body || {}).code || "").trim().slice(0, 32);
  if (!passcodeOk(code)) {
    await sql`INSERT INTO security_code_fails (ip) VALUES (${ip})`;
    await sql`DELETE FROM security_code_fails WHERE created_at < now() - interval '1 day'`;
    return json(res, 403, { error: "Wrong code", left: Math.max(0, CODE_FAILS_PER_HOUR - n - 1) });
  }
  await sql`DELETE FROM security_code_fails WHERE ip IS NOT DISTINCT FROM ${ip}`;
  res.setHeader("Cache-Control", "no-store");
  return json(res, 200, { ok: true, unlock: createUnlockToken() });
}
