import { FieldValue } from "firebase-admin/firestore";

import {
  apiRoute,
  ApiError,
  docId,
  notFound,
  readJson,
  requireApiUser,
  validated,
} from "@/lib/api/http";
import { ROLE_CLAIM, roleFromClaims } from "@/lib/auth/roles";
import { applicationRef } from "@/lib/data/applications";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { collections } from "@/lib/firestore/paths";
import { validate } from "@/lib/validation/core";
import { applicationReviewSchema } from "@/lib/validation/schemas";

type Context = { params: Promise<{ uid: string }> };

const ACTIONS = ["approve", "reject"] as const;

/**
 * POST /api/admin/applications/{uid}  { action: "approve" | "reject", reason? }
 *
 * Admin-only (live custom claim). Approval:
 *   1. sets the Auth custom claim role=photographer (the authoritative role)
 *   2. in one transaction: application → approved (approvedAt/By), and the
 *      users/{uid}.role mirror → photographer
 * If step 2 fails, the claim is rolled back so the two never disagree.
 */
export const POST = apiRoute<Context>(async (request, { params }) => {
  const admin = await requireApiUser("admin");
  const uid = docId((await params).uid, "Application");

  const body = (await readJson(request)) as { action?: unknown; reason?: unknown };
  const action = ACTIONS.find((a) => a === body.action);
  if (!action) throw new ApiError(422, "VALIDATION_FAILED", "Choose approve or reject.");
  const { reason } = validated(validate(applicationReviewSchema, { reason: body.reason ?? null }));

  if (uid === admin.uid) {
    throw new ApiError(403, "SELF_REVIEW", "You cannot review your own application.");
  }

  const ref = applicationRef(uid);
  const snap = await ref.get();
  if (!snap.exists) throw notFound("Application");
  if (snap.get("status") !== "pending") {
    throw new ApiError(409, "NOT_PENDING", "This application has already been reviewed.");
  }

  if (action === "reject") {
    await adminDb().runTransaction(async (tx) => {
      const current = await tx.get(ref);
      if (current.get("status") !== "pending") {
        throw new ApiError(409, "NOT_PENDING", "This application has already been reviewed.");
      }
      tx.update(ref, {
        status: "rejected",
        rejectionReason: reason,
        reviewedAt: FieldValue.serverTimestamp(),
        reviewedBy: admin.uid,
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
    return Response.json({ status: "rejected" });
  }

  // Approve.
  const applicant = await adminAuth().getUser(uid).catch(() => null);
  if (!applicant || applicant.disabled) throw notFound("Applicant account");
  const previousClaims = applicant.customClaims ?? {};
  if (roleFromClaims(previousClaims) === "admin") {
    throw new ApiError(409, "IS_ADMIN", "Admins cannot be converted to photographers here.");
  }

  await adminAuth().setCustomUserClaims(uid, { ...previousClaims, [ROLE_CLAIM]: "photographer" });
  try {
    await adminDb().runTransaction(async (tx) => {
      const current = await tx.get(ref);
      if (current.get("status") !== "pending") {
        throw new ApiError(409, "NOT_PENDING", "This application has already been reviewed.");
      }
      tx.update(ref, {
        status: "approved",
        approvedAt: FieldValue.serverTimestamp(),
        approvedBy: admin.uid,
        reviewedAt: FieldValue.serverTimestamp(),
        reviewedBy: admin.uid,
        rejectionReason: null,
        updatedAt: FieldValue.serverTimestamp(),
      });
      tx.set(
        adminDb().collection(collections.users).doc(uid),
        { role: "photographer", updatedAt: FieldValue.serverTimestamp() },
        { merge: true },
      );
    });
  } catch (error) {
    await adminAuth().setCustomUserClaims(uid, previousClaims);
    throw error;
  }

  return Response.json({ status: "approved" });
});
