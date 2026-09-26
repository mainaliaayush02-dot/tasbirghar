import { apiRoute, readJson, requireApiUser, validated } from "@/lib/api/http";
import { setWeeklyHours } from "@/lib/booking/service";
import { assertStudioOwner } from "@/lib/data/studios";
import { validate } from "@/lib/validation/core";
import { weeklyHoursSchema } from "@/lib/validation/schemas";

type Context = { params: Promise<{ studioId: string }> };

async function authorize(params: Context["params"]) {
  const user = await requireApiUser("photographer");
  const { studioId } = await params;
  await assertStudioOwner(studioId, user.uid);
  return studioId;
}

/**
 * PUT /api/studios/{studioId}/weekly-hours { days: { sun … sat: { closed, slots } } }
 * The studio owner sets standard weekly opening hours. Validated server-side
 * (30-minute steps, no overlaps, ≤ 12 slots, closed days have no slots) and
 * refused (409 BOOKED_TIME) if an upcoming pending/confirmed booking without
 * its own day schedule would fall outside the new hours.
 */
export const PUT = apiRoute<Context>(async (request, { params }) => {
  const studioId = await authorize(params);
  const { days } = validated(validate(weeklyHoursSchema, await readJson(request)));
  await setWeeklyHours(studioId, days);
  return Response.json({ ok: true });
});

/** DELETE — back to default hours every day (same booking protection). */
export const DELETE = apiRoute<Context>(async (_request, { params }) => {
  const studioId = await authorize(params);
  await setWeeklyHours(studioId, null);
  return Response.json({ ok: true });
});
