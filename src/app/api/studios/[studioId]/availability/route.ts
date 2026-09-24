import { apiRoute, ApiError, docId } from "@/lib/api/http";
import { getDayAvailability } from "@/lib/booking/service";

type Context = { params: Promise<{ studioId: string }> };

/**
 * GET /api/studios/{studioId}/availability?date=YYYY-MM-DD
 * Public, read-only day view for the booking form (published studios only):
 * open windows and busy windows. Informational — the booking POST re-checks
 * everything inside a transaction.
 */
export const GET = apiRoute<Context>(async (request, { params }) => {
  const studioId = docId((await params).studioId, "Studio");
  const date = new URL(request.url).searchParams.get("date") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new ApiError(422, "VALIDATION_FAILED", "Invalid date.");
  const day = await getDayAvailability(studioId, date);
  return Response.json(day, { headers: { "Cache-Control": "no-store" } });
});
