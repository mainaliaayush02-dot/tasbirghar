import { FieldValue } from "firebase-admin/firestore";

import { apiRoute, ApiError, readJson, requireApiUser, validated } from "@/lib/api/http";
import { confirmUploadedImage } from "@/lib/cloudinary/confirm";
import { deleteImageQuietly } from "@/lib/cloudinary/delete";
import { folderForTarget } from "@/lib/cloudinary/targets";
import { assertStudioOwner, studioRef, studioSub } from "@/lib/data/studios";
import { adminDb } from "@/lib/firebase/admin";
import { validate } from "@/lib/validation/core";
import { LIMITS, mediaConfirmSchema } from "@/lib/validation/schemas";
import { invalidateMarketplace } from "@/lib/data/revalidate";

/**
 * POST /api/media/confirm { studioId, target, galleryKind?, publicId, alt? }
 *
 * Step 3 of a direct upload. Verifies ownership, then verifies the asset with
 * Cloudinary (format, size, and that it lives in THIS studio's folder for
 * THIS target) before writing any media metadata. This is the only code path
 * that creates portfolio/gallery records or sets profile/cover images.
 */
export const POST = apiRoute(async (request) => {
  const user = await requireApiUser("photographer");
  const input = validated(validate(mediaConfirmSchema, await readJson(request)));
  const studio = await assertStudioOwner(input.studioId, user.uid);

  const expectedFolder = folderForTarget(input.studioId, input.target, input.galleryKind);
  const asset = await confirmUploadedImage(input.publicId, {
    expectedFolder,
    alt: input.alt ?? undefined,
  });

  // Doc id = the asset's UUID, so the same asset can never be confirmed twice.
  const assetKey = asset.publicId.split("/").pop()!;

  try {
    if (input.target === "portfolio" || input.target === "gallery") {
      const sub = studioSub(input.studioId, input.target);
      const limit =
        input.target === "portfolio" ? LIMITS.maxPortfolioPhotos : LIMITS.maxGalleryPhotos;

      const id = await adminDb().runTransaction(async (tx) => {
        const ref = sub.doc(assetKey);
        const [existing, countSnap] = await Promise.all([tx.get(ref), tx.get(sub.count())]);
        if (existing.exists) {
          throw new ApiError(409, "ALREADY_CONFIRMED", "This upload was already saved.");
        }
        const count = countSnap.data().count;
        if (count >= limit) {
          throw new ApiError(409, "LIMIT_REACHED", `You can upload up to ${limit} photos here.`);
        }
        const base = {
          studioId: input.studioId,
          image: asset,
          caption: null,
          sortOrder: count,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        };
        if (input.target === "portfolio") {
          tx.create(ref, { ...base, category: null, isFeatured: false });
          tx.update(studioRef(input.studioId), {
            "stats.portfolioCount": FieldValue.increment(1),
          });
        } else {
          tx.create(ref, { ...base, kind: input.galleryKind });
        }
        return ref.id;
      });
      invalidateMarketplace();
      return Response.json({ id, asset }, { status: 201 });
    }

    // Profile / cover image replacement.
    const field = input.target === "profile" ? "profileImage" : "coverImage";
    const other = input.target === "profile" ? studio.coverImage : studio.profileImage;
    if (other?.publicId === asset.publicId) {
      throw new ApiError(409, "IN_USE", "That image is already in use.");
    }
    await studioRef(input.studioId).update({
      [field]: asset,
      updatedAt: FieldValue.serverTimestamp(),
    });
    const previous = studio[field];
    if (previous && previous.publicId !== asset.publicId && previous.publicId !== other?.publicId) {
      await deleteImageQuietly(previous.publicId);
    }
    invalidateMarketplace();
    return Response.json({ asset });
  } catch (error) {
    // Anything we failed to record must not linger in Cloudinary — but never
    // delete an asset that an existing record already points to.
    const alreadyReferenced =
      (error instanceof ApiError && (error.code === "IN_USE" || error.code === "ALREADY_CONFIRMED")) ||
      studio.profileImage?.publicId === asset.publicId ||
      studio.coverImage?.publicId === asset.publicId;
    if (!alreadyReferenced) {
      await deleteImageQuietly(asset.publicId);
    }
    throw error;
  }
});
