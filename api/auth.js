// Passkey (WebAuthn) authentication.
//
//   GET  /api/auth?action=me               -> { authed, hasCredentials }
//   POST /api/auth?action=login-options    -> WebAuthn authentication options
//   POST /api/auth?action=login-verify     -> verify assertion, start session
//   POST /api/auth?action=register-options -> WebAuthn registration options (ONLY while no device is registered)
//   POST /api/auth?action=register-verify  -> verify attestation, save credential, start session
//   POST /api/auth?action=logout
//
// Registration is first-device-only: once one passkey exists, registration is
// permanently closed (enforced with a guarded INSERT). To reset, delete the
// rows in wa_credentials.
//
// The WebAuthn challenge is kept in a short-lived signed cookie, so no server
// state is needed between the two steps. Signing in from a laptop shows the
// browser's QR code for the iPhone automatically (hybrid transport).
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import { db } from "./_lib/db.js";
import {
  withErrors, json, rp, sign, verifyToken, parseCookies, setCookie, clearCookie,
  createSession, destroySession, isAuthed,
} from "./_lib/util.js";

const RP_NAME = "Ahmed Tarek — Admin";
const CHALLENGE_COOKIE = "wa_challenge";
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

function saveChallenge(res, type, challenge) {
  setCookie(res, CHALLENGE_COOKIE, sign({ t: type, ch: challenge, exp: Date.now() + CHALLENGE_TTL_MS }), CHALLENGE_TTL_MS / 1000);
}

function readChallenge(req, res, type) {
  const payload = verifyToken(parseCookies(req)[CHALLENGE_COOKIE]);
  clearCookie(res, CHALLENGE_COOKIE);
  if (!payload || payload.t !== type) return null;
  return payload.ch;
}

const LOCKED_MSG = "Setup is locked — the admin device is already registered";

async function credentialCount(sql) {
  const [{ count }] = await sql`SELECT count(*)::int AS count FROM wa_credentials`;
  return count;
}

export default withErrors(async (req, res) => {
  const action = req.query.action;
  const { rpID, origin } = rp(req);
  const body = req.body || {};

  if (action === "me" && req.method === "GET") {
    const sql = await db();
    return json(res, 200, { authed: isAuthed(req), hasCredentials: (await credentialCount(sql)) > 0 });
  }

  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

  if (action === "logout") {
    destroySession(res);
    return json(res, 200, { ok: true });
  }

  if (action === "login-options") {
    const options = await generateAuthenticationOptions({ rpID, userVerification: "required" });
    saveChallenge(res, "auth", options.challenge);
    return json(res, 200, options);
  }

  if (action === "login-verify") {
    const challenge = readChallenge(req, res, "auth");
    if (!challenge) return json(res, 400, { error: "Challenge expired — try again" });
    const sql = await db();
    const rows = await sql`SELECT * FROM wa_credentials WHERE id = ${body.response?.id || ""}`;
    if (!rows.length) return json(res, 401, { error: "Unknown passkey" });
    const cred = rows[0];

    const verification = await verifyAuthenticationResponse({
      response: body.response,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: cred.id,
        publicKey: Buffer.from(cred.public_key, "base64url"),
        counter: Number(cred.counter),
        transports: cred.transports ? JSON.parse(cred.transports) : undefined,
      },
      requireUserVerification: true,
    });
    if (!verification.verified) return json(res, 401, { error: "Passkey verification failed" });

    await sql`UPDATE wa_credentials SET counter = ${verification.authenticationInfo.newCounter} WHERE id = ${cred.id}`;
    createSession(res);
    return json(res, 200, { ok: true });
  }

  if (action === "register-options") {
    const sql = await db();
    if ((await credentialCount(sql)) > 0) return json(res, 403, { error: LOCKED_MSG });
    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID,
      userName: "admin",
      userDisplayName: "Admin",
      attestationType: "none",
      authenticatorSelection: { residentKey: "required", userVerification: "required" },
    });
    saveChallenge(res, "reg", options.challenge);
    return json(res, 200, options);
  }

  if (action === "register-verify") {
    const challenge = readChallenge(req, res, "reg");
    if (!challenge) return json(res, 400, { error: "Challenge expired — try again" });

    const verification = await verifyRegistrationResponse({
      response: body.response,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
    });
    if (!verification.verified) return json(res, 400, { error: "Registration failed" });

    const { credential } = verification.registrationInfo;
    const sql = await db();
    // guarded insert: succeeds only while the table is empty, so exactly one
    // device can ever register — no race, no way to add a second passkey
    const inserted = await sql`INSERT INTO wa_credentials (id, public_key, counter, transports, label)
      SELECT ${credential.id}, ${Buffer.from(credential.publicKey).toString("base64url")},
             ${credential.counter}, ${JSON.stringify(credential.transports || [])},
             ${body.label || "admin device"}
      WHERE NOT EXISTS (SELECT 1 FROM wa_credentials)
      RETURNING id`;
    if (!inserted.length) return json(res, 403, { error: LOCKED_MSG });
    createSession(res);
    return json(res, 200, { ok: true });
  }

  return json(res, 400, { error: "Unknown action" });
});
