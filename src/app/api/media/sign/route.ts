import { apiRoute, readJson, requireApiUser, validated } from "@/lib/api/http";
import { signImageUpload } from "@/lib/cloudinary/signature";
import { folderForTarget } from "@/lib/cloudinary/targets";
import { assertStudioOwner } from "@/lib/data/studios";
import { validate } from "@/lib/validation/core";
import { mediaSignSchema } from "@/lib/validation/schemas";

/**
 * POST /api/media/sign { studioId, target, galleryKind? }
 * Step 1 of a direct upload: signed params scoped to the owner's studio folder.
 * The response contains a signature, never the API secret.
 */
export const POST = apiRoute(async (request) => {
  const user = await requireApiUser("photographer");
  const input = validated(validate(mediaSignSchema, await readJson(request)));
  await assertStudioOwner(input.studioId, user.uid);

  const folder = folderForTarget(input.studioId, input.target, input.galleryKind);
  return Response.json(
    signImageUpload({ folder, tags: [`studio:${input.studioId}`, input.target] }),
  );
});
