import "server-only";

import { FieldValue, type Transaction } from "firebase-admin/firestore";

import { ApiError, forbidden, notFound } from "@/lib/api/http";
import type { CurrentUser } from "@/lib/auth/current-user";
import { studioInternalRef, studioRef, studioSub } from "@/lib/data/studios";
import { adminDb } from "@/lib/firebase/admin";
import { collections } from "@/lib/firestore/paths";
import { calculateCommission, DEFAULT_COMMISSION_RATE_BPS } from "@/lib/money";
import type { AvailabilityDayInput, BookingCreateInput } from "@/lib/validation/schemas";
import type {
  AvailabilityDayDoc,
  BookingDoc,
  BookingStatus,
  PackageDoc,
  StudioDoc,
  StudioInternalDoc,
} from "@/types/models";

import {
  ACTIVE_BOOKING_STATUSES,
  BLOCKING_BOOKING_STATUSES,
  bookableRange,
  effectiveHours,
  freeStartTimes,
  fromMinutes,
  isRealDate,
  MAX_PENDING_PER_CUSTOMER,
  nepalNowKey,
  overlaps,
  monthDates,
  SLOT_STEP_MINUTES,
  slotsError,
  strandedByWeekly,
  toMinutes,
  weeklyHoursError,
  type WeeklyHours,
  type Window,
} from "./rules";
import { queueBookingNotification } from "@/lib/notifications/service";
import { TRANSITION_NOTIFICATION } from "@/lib/notifications/types";

import { checkTransition, isExpiredPending, type BookingAction } from "./transitions";

/**
 * Server-authoritative booking logic.
 *
 * Trust model:
 * - The client only states intent (studio, package, date, start time,
 *   contact). Price, commission, payout, owner, end time and status are
 *   derived here from Firestore — never from the request.
 * - Open hours for a date come from `effectiveHours` (rules.ts): the date's own
 *   schedule, else the studio's weekly hours (studios/{id}.weeklyHours), else
 *   the default. Weekly hours live on the studio doc, which every booking
 *   transaction reads, so a weekly change serializes with booking requests.
 * - Photographer availability docs may CLOSE a day or RESTRICT times, but the
 *   final authority is the set of existing blocking bookings (pending,
 *   confirmed, completed), checked inside a transaction.
 * - Availability docs are written only here (setDayAvailability), under the
 *   same studio-day lock, and an edit that would leave a pending/confirmed
 *   booking outside the open hours is refused.
 * - A customer's open (pending, not expired) requests are counted INSIDE the
 *   booking transaction, which also reads and writes that customer's
 *   `customerLocks/{uid}` doc, so concurrent requests from one customer are
 *   serialized and can never exceed MAX_PENDING_PER_CUSTOMER.
 * - Each booking event queues its in-app notification (booking_requested,
 *   booking_confirmed, …) in the SAME transaction, so the event and its
 *   notification commit together or not at all (src/lib/notifications).
 * - Every write for a studio-day first reads `bookingLocks/{studioId}_{date}`
 *   and writes it back. Firestore serializes transactions that touch the same
 *   document, so two concurrent requests can never both pass the overlap
 *   check for the same studio-day (no double booking).
 */

const db = () => adminDb();
const lockRef = (studioId: string, date: string) =>
  db().collection(collections.bookingLocks).doc(`${studioId}_${date}`);
const customerLockRef = (uid: string) => db().collection(collections.customerLocks).doc(uid);
const pendingOf = (uid: string) =>
  db().collection(collections.bookings).where("customerId", "==", uid).where("bookingStatus", "==", "pending");
const bookingsFor = (studioId: string, date: string) =>
  db().collection(collections.bookings).where("studioId", "==", studioId).where("shootDate", "==", date);

/**
 * Public day view: the studio's published hours ONLY. It is never derived
 * from bookings, so it reveals no booking IDs, customers, statuses or busy
 * intervals. Free start times come from getMonthAvailability.
 */
export interface DayAvailability {
  date: string;
  isClosed: boolean;
  /** Windows the studio is open for bookings that day. */
  open: Window[];
  /** "studio" = a date-specific schedule, "weekly" = the studio's weekly hours, "default" = default hours. */
  source: "studio" | "weekly" | "default";
}

const weeklyOf = (studio: { get(field: string): unknown }) => (studio.get("weeklyHours") as WeeklyHours | null | undefined) ?? null;
/** Public `source` values of the day view (kept stable for API clients). */
const PUBLIC_SOURCE = { day: "studio", weekly: "weekly", default: "default" } as const;

const windowsWith = (statuses: BookingStatus[]) => (docs: FirebaseFirestore.QueryDocumentSnapshot[], exceptId?: string): Window[] =>
  docs
    .filter((d) => d.id !== exceptId && statuses.includes(d.get("bookingStatus") as BookingStatus))
    .map((d) => ({ start: d.get("startTime") as string, end: d.get("endTime") as string }));
/** Windows no new request may overlap (pending, confirmed, completed). */
const blockingWindows = windowsWith(BLOCKING_BOOKING_STATUSES);
/** Windows the studio still owes (pending, confirmed). */
const activeWindows = windowsWith(ACTIVE_BOOKING_STATUSES);

/** Public day view for the booking form. Studio must be published. */
export async function getDayAvailability(studioId: string, date: string): Promise<DayAvailability> {
  const studio = await studioRef(studioId).get();
  if (!studio.exists || studio.get("listingStatus") !== "published") throw notFound("Studio");
  assertBookableDate(date);
  const day = await studioSub(studioId, "availability").doc(date).get();
  const { isClosed, open, source } = effectiveHours(day.data() as AvailabilityDayDoc | undefined, weeklyOf(studio), date);
  return { date, isClosed, open, source: PUBLIC_SOURCE[source] };
}

function assertBookableDate(date: string) {
  const { min, max } = bookableRange();
  if (!isRealDate(date) || date < min || date > max) {
    throw new ApiError(422, "VALIDATION_FAILED", "Choose a date between tomorrow and 6 months from now.", {
      shootDate: "Choose a date between tomorrow and 6 months from now.",
    });
  }
}

/* ================================================================ create */

export async function createBooking(user: CurrentUser, input: BookingCreateInput): Promise<string> {
  if (user.role !== "customer") {
    throw new ApiError(403, "CUSTOMERS_ONLY", "Bookings are made from a customer account.");
  }
  assertBookableDate(input.shootDate);
  if (toMinutes(input.startTime) % SLOT_STEP_MINUTES !== 0) {
    throw new ApiError(422, "VALIDATION_FAILED", "Choose a start time on the half hour.", { startTime: "Invalid time." });
  }

  const [studioSnap, internalSnap, packageSnap] = await Promise.all([
    studioRef(input.studioId).get(),
    studioInternalRef(input.studioId).get(),
    studioSub(input.studioId, "packages").doc(input.packageId).get(),
  ]);
  const studio = studioSnap.data() as StudioDoc | undefined;
  const internal = internalSnap.data() as StudioInternalDoc | undefined;
  if (!studio || !internal || studio.listingStatus !== "published") throw notFound("Studio");
  const pkg = packageSnap.data() as PackageDoc | undefined;
  if (!pkg || !pkg.isActive || pkg.studioId !== input.studioId) throw notFound("Package");

  const window: Window = {
    start: input.startTime,
    end: fromMinutes(toMinutes(input.startTime) + pkg.durationMinutes),
  };
  if (toMinutes(window.end) > 24 * 60) {
    throw new ApiError(422, "VALIDATION_FAILED", "This session would run past midnight.", { startTime: "Too late." });
  }

  // Price and commission come ONLY from Firestore, in integer paisa.
  const split = calculateCommission(pkg.price, internal.commissionRateBps ?? DEFAULT_COMMISSION_RATE_BPS);
  const bookingRef = db().collection(collections.bookings).doc();

  await db().runTransaction(async (tx) => {
    const lock = lockRef(input.studioId, input.shootDate);
    const [, , daySnap, existing, freshStudio, pending] = await Promise.all([
      tx.get(lock),
      tx.get(customerLockRef(user.uid)),
      tx.get(studioSub(input.studioId, "availability").doc(input.shootDate)),
      tx.get(bookingsFor(input.studioId, input.shootDate)),
      tx.get(studioRef(input.studioId)),
      tx.get(pendingOf(user.uid)),
    ]);
    if (freshStudio.get("listingStatus") !== "published") throw notFound("Studio");

    // Open requests only: expired ones (start time passed) no longer count.
    const now = nepalNowKey();
    const openRequests = pending.docs.filter((d) => !isExpiredPending(d.data() as BookingDoc, now)).length;
    if (openRequests >= MAX_PENDING_PER_CUSTOMER) {
      throw new ApiError(429, "TOO_MANY_PENDING", `You can have up to ${MAX_PENDING_PER_CUSTOMER} open booking requests at a time.`);
    }

    // Weekly hours from the studio doc read INSIDE this transaction.
    const { isClosed, open } = effectiveHours(daySnap.data() as AvailabilityDayDoc | undefined, weeklyOf(freshStudio), input.shootDate);
    if (isClosed) throw new ApiError(409, "DAY_CLOSED", "The studio is not taking bookings on this date.");
    const fits = open.some((o) => toMinutes(o.start) <= toMinutes(window.start) && toMinutes(window.end) <= toMinutes(o.end));
    if (!fits) {
      throw new ApiError(409, "OUTSIDE_HOURS", "That time is outside the studio's available hours for this date.");
    }
    if (blockingWindows(existing.docs).some((b) => overlaps(b, window))) {
      throw new ApiError(409, "SLOT_TAKEN", "That time has just been requested by someone else. Please choose another time.");
    }

    const booking: Omit<BookingDoc, "createdAt" | "updatedAt" | "confirmedAt" | "completedAt" | "cancelledAt"> = {
      customerId: user.uid,
      studioId: input.studioId,
      studioOwnerId: internal.ownerId,
      packageId: input.packageId,
      photographyCategory: pkg.category,
      shootDate: input.shootDate,
      startTime: window.start,
      endTime: window.end,
      timezone: "Asia/Kathmandu",
      customerName: input.customerName,
      customerPhone: input.customerPhone,
      customerNote: input.customerNote,
      packageSnapshot: { name: pkg.name, price: pkg.price, durationMinutes: pkg.durationMinutes },
      studioSnapshot: { businessName: studio.businessName, slug: studio.slug },
      bookingStatus: "pending",
      paymentStatus: "unpaid",
      payoutStatus: "not_due",
      currency: "NPR",
      grossAmount: split.grossAmount,
      commissionRateBps: split.commissionRateBps,
      commissionAmount: split.commissionAmount,
      photographerNetAmount: split.photographerNetAmount,
    };
    tx.create(bookingRef, {
      ...booking,
      confirmedAt: null,
      completedAt: null,
      cancelledAt: null,
      reviewedAt: null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    queueBookingNotification(tx, "booking_requested", bookingRef.id, booking as BookingDoc);
    touchLock(tx, input.studioId, input.shootDate);
    tx.set(
      customerLockRef(user.uid),
      { uid: user.uid, writes: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
  });

  return bookingRef.id;
}

function touchLock(tx: Transaction, studioId: string, date: string) {
  tx.set(
    lockRef(studioId, date),
    { studioId, date, writes: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );
}

/* ============================================================ transitions */

const TRANSITION_ERRORS = {
  INVALID_TRANSITION: (status: BookingStatus) => `This booking is ${status.replaceAll("_", " ")} and can't be changed that way.`,
  NOT_YET: () => "A booking can be marked completed once its start time has passed.",
  EXPIRED: () => "This request has expired — its requested time has already passed.",
};

/**
 * Status changes, validated against the explicit table in ./transitions.ts.
 * Customers may cancel their own pending request; the studio owner
 * (photographer claim + current private/internal ownerId) confirms, declines,
 * completes or cancels. Admins have no booking write path here.
 */
export async function transitionBooking(user: CurrentUser, bookingId: string, action: BookingAction): Promise<BookingStatus> {
  const ref = db().collection(collections.bookings).doc(bookingId);

  return db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw notFound("Booking");
    const b = snap.data() as BookingDoc;

    // Who is asking? Unrelated users learn nothing about the booking (404).
    let actor: "customer" | "studio";
    if (b.customerId === user.uid) {
      actor = "customer";
    } else if (user.role === "photographer" && b.studioOwnerId === user.uid) {
      const internal = await tx.get(studioInternalRef(b.studioId));
      if (internal.get("ownerId") !== user.uid) throw notFound("Booking");
      actor = "studio";
    } else if (user.role === "admin") {
      throw forbidden(); // admins have no booking write path
    } else {
      throw notFound("Booking");
    }

    const check = checkTransition(b.bookingStatus, action, actor, { shootDate: b.shootDate, startTime: b.startTime, now: nepalNowKey() });
    if (!check.ok) {
      if (check.reason === "WRONG_ACTOR") throw forbidden();
      if (check.reason === "NOT_YET") throw new ApiError(409, "NOT_YET", TRANSITION_ERRORS.NOT_YET());
      if (check.reason === "EXPIRED") throw new ApiError(409, "EXPIRED", TRANSITION_ERRORS.EXPIRED());
      throw new ApiError(409, "INVALID_TRANSITION", TRANSITION_ERRORS.INVALID_TRANSITION(b.bookingStatus));
    }
    const to = check.transition.to;

    const update: Record<string, unknown> = { bookingStatus: to, updatedAt: FieldValue.serverTimestamp() };
    if (action === "confirm") {
      // Re-check against other blocking bookings under the same studio-day lock.
      const [, existing] = await Promise.all([tx.get(lockRef(b.studioId, b.shootDate)), tx.get(bookingsFor(b.studioId, b.shootDate))]);
      if (blockingWindows(existing.docs, bookingId).some((w) => overlaps(w, { start: b.startTime, end: b.endTime }))) {
        throw new ApiError(409, "SLOT_TAKEN", "Another booking already holds this time.");
      }
      update.confirmedAt = FieldValue.serverTimestamp();
      touchLock(tx, b.studioId, b.shootDate);
    }
    if (action === "cancel" || action === "decline" || action === "studio_cancel") {
      update.cancelledAt = FieldValue.serverTimestamp();
      touchLock(tx, b.studioId, b.shootDate);
    }
    if (action === "complete") {
      update.completedAt = FieldValue.serverTimestamp();
      update.payoutStatus = "pending";
      tx.update(studioRef(b.studioId), { "stats.completedBookings": FieldValue.increment(1) });
    }
    tx.update(ref, update);
    queueBookingNotification(tx, TRANSITION_NOTIFICATION[action], bookingId, b);
    return to;
  });
}

/* =========================================================== availability */

/** Bookings of a studio on the given dates (index-free: equality + `in`). */
async function bookingsOnDates(studioId: string, dates: string[]) {
  const chunks: string[][] = [];
  for (let i = 0; i < dates.length; i += 30) chunks.push(dates.slice(i, i + 30));
  const snaps = await Promise.all(
    chunks.map((chunk) =>
      db().collection(collections.bookings).where("studioId", "==", studioId).where("shootDate", "in", chunk).get(),
    ),
  );
  return snaps.flatMap((s) => s.docs);
}

async function availabilityDocs(studioId: string, dates: string[]) {
  const col = studioSub(studioId, "availability");
  const snaps = dates.length ? await db().getAll(...dates.map((d) => col.doc(d))) : [];
  return new Map(snaps.map((s) => [s.id, s.data() as AvailabilityDayDoc | undefined]));
}

export interface MonthAvailability {
  month: string;
  /** Bookable dates in the month → start times still free for the package. */
  days: Record<string, string[]>;
}

/**
 * Public month view for the booking calendar (published studios only).
 * Returns ONLY dates and start times a customer can request — no booking
 * details. Informational: the booking POST re-checks everything.
 */
export async function getMonthAvailability(studioId: string, month: string, packageId: string): Promise<MonthAvailability> {
  const [studio, pkgSnap] = await Promise.all([
    studioRef(studioId).get(),
    studioSub(studioId, "packages").doc(packageId).get(),
  ]);
  if (!studio.exists || studio.get("listingStatus") !== "published") throw notFound("Studio");
  const pkg = pkgSnap.data() as PackageDoc | undefined;
  if (!pkg || !pkg.isActive || pkg.studioId !== studioId) throw notFound("Package");

  const { min, max } = bookableRange();
  const dates = monthDates(month).filter((d) => d >= min && d <= max);
  const [dayDocs, bookings] = await Promise.all([availabilityDocs(studioId, dates), bookingsOnDates(studioId, dates)]);

  const days: Record<string, string[]> = {};
  const weekly = weeklyOf(studio);
  for (const date of dates) {
    const { isClosed, open } = effectiveHours(dayDocs.get(date), weekly, date);
    if (isClosed) continue;
    const blocking = blockingWindows(bookings.filter((b) => b.get("shootDate") === date));
    const times = freeStartTimes(open, blocking, pkg.durationMinutes);
    if (times.length) days[date] = times;
  }
  return { month, days };
}

export interface CalendarBooking {
  id: string;
  start: string;
  end: string;
  status: BookingStatus;
  customerName: string;
  packageName: string;
}

export interface CalendarDay {
  date: string;
  /** standard = no date-specific schedule (weekly or default hours), custom = own slots, closed = unavailable. */
  mode: "standard" | "custom" | "closed";
  /** The date's own slots (custom mode only). */
  slots: Window[];
  /** What "standard hours" means on this date: the weekly hours for its weekday, or the default. */
  standard: { closed: boolean; slots: Window[]; source: "weekly" | "default" };
  bookings: CalendarBooking[];
  /** Inside the editable window (tomorrow … +180 days). */
  editable: boolean;
}

/** Owner calendar for one month: schedule + that month's bookings. Caller must authorize. */
export async function getStudioCalendar(studioId: string, month: string): Promise<CalendarDay[]> {
  const dates = monthDates(month);
  const [dayDocs, bookings, studio] = await Promise.all([availabilityDocs(studioId, dates), bookingsOnDates(studioId, dates), studioRef(studioId).get()]);
  const weekly = weeklyOf(studio);
  const { min, max } = bookableRange();
  return dates.map((date) => {
    const doc = dayDocs.get(date);
    const { isClosed, open, source } = effectiveHours(doc, weekly, date);
    const std = effectiveHours(undefined, weekly, date);
    return {
      date,
      mode: source === "day" ? (isClosed ? "closed" : "custom") : "standard",
      slots: source === "day" ? open : [],
      standard: { closed: std.isClosed, slots: std.open, source: std.source === "weekly" ? "weekly" : "default" },
      bookings: bookings
        .filter((b) => b.get("shootDate") === date)
        .map((b) => ({
          id: b.id,
          start: b.get("startTime") as string,
          end: b.get("endTime") as string,
          status: b.get("bookingStatus") as BookingStatus,
          customerName: b.get("customerName") as string,
          packageName: b.get("packageSnapshot.name") as string,
        }))
        .sort((a, b) => a.start.localeCompare(b.start)),
      editable: date >= min && date <= max,
    };
  });
}

function assertEditableDate(date: string) {
  const { min, max } = bookableRange();
  if (!isRealDate(date)) throw new ApiError(422, "VALIDATION_FAILED", "Invalid date.", { date: "Invalid date." });
  if (date < min || date > max) {
    throw new ApiError(422, "VALIDATION_FAILED", "Availability can be changed from tomorrow up to 6 months ahead.", {
      date: "Choose a date between tomorrow and 6 months from now.",
    });
  }
}

/**
 * Owner sets (input) or resets (null → standard hours) one day's availability.
 * Runs under the studio-day booking lock, so it serializes with booking
 * requests: a request can never slip in against a stale schedule, and the
 * edit is refused if a pending/confirmed booking would fall outside the new
 * open hours. Caller must have verified ownership (assertStudioOwner).
 */
function assertDayInput(input: AvailabilityDayInput) {
  if (input.isClosed && input.slots.length) {
    throw new ApiError(422, "VALIDATION_FAILED", "An unavailable day can't have time slots.", { slots: "Remove the time slots or keep the day available." });
  }
  if (!input.isClosed) {
    const error = slotsError(input.slots);
    if (error) throw new ApiError(422, "VALIDATION_FAILED", error, { slots: error });
  }
}

export async function setDayAvailability(studioId: string, date: string, input: AvailabilityDayInput | null): Promise<CalendarDay["mode"]> {
  assertEditableDate(date);
  if (input) assertDayInput(input);

  const dayRef = studioSub(studioId, "availability").doc(date);
  const slots = input && !input.isClosed ? [...input.slots].sort((a, b) => toMinutes(a.start) - toMinutes(b.start)) : [];
  const next: Pick<AvailabilityDayDoc, "studioId" | "date" | "isClosed" | "slots"> | undefined = input
    ? { studioId, date, isClosed: input.isClosed, slots: slots.map((s) => ({ ...s, status: "open", bookingId: null })) }
    : undefined;

  await db().runTransaction(async (tx) => {
    const [, existing, current, studio] = await Promise.all([
      tx.get(lockRef(studioId, date)),
      tx.get(bookingsFor(studioId, date)),
      tx.get(dayRef),
      tx.get(studioRef(studioId)),
    ]);
    // Resetting to standard hours means the weekly hours (read in this transaction).
    const { isClosed, open } = effectiveHours(next, weeklyOf(studio), date);
    const stranded = activeWindows(existing.docs).filter(
      (w) => isClosed || !open.some((o) => toMinutes(o.start) <= toMinutes(w.start) && toMinutes(w.end) <= toMinutes(o.end)),
    );
    if (stranded.length) {
      const list = stranded.map((w) => `${w.start}–${w.end}`).join(", ");
      throw new ApiError(
        409,
        "BOOKED_TIME",
        `You have a booking at ${list} on this date. Keep that time available, or decline/cancel the booking first.`,
      );
    }
    if (next) {
      tx.set(dayRef, {
        ...next,
        createdAt: current.get("createdAt") ?? FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else if (current.exists) {
      tx.delete(dayRef);
    }
    touchLock(tx, studioId, date);
  });

  return !next ? "standard" : next.isClosed ? "closed" : "custom";
}

/* ============================================================ weekly hours */

const activeOfStudio = (studioId: string) =>
  db().collection(collections.bookings).where("studioId", "==", studioId).where("bookingStatus", "in", ACTIVE_BOOKING_STATUSES);

/**
 * Owner sets (weekly) or resets (null → default hours) the studio's weekly
 * hours. One transaction reads the studio doc, every open booking of the
 * studio and those dates' day schedules, and refuses (409 BOOKED_TIME) if an
 * upcoming pending/confirmed booking without its own day schedule would fall
 * outside the new hours. Booking requests read the studio doc inside their
 * own transaction, so the two can never interleave. Caller must have
 * verified ownership (assertStudioOwner).
 */
export async function setWeeklyHours(studioId: string, weekly: WeeklyHours | null): Promise<void> {
  if (weekly) {
    const error = weeklyHoursError(weekly);
    if (error) throw new ApiError(422, "VALIDATION_FAILED", error, { days: error });
  }
  const sRef = studioRef(studioId);
  const sorted = weekly
    ? (Object.fromEntries(
        Object.entries(weekly).map(([k, d]) => [k, { closed: d.closed, slots: [...d.slots].sort((a, b) => toMinutes(a.start) - toMinutes(b.start)) }]),
      ) as WeeklyHours)
    : null;

  await db().runTransaction(async (tx) => {
    const [studio, active] = await Promise.all([tx.get(sRef), tx.get(activeOfStudio(studioId))]);
    if (!studio.exists) throw notFound("Studio");
    const now = nepalNowKey();
    // Upcoming open bookings only (an expired request or past session has no hours to protect).
    const upcoming = active.docs
      .map((d) => d.data() as BookingDoc)
      .filter((b) => `${b.shootDate}T${b.startTime}` > now)
      .map((b) => ({ date: b.shootDate, start: b.startTime, end: b.endTime }));
    const dates = [...new Set(upcoming.map((b) => b.date))];
    const daySnaps = dates.length ? await tx.getAll(...dates.map((d) => studioSub(studioId, "availability").doc(d))) : [];
    const dayDocs = new Map(daySnaps.map((d) => [d.id, d.data() as AvailabilityDayDoc | undefined]));
    const stranded = strandedByWeekly(upcoming, dayDocs, sorted);
    if (stranded.length) {
      const list = stranded
        .sort((a, b) => `${a.date}${a.start}`.localeCompare(`${b.date}${b.start}`))
        .slice(0, 5)
        .map((b) => `${b.date} ${b.start}–${b.end}`)
        .join(", ");
      throw new ApiError(
        409,
        "BOOKED_TIME",
        `These hours would leave ${stranded.length} booking${stranded.length === 1 ? "" : "s"} outside your opening hours (${list}${stranded.length > 5 ? ", …" : ""}). Keep those times open, or decline/cancel the bookings first.`,
      );
    }
    tx.update(sRef, { weeklyHours: sorted, updatedAt: FieldValue.serverTimestamp() });
  });
}

/* ============================================================ bulk editing */

export interface BulkDayResult {
  date: string;
  ok: boolean;
  mode?: CalendarDay["mode"];
  code?: string;
  message?: string;
}

/**
 * Applies the same day schedule (input) or a reset (null) to several dates.
 * Each date runs through setDayAvailability — its own transaction under that
 * studio-day's lock, with the same validation and stranding protection — so a
 * conflict on one date never affects the others. Returns a result per date.
 */
export async function setDaysAvailability(studioId: string, dates: string[], input: AvailabilityDayInput | null): Promise<BulkDayResult[]> {
  // The hours are the same for every date: invalid input refuses the whole request.
  if (input) assertDayInput(input);
  const results: BulkDayResult[] = [];
  const queue = [...dates].sort();
  const worker = async () => {
    for (let date = queue.shift(); date; date = queue.shift()) {
      try {
        results.push({ date, ok: true, mode: await setDayAvailability(studioId, date, input) });
      } catch (error) {
        if (!(error instanceof ApiError)) throw error;
        results.push({ date, ok: false, code: error.code, message: error.message });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, queue.length) }, worker));
  return results.sort((a, b) => a.date.localeCompare(b.date));
}

/** The studio's weekly hours (null = default hours). Caller must authorize. */
export async function getWeeklyHours(studioId: string): Promise<WeeklyHours | null> {
  return weeklyOf(await studioRef(studioId).get());
}
