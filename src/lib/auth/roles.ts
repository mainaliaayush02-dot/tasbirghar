import type { UserRole } from "@/types/models";

/**
 * Role model. The source of truth is the Firebase Auth custom claim `role`,
 * which only trusted server code (Firebase Admin SDK) can set:
 *
 *   customer      default for every new account (no claim = customer)
 *   photographer  granted server-side when a user starts studio onboarding
 *   admin         granted manually / by another admin, server-side only
 *
 * The claim travels inside the signed ID token, so Firestore rules
 * (`request.auth.token.role`) and server code can trust it; the browser can
 * read it for UI purposes but can never change it.
 */

export const ROLE_CLAIM = "role";

export const USER_ROLES = ["customer", "photographer", "admin"] as const satisfies readonly UserRole[];

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === "string" && (USER_ROLES as readonly string[]).includes(value);
}

/** Resolve a role from decoded token claims. Missing/unknown claims mean "customer". */
export function roleFromClaims(claims: Record<string, unknown> | undefined | null): UserRole {
  const role = claims?.[ROLE_CLAIM];
  return isUserRole(role) ? role : "customer";
}

/** Which role(s) may enter each private area. */
export const AREA_ROLES = {
  account: ["customer", "photographer", "admin"],
  dashboard: ["photographer", "admin"],
  admin: ["admin"],
} as const satisfies Record<string, readonly UserRole[]>;

export type PrivateArea = keyof typeof AREA_ROLES;

export function canAccessArea(role: UserRole, area: PrivateArea): boolean {
  return (AREA_ROLES[area] as readonly UserRole[]).includes(role);
}
