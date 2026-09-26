/**
 * Pure weekly-hours logic: weekday mapping, validation, hours precedence
 * (day schedule → weekly hours → default) and stranded-booking detection.
 * No emulator needed.
 *
 *   npm run test:unit
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  DEFAULT_CLOSE,
  DEFAULT_OPEN,
  effectiveHours,
  MAX_SLOTS_PER_DAY,
  strandedByWeekly,
  WEEKDAY_KEYS,
  weekdayKey,
  weeklyHoursError,
} from "../src/lib/booking/rules.ts";

const open = (start, end) => ({ closed: false, slots: [{ start, end }] });
const week = (overrides = {}) => ({ ...Object.fromEntries(WEEKDAY_KEYS.map((k) => [k, open("09:00", "17:00")])), ...overrides });

describe("weekdayKey", () => {
  test("maps calendar dates to weekdays without timezone drift", () => {
    assert.equal(weekdayKey("2026-10-04"), "sun");
    assert.equal(weekdayKey("2026-10-05"), "mon");
    assert.equal(weekdayKey("2026-10-10"), "sat");
    assert.equal(weekdayKey("2026-12-31"), "thu");
    assert.equal(weekdayKey("2027-01-01"), "fri");
    assert.equal(weekdayKey("2028-02-29"), "tue");
  });
});

describe("weeklyHoursError", () => {
  test("accepts a valid week, including closed days and several slots", () => {
    assert.equal(weeklyHoursError(week()), null);
    assert.equal(weeklyHoursError(week({ sat: { closed: true, slots: [] }, sun: { closed: false, slots: [{ start: "07:00", end: "10:00" }, { start: "14:00", end: "18:30" }] } })), null);
  });
  test("refuses invalid weeks with the weekday named", () => {
    const { mon, ...missing } = week();
    void mon;
    for (const [bad, expected] of [
      [missing, /Monday is missing/],
      [week({ tue: { closed: true, slots: [{ start: "09:00", end: "10:00" }] } }), /Tuesday is closed/],
      [week({ wed: { closed: false, slots: [] } }), /^Wednesday: Add at least one/],
      [week({ thu: open("10:00", "09:00") }), /^Thursday: .*end must be after/],
      [week({ fri: open("10:15", "12:00") }), /^Friday: Times must be on 30-minute steps/],
      [week({ sat: { closed: false, slots: [{ start: "09:00", end: "12:00" }, { start: "11:00", end: "13:00" }] } }), /^Saturday: .*overlap/],
      [week({ sun: open("9:00", "12:00") }), /^Sunday: Times must be HH:mm/],
      [week({ mon: { closed: false, slots: Array.from({ length: MAX_SLOTS_PER_DAY + 1 }, (_, i) => ({ start: `${String(6 + i).padStart(2, "0")}:00`, end: `${String(6 + i).padStart(2, "0")}:30` })) } }), /^Monday: Up to/],
    ]) {
      assert.match(weeklyHoursError(bad) ?? "", expected);
    }
  });
});

describe("effectiveHours precedence", () => {
  const MON = "2026-10-05";
  const SAT = "2026-10-10";
  const weekly = week({ sat: { closed: true, slots: [] }, mon: { closed: false, slots: [{ start: "10:00", end: "12:00" }, { start: "13:00", end: "16:00" }] } });

  test("no day doc, no weekly → default hours", () => {
    assert.deepEqual(effectiveHours(undefined, null, MON), { isClosed: false, open: [{ start: DEFAULT_OPEN, end: DEFAULT_CLOSE }], source: "default" });
    assert.deepEqual(effectiveHours(undefined, undefined, MON).source, "default");
  });
  test("weekly hours apply to dates without a day schedule", () => {
    assert.deepEqual(effectiveHours(undefined, weekly, MON), { isClosed: false, open: weekly.mon.slots, source: "weekly" });
    assert.deepEqual(effectiveHours(undefined, weekly, SAT), { isClosed: true, open: [], source: "weekly" });
  });
  test("a day doc without slots (standard) falls through to weekly hours", () => {
    assert.equal(effectiveHours({ isClosed: false, slots: [] }, weekly, SAT).source, "weekly");
    assert.equal(effectiveHours({ isClosed: false }, null, MON).source, "default");
  });
  test("a day schedule overrides weekly hours both ways", () => {
    assert.deepEqual(effectiveHours({ isClosed: true, slots: [] }, weekly, MON), { isClosed: true, open: [], source: "day" });
    assert.deepEqual(effectiveHours({ isClosed: false, slots: [{ start: "08:00", end: "11:00" }] }, weekly, SAT), {
      isClosed: false, open: [{ start: "08:00", end: "11:00" }], source: "day",
    });
  });
  test("only open day slots count; returned windows are copies", () => {
    const day = { isClosed: false, slots: [{ start: "08:00", end: "09:00", status: "blocked" }, { start: "10:00", end: "11:00", status: "open" }, { start: "12:00", end: "13:00" }] };
    assert.deepEqual(effectiveHours(day, null, MON).open, [{ start: "10:00", end: "11:00" }, { start: "12:00", end: "13:00" }]);
    const hours = effectiveHours(undefined, weekly, MON);
    hours.open[0].start = "00:00";
    assert.equal(weekly.mon.slots[0].start, "10:00");
  });
});

describe("strandedByWeekly", () => {
  const b = (date, start, end) => ({ date, start, end });
  const bookings = [b("2026-10-05", "10:00", "11:00"), b("2026-10-10", "15:00", "16:00"), b("2026-10-06", "18:00", "19:00")];

  test("nothing is stranded when bookings fit the new week", () => {
    assert.deepEqual(strandedByWeekly(bookings, new Map(), week({ tue: open("09:00", "19:00"), sat: open("09:00", "17:00") })), []);
    assert.deepEqual(strandedByWeekly(bookings, new Map(), null), [], "default hours 07:00–20:00 cover them");
  });
  test("closing a weekday or shortening hours strands the affected bookings only", () => {
    assert.deepEqual(strandedByWeekly(bookings, new Map(), week({ sat: { closed: true, slots: [] }, tue: open("09:00", "19:00") })), [bookings[1]]);
    assert.deepEqual(strandedByWeekly(bookings, new Map(), week()), [bookings[2]], "Tuesday 18:00 is after 17:00");
  });
  test("a booking must fit inside ONE window, not across two", () => {
    const split = week({ mon: { closed: false, slots: [{ start: "09:00", end: "10:30" }, { start: "10:30", end: "12:00" }] } });
    assert.deepEqual(strandedByWeekly([b("2026-10-05", "10:00", "11:00")], new Map(), split), [b("2026-10-05", "10:00", "11:00")]);
  });
  test("dates with their own day schedule don't depend on weekly hours", () => {
    const docs = new Map([["2026-10-10", { isClosed: false, slots: [{ start: "14:00", end: "17:00" }] }]]);
    assert.deepEqual(strandedByWeekly([bookings[1]], docs, week({ sat: { closed: true, slots: [] } })), []);
    const standardDoc = new Map([["2026-10-10", { isClosed: false, slots: [] }]]);
    assert.deepEqual(strandedByWeekly([bookings[1]], standardDoc, week({ sat: { closed: true, slots: [] } })), [bookings[1]]);
  });
  test("resetting to default hours strands bookings outside 07:00–20:00", () => {
    assert.deepEqual(strandedByWeekly([b("2026-10-05", "20:00", "21:00")], new Map(), null), [b("2026-10-05", "20:00", "21:00")]);
  });
});
