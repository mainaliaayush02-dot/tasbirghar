import type { MetadataRoute } from "next";

import { absoluteUrl } from "@/config/site";

/**
 * Only real, indexable pages belong here. As public pages ship, extend this:
 *   - category pages: PHOTOGRAPHY_CATEGORIES → routes.category(slug)
 *   - location pages: LOCATIONS → routes.location(slug)
 *   - studio pages:   published studios from Firestore → routes.photographer(slug)
 * When studios exceed ~50k URLs, split with `generateSitemaps`.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: absoluteUrl("/"),
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}
