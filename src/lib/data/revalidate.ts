import "server-only";

import { revalidateTag } from "next/cache";

import { MARKETPLACE_TAG } from "./public";

/**
 * Invalidate cached public marketplace data. Uses `expire: 0` (never serve
 * stale) because visibility changes — unpublish, suspend, hidden reviews,
 * deleted photos — must disappear on the very next request.
 */
export function invalidateMarketplace(): void {
  revalidateTag(MARKETPLACE_TAG, { expire: 0 });
}
