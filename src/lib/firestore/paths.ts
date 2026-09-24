/**
 * Firestore collection paths. Use these instead of string literals so the
 * schema in `@/types/models` and the code that touches it stay in sync.
 */
export const collections = {
  users: "users",
  studios: "studios",
  studioSlugs: "studioSlugs",
  photographerApplications: "photographerApplications",
  bookings: "bookings",
  reviews: "reviews",
} as const;

export const studioSubcollections = {
  portfolio: "portfolio",
  gallery: "gallery",
  packages: "packages",
  availability: "availability",
  /** Server-only audit trail of admin moderation actions. */
  moderationLog: "moderationLog",
} as const;

export type StudioSubcollection =
  (typeof studioSubcollections)[keyof typeof studioSubcollections];

export function studioSubcollectionPath(studioId: string, sub: StudioSubcollection) {
  return `${collections.studios}/${studioId}/${sub}`;
}
