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
import { json, isAuthed } from "./util.js";

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
    )`.catch((err) => { _ready = null; throw err; });
  }
  return _ready;
}

const clip = (v, n) => (v == null ? null : String(v).slice(0, n));

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

  const ip = clip(String(req.headers["x-forwarded-for"] || "").split(",")[0].trim(), 64);
  await sql`INSERT INTO security_snaps (kind, page, photo, note, ua, ip)
    VALUES (${b.kind}, ${clip(b.page, 120)}, ${photo}, ${clip(b.note, 200)}, ${clip(req.headers["user-agent"], 300)}, ${ip})`;
  await sql`DELETE FROM security_snaps WHERE id NOT IN (SELECT id FROM security_snaps ORDER BY id DESC LIMIT ${KEEP})`;
  return json(res, 201, { ok: true });
}

/** GET ?action=snaps — the owner's view of the log. */
export async function snapList(req, res, sql) {
  if (!isAuthed(req)) return json(res, 401, { error: "Not authenticated" });
  await ensure(sql);
  const snaps = await sql`SELECT id, kind, page, photo, note, ua, ip, created_at FROM security_snaps ORDER BY id DESC`;
  res.setHeader("Cache-Control", "private, no-store");
  return json(res, 200, { snaps });
}

/** POST ?action=snaps-clear — empty the log. */
export async function snapClear(req, res, sql) {
  if (!isAuthed(req)) return json(res, 401, { error: "Not authenticated" });
  await ensure(sql);
  await sql`DELETE FROM security_snaps`;
  return json(res, 200, { ok: true });
}
