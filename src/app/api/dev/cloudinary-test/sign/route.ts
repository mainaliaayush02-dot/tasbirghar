import { DEV_TEST_FOLDER } from "@/lib/cloudinary/folders";
import { signImageUpload } from "@/lib/cloudinary/signature";

import { assertConfigured, errorResponse, isDev, notFound } from "../shared";

/**
 * DEV ONLY — step 1 of a direct upload: return signed params for
 * `tasbirghar/dev-tests/`. The response contains the signature, never the secret.
 */
export async function POST() {
  if (!isDev) return notFound();
  try {
    assertConfigured();
    return Response.json(signImageUpload({ folder: DEV_TEST_FOLDER, tags: ["dev-test"] }));
  } catch (error) {
    return errorResponse(error);
  }
}
