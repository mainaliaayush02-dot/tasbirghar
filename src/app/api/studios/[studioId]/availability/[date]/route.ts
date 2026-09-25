import { apiRoute, ApiError, readJson, requireApiUser, validated } from "@/lib/api/http";
import { DATE_RE } from "@/lib/booking/rules";
import { setDayAvailability } from "@/lib/booking/service";
import { assertStudioOwner } from "@/lib/data/studios";
import { validate } from "@/lib/validation/core";
import { availabilityDaySchema } from "@/lib/validation/schemas";

type Context = { params: Promise<{ studioId: string; date: string }> };

async function authorize(params: Context["params"]) {
  const user = await requireApiUser("photographer");
  const { studioId, date } = await params;
  await assertStudioOwner(studioId, user.uid);
  if (!DATE_RE.test(date)) throw new ApiError(422, "VALIDATION_FAILED", "Invalid date.", { date: "Invalid date." });
  return { studioId, date };
}

/**
 * PUT /api/studios/{studioId}/availability/{YYYY-MM-DD} { isClosed, slots }
 * The studio owner marks a day unavailable or sets its custom time slots.
 * Slots are validated server-side (HH:mm on 30-minute steps, end after
 * start, no overlaps or duplicates, max 12) and the edit is refused if it
 * would leave a pending/confirmed booking outside the new hours.
 */
export const PUT = apiRoute<Context>(async (request, { params }) => {
  const { studioId, date } = await authorize(params);
  const input = validated(validate(availabilityDaySchema, await readJson(request)));
  const mode = await setDayAvailability(studioId, date, input);
  return Response.json({ ok: true, mode });
});

/** DELETE — back to standard hours (removes the custom schedule for that day). */
export const DELETE = apiRoute<Context>(async (_request, { params }) => {
  const { studioId, date } = await authorize(params);
  const mode = await setDayAvailability(studioId, date, null);
  return Response.json({ ok: true, mode });
});
