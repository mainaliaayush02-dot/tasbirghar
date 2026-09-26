/**
 * In-app notifications — the single definition of every notification type.
 *
 * Stored at users/{uid}/notifications/{id} by server code only, inside the
 * same Firestore transaction as the event that causes them. Documents hold a
 * fixed `type`, entity ids and a small snapshot (`data`); titles, messages
 * and links are generated here from the type when rendering, never stored or
 * accepted from a client.
 *
 * Pure and dependency-free (unit-tested directly).
 */
import type { BookingAction } from "@/lib/booking/transitions";

export const NOTIFICATION_TYPES = [
  "booking_requested", // → studio: a customer requested a booking
  "booking_confirmed", // → customer
  "booking_declined", // → customer
  "booking_cancelled_by_customer", // → studio
  "booking_cancelled_by_studio", // → customer
  "booking_completed", // → customer
  "review_submitted", // → studio: a review of their session awaits moderation
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export type NotificationAudience = "customer" | "studio";

/** Who receives each type. The recipient uid comes from the booking, never from a client. */
export const NOTIFICATION_AUDIENCE: Record<NotificationType, NotificationAudience> = {
  booking_requested: "studio",
  booking_confirmed: "customer",
  booking_declined: "customer",
  booking_cancelled_by_customer: "studio",
  booking_cancelled_by_studio: "customer",
  booking_completed: "customer",
  review_submitted: "studio",
};

/** Notification sent for each booking status change (see ./transitions). */
export const TRANSITION_NOTIFICATION: Record<BookingAction, NotificationType> = {
  confirm: "booking_confirmed",
  decline: "booking_declined",
  cancel: "booking_cancelled_by_customer",
  studio_cancel: "booking_cancelled_by_studio",
  complete: "booking_completed",
};

/** Minimal, display-only snapshot. Names are privacy-safe display names. */
export interface NotificationData {
  studioName?: string;
  customerName?: string;
  packageName?: string;
  /** "YYYY-MM-DD" (Nepal). */
  date?: string;
  /** "HH:mm" (Nepal). */
  time?: string;
}

const DATA_KEYS: readonly (keyof NotificationData)[] = ["studioName", "customerName", "packageName", "date", "time"];
const ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_TEXT = 80;

/** Document id: one notification per event → retries/repeats can never duplicate it. */
export function notificationId(type: NotificationType, bookingId: string): string {
  if (!isNotificationType(type)) throw new Error(`Unknown notification type: ${type}`);
  if (!ID_RE.test(bookingId)) throw new Error("Invalid booking id.");
  return `${type}_${bookingId}`;
}

/** Shape of an id produced by notificationId (used to validate API input). */
export const NOTIFICATION_ID_RE = new RegExp(`^(${NOTIFICATION_TYPES.join("|")})_[A-Za-z0-9_-]{1,128}$`);

export const isNotificationType = (value: unknown): value is NotificationType =>
  typeof value === "string" && (NOTIFICATION_TYPES as readonly string[]).includes(value);

export interface NotificationPayload {
  type: NotificationType;
  bookingId: string;
  studioId: string;
  reviewId: string | null;
  data: NotificationData;
}

/**
 * Builds a validated payload. Throws on an unknown type, malformed ids, extra
 * data keys or out-of-shape values, so a bug can't store arbitrary content.
 */
export function buildNotification(input: { type: NotificationType; bookingId: string; studioId: string; reviewId?: string | null; data: NotificationData }): NotificationPayload {
  if (!isNotificationType(input.type)) throw new Error(`Unknown notification type: ${String(input.type)}`);
  for (const id of [input.bookingId, input.studioId, input.reviewId].filter((v) => v !== null && v !== undefined)) {
    if (typeof id !== "string" || !ID_RE.test(id)) throw new Error("Invalid notification entity id.");
  }
  const data: NotificationData = {};
  for (const [key, value] of Object.entries(input.data)) {
    if (!(DATA_KEYS as readonly string[]).includes(key)) throw new Error(`Unexpected notification data field: ${key}`);
    if (value === undefined || value === null) continue;
    if (typeof value !== "string" || value.length === 0 || value.length > MAX_TEXT) throw new Error(`Invalid notification data: ${key}`);
    if (key === "date" && !DATE_RE.test(value)) throw new Error("Invalid notification date.");
    if (key === "time" && !TIME_RE.test(value)) throw new Error("Invalid notification time.");
    data[key as keyof NotificationData] = value;
  }
  return { type: input.type, bookingId: input.bookingId, studioId: input.studioId, reviewId: input.reviewId ?? null, data };
}

/* --------------------------------------------------------------- rendering */

const dayLabel = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" });
const timeLabel = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};
/** " Mon 5 Oct at 1:30 PM" with the given preposition, or "" when there's no date. */
const when = (d: NotificationData, prep: "on" | "for") =>
  d.date ? ` ${prep} ${dayLabel(d.date)}${d.time ? ` at ${timeLabel(d.time)}` : ""}` : "";

export interface RenderedNotification {
  title: string;
  body: string;
  /** Existing page the notification opens. */
  href: string;
}

/** Human-readable text and destination, generated from the fixed type only. */
export function renderNotification(n: { type: NotificationType; bookingId: string; data: NotificationData }): RenderedNotification {
  const d = n.data;
  const studio = d.studioName ?? "The studio";
  const customer = d.customerName ?? "A customer";
  const pkg = d.packageName ? ` for ${d.packageName}` : "";
  const customerBooking = `/account/bookings/${n.bookingId}`;
  switch (n.type) {
    case "booking_requested":
      return { title: "New booking request", body: `${customer} requested a session${pkg}${when(d, "on")}.`, href: "/dashboard/bookings?status=pending" };
    case "booking_confirmed":
      return { title: "Your booking was confirmed", body: `${studio} confirmed your session${when(d, "on")}.`, href: customerBooking };
    case "booking_declined":
      return { title: "Your booking was declined", body: `${studio} couldn't take your request${when(d, "for")}.`, href: customerBooking };
    case "booking_cancelled_by_customer":
      return { title: "Booking cancelled", body: `${customer} cancelled their request${when(d, "for")}.`, href: "/dashboard/bookings?status=cancelled" };
    case "booking_cancelled_by_studio":
      return { title: "Booking cancelled by the studio", body: `${studio} cancelled your session${when(d, "on")}.`, href: customerBooking };
    case "booking_completed":
      return { title: "Session completed", body: `${studio} marked your session${when(d, "on")} as completed. You can now leave a review.`, href: customerBooking };
    case "review_submitted":
      return {
        title: "New review awaiting moderation",
        body: `${customer} reviewed their session${when(d, "on")}. It will appear on your profile once TasbirGhar has checked it.`,
        href: "/dashboard/bookings?status=completed",
      };
  }
}
