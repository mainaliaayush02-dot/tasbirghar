import { deleteImage } from "@/lib/cloudinary/delete";
import { DEV_TEST_FOLDER } from "@/lib/cloudinary/folders";
import { MediaError } from "@/lib/cloudinary/types";

import { assertConfigured, errorResponse, isDev, notFound } from "./shared";

/** DEV ONLY — delete a test asset: DELETE /api/dev/cloudinary-test?publicId=... */
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
