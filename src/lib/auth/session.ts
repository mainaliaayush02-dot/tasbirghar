import "server-only";

import { cookies } from "next/headers";

import { adminAuth } from "@/lib/firebase/admin";

/**
 * Session cookies are Firebase session cookies minted by the Admin SDK from a
 * freshly issued ID token. They are httpOnly (no JS access), SameSite=Lax (not
 * sent on cross-site POSTs) and Secure in production.
 */
export const SESSION_COOKIE = "__session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 5; // 5 days (Firebase max: 14)

/** ID tokens older than this cannot be exchanged for a session (replay protection). */
const MAX_AUTH_AGE_SECONDS = 5 * 60;

export class SessionError extends Error {}

export async function createSession(idToken: string) {
  const decoded = await adminAuth()
    .verifyIdToken(idToken, true)
    .catch(() => {
      throw new SessionError("Invalid or expired sign-in token.");
    });

  if (Date.now() / 1000 - decoded.auth_time > MAX_AUTH_AGE_SECONDS) {
    throw new SessionError("Please sign in again.");
  }

  const sessionCookie = await adminAuth().createSessionCookie(idToken, {
    expiresIn: SESSION_MAX_AGE_SECONDS * 1000,
  });

  (await cookies()).set(SESSION_COOKIE, sessionCookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

  return decoded;
}

export async function clearSession() {
  (await cookies()).delete(SESSION_COOKIE);
}

/** Verified session claims, or null. Checks revocation (e.g. disabled users). */
export async function readSession() {
  const value = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!value) return null;
  try {
    return await adminAuth().verifySessionCookie(value, true);
  } catch {
    return null;
  }
}
