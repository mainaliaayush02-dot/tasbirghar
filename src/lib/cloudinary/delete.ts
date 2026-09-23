import "server-only";

import { getCloudinary } from "./config";
import { isTasbirGharPublicId } from "./folders";
import { MediaError } from "./types";

/**
 * Permanently delete an image and invalidate CDN caches. Only assets under the
 * `tasbirghar/` root can be deleted. Callers must authorize first (the asset
 * belongs to the requesting user's studio, or the user is an admin).
 *
 * Returns true if the asset was deleted, false if it did not exist.
 */
export async function deleteImage(publicId: string): Promise<boolean> {
  if (!isTasbirGharPublicId(publicId)) {
    throw new MediaError("INVALID_TARGET", "Refusing to delete an asset outside tasbirghar/.");
  }

  const result: { result?: string } = await getCloudinary().uploader.destroy(publicId, {
    resource_type: "image",
    invalidate: true,
  });

  if (result.result === "ok") return true;
  if (result.result === "not found") return false;
  throw new MediaError("DELETE_FAILED", `Cloudinary delete failed: ${result.result}`, 502);
}

/**
 * Replace flow: upload the new asset first, persist it, THEN delete the old
 * one — so a failed upload never leaves a record pointing at nothing.
 */
export async function deleteImageQuietly(publicId: string | null | undefined): Promise<void> {
  if (!publicId) return;
  try {
    await deleteImage(publicId);
  } catch (error) {
    // Orphaned assets are harmless (a cleanup job can sweep them); never fail
    // the user's request because an old asset couldn't be removed.
    console.error("[cloudinary] failed to delete old asset", publicId, error);
  }
}
