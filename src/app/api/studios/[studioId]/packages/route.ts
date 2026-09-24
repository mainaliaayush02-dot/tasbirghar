import { FieldValue } from "firebase-admin/firestore";

import { apiRoute, ApiError, readJson, requireApiUser, validated } from "@/lib/api/http";
import {
  assertStudioOwner,
  packageFields,
  refreshStartingPrice,
  studioSub,
} from "@/lib/data/studios";
import { validate } from "@/lib/validation/core";
import { LIMITS, packageSchema } from "@/lib/validation/schemas";
import { invalidateMarketplace } from "@/lib/data/revalidate";

type Context = { params: Promise<{ studioId: string }> };

/**
 * POST /api/studios/{studioId}/packages — owner creates a package.
 * Currency is always NPR; images start empty (attached only via media confirm).
 */
export const POST = apiRoute<Context>(async (request, { params }) => {
  const user = await requireApiUser("photographer");
  const { studioId } = await params;
  await assertStudioOwner(studioId, user.uid);
  const input = validated(validate(packageSchema, await readJson(request)));

  const packages = studioSub(studioId, "packages");
  const count = (await packages.count().get()).data().count;
  if (count >= LIMITS.maxPackages) {
    throw new ApiError(409, "LIMIT_REACHED", `You can create up to ${LIMITS.maxPackages} packages.`);
  }

  const ref = packages.doc();
  await ref.create({
    ...packageFields(input),
    studioId,
    currency: "NPR",
    images: [],
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  await refreshStartingPrice(studioId);

  invalidateMarketplace();
  return Response.json({ id: ref.id }, { status: 201 });
});
