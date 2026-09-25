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
  /** Server-only per-studio-per-day lock docs that serialize booking writes. */
  bookingLocks: "bookingLocks",
  /** Server-only per-customer lock docs that serialize a customer's new requests. */
  customerLocks: "customerLocks",
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

/** Private, server-written studio sub-documents (see StudioContactDoc / StudioInternalDoc). */
export const STUDIO_PRIVATE = "private";
export const STUDIO_CONTACT_DOC = "contact";
export const STUDIO_INTERNAL_DOC = "internal";
