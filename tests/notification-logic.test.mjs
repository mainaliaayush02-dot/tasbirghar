/**
 * Pure notification logic: fixed types, deterministic ids, payload
 * validation, recipient mapping and rendering. No emulator needed.
 *
 *   npm run test:unit
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { BOOKING_ACTIONS, BOOKING_TRANSITIONS } from "../src/lib/booking/transitions.ts";
import {
  buildNotification,
  isNotificationType,
  NOTIFICATION_AUDIENCE,
  NOTIFICATION_ID_RE,
  NOTIFICATION_TYPES,
  notificationId,
  renderNotification,
  TRANSITION_NOTIFICATION,
} from "../src/lib/notifications/types.ts";

const data = { studioName: "Lalitpur Light Studio", customerName: "Anjali S.", packageName: "Newborn Classic", date: "2026-10-05", time: "13:30" };

describe("notification types and ids", () => {
  test("the type list is fixed", () => {
    assert.deepEqual([...NOTIFICATION_TYPES].sort(), [
      "booking_cancelled_by_customer", "booking_cancelled_by_studio", "booking_completed", "booking_confirmed",
      "booking_declined", "booking_requested", "review_submitted",
    ]);
    assert.equal(isNotificationType("booking_confirmed"), true);
    for (const bad of ["booking_expired", "admin_alert", "", null, 5, "BOOKING_CONFIRMED"]) assert.equal(isNotificationType(bad), false, String(bad));
  });
  test("ids are deterministic per event and match the API id pattern", () => {
    assert.equal(notificationId("booking_confirmed", "abc123"), "booking_confirmed_abc123");
    assert.equal(notificationId("booking_confirmed", "abc123"), notificationId("booking_confirmed", "abc123"));
    assert.notEqual(notificationId("booking_confirmed", "abc123"), notificationId("booking_declined", "abc123"));
    for (const t of NOTIFICATION_TYPES) assert.match(notificationId(t, "Xy_9-z"), NOTIFICATION_ID_RE);
    assert.doesNotMatch("unknown_type_abc", NOTIFICATION_ID_RE);
    assert.doesNotMatch("booking_confirmed_", NOTIFICATION_ID_RE);
    assert.doesNotMatch("booking_confirmed_a/b", NOTIFICATION_ID_RE);
    assert.throws(() => notificationId("booking_expired", "abc"));
    assert.throws(() => notificationId("booking_confirmed", "a/b"));
    assert.throws(() => notificationId("booking_confirmed", ""));
  });
});

describe("payload validation", () => {
  test("valid payloads keep only allowed data", () => {
    const p = buildNotification({ type: "booking_requested", bookingId: "b1", studioId: "s1", data });
    assert.deepEqual(p, { type: "booking_requested", bookingId: "b1", studioId: "s1", reviewId: null, data });
  });
  test("invalid payloads are refused", () => {
    const base = { type: "booking_confirmed", bookingId: "b1", studioId: "s1", data: { studioName: "S" } };
    for (const [label, input] of [
      ["unknown type", { ...base, type: "booking_expired" }],
      ["bad booking id", { ...base, bookingId: "../x" }],
      ["bad studio id", { ...base, studioId: "a b" }],
      ["bad review id", { ...base, reviewId: "x/y" }],
      ["extra data key (href)", { ...base, data: { href: "https://evil.example" } }],
      ["extra data key (title)", { ...base, data: { title: "Free money" } }],
      ["too long", { ...base, data: { studioName: "x".repeat(81) } }],
      ["bad date", { ...base, data: { date: "tomorrow" } }],
      ["bad time", { ...base, data: { time: "25:00" } }],
      ["non-string", { ...base, data: { studioName: 42 } }],
    ]) {
      assert.throws(() => buildNotification(input), undefined, label);
    }
  });
});

describe("recipients", () => {
  test("every booking action maps to exactly one notification for the OTHER party", () => {
    assert.deepEqual(Object.keys(TRANSITION_NOTIFICATION).sort(), [...BOOKING_ACTIONS].sort());
    for (const t of BOOKING_TRANSITIONS) {
      const type = TRANSITION_NOTIFICATION[t.action];
      const expected = t.actor === "customer" ? "studio" : "customer";
      assert.equal(NOTIFICATION_AUDIENCE[type], expected, `${t.action} by ${t.actor} → ${type}`);
    }
  });
  test("creation and review events notify the studio", () => {
    assert.equal(NOTIFICATION_AUDIENCE.booking_requested, "studio");
    assert.equal(NOTIFICATION_AUDIENCE.review_submitted, "studio");
    for (const t of NOTIFICATION_TYPES) assert.ok(["customer", "studio"].includes(NOTIFICATION_AUDIENCE[t]), t);
  });
});

describe("rendering", () => {
  test("every type renders a title, body and a link to an existing page", () => {
    for (const type of NOTIFICATION_TYPES) {
      const r = renderNotification({ type, bookingId: "b1", data });
      assert.ok(r.title.length > 3 && r.body.length > 10, type);
      const expectedPrefix = NOTIFICATION_AUDIENCE[type] === "customer" ? "/account/bookings/b1" : "/dashboard/bookings";
      assert.ok(r.href.startsWith(expectedPrefix), `${type} → ${r.href}`);
      assert.doesNotMatch(r.href, /^https?:/, "links are internal");
    }
  });
  test("human-readable copy with date/time context", () => {
    assert.deepEqual(renderNotification({ type: "booking_confirmed", bookingId: "b1", data }), {
      title: "Your booking was confirmed",
      body: "Lalitpur Light Studio confirmed your session on Mon 5 Oct at 1:30 PM.",
      href: "/account/bookings/b1",
    });
    assert.equal(renderNotification({ type: "booking_requested", bookingId: "b1", data }).title, "New booking request");
    assert.match(renderNotification({ type: "booking_requested", bookingId: "b1", data }).body, /^Anjali S\. requested a session for Newborn Classic on Mon 5 Oct at 1:30 PM\.$/);
    assert.equal(renderNotification({ type: "review_submitted", bookingId: "b1", data }).title, "New review awaiting moderation");
    assert.equal(renderNotification({ type: "booking_completed", bookingId: "b1", data }).title, "Session completed");
    assert.equal(renderNotification({ type: "booking_declined", bookingId: "b1", data }).title, "Your booking was declined");
    assert.equal(renderNotification({ type: "booking_cancelled_by_customer", bookingId: "b1", data }).title, "Booking cancelled");
  });
  test("missing snapshot fields fall back gracefully", () => {
    assert.equal(renderNotification({ type: "booking_cancelled_by_studio", bookingId: "b1", data: {} }).body, "The studio cancelled your session.");
    assert.equal(renderNotification({ type: "booking_requested", bookingId: "b1", data: {} }).body, "A customer requested a session.");
    assert.equal(renderNotification({ type: "booking_declined", bookingId: "b1", data: { studioName: "S", date: "2026-10-05" } }).body, "S couldn't take your request for Mon 5 Oct.");
  });
});
