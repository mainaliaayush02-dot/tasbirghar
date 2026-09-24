import { apiRoute, docId, readJson, requireApiUser, validated } from "@/lib/api/http";
import { transitionBooking } from "@/lib/booking/service";
import { validate } from "@/lib/validation/core";
import { bookingActionSchema } from "@/lib/validation/schemas";

type Context = { params: Promise<{ bookingId: string }> };

/**
 * POST /api/bookings/{bookingId} { action }
 * cancel (customer, own pending request) · confirm / decline / complete
 * (studio owner). Ownership and transitions are enforced server-side.
 */
export const POST = apiRoute<Context>(async (request, { params }) => {
  const user = await requireApiUser();
  const bookingId = docId((await params).bookingId, "Booking");
  const { action } = validated(validate(bookingActionSchema, await readJson(request)));
  const status = await transitionBooking(user, bookingId, action);
  return Response.json({ ok: true, status });
});
