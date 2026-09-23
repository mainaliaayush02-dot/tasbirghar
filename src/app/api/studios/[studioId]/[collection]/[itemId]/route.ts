import { FieldValue } from "firebase-admin/firestore";

import {
  apiRoute,
  docId,
  notFound,
  readJson,
  requireApiUser,
  validated,
} from "@/lib/api/http";
import { deleteImageQuietly } from "@/lib/cloudinary/delete";
import { assertStudioOwner, studioRef, studioSub } from "@/lib/data/studios";
import { adminDb } from "@/lib/firebase/admin";
import { validate } from "@/lib/validation/core";
import { galleryUpdateSchema, portfolioUpdateSchema } from "@/lib/validation/schemas";
import type { MediaAsset } from "@/types/media";

type Context = { params: Promise<{ studioId: string; collection: string; itemId: string }> };

/**
 * PATCH / DELETE /api/studios/{studioId}/{portfolio|gallery}/{itemId}
 *
 * Owners edit presentation fields only (caption, category, order, featured);
 * the image itself is immutable. Delete removes the record, then the asset.
 */
async function resolve(context: Context) {
  const user = await requireApiUser("photographer");
  const { studioId, collection, itemId } = await context.params;
  if (collection !== "portfolio" && collection !== "gallery") throw notFound();
  await assertStudioOwner(studioId, user.uid);
  const ref = studioSub(studioId, collection).doc(docId(itemId, "Photo"));
  return { studioId, collection, ref } as const;
}

export const PATCH = apiRoute<Context>(async (request, context) => {
  const { collection, ref } = await resolve(context);
  const body = await readJson(request);
  const input =
    collection === "portfolio"
      ? validated(validate(portfolioUpdateSchema, body))
      : validated(validate(galleryUpdateSchema, body));

  const snap = await ref.get();
  if (!snap.exists) throw notFound("Photo");
  await ref.update({ ...input, updatedAt: FieldValue.serverTimestamp() });
  return Response.json({ ok: true });
});

export const DELETE = apiRoute<Context>(async (_request, context) => {
  const { studioId, collection, ref } = await resolve(context);

  const image = await adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw notFound("Photo");
    tx.delete(ref);
    if (collection === "portfolio") {
      tx.update(studioRef(studioId), { "stats.portfolioCount": FieldValue.increment(-1) });
    }
    return snap.get("image") as MediaAsset;
  });

  await deleteImageQuietly(image?.publicId);
  return Response.json({ ok: true });
});
