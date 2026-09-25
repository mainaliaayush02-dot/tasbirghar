/**
 * Review rules shared by the server (authoritative) and forms (limits only).
 * Pure and dependency-free, so they are unit-tested directly.
 */
import type { BookingStatus, ReviewStatus } from "@/types/models";

/** A customer may review a completed booking for this long after completion. */
export const REVIEW_WINDOW_DAYS = 60;
export const RATING_MIN = 1;
export const RATING_MAX = 5;
export const COMMENT_MIN = 20;
export const COMMENT_MAX = 1000;

const DAY_MS = 24 * 60 * 60 * 1000;

export type ReviewIneligibility = "NOT_COMPLETED" | "ALREADY_REVIEWED" | "REVIEW_WINDOW_CLOSED";

/**
 * Whether a booking can be reviewed now. Ownership (the booking belongs to
 * the signed-in customer) is checked separately by the caller.
 */
export function reviewEligibility(
  b: { bookingStatus: BookingStatus; completedAtMs: number | null; reviewed: boolean },
  nowMs: number,
): { ok: true; closesAtMs: number } | { ok: false; reason: ReviewIneligibility } {
  if (b.bookingStatus !== "completed" || b.completedAtMs === null) return { ok: false, reason: "NOT_COMPLETED" };
  if (b.reviewed) return { ok: false, reason: "ALREADY_REVIEWED" };
  const closesAtMs = b.completedAtMs + REVIEW_WINDOW_DAYS * DAY_MS;
  if (nowMs > closesAtMs) return { ok: false, reason: "REVIEW_WINDOW_CLOSED" };
  return { ok: true, closesAtMs };
}

/**
 * Privacy-safe public name from the account's display name: first name plus
 * last initial ("Anjali Shrestha" → "Anjali S."). Never includes email,
 * phone or ids; falls back to a generic label.
 */
export function publicDisplayName(displayName: string | null | undefined): string {
  const parts = (displayName ?? "")
    .replace(/[^\p{L}\p{M}\s'-]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "TasbirGhar customer";
  const first = parts[0].slice(0, 30);
  const last = parts.length > 1 ? ` ${parts[parts.length - 1][0].toUpperCase()}.` : "";
  return `${first[0].toUpperCase()}${first.slice(1)}${last}`;
}

export interface RatingStats {
  ratingSum: number;
  reviewCount: number;
  ratingAverage: number;
}

/** Average rounded to 2 decimals; 0 when there are no published reviews. */
export const averageOf = (sum: number, count: number) => (count > 0 ? Math.round((sum / count) * 100) / 100 : 0);

/**
 * New public rating stats after a review moves from `from` to `to`.
 * Only `published` reviews count: crossing into published adds the rating,
 * crossing out of it removes it, anything else changes nothing. Returns null
 * if the stored totals are inconsistent (would go negative).
 */
export function applyReviewStatusChange(stats: RatingStats, rating: number, from: ReviewStatus, to: ReviewStatus): RatingStats | null {
  const was = from === "published";
  const will = to === "published";
  const delta = was === will ? 0 : will ? 1 : -1;
  const ratingSum = stats.ratingSum + delta * rating;
  const reviewCount = stats.reviewCount + delta;
  if (ratingSum < 0 || reviewCount < 0 || (reviewCount === 0 && ratingSum !== 0)) return null;
  return { ratingSum, reviewCount, ratingAverage: averageOf(ratingSum, reviewCount) };
}
