import "server-only";

import type { DocumentSnapshot } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebase/admin";
import { collections } from "@/lib/firestore/paths";
import type { MinorUnits } from "@/lib/money";
import type { BookingDoc, BookingStatus, PaymentStatus } from "@/types/models";

import { toIso } from "./serialize";

/** Customer-facing booking view — no commission or payout fields. */
export interface CustomerBookingDTO {
  id: string;
  studio: { businessName: string; slug: string };
  packageName: string;
  durationMinutes: number;
  shootDate: string;
  startTime: string;
  endTime: string;
  /** What the customer pays (integer paisa). */
  price: MinorUnits;
  bookingStatus: BookingStatus;
  paymentStatus: PaymentStatus;
  customerName: string;
  customerPhone: string;
  customerNote: string | null;
  createdAt: string | null;
  confirmedAt: string | null;
}

/** Studio-facing view — includes the photographer's payout. */
export interface StudioBookingDTO extends CustomerBookingDTO {
  photographerNetAmount: MinorUnits;
  commissionAmount: MinorUnits;
}

function toCustomer(d: DocumentSnapshot): CustomerBookingDTO {
  const b = d.data() as BookingDoc;
  return {
    id: d.id,
    studio: { businessName: b.studioSnapshot.businessName, slug: b.studioSnapshot.slug },
    packageName: b.packageSnapshot.name,
    durationMinutes: b.packageSnapshot.durationMinutes,
    shootDate: b.shootDate,
    startTime: b.startTime,
    endTime: b.endTime,
    price: b.grossAmount,
    bookingStatus: b.bookingStatus,
    paymentStatus: b.paymentStatus,
    customerName: b.customerName,
    customerPhone: b.customerPhone,
    customerNote: b.customerNote,
    createdAt: toIso(b.createdAt),
    confirmedAt: toIso(b.confirmedAt),
  };
}

const byShootDate = <T extends { shootDate: string; startTime: string }>(a: T, b: T) =>
  `${b.shootDate}${b.startTime}`.localeCompare(`${a.shootDate}${a.startTime}`);

export async function listCustomerBookings(uid: string): Promise<CustomerBookingDTO[]> {
  const snap = await adminDb().collection(collections.bookings).where("customerId", "==", uid).limit(200).get();
  return snap.docs.map(toCustomer).sort(byShootDate);
}

/** Null unless the booking belongs to this customer (no existence leak). */
export async function getCustomerBooking(uid: string, bookingId: string): Promise<CustomerBookingDTO | null> {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(bookingId)) return null;
  const snap = await adminDb().collection(collections.bookings).doc(bookingId).get();
  if (!snap.exists || snap.get("customerId") !== uid) return null;
  return toCustomer(snap);
}

export async function listStudioBookings(studioId: string, ownerUid: string): Promise<StudioBookingDTO[]> {
  const snap = await adminDb().collection(collections.bookings).where("studioId", "==", studioId).limit(300).get();
  return snap.docs
    .filter((d) => d.get("studioOwnerId") === ownerUid)
    .map((d) => {
      const b = d.data() as BookingDoc;
      return { ...toCustomer(d), photographerNetAmount: b.photographerNetAmount, commissionAmount: b.commissionAmount };
    })
    .sort(byShootDate);
}
