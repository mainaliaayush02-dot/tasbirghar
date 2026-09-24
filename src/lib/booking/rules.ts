/**
 * Booking time rules, shared by the server (authoritative) and the booking
 * form (instant feedback only). All dates/times are Asia/Kathmandu local.
 */
import type { BookingStatus } from "@/types/models";

export const BOOKING_TZ = "Asia/Kathmandu";
/** Bookings that hold a time window (block other requests). */
export const ACTIVE_BOOKING_STATUSES: BookingStatus[] = ["pending", "confirmed"];
export const MIN_LEAD_DAYS = 1;
export const MAX_LEAD_DAYS = 180;
/** Studio hours used when a studio has not published availability for a day. */
export const DEFAULT_OPEN = "07:00";
export const DEFAULT_CLOSE = "20:00";
export const SLOT_STEP_MINUTES = 30;
/** Anti-spam: open (pending) requests a customer may have at once. */
export const MAX_PENDING_PER_CUSTOMER = 5;

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
export const fromMinutes = (mins: number) =>
  `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;

/** Today's date in Nepal as YYYY-MM-DD. */
export function nepalToday(now: Date = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: BOOKING_TZ });
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function isRealDate(date: string): boolean {
  if (!DATE_RE.test(date)) return false;
  const d = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === date;
}

/** Bookable window: tomorrow … +180 days (Nepal time). */
export function bookableRange(now: Date = new Date()) {
  const today = nepalToday(now);
  return { min: addDays(today, MIN_LEAD_DAYS), max: addDays(today, MAX_LEAD_DAYS) };
}

export interface Window {
  start: string;
  end: string;
}

export const overlaps = (a: Window, b: Window) =>
  toMinutes(a.start) < toMinutes(b.end) && toMinutes(b.start) < toMinutes(a.end);

/** Candidate start times inside [open, close) that fit `duration`. */
export function startTimes(open: string, close: string, durationMinutes: number): string[] {
  const out: string[] = [];
  for (let t = toMinutes(open); t + durationMinutes <= toMinutes(close); t += SLOT_STEP_MINUTES) {
    out.push(fromMinutes(t));
  }
  return out;
}
