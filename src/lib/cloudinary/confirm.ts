import "server-only";

import { getCloudinary } from "./config";
import { deleteImageQuietly } from "./delete";
import { isTasbirGharPublicId } from "./folders";
import {
  ALLOWED_IMAGE_FORMATS,
  MAX_IMAGE_BYTES,
  MediaError,
  type MediaAsset,
} from "./types";

interface AdminResource {
  public_id: string;
  secure_url: string;
  resource_type: string;
  asset_folder?: string;
  format: string;
  bytes: number;
  width: number;
  height: number;
}

export interface ConfirmUploadOptions {
  /** The folder the upload was signed for; the asset must actually be there. */
  expectedFolder: string;
  alt?: string;
}

/**
 * Second half of a direct upload: after the browser reports a `publicId`,
 * read the asset back from the Cloudinary Admin API and validate what
 * Cloudinary actually stored (decoded format, real byte size, asset folder) —
 * nothing the browser claims is trusted. Invalid assets are deleted.
 *
 * Returns the `MediaAsset` to persist in Firestore.
 */
export async function confirmUploadedImage(
  publicId: string,
  { expectedFolder, alt }: ConfirmUploadOptions,
): Promise<MediaAsset> {
  if (!isTasbirGharPublicId(publicId) || !publicId.startsWith(`${expectedFolder}/`)) {
    throw new MediaError("INVALID_TARGET", "Asset does not belong to this upload target.");
  }

  let resource: AdminResource;
  try {
    resource = await getCloudinary().api.resource(publicId, { resource_type: "image" });
  } catch {
    throw new MediaError("INVALID_TARGET", "Uploaded asset was not found.", 404);
  }

  const problem =
    resource.resource_type !== "image"
      ? "Only images are allowed."
      : !(ALLOWED_IMAGE_FORMATS as readonly string[]).includes(resource.format)
        ? "Unsupported file. Please upload a JPEG, PNG, WEBP or AVIF image."
        : resource.bytes > MAX_IMAGE_BYTES
          ? `Images must be ${MAX_IMAGE_BYTES / (1024 * 1024)} MB or smaller.`
          : resource.asset_folder !== expectedFolder
            ? "Asset is not in the expected folder."
            : null;

  if (problem) {
    await deleteImageQuietly(publicId);
    throw new MediaError("UNSUPPORTED_TYPE", problem, 422);
  }

  return {
    publicId: resource.public_id,
    secureUrl: resource.secure_url,
    width: resource.width,
    height: resource.height,
    format: resource.format,
    bytes: resource.bytes,
    ...(alt ? { alt } : {}),
  };
}
