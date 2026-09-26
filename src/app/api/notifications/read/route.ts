import { apiRoute, ApiError, readJson, requireApiUser, validated } from "@/lib/api/http";
import { markRead } from "@/lib/notifications/service";
import { validate } from "@/lib/validation/core";
import { notificationReadSchema } from "@/lib/validation/schemas";

/**
 * POST /api/notifications/read { ids: [...] } | { all: true }
 * Marks the signed-in user's OWN notifications read (ids are looked up only
 * under users/{uid}/notifications, so another user's ids simply don't match).
 */
export const POST = apiRoute(async (request) => {
  const user = await requireApiUser();
  const input = validated(validate(notificationReadSchema, await readJson(request)));
  if ((input.ids === null) === (input.all === null)) {
    throw new ApiError(422, "VALIDATION_FAILED", "Send either { ids } or { all: true }.", { _form: "Send either ids or all." });
  }
  const result = await markRead(user.uid, input.all ? { all: true } : { ids: input.ids! });
  return Response.json({ ok: true, ...result });
});
