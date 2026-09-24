import { apiRoute, readJson, requireApiUser, validated } from "@/lib/api/http";
import { createBooking } from "@/lib/booking/service";
import { validate } from "@/lib/validation/core";
import { bookingCreateSchema } from "@/lib/validation/schemas";

/**
 * POST /api/bookings — a signed-in customer requests a booking.
 * Body: { studioId, packageId, shootDate, startTime, customerName,
 * customerPhone, customerNote }. Everything else (price, commission, owner,
 * end time, status) is derived server-side; see lib/booking/service.ts.
 */
export const POST = apiRoute(async (request) => {
  const user = await requireApiUser();
  const input = validated(validate(bookingCreateSchema, await readJson(request)));
  const bookingId = await createBooking(user, input);
  return Response.json({ bookingId, status: "pending" }, { status: 201 });
});
