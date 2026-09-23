import type { MetadataRoute } from "next";

import { PRIVATE_PATH_PREFIXES } from "@/config/routes";
import { absoluteUrl } from "@/config/site";

export default function robots(): MetadataRoute.Robots {
  // Vercel preview deployments must never be indexed.
  const isProduction = (process.env.VERCEL_ENV ?? "production") === "production";

  if (!isProduction) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [...PRIVATE_PATH_PREFIXES],
    },
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
