/**
 * Photography categories. The slug is the stable identifier stored in
 * Firestore and used in URLs (`/categories/[category]`) — never rename a slug
 * once live; add a redirect instead.
 *
 * To expand (wedding, pre-wedding, events, product, fashion, commercial), add
 * entries here — validation, forms and filters all derive from this list.
 */
export const PHOTOGRAPHY_CATEGORIES = [
  { slug: "newborn", name: "Newborn Photography" },
  { slug: "maternity", name: "Maternity Photography" },
  { slug: "baby", name: "Baby Photography" },
  { slug: "cake-smash", name: "Cake Smash Photography" },
  { slug: "family", name: "Family Photography" },
  { slug: "couple", name: "Couple Photography" },
  { slug: "studio", name: "Studio Photography" },
] as const;

export type CategorySlug = (typeof PHOTOGRAPHY_CATEGORIES)[number]["slug"];

export function isCategorySlug(value: string): value is CategorySlug {
  return PHOTOGRAPHY_CATEGORIES.some((c) => c.slug === value);
}

export function getCategory(slug: CategorySlug) {
  return PHOTOGRAPHY_CATEGORIES.find((c) => c.slug === slug)!;
}
