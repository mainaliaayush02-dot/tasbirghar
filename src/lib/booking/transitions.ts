/**
 * Booking status lifecycle — the ONLY allowed status changes.
 *
 *   pending   ── confirm (studio)        → confirmed
 *   pending   ── decline (studio)        → declined
 *   pending   ── cancel (customer)       → cancelled_by_customer
 *   confirmed ── complete (studio)       → completed            (on/after the shoot date)
 *   confirmed ── studio_cancel (studio)  → cancelled_by_studio
 *
 * completed, declined, cancelled_by_customer, cancelled_by_studio and no_show
 * are final. Customers cannot cancel a confirmed booking online: that needs a
 * cancellation policy (notice period, deposits) which has not been decided,
 * so they contact the studio instead.
 *
 * Pure and dependency-free: used by the server (authoritative, inside the
 * booking transaction) and by the UI to decide which buttons to show.
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
  /** Only allowed once the shoot date has arrived (Nepal time). */
  onOrAfterShootDate?: boolean;
}

export const BOOKING_TRANSITIONS: readonly Transition[] = [
  { from: "pending", action: "confirm", actor: "studio", to: "confirmed" },
  { from: "pending", action: "decline", actor: "studio", to: "declined" },
  { from: "pending", action: "cancel", actor: "customer", to: "cancelled_by_customer" },
  { from: "confirmed", action: "complete", actor: "studio", to: "completed", onOrAfterShootDate: true },
  { from: "confirmed", action: "studio_cancel", actor: "studio", to: "cancelled_by_studio" },
];

export const FINAL_STATUSES: readonly BookingStatus[] = [
  "completed",
  "declined",
  "cancelled_by_customer",
  "cancelled_by_studio",
  "no_show",
];

export type TransitionCheck =
  | { ok: true; transition: Transition }
  | { ok: false; reason: "WRONG_ACTOR" | "INVALID_TRANSITION" | "NOT_YET" };

/** Whether `actor` may apply `action` to a booking in status `from`. */
export function checkTransition(
  from: BookingStatus,
  action: BookingAction,
  actor: BookingActor,
  { shootDate, today }: { shootDate: string; today: string },
): TransitionCheck {
  const forAction = BOOKING_TRANSITIONS.filter((t) => t.action === action);
  if (!forAction.some((t) => t.actor === actor)) return { ok: false, reason: "WRONG_ACTOR" };
  const transition = forAction.find((t) => t.from === from && t.actor === actor);
  if (!transition) return { ok: false, reason: "INVALID_TRANSITION" };
  if (transition.onOrAfterShootDate && shootDate > today) return { ok: false, reason: "NOT_YET" };
  return { ok: true, transition };
}

/** Actions to offer `actor` right now (drives the buttons in the UI). */
export function availableActions(
  status: BookingStatus,
  actor: BookingActor,
  when: { shootDate: string; today: string },
): BookingAction[] {
  return BOOKING_TRANSITIONS.filter((t) => t.from === status && t.actor === actor)
    .filter((t) => checkTransition(status, t.action, actor, when).ok)
    .map((t) => t.action);
}
