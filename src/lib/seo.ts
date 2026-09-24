import type { Metadata } from "next";

import { siteConfig } from "@/config/site";

interface PageMetadataInput {
  title?: string;
  description?: string;
  /** Path relative to the site root, e.g. "/categories/newborn". Sets the canonical URL. */
  path: string;
  /** Private or thin pages should pass false. */
  index?: boolean;
  /** Absolute or root-relative image for social previews. Defaults to the official logo lockup. */
  image?: { url: string; width?: number; height?: number; alt: string };
}

const DEFAULT_IMAGE = {
  url: "/brand/tasbirghar-logo-lockup.png",
  width: 640,
  height: 526,
  alt: "TasbirGhar — Discover. Book. Capture.",
};

/**
 * Per-page metadata with a canonical URL and complete Open Graph / Twitter
 * data. (Next.js replaces — does not merge — a parent's openGraph object, so
 * every page sets its own image.) Titles are wrapped by the root template.
 */
export function buildMetadata({
  title,
  description = siteConfig.description,
  path,
  index = true,
  image = DEFAULT_IMAGE,
}: PageMetadataInput): Metadata {
  const fullTitle = title ? `${title} | ${siteConfig.name}` : siteConfig.name;
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      siteName: siteConfig.name,
      locale: siteConfig.locale,
      title: fullTitle,
      description,
      url: path,
      images: [image],
    },
    twitter: { card: "summary_large_image", title: fullTitle, description, images: [image.url] },
    robots: index ? undefined : { index: false, follow: false },
  };
}

export const noIndexMetadata: Metadata = {
  robots: { index: false, follow: false },
};
