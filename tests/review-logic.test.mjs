/**
 * Pure review logic: eligibility window, privacy-safe display names and
 * published-only rating accounting. No emulator or server needed.
 *
 *   npm run test:unit
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { applyReviewStatusChange, averageOf, publicDisplayName, REVIEW_WINDOW_DAYS, reviewEligibility } from "../src/lib/reviews/rules.ts";

const DAY = 24 * 60 * 60 * 1000;
const completedAt = Date.UTC(2026, 9, 1, 6, 0);

describe("review eligibility", () => {
  const b = (bookingStatus, extra = {}) => ({ bookingStatus, completedAtMs: completedAt, reviewed: false, ...extra });

  test("a completed, unreviewed booking inside the window is eligible", () => {
    assert.equal(reviewEligibility(b("completed"), completedAt + DAY).ok, true);
    assert.equal(reviewEligibility(b("completed"), completedAt + REVIEW_WINDOW_DAYS * DAY).ok, true, "last moment of day 60");
  });
  test("every non-completed status is refused", () => {
    for (const st of ["pending", "confirmed", "declined", "cancelled_by_customer", "cancelled_by_studio", "no_show"]) {
      assert.equal(reviewEligibility(b(st), completedAt + DAY).reason, "NOT_COMPLETED", st);
    }
    assert.equal(reviewEligibility(b("completed", { completedAtMs: null }), completedAt).reason, "NOT_COMPLETED", "no completion time");
  });
  test("already reviewed and window closed are refused", () => {
    assert.equal(reviewEligibility(b("completed", { reviewed: true }), completedAt + DAY).reason, "ALREADY_REVIEWED");
    assert.equal(reviewEligibility(b("completed"), completedAt + REVIEW_WINDOW_DAYS * DAY + 1).reason, "REVIEW_WINDOW_CLOSED");
    assert.equal(reviewEligibility(b("completed"), completedAt + 61 * DAY).reason, "REVIEW_WINDOW_CLOSED");
  });
});

describe("privacy-safe display name", () => {
  test("first name + last initial", () => {
    assert.equal(publicDisplayName("Anjali Shrestha"), "Anjali S.");
    assert.equal(publicDisplayName("anjali  maya shrestha"), "Anjali S.");
    assert.equal(publicDisplayName("Ram"), "Ram");
  });
  test("never leaks digits, emails or symbols; empty falls back", () => {
    assert.equal(publicDisplayName("Ram 9812345678"), "Ram");
    assert.ok(!/[@\d.]/.test(publicDisplayName("sita@example.com").replace(/ [A-Z]\.$/, "")));
    assert.equal(publicDisplayName(""), "TasbirGhar customer");
    assert.equal(publicDisplayName(null), "TasbirGhar customer");
    assert.equal(publicDisplayName("   123 !!! "), "TasbirGhar customer");
  });
});

describe("published-only rating accounting", () => {
  const zero = { ratingSum: 0, reviewCount: 0, ratingAverage: 0 };

  test("only crossing the published boundary changes totals", () => {
    const a = applyReviewStatusChange(zero, 5, "pending_moderation", "published");
    assert.deepEqual(a, { ratingSum: 5, reviewCount: 1, ratingAverage: 5 });
    const b = applyReviewStatusChange(a, 2, "pending_moderation", "published");
    assert.deepEqual(b, { ratingSum: 7, reviewCount: 2, ratingAverage: 3.5 });
    assert.deepEqual(applyReviewStatusChange(b, 4, "pending_moderation", "hidden"), b, "pending → hidden: no change");
    const c = applyReviewStatusChange(b, 5, "published", "hidden");
    assert.deepEqual(c, { ratingSum: 2, reviewCount: 1, ratingAverage: 2 });
    assert.deepEqual(applyReviewStatusChange(c, 5, "hidden", "published"), b, "re-publish restores exactly once");
  });
  test("a no-op transition changes nothing (repeat moderation can't double count)", () => {
    const s = { ratingSum: 9, reviewCount: 2, ratingAverage: 4.5 };
    assert.deepEqual(applyReviewStatusChange(s, 4, "published", "published"), s);
    assert.deepEqual(applyReviewStatusChange(s, 4, "hidden", "hidden"), s);
  });
  test("inconsistent totals are detected instead of going negative", () => {
    assert.equal(applyReviewStatusChange(zero, 5, "published", "hidden"), null);
    assert.equal(applyReviewStatusChange({ ratingSum: 3, reviewCount: 1, ratingAverage: 3 }, 5, "published", "hidden"), null);
  });
  test("average rounds to 2 decimals and is 0 with no reviews", () => {
    assert.equal(averageOf(0, 0), 0);
    assert.equal(averageOf(14, 3), 4.67);
  });
});
