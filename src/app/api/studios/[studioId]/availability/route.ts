import { apiRoute, ApiError, docId } from "@/lib/api/http";
import { MONTH_RE } from "@/lib/booking/rules";
import { getDayAvailability, getMonthAvailability } from "@/lib/booking/service";

type Context = { params: Promise<{ studioId: string }> };

/**
 * Public, read-only availability for the booking form (published studios only).
 *
 *   ?month=YYYY-MM&packageId=…  bookable dates of the month → free start times
 *                               for that package (no booking details at all)
 *   ?date=YYYY-MM-DD            one day's published open hours only (never
 *                               booking-derived: no busy intervals)
 *
 * Informational — the booking POST re-checks everything inside a transaction.
 */
export const GET = apiRoute<Context>(async (request, { params }) => {
  const studioId = docId((await params).studioId, "Studio");
  const sp = new URL(request.url).searchParams;
  const headers = { "Cache-Control": "no-store" };

  const month = sp.get("month");
  if (month !== null) {
    if (!MONTH_RE.test(month)) throw new ApiError(422, "VALIDATION_FAILED", "Invalid month.");
    const packageId = docId(sp.get("packageId") ?? "", "Package");
    return Response.json(await getMonthAvailability(studioId, month, packageId), { headers });
  }

  const date = sp.get("date") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new ApiError(422, "VALIDATION_FAILED", "Invalid date.");
  return Response.json(await getDayAvailability(studioId, date), { headers });
});
