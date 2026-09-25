/**
 * Pure booking logic: the status transition table and availability slot
 * validation. No emulator or server needed.
 *
 *   npm run test:unit
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  BLOCKING_BOOKING_STATUSES,
  freeStartTimes,
  monthDates,
  addMonths,
  nepalNowKey,
  slotsError,
} from "../src/lib/booking/rules.ts";
import {
  availableActions,
  BOOKING_TRANSITIONS,
  bookingPhase,
  checkTransition,
  FINAL_STATUSES,
  isExpiredPending,
} from "../src/lib/booking/transitions.ts";

const ALL_STATUSES = ["pending", "confirmed", "declined", "cancelled_by_customer", "cancelled_by_studio", "completed", "no_show"];
const ACTIONS = ["cancel", "confirm", "decline", "complete", "studio_cancel"];
// Session 2026-10-10 10:00 (Nepal). "now" keys are Nepal wall-clock minutes.
const when = { shootDate: "2026-10-10", startTime: "10:00", now: "2026-10-01T09:00" };
const onTheDay = { shootDate: "2026-10-10", startTime: "10:00", now: "2026-10-10T10:00" };
const justBefore = { shootDate: "2026-10-10", startTime: "10:00", now: "2026-10-10T09:59" };

describe("booking status transitions", () => {
  test("the table is exactly the allowed lifecycle", () => {
    const allowed = BOOKING_TRANSITIONS.map((t) => `${t.from} -${t.action}(${t.actor})-> ${t.to}`).sort();
    assert.deepEqual(allowed, [
      "confirmed -complete(studio)-> completed",
      "confirmed -studio_cancel(studio)-> cancelled_by_studio",
      "pending -cancel(customer)-> cancelled_by_customer",
      "pending -confirm(studio)-> confirmed",
      "pending -decline(studio)-> declined",
    ]);
  });

  test("every other (status, action, actor) combination is denied", () => {
    for (const from of ALL_STATUSES) {
      for (const action of ACTIONS) {
        for (const actor of ["customer", "studio"]) {
          const listed = BOOKING_TRANSITIONS.find((t) => t.from === from && t.action === action && t.actor === actor);
          // Evaluate each listed transition at a time its guard allows.
          const at = listed?.afterStart ? onTheDay : when;
          assert.equal(checkTransition(from, action, actor, at).ok, Boolean(listed), `${from} ${action} by ${actor}`);
        }
      }
    }
  });

  test("final statuses allow nothing, for anyone", () => {
    for (const from of FINAL_STATUSES) {
      assert.deepEqual(availableActions(from, "customer", onTheDay), [], from);
      assert.deepEqual(availableActions(from, "studio", onTheDay), [], from);
    }
  });

  test("pending requests can only be acted on before their start time (derived expiry)", () => {
    for (const [action, actor] of [["confirm", "studio"], ["decline", "studio"], ["cancel", "customer"]]) {
      assert.equal(checkTransition("pending", action, actor, justBefore).ok, true, `${action} a minute before`);
      assert.equal(checkTransition("pending", action, actor, onTheDay).reason, "EXPIRED", `${action} at the start time`);
      assert.equal(checkTransition("pending", action, actor, { ...when, now: "2026-10-11T08:00" }).reason, "EXPIRED", `${action} a day later`);
    }
    assert.deepEqual(availableActions("pending", "studio", onTheDay), []);
    assert.deepEqual(availableActions("pending", "customer", onTheDay), []);
  });

  test("completion requires the start time to have passed", () => {
    assert.equal(checkTransition("confirmed", "complete", "studio", justBefore).reason, "NOT_YET");
    assert.equal(checkTransition("confirmed", "complete", "studio", { ...when, now: "2026-10-10T08:00" }).reason, "NOT_YET", "same day, before start");
    assert.equal(checkTransition("confirmed", "complete", "studio", onTheDay).ok, true, "at the start time");
    assert.equal(checkTransition("confirmed", "complete", "studio", { ...when, now: "2026-12-01T00:00" }).ok, true, "weeks later");
    // Studio cancellation of a confirmed booking is not time-limited (closes sessions that never happened).
    assert.equal(checkTransition("confirmed", "studio_cancel", "studio", justBefore).ok, true);
    assert.equal(checkTransition("confirmed", "studio_cancel", "studio", onTheDay).ok, true);
  });

  test("customers can only cancel a pending request", () => {
    assert.deepEqual(availableActions("pending", "customer", when), ["cancel"]);
    assert.deepEqual(availableActions("confirmed", "customer", when), []);
    assert.equal(checkTransition("confirmed", "cancel", "customer", when).reason, "INVALID_TRANSITION");
    assert.equal(checkTransition("completed", "cancel", "customer", when).reason, "INVALID_TRANSITION");
    assert.equal(checkTransition("pending", "confirm", "customer", when).reason, "WRONG_ACTOR");
  });

  test("studio actions: confirm/decline pending; complete once started; cancel confirmed", () => {
    assert.deepEqual(availableActions("pending", "studio", when), ["confirm", "decline"]);
    assert.deepEqual(availableActions("confirmed", "studio", when), ["studio_cancel"]);
    assert.equal(checkTransition("confirmed", "complete", "studio", when).reason, "NOT_YET");
    assert.deepEqual(availableActions("confirmed", "studio", onTheDay), ["complete", "studio_cancel"]);
    assert.equal(checkTransition("pending", "complete", "studio", onTheDay).reason, "INVALID_TRANSITION");
    assert.equal(checkTransition("pending", "cancel", "studio", when).reason, "WRONG_ACTOR");
  });

  test("dashboard phase is derived from status AND time", () => {
    const b = (bookingStatus) => ({ bookingStatus, shootDate: "2026-10-10", startTime: "10:00" });
    const before = "2026-10-10T09:59";
    const after = "2026-10-10T10:00";
    assert.equal(bookingPhase(b("pending"), before), "upcoming");
    assert.equal(bookingPhase(b("pending"), after), "expired");
    assert.equal(bookingPhase(b("confirmed"), before), "upcoming");
    assert.equal(bookingPhase(b("confirmed"), after), "needs_completion");
    for (const st of FINAL_STATUSES) {
      assert.equal(bookingPhase(b(st), before), "past", st);
      assert.equal(bookingPhase(b(st), after), "past", st);
    }
    assert.equal(isExpiredPending(b("pending"), after), true);
    assert.equal(isExpiredPending(b("confirmed"), after), false);
  });

  test("nepalNowKey is Nepal wall-clock time (UTC+5:45) as a sortable key", () => {
    assert.equal(nepalNowKey(new Date("2026-10-09T18:14:00Z")), "2026-10-09T23:59");
    assert.equal(nepalNowKey(new Date("2026-10-09T18:15:00Z")), "2026-10-10T00:00");
    assert.equal(nepalNowKey(new Date("2026-10-10T04:15:00Z")), "2026-10-10T10:00");
    assert.match(nepalNowKey(), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });
});

describe("availability slots", () => {
  const s = (start, end) => ({ start, end });

  test("valid slots pass (adjacent is fine)", () => {
    assert.equal(slotsError([s("10:00", "11:00"), s("13:00", "14:00"), s("16:00", "17:00")]), null);
    assert.equal(slotsError([s("10:00", "11:00"), s("11:00", "12:00")]), null);
  });

  test("invalid slots are rejected", () => {
    for (const [label, slots] of [
      ["empty", []],
      ["end before start", [s("11:00", "10:00")]],
      ["zero length", [s("10:00", "10:00")]],
      ["overlap", [s("10:00", "12:00"), s("11:30", "13:00")]],
      ["duplicate", [s("10:00", "11:00"), s("10:00", "11:00")]],
      ["off-step", [s("10:15", "11:00")]],
      ["malformed", [s("9:00", "11:00")]],
      ["too many", Array.from({ length: 13 }, (_, i) => s(`${String(i + 6).padStart(2, "0")}:00`, `${String(i + 6).padStart(2, "0")}:30`))],
    ]) {
      assert.notEqual(slotsError(slots), null, label);
    }
  });

  test("free start times respect windows, duration and blocking bookings", () => {
    const open = [s("10:00", "12:00"), s("14:00", "15:00")];
    assert.deepEqual(freeStartTimes(open, [], 60), ["10:00", "10:30", "11:00", "14:00"]);
    assert.deepEqual(freeStartTimes(open, [s("10:30", "11:30")], 60), ["14:00"]);
    assert.deepEqual(freeStartTimes(open, [], 180), []);
  });

  test("completed bookings block; cancelled and declined do not", () => {
    assert.ok(BLOCKING_BOOKING_STATUSES.includes("completed"));
    for (const st of ["declined", "cancelled_by_customer", "cancelled_by_studio"]) assert.ok(!BLOCKING_BOOKING_STATUSES.includes(st));
  });

  test("month helpers", () => {
    assert.equal(monthDates("2028-02").length, 29);
    assert.equal(monthDates("2026-09").at(-1), "2026-09-30");
    assert.equal(addMonths("2026-12", 1), "2027-01");
    assert.equal(addMonths("2026-01", -1), "2025-12");
  });
});
