import type { MetadataRoute } from "next";

import { PHOTOGRAPHY_CATEGORIES } from "@/config/categories";
import { LOCATIONS } from "@/config/locations";
import { absoluteUrl } from "@/config/site";
import { getPublishedStudios } from "@/lib/data/public";

// Built per request from the cached marketplace data (only published studios),
// so the build never depends on Firestore and unpublished studios drop out
// immediately after moderation.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const studios = await getPublishedStudios().catch(() => []);
  const page = (path: string, priority: number, changeFrequency: "daily" | "weekly" | "monthly") => ({
    url: absoluteUrl(path),
    changeFrequency,
    priority,
  });
  return [
    page("/", 1, "daily"),
    page("/photographers", 0.9, "daily"),
    page("/packages", 0.8, "daily"),
    ...PHOTOGRAPHY_CATEGORIES.map((c) => page(`/categories/${c.slug}`, 0.8, "weekly")),
    ...LOCATIONS.map((l) => page(`/locations/${l.slug}`, 0.7, "weekly")),
    ...studios.map((s) => ({
      url: absoluteUrl(`/photographers/${s.slug}`),
      changeFrequency: "weekly" as const,
      priority: 0.7,
      ...(s.publishedAt ? { lastModified: new Date(s.publishedAt) } : {}),
    })),
    page("/how-it-works", 0.5, "monthly"),
    page("/about", 0.4, "monthly"),
    page("/contact", 0.3, "monthly"),
  ];
}
