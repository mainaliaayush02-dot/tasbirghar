import "server-only";

import { randomUUID } from "node:crypto";

import type { UploadApiResponse } from "cloudinary";

import { getCloudinary } from "./config";
import {
  ALLOWED_IMAGE_FORMATS,
  MediaError,
  type MediaAsset,
} from "./types";
import type { ValidatedImage } from "./validation";

export interface UploadImageOptions {
  /** Target folder, built with the helpers in `./folders` — never from raw user input. */
  folder: string;
  alt?: string;
  tags?: string[];
}

/**
 * Upload an already-validated image to Cloudinary and return the metadata to
 * persist in Firestore. Callers are responsible for authorizing the request
 * (e.g. the user owns the studio whose folder is being written to).
 */
export async function uploadImage(
  image: ValidatedImage,
  { folder, alt, tags = [] }: UploadImageOptions,
): Promise<MediaAsset> {
  const cloudinary = getCloudinary();
  const publicId = `${folder}/${randomUUID()}`;

  const result = await new Promise<UploadApiResponse>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        resource_type: "image",
        // Full path in public_id works with both fixed and dynamic folder modes;
        // asset_folder keeps the Media Library tidy in dynamic mode.
        public_id: publicId,
        asset_folder: folder,
        overwrite: false,
        unique_filename: false,
        // Defense in depth: Cloudinary re-checks the decoded format.
        allowed_formats: [...ALLOWED_IMAGE_FORMATS],
        tags: ["tasbirghar", ...tags],
      },
      (error, response) => {
        if (error || !response) {
          reject(
            new MediaError(
              "UPLOAD_FAILED",
              error?.message ?? "Cloudinary did not return a response.",
              502,
            ),
          );
        } else {
          resolve(response);
        }
      },
    );
    stream.end(image.buffer);
  });

  return {
    publicId: result.public_id,
    url: result.secure_url,
    width: result.width,
    height: result.height,
    format: result.format,
    bytes: result.bytes,
    ...(alt ? { alt } : {}),
  };
}
