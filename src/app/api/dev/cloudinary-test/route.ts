import { deleteImage } from "@/lib/cloudinary/delete";
import { DEV_TEST_FOLDER } from "@/lib/cloudinary/folders";
import { MediaError } from "@/lib/cloudinary/types";
import { uploadImage } from "@/lib/cloudinary/upload";
import { validateImageFile } from "@/lib/cloudinary/validation";
import { isCloudinaryConfigured } from "@/lib/env/server";

/**
 * DEVELOPMENT-ONLY Cloudinary round-trip test.
 *
 * Returns 404 in any non-development build, so it can never become an open
 * anonymous upload endpoint in production. Uploads are confined to
 * `tasbirghar/dev-tests/`. Real uploads will go through authenticated,
 * ownership-checked routes (Phase 2).
 */

const isDev = process.env.NODE_ENV === "development";

function notFound() {
  return new Response("Not Found", { status: 404 });
}

function errorResponse(error: unknown) {
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

function assertConfigured() {
  if (!isCloudinaryConfigured()) {
    throw new MediaError(
      "NOT_CONFIGURED",
      "Cloudinary env vars are missing. Set NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET in .env.local, then restart the dev server.",
      503,
    );
  }
}

export async function POST(request: Request) {
  if (!isDev) return notFound();
  try {
    assertConfigured();
    const form = await request.formData();
    const image = await validateImageFile(form.get("file"));
    const alt = form.get("alt");
    const asset = await uploadImage(image, {
      folder: DEV_TEST_FOLDER,
      alt: typeof alt === "string" && alt.trim() ? alt.trim().slice(0, 200) : undefined,
      tags: ["dev-test"],
    });
    return Response.json({ asset, detectedType: image.mimeType }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  if (!isDev) return notFound();
  try {
    assertConfigured();
    const publicId = new URL(request.url).searchParams.get("publicId") ?? "";
    if (!publicId.startsWith(`${DEV_TEST_FOLDER}/`)) {
      throw new MediaError("INVALID_TARGET", "Only dev-test assets can be deleted here.");
    }
    const deleted = await deleteImage(publicId);
    return Response.json({ deleted });
  } catch (error) {
    return errorResponse(error);
  }
}
