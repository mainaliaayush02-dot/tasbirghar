import { FieldValue } from "firebase-admin/firestore";

import { apiRoute, docId, notFound, readJson, requireApiUser, validated } from "@/lib/api/http";
import {
  assertStudioOwner,
  packageFields,
  refreshStartingPrice,
  studioSub,
} from "@/lib/data/studios";
import { validate } from "@/lib/validation/core";
import { packageSchema } from "@/lib/validation/schemas";
import { invalidateMarketplace } from "@/lib/data/revalidate";

type Context = { params: Promise<{ studioId: string; packageId: string }> };

async function resolve(context: Context) {
  const user = await requireApiUser("photographer");
  const { studioId, packageId } = await context.params;
  await assertStudioOwner(studioId, user.uid);
  const ref = studioSub(studioId, "packages").doc(docId(packageId, "Package"));
  if (!(await ref.get()).exists) throw notFound("Package");
  return { studioId, ref };
}

/** PUT — replace editable package fields (studioId, currency, images untouched). */
export const PUT = apiRoute<Context>(async (request, context) => {
  const { studioId, ref } = await resolve(context);
  const input = validated(validate(packageSchema, await readJson(request)));
  await ref.update({ ...packageFields(input), updatedAt: FieldValue.serverTimestamp() });
  await refreshStartingPrice(studioId);
  invalidateMarketplace();
  return Response.json({ ok: true });
});

export const DELETE = apiRoute<Context>(async (_request, context) => {
  const { studioId, ref } = await resolve(context);
  await ref.delete();
  await refreshStartingPrice(studioId);
  invalidateMarketplace();
  return Response.json({ ok: true });
});
