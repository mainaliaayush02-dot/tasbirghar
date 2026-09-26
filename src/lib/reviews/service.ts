import "server-only";

import { FieldValue, type Timestamp } from "firebase-admin/firestore";

import { ApiError, forbidden, notFound } from "@/lib/api/http";
import type { CurrentUser } from "@/lib/auth/current-user";
import { studioInternalRef, studioRef } from "@/lib/data/studios";
import { toIso } from "@/lib/data/serialize";
import { adminDb } from "@/lib/firebase/admin";
import { collections } from "@/lib/firestore/paths";
import { queueBookingNotification } from "@/lib/notifications/service";
import type { ReviewSubmitInput } from "@/lib/validation/schemas";
import type { BookingDoc, ReviewDoc, ReviewStatus, StudioDoc } from "@/types/models";

import { applyReviewStatusChange, publicDisplayName, REVIEW_WINDOW_DAYS, reviewEligibility } from "./rules";

/**
 * Reviews — server-authoritative.
 *
 * - One review per booking: the review doc id IS the booking id, created with
 *   `tx.create` inside a transaction that also reads and updates the booking,
 *   so duplicate or concurrent submissions produce exactly one review.
 * - Everything except the rating and comment is derived here: booking,
 *   studio, customer, privacy-safe display name, status and timestamps.
 * - New reviews are `pending_moderation`. Only published reviews count toward
 *   a studio's public rating; the totals change in the same transaction that
 *   moves a review across the published boundary, so they cannot drift.
 */

const db = () => adminDb();
const reviewRef = (bookingId: string) => db().collection(collections.reviews).doc(bookingId);
const bookingRef = (bookingId: string) => db().collection(collections.bookings).doc(bookingId);

const INELIGIBLE: Record<string, string> = {
  NOT_COMPLETED: "Only completed sessions can be reviewed.",
  ALREADY_REVIEWED: "You've already reviewed this booking.",
  REVIEW_WINDOW_CLOSED: `Reviews can be written up to ${REVIEW_WINDOW_DAYS} days after the session is completed.`,
};

const millis = (t: Timestamp | null | undefined) => (t ? t.toMillis() : null);

/** A customer reviews their own completed booking. Caller must require the customer role. */
export async function submitReview(user: CurrentUser, bookingId: string, input: ReviewSubmitInput): Promise<ReviewStatus> {
  const ref = reviewRef(bookingId);
  try {
    await db().runTransaction(async (tx) => {
      const [bookingSnap, reviewSnap, userSnap] = await Promise.all([
        tx.get(bookingRef(bookingId)),
        tx.get(ref),
        tx.get(db().collection(collections.users).doc(user.uid)),
      ]);
      const b = bookingSnap.data() as BookingDoc | undefined;
      // Not found and not yours look the same: no existence leak.
      if (!b || b.customerId !== user.uid) throw notFound("Booking");

      const [studioSnap, internalSnap] = await Promise.all([tx.get(studioRef(b.studioId)), tx.get(studioInternalRef(b.studioId))]);
      if (!studioSnap.exists || !internalSnap.exists) throw notFound("Studio");
      // A studio owner can never review their own studio.
      if (b.studioOwnerId === user.uid || internalSnap.get("ownerId") === user.uid) throw forbidden();

      const eligible = reviewEligibility(
        { bookingStatus: b.bookingStatus, completedAtMs: millis(b.completedAt), reviewed: reviewSnap.exists || Boolean(b.reviewedAt) },
        Date.now(),
      );
      if (!eligible.ok) throw new ApiError(409, eligible.reason, INELIGIBLE[eligible.reason]);

      const review: Omit<ReviewDoc, "createdAt" | "updatedAt"> = {
        bookingId,
        studioId: b.studioId,
        customerId: user.uid,
        customerDisplayName: publicDisplayName((userSnap.get("displayName") as string | undefined) || b.customerName),
        rating: input.rating as ReviewDoc["rating"],
        comment: input.comment,
        status: "pending_moderation",
        studioReply: null,
        moderation: null,
      };
      tx.create(ref, { ...review, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      tx.update(bookingRef(bookingId), { reviewedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      // The studio learns a review is in; admins see it in the derived moderation queue.
      queueBookingNotification(tx, "review_submitted", bookingId, b);
    });
  } catch (error) {
    // A concurrent submission committed first (gRPC ALREADY_EXISTS).
    if ((error as { code?: number }).code === 6) throw new ApiError(409, "ALREADY_REVIEWED", INELIGIBLE.ALREADY_REVIEWED);
    throw error;
  }
  return "pending_moderation";
}

/**
 * Admin moderation: publish or hide. Updates the studio's public rating totals
 * in the same transaction when the review crosses the published boundary.
 * Repeating the current state is refused (409 NO_CHANGE), so a repeated or
 * concurrent action can never count a rating twice.
 */
export async function moderateReview(
  admin: CurrentUser,
  reviewId: string,
  action: "publish" | "hide",
  reason: string | null,
): Promise<ReviewStatus> {
  const ref = reviewRef(reviewId);
  const to: ReviewStatus = action === "publish" ? "published" : "hidden";

  await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw notFound("Review");
    const review = snap.data() as ReviewDoc;
    if (review.status === to) throw new ApiError(409, "NO_CHANGE", `This review is already ${to}.`);

    const sRef = studioRef(review.studioId);
    const studio = (await tx.get(sRef)).data() as StudioDoc | undefined;
    if (!studio) throw notFound("Studio");
    const stats = studio.stats ?? { ratingAverage: 0, reviewCount: 0 };
    const current = {
      reviewCount: stats.reviewCount ?? 0,
      ratingAverage: stats.ratingAverage ?? 0,
      ratingSum: stats.ratingSum ?? Math.round((stats.ratingAverage ?? 0) * (stats.reviewCount ?? 0)),
    };
    const next = applyReviewStatusChange(current, review.rating, review.status, to);
    if (!next) {
      throw new ApiError(409, "STATS_INCONSISTENT", "This studio's rating totals are inconsistent. Run `npm run ratings:recompute` first.");
    }

    tx.update(ref, {
      status: to,
      moderation: { action, by: admin.uid, at: FieldValue.serverTimestamp(), reason },
      updatedAt: FieldValue.serverTimestamp(),
    });
    if (next.reviewCount !== current.reviewCount || next.ratingSum !== current.ratingSum) {
      tx.update(sRef, {
        "stats.ratingSum": next.ratingSum,
        "stats.reviewCount": next.reviewCount,
        "stats.ratingAverage": next.ratingAverage,
      });
    }
  });
  return to;
}

export interface OwnReviewDTO {
  rating: number;
  comment: string;
  status: ReviewStatus;
  createdAt: string | null;
}

/** The signed-in customer's own review for a booking, or null. */
export async function getOwnReview(uid: string, bookingId: string): Promise<OwnReviewDTO | null> {
  const snap = await reviewRef(bookingId).get();
  const r = snap.data() as ReviewDoc | undefined;
  if (!r || r.customerId !== uid) return null;
  return { rating: r.rating, comment: r.comment, status: r.status, createdAt: toIso(r.createdAt) };
}
