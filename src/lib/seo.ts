import type { Metadata } from "next";

import { siteConfig } from "@/config/site";

interface PageMetadataInput {
  title?: string;
  description?: string;
  /** Path relative to the site root, e.g. "/categories/newborn". Sets the canonical URL. */
  path: string;
  /** Private or thin pages should pass false. */
  index?: boolean;
}

/**
 * Per-page metadata with a canonical URL. Titles are wrapped by the root
 * layout's template ("%s | TasbirGhar"). Relative URLs resolve against
 * `metadataBase` (NEXT_PUBLIC_APP_URL).
 */
export function buildMetadata({
  title,
  description = siteConfig.description,
  path,
  index = true,
}: PageMetadataInput): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { title: title ?? siteConfig.name, description, url: path },
    robots: index ? undefined : { index: false, follow: false },
  };
}

export const noIndexMetadata: Metadata = {
  robots: { index: false, follow: false },
};
