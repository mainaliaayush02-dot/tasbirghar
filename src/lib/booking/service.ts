import "server-only";

import { FieldValue, type Transaction } from "firebase-admin/firestore";

import { ApiError, forbidden, notFound } from "@/lib/api/http";
import type { CurrentUser } from "@/lib/auth/current-user";
import { studioInternalRef, studioRef, studioSub } from "@/lib/data/studios";
import { adminDb } from "@/lib/firebase/admin";
import { collections } from "@/lib/firestore/paths";
import { calculateCommission, DEFAULT_COMMISSION_RATE_BPS } from "@/lib/money";
import type { BookingAction, BookingCreateInput } from "@/lib/validation/schemas";
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
  bookableRange,
  DEFAULT_CLOSE,
  DEFAULT_OPEN,
  fromMinutes,
  isRealDate,
  MAX_PENDING_PER_CUSTOMER,
  nepalToday,
  overlaps,
  SLOT_STEP_MINUTES,
  toMinutes,
  type Window,
} from "./rules";

/**
 * Server-authoritative booking logic.
 *
 * Trust model:
 * - The client only states intent (studio, package, date, start time,
 *   contact). Price, commission, payout, owner, end time and status are
 *   derived here from Firestore — never from the request.
 * - Photographer availability docs may CLOSE a day or RESTRICT times, but the
 *   final authority is the set of existing active bookings, checked inside a
 *   transaction.
 * - Every write for a studio-day first reads `bookingLocks/{studioId}_{date}`
 *   and writes it back. Firestore serializes transactions that touch the same
 *   document, so two concurrent requests can never both pass the overlap
 *   check for the same studio-day (no double booking).
 */

const db = () => adminDb();
const lockRef = (studioId: string, date: string) =>
  db().collection(collections.bookingLocks).doc(`${studioId}_${date}`);
const bookingsFor = (studioId: string, date: string) =>
  db().collection(collections.bookings).where("studioId", "==", studioId).where("shootDate", "==", date);

export interface DayAvailability {
  date: string;
  isClosed: boolean;
  /** Windows the studio is open for bookings that day. */
  open: Window[];
  /** Windows already held by active (requested/confirmed) bookings. */
  busy: Window[];
  /** "studio" when the studio published availability; else default hours. */
  source: "studio" | "default";
}

function openWindows(day: AvailabilityDayDoc | undefined): { isClosed: boolean; open: Window[]; source: "studio" | "default" } {
  if (!day) return { isClosed: false, open: [{ start: DEFAULT_OPEN, end: DEFAULT_CLOSE }], source: "default" };
  if (day.isClosed) return { isClosed: true, open: [], source: "studio" };
  const slots = (day.slots ?? []).filter((s) => s.status === "open").map((s) => ({ start: s.start, end: s.end }));
  // A day doc without any slots means "open, default hours".
  if (!day.slots?.length) return { isClosed: false, open: [{ start: DEFAULT_OPEN, end: DEFAULT_CLOSE }], source: "default" };
  return { isClosed: false, open: slots, source: "studio" };
}

const activeWindows = (docs: FirebaseFirestore.QueryDocumentSnapshot[], exceptId?: string): Window[] =>
  docs
    .filter((d) => d.id !== exceptId && ACTIVE_BOOKING_STATUSES.includes(d.get("bookingStatus") as BookingStatus))
    .map((d) => ({ start: d.get("startTime") as string, end: d.get("endTime") as string }));

/** Public day view for the booking form. Studio must be published. */
export async function getDayAvailability(studioId: string, date: string): Promise<DayAvailability> {
  const studio = await studioRef(studioId).get();
  if (!studio.exists || studio.get("listingStatus") !== "published") throw notFound("Studio");
  assertBookableDate(date);
  const [day, bookings] = await Promise.all([
    studioSub(studioId, "availability").doc(date).get(),
    bookingsFor(studioId, date).get(),
  ]);
  const { isClosed, open, source } = openWindows(day.data() as AvailabilityDayDoc | undefined);
  return { date, isClosed, open, busy: activeWindows(bookings.docs), source };
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

  const [studioSnap, internalSnap, packageSnap, pending] = await Promise.all([
    studioRef(input.studioId).get(),
    studioInternalRef(input.studioId).get(),
    studioSub(input.studioId, "packages").doc(input.packageId).get(),
    db()
      .collection(collections.bookings)
      .where("customerId", "==", user.uid)
      .where("bookingStatus", "==", "pending")
      .count()
      .get(),
  ]);
  const studio = studioSnap.data() as StudioDoc | undefined;
  const internal = internalSnap.data() as StudioInternalDoc | undefined;
  if (!studio || !internal || studio.listingStatus !== "published") throw notFound("Studio");
  const pkg = packageSnap.data() as PackageDoc | undefined;
  if (!pkg || !pkg.isActive || pkg.studioId !== input.studioId) throw notFound("Package");
  if (pending.data().count >= MAX_PENDING_PER_CUSTOMER) {
    throw new ApiError(429, "TOO_MANY_PENDING", `You can have up to ${MAX_PENDING_PER_CUSTOMER} open booking requests at a time.`);
  }

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
    const [, daySnap, existing, freshStudio] = await Promise.all([
      tx.get(lock),
      tx.get(studioSub(input.studioId, "availability").doc(input.shootDate)),
      tx.get(bookingsFor(input.studioId, input.shootDate)),
      tx.get(studioRef(input.studioId)),
    ]);
    if (freshStudio.get("listingStatus") !== "published") throw notFound("Studio");

    const { isClosed, open } = openWindows(daySnap.data() as AvailabilityDayDoc | undefined);
    if (isClosed) throw new ApiError(409, "DAY_CLOSED", "The studio is not taking bookings on this date.");
    const fits = open.some((o) => toMinutes(o.start) <= toMinutes(window.start) && toMinutes(window.end) <= toMinutes(o.end));
    if (!fits) {
      throw new ApiError(409, "OUTSIDE_HOURS", "That time is outside the studio's available hours for this date.");
    }
    if (activeWindows(existing.docs).some((b) => overlaps(b, window))) {
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
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    touchLock(tx, input.studioId, input.shootDate);
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

const TRANSITIONS: Record<BookingAction, { actor: "customer" | "owner"; from: BookingStatus[]; to: BookingStatus }> = {
  cancel: { actor: "customer", from: ["pending"], to: "cancelled_by_customer" },
  confirm: { actor: "owner", from: ["pending"], to: "confirmed" },
  decline: { actor: "owner", from: ["pending"], to: "declined" },
  complete: { actor: "owner", from: ["confirmed"], to: "completed" },
};

/**
 * Status changes. Customers may cancel their own pending request; the studio
 * owner (photographer claim + current private/internal ownerId) confirms, declines or
 * completes. Admins have no booking write path here.
 */
export async function transitionBooking(user: CurrentUser, bookingId: string, action: BookingAction): Promise<BookingStatus> {
  const rule = TRANSITIONS[action];
  const ref = db().collection(collections.bookings).doc(bookingId);

  return db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw notFound("Booking");
    const b = snap.data() as BookingDoc;

    if (rule.actor === "customer") {
      if (b.customerId !== user.uid) throw notFound("Booking");
    } else {
      if (user.role !== "photographer") throw forbidden();
      const internal = await tx.get(studioInternalRef(b.studioId));
      if (b.studioOwnerId !== user.uid || internal.get("ownerId") !== user.uid) throw notFound("Booking");
    }
    if (!rule.from.includes(b.bookingStatus)) {
      throw new ApiError(409, "INVALID_TRANSITION", `This booking is ${b.bookingStatus.replaceAll("_", " ")}.`);
    }
    if (action === "complete" && b.shootDate > nepalToday()) {
      throw new ApiError(409, "NOT_YET", "A booking can be completed on or after the shoot date.");
    }

    const update: Record<string, unknown> = { bookingStatus: rule.to, updatedAt: FieldValue.serverTimestamp() };
    if (action === "confirm") {
      // Re-check against other active bookings under the same studio-day lock.
      const [, existing] = await Promise.all([tx.get(lockRef(b.studioId, b.shootDate)), tx.get(bookingsFor(b.studioId, b.shootDate))]);
      if (activeWindows(existing.docs, bookingId).some((w) => overlaps(w, { start: b.startTime, end: b.endTime }))) {
        throw new ApiError(409, "SLOT_TAKEN", "Another booking already holds this time.");
      }
      update.confirmedAt = FieldValue.serverTimestamp();
      touchLock(tx, b.studioId, b.shootDate);
    }
    if (action === "cancel" || action === "decline") {
      update.cancelledAt = FieldValue.serverTimestamp();
      touchLock(tx, b.studioId, b.shootDate);
    }
    if (action === "complete") {
      update.completedAt = FieldValue.serverTimestamp();
      update.payoutStatus = "pending";
      tx.update(studioRef(b.studioId), { "stats.completedBookings": FieldValue.increment(1) });
    }
    tx.update(ref, update);
    return rule.to;
  });
}
