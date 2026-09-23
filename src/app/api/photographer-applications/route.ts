import { FieldValue } from "firebase-admin/firestore";

import { apiRoute, ApiError, readJson, requireApiUser, validated } from "@/lib/api/http";
import { applicationRef } from "@/lib/data/applications";
import { adminDb } from "@/lib/firebase/admin";
import { validate } from "@/lib/validation/core";
import { applicationSchema } from "@/lib/validation/schemas";

/**
 * POST /api/photographer-applications — a signed-in customer applies to
 * become a photographer. Stored at photographerApplications/{uid} with status
 * "pending". Only an admin (server route) can change the status.
 */
export const POST = apiRoute(async (request) => {
  const user = await requireApiUser();
  if (user.role !== "customer") {
    throw new ApiError(409, "ALREADY_PHOTOGRAPHER", "Your account already has a professional role.");
  }
  const input = validated(validate(applicationSchema, await readJson(request)));
  const ref = applicationRef(user.uid);

  await adminDb().runTransaction(async (tx) => {
    const existing = await tx.get(ref);
    const status = existing.get("status") as string | undefined;
    if (status === "pending") {
      throw new ApiError(409, "ALREADY_PENDING", "Your application is already under review.");
    }
    if (status === "approved") {
      throw new ApiError(409, "ALREADY_APPROVED", "Your application was already approved.");
    }
    tx.set(ref, {
      ...input,
      applicantUid: user.uid,
      applicantEmail: user.email,
      status: "pending",
      submittedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      reviewedAt: null,
      reviewedBy: null,
      approvedAt: null,
      approvedBy: null,
      rejectionReason: null,
    });
  });

  return Response.json({ status: "pending" }, { status: 201 });
});
