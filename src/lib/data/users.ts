import "server-only";

import { FieldValue } from "firebase-admin/firestore";

import type { CurrentUser } from "@/lib/auth/current-user";
import { adminDb } from "@/lib/firebase/admin";
import { collections } from "@/lib/firestore/paths";
import type { SignupProfileInput } from "@/lib/validation/schemas";
import type { AccountDTO } from "@/types/dto";
import type { UserDoc, UserRole } from "@/types/models";

import { toIso } from "./serialize";

const userRef = (uid: string) => adminDb().collection(collections.users).doc(uid);

/**
 * Create users/{uid} on first sign-in (idempotent). Email and uid come from
 * the verified token; the role mirror comes from the trusted claim; only the
 * validated displayName/phone come from the client.
 */
export async function ensureUserDoc(
  identity: { uid: string; email: string | null; name: string | null; role: UserRole },
  profile: SignupProfileInput | null,
): Promise<void> {
  const ref = userRef(identity.uid);
  await adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) return;
    tx.create(ref, {
      uid: identity.uid,
      role: identity.role,
      displayName:
        profile?.displayName ?? identity.name ?? identity.email?.split("@")[0] ?? "TasbirGhar user",
      email: identity.email,
      phone: profile?.phone ?? null,
      photo: null,
      studioId: null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
}

export async function getAccount(user: CurrentUser): Promise<AccountDTO> {
  const snap = await userRef(user.uid).get();
  const data = snap.data() as Partial<UserDoc> | undefined;
  return {
    uid: user.uid,
    email: user.email,
    displayName: data?.displayName ?? user.displayName ?? "",
    phone: data?.phone ?? null,
    // Always report the trusted claim, not the mirror.
    role: user.role,
    studioId: data?.studioId ?? null,
    createdAt: toIso(data?.createdAt),
  };
}

export async function getUserStudioId(uid: string): Promise<string | null> {
  const snap = await userRef(uid).get();
  return (snap.get("studioId") as string | null | undefined) ?? null;
}
