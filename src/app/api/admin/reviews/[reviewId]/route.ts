import { FieldValue } from "firebase-admin/firestore";

import {
  apiRoute,
  ApiError,
  docId,
  notFound,
  readJson,
  requireApiUser,
  validated,
} from "@/lib/api/http";
import { adminDb } from "@/lib/firebase/admin";
import { collections } from "@/lib/firestore/paths";
import { validate } from "@/lib/validation/core";
import { reviewModerationSchema } from "@/lib/validation/schemas";
import { invalidateMarketplace } from "@/lib/data/revalidate";

type Context = { params: Promise<{ reviewId: string }> };

/**
 * POST /api/admin/reviews/{reviewId} { action: "publish" | "hide", reason? }
 *
 * Admin-only review moderation. Reviews themselves are created only by
 * server code for completed bookings; this route only changes visibility and
 * records who moderated it. Review text and rating are never editable.
 */
export const POST = apiRoute<Context>(async (request, { params }) => {
  const admin = await requireApiUser("admin");
  const reviewId = docId((await params).reviewId, "Review");
  const { action, reason } = validated(validate(reviewModerationSchema, await readJson(request)));
  if (action === "hide" && !reason) {
    throw new ApiError(422, "VALIDATION_FAILED", "A reason is required to hide a review.", { reason: "Required." });
  }

  const ref = adminDb().collection(collections.reviews).doc(reviewId);
  const status = action === "publish" ? "published" : "hidden";
  await adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw notFound("Review");
    if (snap.get("status") === status) {
      throw new ApiError(409, "NO_CHANGE", `This review is already ${status}.`);
    }
    tx.update(ref, {
      status,
      moderation: { action, by: admin.uid, at: FieldValue.serverTimestamp(), reason },
      updatedAt: FieldValue.serverTimestamp(),
    });
  });

  invalidateMarketplace();
  return Response.json({ ok: true, status });
});
