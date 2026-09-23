/**
 * Service locations. Launch market is Kathmandu Valley; add districts/cities
 * here as TasbirGhar expands. Slugs are stored in Firestore and used in
 * `/locations/[location]` URLs.
 */
export const LOCATIONS = [
  { slug: "kathmandu", name: "Kathmandu" },
  { slug: "lalitpur", name: "Lalitpur" },
  { slug: "bhaktapur", name: "Bhaktapur" },
] as const;

export type LocationSlug = (typeof LOCATIONS)[number]["slug"];

export function isLocationSlug(value: string): value is LocationSlug {
  return LOCATIONS.some((l) => l.slug === value);
}
