import { apiRoute, docId, readJson, requireApiUser, validated } from "@/lib/api/http";
import { submitReview } from "@/lib/reviews/service";
import { validate } from "@/lib/validation/core";
import { reviewSubmitSchema } from "@/lib/validation/schemas";

type Context = { params: Promise<{ bookingId: string }> };

/**
 * POST /api/bookings/{bookingId}/review { rating, comment }
 *
 * A customer reviews their own completed booking (within 60 days of
 * completion). The body carries only the rating (integer 1–5) and comment
 * (20–1,000 characters); everything else is derived server-side and any
 * other field is rejected. The review starts as `pending_moderation` and is
 * public only after an admin publishes it. Reviews can't be edited or
 * deleted by the customer (there is intentionally no PUT/PATCH/DELETE).
 */
export const POST = apiRoute<Context>(async (request, { params }) => {
  const user = await requireApiUser("customer");
  const bookingId = docId((await params).bookingId, "Booking");
  const input = validated(validate(reviewSubmitSchema, await readJson(request)));
  const status = await submitReview(user, bookingId, input);
  return Response.json({ ok: true, status }, { status: 201 });
});
