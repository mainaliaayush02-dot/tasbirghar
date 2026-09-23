import "server-only";

import { requireEnv } from "./public";

/**
 * Server-only secrets. The `server-only` import makes the build fail if this
 * module is ever pulled into a Client Component bundle.
 */
export function getCloudinaryServerEnv() {
  return {
    cloudName: requireEnv(
      process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
      "NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME",
    ),
    apiKey: requireEnv(process.env.CLOUDINARY_API_KEY, "CLOUDINARY_API_KEY"),
    apiSecret: requireEnv(
      process.env.CLOUDINARY_API_SECRET,
      "CLOUDINARY_API_SECRET",
    ),
  };
}

export function isCloudinaryConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET,
  );
}
