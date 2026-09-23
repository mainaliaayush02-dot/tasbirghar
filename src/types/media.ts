/**
 * A Cloudinary-hosted image as persisted in Firestore.
 *
 * `publicId` is the durable identifier: it is what lets us delete, replace or
 * re-transform the asset later. `url` is the original `secure_url`, kept for
 * reference/debugging — UI code should build optimized delivery URLs from
 * `publicId` via `@/lib/cloudinary/delivery` rather than rendering `url`.
 */
export interface MediaAsset {
  publicId: string;
  url: string;
  width?: number;
  height?: number;
  format?: string;
  bytes?: number;
  alt?: string;
}

/** Where a studio asset lives: `tasbirghar/studios/{studioId}/{kind}/`. */
export const STUDIO_MEDIA_KINDS = [
  "profile",
  "portfolio",
  "studio",
  "packages",
  "setups",
  "props",
] as const;

export type StudioMediaKind = (typeof STUDIO_MEDIA_KINDS)[number];
