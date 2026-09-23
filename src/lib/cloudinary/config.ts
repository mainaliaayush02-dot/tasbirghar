import "server-only";

import { v2 as cloudinary } from "cloudinary";

import { getCloudinaryServerEnv } from "@/lib/env/server";

let configured = false;

/**
 * Server-only, lazily configured Cloudinary SDK. The API secret never leaves
 * this module; the `server-only` import fails the build if a Client Component
 * ever imports it.
 */
export function getCloudinary() {
  if (!configured) {
    const { cloudName, apiKey, apiSecret } = getCloudinaryServerEnv();
    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
      secure: true,
    });
    configured = true;
  }
  return cloudinary;
}
