import { confirmUploadedImage } from "@/lib/cloudinary/confirm";
import { DEV_TEST_FOLDER } from "@/lib/cloudinary/folders";
import { MediaError } from "@/lib/cloudinary/types";

import { assertConfigured, errorResponse, isDev, notFound } from "../shared";

/**
 * DEV ONLY — step 3 of a direct upload: verify the asset Cloudinary stored and
 * return the MediaAsset metadata that would be persisted to Firestore.
 */
export async function POST(request: Request) {
  if (!isDev) return notFound();
  try {
    assertConfigured();
    const body = (await request.json().catch(() => null)) as
      | { publicId?: unknown; alt?: unknown }
      | null;
    if (typeof body?.publicId !== "string") {
      throw new MediaError("INVALID_TARGET", "publicId is required.");
    }
    const alt =
      typeof body.alt === "string" && body.alt.trim() ? body.alt.trim().slice(0, 200) : undefined;

    const asset = await confirmUploadedImage(body.publicId, {
      expectedFolder: DEV_TEST_FOLDER,
      alt,
    });
    return Response.json({ asset });
  } catch (error) {
    return errorResponse(error);
  }
}
