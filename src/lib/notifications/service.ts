import "server-only";

import { FieldValue, type Transaction } from "firebase-admin/firestore";

import { toIso } from "@/lib/data/serialize";
import { adminDb } from "@/lib/firebase/admin";
import { collections, USER_NOTIFICATIONS } from "@/lib/firestore/paths";
import { publicDisplayName } from "@/lib/reviews/rules";
import type { BookingDoc } from "@/types/models";

import {
  buildNotification,
  NOTIFICATION_AUDIENCE,
  notificationId,
  renderNotification,
  type NotificationData,
  type NotificationType,
} from "./types";

/**
 * In-app notifications (server-only).
 *
 * - Written ONLY here, via `queueBookingNotification(tx, …)` inside the same
 *   transaction as the booking/review change that causes them: all-or-nothing.
 * - The recipient comes from the booking (customerId / studioOwnerId), never
 *   from a request. The document id is deterministic per event
 *   (`{type}_{bookingId}`) and written with `tx.create`, so an event can
 *   produce at most one notification.
 * - Reading and marking read are scoped to users/{uid}/notifications of the
 *   signed-in user, so one user can never touch another user's documents.
 */

export const MAX_LIST = 30;
export const MAX_MARK_IDS = 50;
const MAX_MARK_ALL = 500;

const inbox = (uid: string) => adminDb().collection(collections.users).doc(uid).collection(USER_NOTIFICATIONS);

/** Display snapshot for a booking notification (privacy-safe names only). */
function bookingData(type: NotificationType, b: BookingDoc): NotificationData {
  const data: NotificationData = {
    studioName: b.studioSnapshot.businessName.slice(0, 80),
    packageName: b.packageSnapshot.name.slice(0, 80),
    date: b.shootDate,
    time: b.startTime,
  };
  // Studios see who it is (first name + initial); customers never get customer names.
  if (NOTIFICATION_AUDIENCE[type] === "studio") data.customerName = publicDisplayName(b.customerName);
  return data;
}

/**
 * Queues one notification about `booking` in the caller's transaction. Must be
 * called after all of the transaction's reads (it only writes).
 */
export function queueBookingNotification(tx: Transaction, type: NotificationType, bookingId: string, b: BookingDoc) {
  const recipient = NOTIFICATION_AUDIENCE[type] === "studio" ? b.studioOwnerId : b.customerId;
  const payload = buildNotification({
    type,
    bookingId,
    studioId: b.studioId,
    reviewId: type === "review_submitted" ? bookingId : null,
    data: bookingData(type, b),
  });
  tx.create(inbox(recipient).doc(notificationId(type, bookingId)), {
    ...payload,
    readAt: null,
    createdAt: FieldValue.serverTimestamp(),
  });
}

export interface NotificationDTO {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  href: string;
  read: boolean;
  createdAt: string | null;
}

export async function unreadCount(uid: string): Promise<number> {
  return (await inbox(uid).where("readAt", "==", null).count().get()).data().count;
}

/** The user's latest notifications (newest first) and their unread count. */
export async function listNotifications(uid: string): Promise<{ items: NotificationDTO[]; unread: number }> {
  const [snap, unread] = await Promise.all([inbox(uid).orderBy("createdAt", "desc").limit(MAX_LIST).get(), unreadCount(uid)]);
  const items = snap.docs.map((d) => {
    const n = d.data();
    const text = renderNotification({ type: n.type, bookingId: n.bookingId, data: n.data ?? {} });
    return { id: d.id, type: n.type, ...text, read: n.readAt !== null && n.readAt !== undefined, createdAt: toIso(n.createdAt) };
  });
  return { items, unread };
}

/**
 * Marks the user's own notifications read: specific ids (≤ 50) or all unread
 * (≤ 500 per call). Unknown ids are ignored — nothing is ever created.
 */
export async function markRead(uid: string, input: { ids: string[] } | { all: true }): Promise<{ updated: number; unread: number }> {
  const db = adminDb();
  const docs =
    "all" in input
      ? (await inbox(uid).where("readAt", "==", null).limit(MAX_MARK_ALL).get()).docs
      : (await db.getAll(...input.ids.map((id) => inbox(uid).doc(id)))).filter((d) => d.exists && d.get("readAt") === null);
  if (docs.length) {
    const batch = db.batch();
    for (const d of docs) batch.update(d.ref, { readAt: FieldValue.serverTimestamp() });
    await batch.commit();
  }
  return { updated: docs.length, unread: await unreadCount(uid) };
}
