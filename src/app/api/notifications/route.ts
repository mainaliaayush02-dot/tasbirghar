import { apiRoute, requireApiUser } from "@/lib/api/http";
import { listNotifications } from "@/lib/notifications/service";

/**
 * GET /api/notifications — the signed-in user's latest 30 notifications
 * (newest first) and unread count. Always scoped to the session's own uid.
 */
export const GET = apiRoute(async () => {
  const user = await requireApiUser();
  const result = await listNotifications(user.uid);
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
});
