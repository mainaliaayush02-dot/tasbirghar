export type { MediaAsset, StudioMediaKind } from "@/types/media";

export const ALLOWED_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
] as const;

export type AllowedImageMimeType = (typeof ALLOWED_IMAGE_MIME_TYPES)[number];

/** Cloudinary format names matching the MIME types above. */
export const ALLOWED_IMAGE_FORMATS = ["jpg", "png", "webp", "avif"] as const;

/**
 * 10 MB — also the Cloudinary free-plan per-image limit. Files are uploaded
 * browser → Cloudinary directly (signed), never through a Next.js route, so
 * Vercel's 4.5 MB request-body limit does not apply.
 */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export type MediaErrorCode =
  | "NO_FILE"
  | "EMPTY_FILE"
  | "FILE_TOO_LARGE"
  | "UNSUPPORTED_TYPE"
  | "INVALID_TARGET"
  | "NOT_CONFIGURED"
  | "DELETE_FAILED";

export class MediaError extends Error {
  constructor(
    readonly code: MediaErrorCode,
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "MediaError";
  }
}
