/**
 * Booking status lifecycle — the ONLY allowed status changes.
 *
 *   pending   ── confirm (studio)        → confirmed              (before the start time)
 *   pending   ── decline (studio)        → declined               (before the start time)
 *   pending   ── cancel (customer)       → cancelled_by_customer  (before the start time)
 *   confirmed ── complete (studio)       → completed              (once the start time has passed)
 *   confirmed ── studio_cancel (studio)  → cancelled_by_studio
 *
 * completed, declined, cancelled_by_customer, cancelled_by_studio and no_show
 * are final. A pending request whose start time has passed is EXPIRED: that
 * is derived from its date and time (no stored status, no background job).
 * It stays stored as `pending`, nobody can act on it, it no longer counts
 * toward the customer's open-request limit, and the UI shows it as expired.
 *
 * Customers cannot cancel a confirmed booking online: that needs a
 * cancellation policy (notice period, deposits) which has not been decided,
 * so they contact TasbirGhar instead.
 *
 * Pure and dependency-free: used by the server (authoritative, inside the
 * booking transaction) and by the UI to decide which buttons to show.
 * Times are Nepal wall-clock keys "YYYY-MM-DDTHH:mm" (see nepalNowKey).
 */
import type { BookingStatus } from "@/types/models";

export const BOOKING_ACTIONS = ["cancel", "confirm", "decline", "complete", "studio_cancel"] as const;
export type BookingAction = (typeof BOOKING_ACTIONS)[number];
export type BookingActor = "customer" | "studio";

export interface Transition {
  from: BookingStatus;
  action: BookingAction;
  actor: BookingActor;
  to: BookingStatus;
  /** Only allowed while the session's start time is still in the future. */
  beforeStart?: true;
  /** Only allowed once the session's start time has passed. */
  afterStart?: true;
}

export const BOOKING_TRANSITIONS: readonly Transition[] = [
  { from: "pending", action: "confirm", actor: "studio", to: "confirmed", beforeStart: true },
  { from: "pending", action: "decline", actor: "studio", to: "declined", beforeStart: true },
  { from: "pending", action: "cancel", actor: "customer", to: "cancelled_by_customer", beforeStart: true },
  { from: "confirmed", action: "complete", actor: "studio", to: "completed", afterStart: true },
  { from: "confirmed", action: "studio_cancel", actor: "studio", to: "cancelled_by_studio" },
];

export const FINAL_STATUSES: readonly BookingStatus[] = [
  "completed",
  "declined",
  "cancelled_by_customer",
  "cancelled_by_studio",
  "no_show",
];

/** The booking's start as a Nepal wall-clock key comparable with nepalNowKey(). */
export const startKey = (b: { shootDate: string; startTime: string }) => `${b.shootDate}T${b.startTime}`;

/** True once the session's start time has been reached (Nepal time). */
export const hasStarted = (b: { shootDate: string; startTime: string }, nowKey: string) => startKey(b) <= nowKey;

export interface When {
  shootDate: string;
  startTime: string;
  /** nepalNowKey() */
  now: string;
}

export type TransitionCheck =
  | { ok: true; transition: Transition }
  | { ok: false; reason: "WRONG_ACTOR" | "INVALID_TRANSITION" | "EXPIRED" | "NOT_YET" };

/** Whether `actor` may apply `action` to a booking in status `from`, right now. */
export function checkTransition(from: BookingStatus, action: BookingAction, actor: BookingActor, when: When): TransitionCheck {
  const forAction = BOOKING_TRANSITIONS.filter((t) => t.action === action);
  if (!forAction.some((t) => t.actor === actor)) return { ok: false, reason: "WRONG_ACTOR" };
  const transition = forAction.find((t) => t.from === from && t.actor === actor);
  if (!transition) return { ok: false, reason: "INVALID_TRANSITION" };
  const started = hasStarted(when, when.now);
  if (transition.beforeStart && started) return { ok: false, reason: "EXPIRED" };
  if (transition.afterStart && !started) return { ok: false, reason: "NOT_YET" };
  return { ok: true, transition };
}

/** Actions to offer `actor` right now (drives the buttons in the UI). */
export function availableActions(status: BookingStatus, actor: BookingActor, when: When): BookingAction[] {
  return BOOKING_TRANSITIONS.filter((t) => t.from === status && t.actor === actor)
    .filter((t) => checkTransition(status, t.action, actor, when).ok)
    .map((t) => t.action);
}

/**
 * Where a booking belongs in dashboards, from its stored status AND its time:
 *   upcoming          pending/confirmed, start still in the future
 *   needs_completion  confirmed, start passed, not yet marked completed
 *   expired           pending, start passed (derived — never stored)
 *   past              every final status
 */
export type BookingPhase = "upcoming" | "needs_completion" | "expired" | "past";

export function bookingPhase(b: { bookingStatus: BookingStatus; shootDate: string; startTime: string }, nowKey: string): BookingPhase {
  const started = hasStarted(b, nowKey);
  if (b.bookingStatus === "pending") return started ? "expired" : "upcoming";
  if (b.bookingStatus === "confirmed") return started ? "needs_completion" : "upcoming";
  return "past";
}

/** A pending request whose start time has passed (derived expiry). */
export const isExpiredPending = (b: { bookingStatus: BookingStatus; shootDate: string; startTime: string }, nowKey: string) =>
  bookingPhase(b, nowKey) === "expired";
