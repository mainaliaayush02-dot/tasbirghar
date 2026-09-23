import { FieldValue } from "firebase-admin/firestore";

import { apiRoute, readJson, requireApiUser, validated } from "@/lib/api/http";
import { assertStudioOwner, studioRef } from "@/lib/data/studios";
import { validate } from "@/lib/validation/core";
import { studioProfileSchema } from "@/lib/validation/schemas";

type Context = { params: Promise<{ studioId: string }> };

/**
 * PUT /api/studios/{studioId} — owner updates the studio profile. The full
 * profile is validated and written; slug, ownership, statuses, commission,
 * stats and media are not part of the schema and cannot be changed here.
 */
export const PUT = apiRoute<Context>(async (request, { params }) => {
  const user = await requireApiUser("photographer");
  const { studioId } = await params;
  await assertStudioOwner(studioId, user.uid);
  const input = validated(validate(studioProfileSchema, await readJson(request)));

  await studioRef(studioId).update({
    businessName: input.businessName,
    description: input.description,
    phone: input.phone,
    email: input.email,
    website: input.website,
    instagram: input.instagram,
    "location.city": input.city,
    "location.area": input.area,
    "location.address": input.address,
    categories: input.categories,
    yearsOfExperience: input.yearsOfExperience,
    facilities: input.facilities,
    props: input.props,
    team: input.team,
    highlights: input.highlights,
    updatedAt: FieldValue.serverTimestamp(),
  });

  return Response.json({ ok: true });
});
