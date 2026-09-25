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
  slotsError,
} from "../src/lib/booking/rules.ts";
import { availableActions, BOOKING_TRANSITIONS, checkTransition, FINAL_STATUSES } from "../src/lib/booking/transitions.ts";

const ALL_STATUSES = ["pending", "confirmed", "declined", "cancelled_by_customer", "cancelled_by_studio", "completed", "no_show"];
const ACTIONS = ["cancel", "confirm", "decline", "complete", "studio_cancel"];
const when = { shootDate: "2026-10-10", today: "2026-10-01" };
const onTheDay = { shootDate: "2026-10-10", today: "2026-10-10" };

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
          const listed = BOOKING_TRANSITIONS.some((t) => t.from === from && t.action === action && t.actor === actor);
          const result = checkTransition(from, action, actor, onTheDay);
          assert.equal(result.ok, listed, `${from} ${action} by ${actor}`);
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

  test("customers can only cancel a pending request", () => {
    assert.deepEqual(availableActions("pending", "customer", when), ["cancel"]);
    assert.deepEqual(availableActions("confirmed", "customer", when), []);
    assert.equal(checkTransition("confirmed", "cancel", "customer", when).reason, "INVALID_TRANSITION");
    assert.equal(checkTransition("completed", "cancel", "customer", when).reason, "INVALID_TRANSITION");
    assert.equal(checkTransition("pending", "confirm", "customer", when).reason, "WRONG_ACTOR");
  });

  test("studio actions: confirm/decline pending; complete only on/after the shoot date; cancel confirmed", () => {
    assert.deepEqual(availableActions("pending", "studio", when), ["confirm", "decline"]);
    assert.deepEqual(availableActions("confirmed", "studio", when), ["studio_cancel"]);
    assert.equal(checkTransition("confirmed", "complete", "studio", when).reason, "NOT_YET");
    assert.deepEqual(availableActions("confirmed", "studio", onTheDay), ["complete", "studio_cancel"]);
    assert.equal(checkTransition("pending", "complete", "studio", onTheDay).reason, "INVALID_TRANSITION");
    assert.equal(checkTransition("pending", "cancel", "studio", when).reason, "WRONG_ACTOR");
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
