import { FieldValue } from "firebase-admin/firestore";

import { apiRoute, readJson, requireApiUser, validated } from "@/lib/api/http";
import { assertStudioOwner, studioContactRef, studioRef } from "@/lib/data/studios";
import { adminDb } from "@/lib/firebase/admin";
import { validate } from "@/lib/validation/core";
import { studioProfileSchema } from "@/lib/validation/schemas";
import { invalidateMarketplace } from "@/lib/data/revalidate";

type Context = { params: Promise<{ studioId: string }> };

/**
 * PUT /api/studios/{studioId} — owner updates the studio profile. Public
 * fields go to the studio doc; phone/email/street address/website/instagram
 * go to the private contact doc. Slug, ownership, statuses, commission, stats and media
 * are not part of the schema and cannot be changed here.
 */
export const PUT = apiRoute<Context>(async (request, { params }) => {
  const user = await requireApiUser("photographer");
  const { studioId } = await params;
  await assertStudioOwner(studioId, user.uid);
  const input = validated(validate(studioProfileSchema, await readJson(request)));

  // Public fields and private contact are written together.
  const batch = adminDb().batch();
  batch.update(studioRef(studioId), {
    businessName: input.businessName,
    description: input.description,
    "location.city": input.city,
    "location.area": input.area,
    categories: input.categories,
    yearsOfExperience: input.yearsOfExperience,
    facilities: input.facilities,
    props: input.props,
    team: input.team,
    highlights: input.highlights,
    updatedAt: FieldValue.serverTimestamp(),
  });
  batch.set(
    studioContactRef(studioId),
    {
      phone: input.phone,
      email: input.email,
      address: input.address,
      website: input.website,
      instagram: input.instagram,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  await batch.commit();

  invalidateMarketplace();
  return Response.json({ ok: true });
});
