import { ApiError } from "@/lib/api/http";
import type { MediaTarget } from "@/lib/validation/schemas";
import type { StudioMediaKind } from "@/types/media";
import type { GalleryImageKind } from "@/types/models";

import { studioMediaFolder } from "./folders";

const GALLERY_FOLDER: Record<GalleryImageKind, StudioMediaKind> = {
  studio: "studio",
  setup: "setups",
  prop: "props",
};

/**
 * Map an upload target to its Cloudinary folder. The folder is derived only
 * from the (already ownership-checked) studioId and the target — never from
 * client-supplied paths.
 */
export function folderForTarget(
  studioId: string,
  target: MediaTarget,
  galleryKind: GalleryImageKind | null,
): string {
  switch (target) {
    case "portfolio":
      return studioMediaFolder(studioId, "portfolio");
    case "gallery":
      if (!galleryKind) {
        throw new ApiError(422, "VALIDATION_FAILED", "Choose a photo type.", {
          galleryKind: "Choose a photo type.",
        });
      }
      return studioMediaFolder(studioId, GALLERY_FOLDER[galleryKind]);
    case "profile":
    case "cover":
      return studioMediaFolder(studioId, "profile");
  }
}
