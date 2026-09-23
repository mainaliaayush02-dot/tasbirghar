import "server-only";

import { notFound, redirect } from "next/navigation";
import { cache } from "react";

import { adminAuth } from "@/lib/firebase/admin";
import type { UserRole } from "@/types/models";

import { canAccessArea, roleFromClaims, type PrivateArea } from "./roles";
import { readSession } from "./session";

export interface CurrentUser {
  uid: string;
  /** From Firebase Auth (verified), never from client input or Firestore. */
  email: string | null;
  emailVerified: boolean;
  displayName: string | null;
  /** From the live custom claim — the only authoritative role. */
  role: UserRole;
}

/**
 * The authenticated user for this request, or null.
 *
 * Reads the session cookie, verifies it (including revocation), then loads
 * the user record so custom claims are CURRENT — a role granted or revoked
 * after the session was created takes effect immediately. Memoized per
 * request with React `cache`.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await readSession();
  if (!session) return null;

  try {
    const record = await adminAuth().getUser(session.uid);
    if (record.disabled) return null;
    return {
      uid: record.uid,
      email: record.email ?? null,
      emailVerified: record.emailVerified,
      displayName: record.displayName ?? null,
      role: roleFromClaims(record.customClaims),
    };
  } catch {
    return null;
  }
});

/**
 * Authorization gate for Server Components (the real security boundary —
 * `proxy.ts` only does optimistic redirects). Signed-out users go to login;
 * signed-in users without the role are sent somewhere sensible, and the admin
 * area 404s so its existence is not revealed.
 */
export async function requireUser(area: PrivateArea, nextPath: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  if (!canAccessArea(user.role, area)) {
    if (area === "dashboard") redirect("/become-a-photographer");
    notFound();
  }
  return user;
}

/** Where to send a user after login when no explicit `next` is given. */
export function homeForRole(role: UserRole): string {
  if (role === "admin") return "/admin";
  if (role === "photographer") return "/dashboard";
  return "/account";
}
