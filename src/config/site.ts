export const siteConfig = {
  name: "TasbirGhar",
  nameNe: "तस्वीरघर",
  tagline: "Book trusted photographers in Kathmandu",
  description:
    "Discover, compare and book newborn, maternity, baby, cake smash, family, couple and studio photographers across Kathmandu Valley.",
  url: (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(
    /\/$/,
    "",
  ),
  locale: "en_NP",
  /** Public support email (optional). Unset → the contact page says so honestly. */
  contactEmail: process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() || null,
  market: "Kathmandu Valley, Nepal",
} as const;

export function absoluteUrl(path = "/"): string {
  return `${siteConfig.url}${path.startsWith("/") ? path : `/${path}`}`;
}
