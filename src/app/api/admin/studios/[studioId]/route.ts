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
import { studioRef, studioSub } from "@/lib/data/studios";
import { adminDb } from "@/lib/firebase/admin";
import { validate } from "@/lib/validation/core";
import {
  studioModerationSchema,
  type StudioModerationAction,
} from "@/lib/validation/schemas";
import type { StudioDoc, StudioListingStatus, StudioVerificationStatus } from "@/types/models";

type Context = { params: Promise<{ studioId: string }> };

/** Allowed transitions: action → (from → to). Anything else is a 409. */
const LISTING: Partial<Record<StudioModerationAction, { from: StudioListingStatus[]; to: StudioListingStatus }>> = {
  publish: { from: ["draft", "pending_review"], to: "published" },
  unpublish: { from: ["published", "pending_review"], to: "draft" },
  suspend: { from: ["draft", "pending_review", "published"], to: "suspended" },
  reinstate: { from: ["suspended"], to: "draft" },
};
const VERIFICATION: Partial<Record<StudioModerationAction, { from: StudioVerificationStatus[]; to: StudioVerificationStatus }>> = {
  verify: { from: ["unverified", "pending", "rejected"], to: "verified" },
  unverify: { from: ["verified"], to: "unverified" },
};

const PAST: Record<StudioModerationAction, string> = {
  publish: "published",
  unpublish: "unpublished",
  suspend: "suspended",
  reinstate: "reinstated",
  verify: "verified",
  unverify: "unverified",
};

/**
 * POST /api/admin/studios/{studioId} { action, reason? }
 *
 * Admin-only studio moderation (live `admin` claim). Changes listing or
 * verification status in a transaction and records who/when/why in
 * `lastModeration` plus an append-only `moderationLog` entry. Owners can never
 * reach these fields (Firestore rules + owner routes exclude them).
 */
export const POST = apiRoute<Context>(async (request, { params }) => {
  const admin = await requireApiUser("admin");
  const studioId = docId((await params).studioId, "Studio");
  const { action, reason } = validated(validate(studioModerationSchema, await readJson(request)));
  if (action === "suspend" && !reason) {
    throw new ApiError(422, "VALIDATION_FAILED", "A reason is required to suspend a studio.", {
      reason: "Required.",
    });
  }

  const ref = studioRef(studioId);
  const result = await adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw notFound("Studio");
    const studio = snap.data() as StudioDoc;
    const update: Record<string, unknown> = {};

    const listing = LISTING[action];
    if (listing) {
      if (!listing.from.includes(studio.listingStatus)) {
        throw new ApiError(409, "INVALID_TRANSITION", `A ${studio.listingStatus.replace("_", " ")} studio cannot be ${PAST[action]}.`);
      }
      if (action === "publish") {
        // Never publish an empty listing: customers must see real work and prices.
        const [photos, activePackages] = await Promise.all([
          tx.get(studioSub(studioId, "portfolio").count()),
          tx.get(studioSub(studioId, "packages").where("isActive", "==", true).count()),
        ]);
        if (photos.data().count === 0 || activePackages.data().count === 0 || !studio.profileImage) {
          throw new ApiError(
            409,
            "INCOMPLETE_LISTING",
            "This studio needs a profile photo, at least one portfolio photo and one active package before it can be published.",
          );
        }
      }
      update.listingStatus = listing.to;
    }

    const verification = VERIFICATION[action];
    if (verification) {
      if (!verification.from.includes(studio.verificationStatus)) {
        throw new ApiError(409, "INVALID_TRANSITION", `This studio is already ${studio.verificationStatus}.`);
      }
      update.verificationStatus = verification.to;
    }

    const entry = { action, by: admin.uid, at: FieldValue.serverTimestamp(), reason };
    tx.update(ref, { ...update, lastModeration: entry });
    tx.create(studioSub(studioId, "moderationLog").doc(), {
      ...entry,
      from: { listingStatus: studio.listingStatus, verificationStatus: studio.verificationStatus },
      to: {
        listingStatus: (update.listingStatus as string) ?? studio.listingStatus,
        verificationStatus: (update.verificationStatus as string) ?? studio.verificationStatus,
      },
    });
    return update;
  });

  return Response.json({ ok: true, ...result });
});
