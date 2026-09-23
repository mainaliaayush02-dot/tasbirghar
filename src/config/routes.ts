import type { CategorySlug } from "./categories";
import type { LocationSlug } from "./locations";

/**
 * Single source of truth for app URLs. Use these helpers instead of
 * hand-writing paths so routes can be renamed in one place.
 */
export const routes = {
  home: "/",
  photographers: "/photographers",
  photographer: (slug: string) => `/photographers/${slug}`,
  category: (slug: CategorySlug) => `/categories/${slug}`,
  location: (slug: LocationSlug) => `/locations/${slug}`,
  search: "/search",

  account: {
    root: "/account",
    bookings: "/account/bookings",
  },

  dashboard: {
    root: "/dashboard",
    profile: "/dashboard/profile",
    portfolio: "/dashboard/portfolio",
    packages: "/dashboard/packages",
    availability: "/dashboard/availability",
    bookings: "/dashboard/bookings",
  },

  admin: {
    root: "/admin",
    studios: "/admin/studios",
    users: "/admin/users",
    bookings: "/admin/bookings",
    reviews: "/admin/reviews",
  },
} as const;

/** Path prefixes that must never be indexed and will require auth. */
export const PRIVATE_PATH_PREFIXES = [
  "/account",
  "/dashboard",
  "/admin",
  "/api",
  "/dev",
] as const;
