import { FieldValue } from "firebase-admin/firestore";

import { apiRoute, readJson, requireApiUser, validated } from "@/lib/api/http";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { collections } from "@/lib/firestore/paths";
import { validate } from "@/lib/validation/core";
import { accountUpdateSchema } from "@/lib/validation/schemas";

/** PATCH /api/account { displayName, phone } — the only user-editable profile fields. */
export const PATCH = apiRoute(async (request) => {
  const user = await requireApiUser();
  const input = validated(validate(accountUpdateSchema, await readJson(request)));

  await adminDb()
    .collection(collections.users)
    .doc(user.uid)
    .set(
      { displayName: input.displayName, phone: input.phone, updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
  await adminAuth().updateUser(user.uid, { displayName: input.displayName });

  return Response.json({ ok: true });
});
