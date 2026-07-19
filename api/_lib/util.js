// Shared helpers for the admin API: signed cookies, auth guard, request/response utils.
import crypto from "node:crypto";

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET env var is not set");
  return s;
}

function hmac(body) {
  return crypto.createHmac("sha256", secret()).update(body).digest("base64url");
}

/** Sign a JSON payload into a tamper-proof token: base64url(json).hmac */
export function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${hmac(body)}`;
}

/** Verify a token produced by sign(). Returns the payload or null (bad sig / expired). */
export function verifyToken(token) {
  if (!token || typeof token !== "string") return null;
  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;
  const body = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  const expect = hmac(body);
  const a = Buffer.from(mac);
  const b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString());
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

/** Constant-time string comparison (for the setup secret). */
export function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export function parseCookies(req) {
  const out = {};
  const raw = req.headers.cookie || "";
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function setCookie(res, name, value, maxAgeSec) {
  const secure = process.env.NODE_ENV !== "development";
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSec}`,
  ];
  if (secure) parts.push("Secure");
  const prev = res.getHeader("Set-Cookie");
  const list = prev ? (Array.isArray(prev) ? prev : [prev]) : [];
  res.setHeader("Set-Cookie", [...list, parts.join("; ")]);
}

export function clearCookie(res, name) {
  setCookie(res, name, "", 0);
}

/** Relying-party info derived from the request host. */
export function rp(req) {
  const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost";
  const rpID = String(host).split(":")[0];
  const proto = req.headers["x-forwarded-proto"] || (rpID === "localhost" ? "http" : "https");
  return { rpID, origin: `${proto}://${host}` };
}

const SESSION_COOKIE = "admin_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function createSession(res) {
  const token = sign({ t: "sess", exp: Date.now() + SESSION_TTL_MS });
  setCookie(res, SESSION_COOKIE, token, SESSION_TTL_MS / 1000);
}

export function destroySession(res) {
  clearCookie(res, SESSION_COOKIE);
}

export function isAuthed(req) {
  const payload = verifyToken(parseCookies(req)[SESSION_COOKIE]);
  return !!payload && payload.t === "sess";
}

/** Guard: responds 401 and returns false when not logged in. */
export function requireAuth(req, res) {
  if (isAuthed(req)) return true;
  res.status(401).json({ error: "Not authenticated" });
  return false;
}

export function json(res, status, data) {
  res.status(status).json(data);
}

/** Wrap a handler with uniform error reporting. */
export function withErrors(handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: err.message || "Server error" });
    }
  };
}
