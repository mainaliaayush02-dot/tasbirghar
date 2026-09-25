/**
 * Booking time rules, shared by the server (authoritative) and the booking
 * form (instant feedback only). All dates/times are Asia/Kathmandu local.
 */
import type { BookingStatus } from "@/types/models";

export const BOOKING_TZ = "Asia/Kathmandu";
/** Open commitments: requests and confirmed sessions the studio still owes. */
export const ACTIVE_BOOKING_STATUSES: BookingStatus[] = ["pending", "confirmed"];
/**
 * Bookings whose time window can never be requested again. Completed sessions
 * block their (historical) window too; cancelled and declined ones free it.
 */
export const BLOCKING_BOOKING_STATUSES: BookingStatus[] = ["pending", "confirmed", "completed"];
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

/**
 * Start times a customer can actually request: inside an open window, on the
 * slot step, and not overlapping any blocking booking. The booking
 * transaction applies exactly the same test, so what is shown is what passes.
 */
export function freeStartTimes(open: Window[], blocking: Window[], durationMinutes: number): string[] {
  const out = new Set<string>();
  for (const w of open) {
    for (const start of startTimes(w.start, w.end, durationMinutes)) {
      const session = { start, end: fromMinutes(toMinutes(start) + durationMinutes) };
      if (!blocking.some((b) => overlaps(b, session))) out.add(start);
    }
  }
  return [...out].sort();
}

/* ------------------------------------------------------ availability editor */

/** Custom time slots a studio may publish for one day. */
export const MAX_SLOTS_PER_DAY = 12;

export const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Every date of a "YYYY-MM" month. */
export function monthDates(month: string): string[] {
  const out: string[] = [];
  for (let d = `${month}-01`; d.startsWith(month); d = addDays(d, 1)) out.push(d);
  return out;
}

export function addMonths(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

/**
 * Validates a day's custom slots. Returns an error message, or null.
 * Shared by the server (authoritative) and the dashboard editor.
 */
export function slotsError(slots: Window[]): string | null {
  if (slots.length === 0) return "Add at least one time slot, or use standard hours.";
  if (slots.length > MAX_SLOTS_PER_DAY) return `Up to ${MAX_SLOTS_PER_DAY} time slots per day.`;
  for (const s of slots) {
    if (!TIME_RE.test(s.start) || !TIME_RE.test(s.end)) return "Times must be HH:mm.";
    if (toMinutes(s.start) % SLOT_STEP_MINUTES || toMinutes(s.end) % SLOT_STEP_MINUTES) {
      return `Times must be on ${SLOT_STEP_MINUTES}-minute steps (e.g. 10:00 or 10:30).`;
    }
    if (toMinutes(s.end) <= toMinutes(s.start)) return `${s.start}–${s.end}: the end must be after the start.`;
  }
  const sorted = [...slots].sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
  for (let i = 1; i < sorted.length; i++) {
    if (overlaps(sorted[i - 1], sorted[i])) {
      return `${sorted[i - 1].start}–${sorted[i - 1].end} and ${sorted[i].start}–${sorted[i].end} overlap.`;
    }
  }
  return null;
}
