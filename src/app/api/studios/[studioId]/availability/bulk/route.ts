import { apiRoute, ApiError, readJson, requireApiUser, validated } from "@/lib/api/http";
import { bookableRange, isRealDate } from "@/lib/booking/rules";
import { setDaysAvailability } from "@/lib/booking/service";
import { assertStudioOwner } from "@/lib/data/studios";
import { validate } from "@/lib/validation/core";
import { bulkAvailabilitySchema } from "@/lib/validation/schemas";

type Context = { params: Promise<{ studioId: string }> };

/**
 * PUT /api/studios/{studioId}/availability/bulk
 *   { dates: [...], hours: { isClosed, slots } } | { dates: [...], reset: true }
 *
 * The studio owner applies one day schedule (or a reset to standard hours) to
 * up to 31 dates. Every date must be real and editable (tomorrow … +180 days)
 * or the whole request is refused. Each date then runs in its own locked
 * transaction with the same checks as a single-day edit, so a date with a
 * conflicting booking is reported (BOOKED_TIME) without affecting the rest.
 */
export const PUT = apiRoute<Context>(async (request, { params }) => {
  const user = await requireApiUser("photographer");
  const { studioId } = await params;
  await assertStudioOwner(studioId, user.uid);
  const input = validated(validate(bulkAvailabilitySchema, await readJson(request)));
  if ((input.hours === null) === (input.reset === null)) {
    throw new ApiError(422, "VALIDATION_FAILED", "Send either hours or reset: true.", { _form: "Send either hours or reset." });
  }
  const { min, max } = bookableRange();
  const bad = input.dates.filter((d) => !isRealDate(d) || d < min || d > max);
  if (bad.length) {
    throw new ApiError(422, "VALIDATION_FAILED", "Availability can be changed from tomorrow up to 6 months ahead.", { dates: `Not editable: ${bad.join(", ")}` });
  }
  const results = await setDaysAvailability(studioId, input.dates, input.reset ? null : input.hours);
  return Response.json({ ok: results.every((r) => r.ok), saved: results.filter((r) => r.ok).length, results });
});
