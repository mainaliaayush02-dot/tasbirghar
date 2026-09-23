import { MediaError } from "@/lib/cloudinary/types";
import { isCloudinaryConfigured } from "@/lib/env/server";

/**
 * Guards for the DEVELOPMENT-ONLY Cloudinary test routes. Every handler
 * returns 404 unless NODE_ENV is "development", so these can never become
 * open anonymous upload endpoints in production. Real uploads will go through
 * authenticated, ownership-checked routes (Phase 2).
 */

export const isDev = process.env.NODE_ENV === "development";

export function notFound() {
  return new Response("Not Found", { status: 404 });
}

export function assertConfigured() {
  if (!isCloudinaryConfigured()) {
    throw new MediaError(
      "NOT_CONFIGURED",
      "Cloudinary env vars are missing. Set NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET in .env.local, then restart the dev server.",
      503,
    );
  }
}

export function errorResponse(error: unknown) {
  if (error instanceof MediaError) {
    return Response.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  }
  console.error("[dev/cloudinary-test]", error);
  return Response.json(
    { error: { code: "UNKNOWN", message: "Unexpected server error." } },
    { status: 500 },
  );
}
