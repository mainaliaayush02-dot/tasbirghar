import { apiRoute, ApiError, readJson, validated } from "@/lib/api/http";
import { homeForRole } from "@/lib/auth/current-user";
import { roleFromClaims } from "@/lib/auth/roles";
import { clearSession, createSession, readSession, SessionError } from "@/lib/auth/session";
import { adminAuth } from "@/lib/firebase/admin";
import { ensureUserDoc } from "@/lib/data/users";
import { validate } from "@/lib/validation/core";
import { signupProfileSchema } from "@/lib/validation/schemas";

/**
 * POST /api/auth/session  { idToken, profile?: { displayName, phone } }
 *
 * Exchanges a fresh Firebase ID token for an httpOnly session cookie and, on
 * first sign-in, creates users/{uid}. Identity (uid, email) and role come from
 * the verified token — never from the request body.
 */
export const POST = apiRoute(async (request) => {
  const body = (await readJson(request)) as { idToken?: unknown; profile?: unknown };
  if (typeof body.idToken !== "string" || body.idToken.length > 4096) {
    throw new ApiError(400, "INVALID_TOKEN", "Missing sign-in token.");
  }
  for (const key of Object.keys(body)) {
    if (key !== "idToken" && key !== "profile") {
      throw new ApiError(422, "VALIDATION_FAILED", "Unexpected field.", { [key]: "Unexpected field." });
    }
  }
  const profile =
    body.profile === undefined ? null : validated(validate(signupProfileSchema, body.profile));

  let decoded;
  try {
    decoded = await createSession(body.idToken);
  } catch (error) {
    if (error instanceof SessionError) throw new ApiError(401, "INVALID_TOKEN", error.message);
    throw error;
  }

  const role = roleFromClaims(decoded);
  await ensureUserDoc(
    {
      uid: decoded.uid,
      email: decoded.email ?? null,
      name: typeof decoded.name === "string" ? decoded.name : null,
      role,
    },
    profile,
  );

  return Response.json({ role, redirectTo: homeForRole(role) });
});

/**
 * DELETE /api/auth/session — sign out. Clears the cookie AND revokes the
 * user's refresh tokens, so a copied session cookie stops working server-side
 * too (session cookies cannot be revoked individually; this signs the user
 * out on every device).
 */
export const DELETE = apiRoute(async () => {
  const session = await readSession();
  await clearSession();
  if (session) await adminAuth().revokeRefreshTokens(session.uid);
  return Response.json({ ok: true });
});
