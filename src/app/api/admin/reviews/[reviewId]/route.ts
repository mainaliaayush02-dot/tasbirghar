import { apiRoute, ApiError, docId, readJson, requireApiUser, validated } from "@/lib/api/http";
import { invalidateMarketplace } from "@/lib/data/revalidate";
import { moderateReview } from "@/lib/reviews/service";
import { validate } from "@/lib/validation/core";
import { reviewModerationSchema } from "@/lib/validation/schemas";

type Context = { params: Promise<{ reviewId: string }> };

/**
 * POST /api/admin/reviews/{reviewId} { action: "publish" | "hide", reason? }
 *
 * Admin-only review moderation. Reviews themselves are created only by
 * server code for completed bookings; this route only changes visibility,
 * records who moderated it, and keeps the studio's public rating totals in
 * step (in the same transaction). Review text and rating are never editable.
 */
export const POST = apiRoute<Context>(async (request, { params }) => {
  const admin = await requireApiUser("admin");
  const reviewId = docId((await params).reviewId, "Review");
  const { action, reason } = validated(validate(reviewModerationSchema, await readJson(request)));
  if (action === "hide" && !reason) {
    throw new ApiError(422, "VALIDATION_FAILED", "A reason is required to hide a review.", { reason: "Required." });
  }

  const status = await moderateReview(admin, reviewId, action, reason);
  invalidateMarketplace();
  return Response.json({ ok: true, status });
});
