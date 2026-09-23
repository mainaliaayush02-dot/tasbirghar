import "server-only";

import { randomUUID } from "node:crypto";

import { getCloudinaryServerEnv } from "@/lib/env/server";

import { getCloudinary } from "./config";
import { ALLOWED_IMAGE_FORMATS } from "./types";

export interface SignedUpload {
  /** POST the file here as multipart/form-data along with `fields`. */
  uploadUrl: string;
  /** Every field must be sent exactly as given, or Cloudinary rejects the signature. */
  fields: Record<string, string>;
  publicId: string;
  assetFolder: string;
}

export interface SignUploadOptions {
  /** Target folder, built with the helpers in `./folders` — never from raw user input. */
  folder: string;
  tags?: string[];
}

/**
 * Sign a browser → Cloudinary direct upload. The API secret stays on the
 * server; the browser receives only the signature, which covers exactly
 * these parameters (Dynamic Folders `asset_folder`, a server-chosen
 * `public_id`, `allowed_formats`), so it cannot be reused for another folder,
 * id or file type. Cloudinary rejects signatures older than one hour.
 *
 * Callers must authorize first (the user owns the target studio/folder).
 * After the browser uploads, call `confirmUploadedImage` before persisting.
 */
export function signImageUpload({ folder, tags = [] }: SignUploadOptions): SignedUpload {
  const { cloudName, apiKey, apiSecret } = getCloudinaryServerEnv();

  const publicId = `${folder}/${randomUUID()}`;
  const params: Record<string, string> = {
    timestamp: String(Math.floor(Date.now() / 1000)),
    public_id: publicId,
    asset_folder: folder,
    allowed_formats: ALLOWED_IMAGE_FORMATS.join(","),
    overwrite: "false",
    tags: ["tasbirghar", ...tags].join(","),
  };
  const signature = getCloudinary().utils.api_sign_request(params, apiSecret);

  return {
    uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
    fields: { ...params, api_key: apiKey, signature },
    publicId,
    assetFolder: folder,
  };
}
