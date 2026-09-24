import "server-only";

import {
  AggregateField,
  FieldPath,
  type DocumentSnapshot,
  type Query,
} from "firebase-admin/firestore";

import type { CategorySlug } from "@/config/categories";
import type { LocationSlug } from "@/config/locations";
import { roleFromClaims } from "@/lib/auth/roles";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { collections } from "@/lib/firestore/paths";
import { DEFAULT_COMMISSION_RATE_BPS, type MinorUnits } from "@/lib/money";
import type { ApplicationDTO, PackageDTO } from "@/types/dto";
import type {
  ApplicationStatus,
  AvailabilityDayDoc,
  BookingDoc,
  BookingStatus,
  ReviewDoc,
  ReviewStatus,
  StudioDoc,
  StudioListingStatus,
  StudioVerificationStatus,
  UserDoc,
  UserRole,
} from "@/types/models";

import { toApplicationDTO } from "./applications";
import { toIso } from "./serialize";
import { listGallery, listPackages, listPortfolio, studioRef, studioSub } from "./studios";

/**
 * Admin read models. Callers MUST have verified the live `admin` claim
 * (`requireUser("admin", …)`). Everything here reads through the Admin SDK
 * on the server; nothing is exposed to the browser Firestore SDK.
 *
 * Scale notes: counts and money totals use Firestore aggregations (no
 * document downloads). List pages scan at most LIST_SCAN_LIMIT recent
 * documents and filter/search in memory — fine for the launch market; move
 * to a search index when collections outgrow it.
 */

export const PAGE_SIZE = 20;
const LIST_SCAN_LIMIT = 500;

const db = () => adminDb();
const count = async (query: Query) => (await query.count().get()).data().count;

/**
 * Booking money totals. Every money aggregation sums the SAME three fields
 * (filtered on bookingStatus), so a single composite index serves the
 * dashboard and the commission page:
 *   bookings: bookingStatus ASC, commissionAmount ASC, grossAmount ASC,
 *             photographerNetAmount ASC  (see firestore.indexes.json)
 * Summing a different field set would require a different index.
 */
const MONEY_SUMS = {
  gross: AggregateField.sum("grossAmount"),
  commission: AggregateField.sum("commissionAmount"),
  net: AggregateField.sum("photographerNetAmount"),
};

async function sumMoney(query: Query): Promise<{ gross: number; commission: number; net: number }> {
  const d = (await query.aggregate(MONEY_SUMS).get()).data();
  return { gross: d.gross ?? 0, commission: d.commission ?? 0, net: d.net ?? 0 };
}

/** Bookings that count toward booking value (confirmed or delivered). */
const VALUE_STATUSES: BookingStatus[] = ["confirmed", "completed"];

/* ------------------------------------------------------------ auth lookup */

export interface AuthSummary {
  email: string | null;
  displayName: string | null;
  disabled: boolean;
  role: UserRole;
  createdAt: string | null;
  lastSignInAt: string | null;
}

/** Batch-load Firebase Auth records (claims are the authoritative role). */
export async function authUsers(uids: string[]): Promise<Map<string, AuthSummary>> {
  const unique = [...new Set(uids.filter(Boolean))];
  const map = new Map<string, AuthSummary>();
  for (let i = 0; i < unique.length; i += 100) {
    const { users } = await adminAuth().getUsers(unique.slice(i, i + 100).map((uid) => ({ uid })));
    for (const u of users) {
      map.set(u.uid, {
        email: u.email ?? null,
        displayName: u.displayName ?? null,
        disabled: u.disabled,
        role: roleFromClaims(u.customClaims),
        createdAt: u.metadata.creationTime ? new Date(u.metadata.creationTime).toISOString() : null,
        lastSignInAt: u.metadata.lastSignInTime ? new Date(u.metadata.lastSignInTime).toISOString() : null,
      });
    }
  }
  return map;
}

function paginate<T>(items: T[], page: number) {
  const pageCount = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const current = Math.min(Math.max(1, page), pageCount);
  return {
    items: items.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE),
    page: current,
    pageCount,
    total: items.length,
  };
}

const matches = (q: string, ...fields: (string | null | undefined)[]) =>
  !q || fields.some((f) => f?.toLowerCase().includes(q.toLowerCase()));

/* ================================================================= stats */

export interface MarketplaceStats {
  studios: { total: number } & Record<StudioListingStatus, number>;
  verifiedStudios: number;
  applications: Record<ApplicationStatus, number>;
  photographers: number;
  customers: number;
  admins: number;
  bookings: { total: number; completed: number; pending: number };
  money: { bookingValue: MinorUnits; commission: MinorUnits; photographerNet: MinorUnits };
}

export async function getMarketplaceStats(): Promise<MarketplaceStats> {
  const studios = db().collection(collections.studios);
  const apps = db().collection(collections.photographerApplications);
  const users = db().collection(collections.users);
  const bookings = db().collection(collections.bookings);
  const valued = bookings.where("bookingStatus", "in", VALUE_STATUSES);
  const completed = bookings.where("bookingStatus", "==", "completed");

  const [
    studioTotal, draft, pendingReview, published, suspended, verified,
    appPending, appApproved, appRejected,
    photographers, customers, admins,
    bookingTotal, bookingCompleted, bookingPending,
    valuedMoney, completedMoney,
  ] = await Promise.all([
    count(studios),
    count(studios.where("listingStatus", "==", "draft")),
    count(studios.where("listingStatus", "==", "pending_review")),
    count(studios.where("listingStatus", "==", "published")),
    count(studios.where("listingStatus", "==", "suspended")),
    count(studios.where("verificationStatus", "==", "verified")),
    count(apps.where("status", "==", "pending")),
    count(apps.where("status", "==", "approved")),
    count(apps.where("status", "==", "rejected")),
    count(users.where("role", "==", "photographer")),
    count(users.where("role", "==", "customer")),
    count(users.where("role", "==", "admin")),
    count(bookings),
    count(completed),
    count(bookings.where("bookingStatus", "==", "pending")),
    sumMoney(valued),
    sumMoney(completed),
  ]);

  return {
    studios: { total: studioTotal, draft, pending_review: pendingReview, published, suspended },
    verifiedStudios: verified,
    applications: { pending: appPending, approved: appApproved, rejected: appRejected },
    photographers,
    customers,
    admins,
    bookings: { total: bookingTotal, completed: bookingCompleted, pending: bookingPending },
    money: {
      bookingValue: valuedMoney.gross,
      commission: completedMoney.commission,
      photographerNet: completedMoney.net,
    },
  };
}

/* ======================================================= recent activity */

export interface ActivityItem {
  id: string;
  kind: "application" | "review" | "customer" | "studio_created" | "studio_updated" | "booking";
  title: string;
  detail: string;
  at: string;
  href?: string;
}

/**
 * There is no event log yet, so activity is derived from record timestamps
 * (submittedAt / reviewedAt / createdAt / updatedAt). Nothing is invented.
 */
export async function getRecentActivity(limit = 10): Promise<ActivityItem[]> {
  const N = 6;
  const [submitted, reviewed, customers, studiosCreated, studiosUpdated, bookings] = await Promise.all([
    db().collection(collections.photographerApplications).orderBy("submittedAt", "desc").limit(N).get(),
    db().collection(collections.photographerApplications).orderBy("reviewedAt", "desc").limit(N).get(),
    db().collection(collections.users).orderBy("createdAt", "desc").limit(N).get(),
    db().collection(collections.studios).orderBy("createdAt", "desc").limit(N).get(),
    db().collection(collections.studios).orderBy("updatedAt", "desc").limit(N).get(),
    db().collection(collections.bookings).orderBy("createdAt", "desc").limit(N).get(),
  ]);

  const items: ActivityItem[] = [];
  const push = (item: Omit<ActivityItem, "at"> & { at: string | null }) =>
    item.at && items.push(item as ActivityItem);

  for (const d of submitted.docs) {
    push({
      id: `app-${d.id}`, kind: "application", title: "New photographer application",
      detail: `${d.get("businessName")} · ${d.get("fullName")}`, at: toIso(d.get("submittedAt")),
      href: `/admin/applications/${d.id}`,
    });
  }
  for (const d of reviewed.docs) {
    if (d.get("status") === "pending") continue;
    push({
      id: `rev-${d.id}`, kind: "review",
      title: d.get("status") === "approved" ? "Photographer approved" : "Application rejected",
      detail: String(d.get("businessName")), at: toIso(d.get("reviewedAt")),
      href: `/admin/applications/${d.id}`,
    });
  }
  for (const d of customers.docs) {
    push({
      id: `user-${d.id}`, kind: "customer", title: "New account registered",
      detail: String(d.get("displayName") ?? "New user"), at: toIso(d.get("createdAt")),
    });
  }
  for (const d of studiosCreated.docs) {
    push({
      id: `studio-${d.id}`, kind: "studio_created", title: "Studio created",
      detail: String(d.get("businessName")), at: toIso(d.get("createdAt")), href: `/admin/studios/${d.id}`,
    });
  }
  for (const d of studiosUpdated.docs) {
    const created = toIso(d.get("createdAt"));
    const updated = toIso(d.get("updatedAt"));
    // Skip the creation write itself.
    if (!updated || !created || new Date(updated).getTime() - new Date(created).getTime() < 60_000) continue;
    push({
      id: `studio-upd-${d.id}`, kind: "studio_updated", title: "Studio profile updated",
      detail: String(d.get("businessName")), at: updated, href: `/admin/studios/${d.id}`,
    });
  }
  for (const d of bookings.docs) {
    push({
      id: `booking-${d.id}`, kind: "booking", title: "Booking received",
      detail: String(d.get("studioSnapshot.businessName") ?? d.id), at: toIso(d.get("createdAt")),
    });
  }

  return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}

/* ========================================================== applications */

export async function listApplicationsAdmin({ status, q }: { status: ApplicationStatus | ""; q: string }) {
  const base = db().collection(collections.photographerApplications);
  const snap = await (status ? base.where("status", "==", status) : base.orderBy("submittedAt", "desc"))
    .limit(LIST_SCAN_LIMIT)
    .get();
  return snap.docs
    .map(toApplicationDTO)
    .filter((a) => matches(q, a.fullName, a.businessName, a.applicantEmail, a.phone, a.area))
    .sort((a, b) =>
      // Pending: oldest first (review queue). Others: newest first.
      status === "pending"
        ? (a.submittedAt ?? "").localeCompare(b.submittedAt ?? "")
        : (b.submittedAt ?? "").localeCompare(a.submittedAt ?? ""),
    );
}

export async function getApplicationAdmin(uid: string): Promise<(ApplicationDTO & { studioId: string | null }) | null> {
  const [snap, user] = await Promise.all([
    db().collection(collections.photographerApplications).doc(uid).get(),
    db().collection(collections.users).doc(uid).get(),
  ]);
  if (!snap.exists) return null;
  return { ...toApplicationDTO(snap), studioId: (user.get("studioId") as string | null) ?? null };
}

/* =============================================================== studios */

export interface AdminStudioRow {
  id: string;
  businessName: string;
  slug: string;
  ownerId: string;
  ownerEmail: string | null;
  ownerName: string | null;
  city: LocationSlug;
  area: string;
  categories: CategorySlug[];
  listingStatus: StudioListingStatus;
  verificationStatus: StudioVerificationStatus;
  portfolioCount: number;
  packageCount: number;
  createdAt: string | null;
}

export async function listStudiosAdmin({
  status, q, city, category, page,
}: { status: StudioListingStatus | ""; q: string; city: string; category: string; page: number }) {
  let query: Query = db().collection(collections.studios);
  if (status) query = query.where("listingStatus", "==", status);
  const snap = await query.limit(LIST_SCAN_LIMIT).get();
  const owners = await authUsers(snap.docs.map((d) => d.get("ownerId")));

  const rows = snap.docs
    .map((d) => {
      const s = d.data() as StudioDoc;
      const owner = owners.get(s.ownerId);
      return {
        id: d.id,
        businessName: s.businessName,
        slug: s.slug,
        ownerId: s.ownerId,
        ownerEmail: owner?.email ?? null,
        ownerName: owner?.displayName ?? null,
        city: s.location.city,
        area: s.location.area,
        categories: s.categories,
        listingStatus: s.listingStatus,
        verificationStatus: s.verificationStatus,
        portfolioCount: s.stats?.portfolioCount ?? 0,
        packageCount: 0,
        createdAt: toIso(s.createdAt),
      } satisfies AdminStudioRow;
    })
    .filter((r) => (!city || r.city === city) && (!category || r.categories.includes(category as CategorySlug)))
    .filter((r) => matches(q, r.businessName, r.slug, r.ownerEmail, r.ownerName, r.area, r.city))
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));

  const result = paginate(rows, page);
  // Package counts only for the visible page (cheap aggregate per studio).
  await Promise.all(
    result.items.map(async (r) => {
      r.packageCount = await count(studioSub(r.id, "packages"));
    }),
  );
  return result;
}

export interface AdminStudioDetail {
  studio: StudioDoc & { id: string };
  owner: (AuthSummary & { uid: string }) | null;
  application: ApplicationDTO | null;
  portfolio: Awaited<ReturnType<typeof listPortfolio>>;
  gallery: Awaited<ReturnType<typeof listGallery>>;
  packages: PackageDTO[];
  availability: { date: string; isClosed: boolean; slots: AvailabilityDayDoc["slots"] }[];
  bookingCount: number;
  createdAt: string | null;
  updatedAt: string | null;
  lastModeration: { action: string; at: string | null; byEmail: string | null; reason: string | null } | null;
}

export async function getStudioAdmin(studioId: string): Promise<AdminStudioDetail | null> {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(studioId)) return null;
  const snap = await studioRef(studioId).get();
  if (!snap.exists) return null;
  const studio = snap.data() as StudioDoc & { lastModeration?: { action: string; at: unknown; by: string; reason: string | null } };
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kathmandu" });

  const [owners, application, portfolio, gallery, packages, availability, bookingCount] = await Promise.all([
    authUsers([studio.ownerId, studio.lastModeration?.by ?? ""]),
    db().collection(collections.photographerApplications).doc(studio.ownerId).get(),
    listPortfolio(studioId),
    listGallery(studioId),
    listPackages(studioId),
    studioSub(studioId, "availability").orderBy(FieldPath.documentId()).startAt(today).limit(14).get(),
    count(db().collection(collections.bookings).where("studioId", "==", studioId)),
  ]);
  const owner = owners.get(studio.ownerId);

  return {
    studio: { ...studio, id: snap.id },
    owner: owner ? { ...owner, uid: studio.ownerId } : null,
    application: application.exists ? toApplicationDTO(application) : null,
    portfolio,
    gallery,
    packages,
    availability: availability.docs.map((d) => {
      const a = d.data() as AvailabilityDayDoc;
      return { date: d.id, isClosed: a.isClosed, slots: a.slots ?? [] };
    }),
    bookingCount,
    createdAt: toIso(studio.createdAt),
    updatedAt: toIso(studio.updatedAt),
    lastModeration: studio.lastModeration
      ? {
          action: studio.lastModeration.action,
          at: toIso(studio.lastModeration.at),
          byEmail: owners.get(studio.lastModeration.by)?.email ?? null,
          reason: studio.lastModeration.reason,
        }
      : null,
  };
}

/* ========================================================= photographers */

export interface AdminPhotographerRow {
  uid: string;
  name: string;
  email: string | null;
  studioId: string | null;
  studioName: string | null;
  city: LocationSlug | null;
  categories: CategorySlug[];
  listingStatus: StudioListingStatus | null;
  disabled: boolean;
  claimMatches: boolean;
  joinedAt: string | null;
}

export async function listPhotographersAdmin({ q, page }: { q: string; page: number }) {
  const snap = await db().collection(collections.users).where("role", "==", "photographer").limit(LIST_SCAN_LIMIT).get();
  const users = snap.docs.map((d) => ({ ...(d.data() as UserDoc), uid: d.id }));
  const [auth, studios] = await Promise.all([
    authUsers(users.map((u) => u.uid)),
    Promise.all(users.map((u) => (u.studioId ? studioRef(u.studioId).get() : null))),
  ]);

  const rows: AdminPhotographerRow[] = users.map((u, i) => {
    const s = studios[i]?.exists ? (studios[i]!.data() as StudioDoc) : null;
    const a = auth.get(u.uid);
    return {
      uid: u.uid,
      name: u.displayName,
      email: a?.email ?? u.email,
      studioId: s ? u.studioId : null,
      studioName: s?.businessName ?? null,
      city: s?.location.city ?? null,
      categories: s?.categories ?? [],
      listingStatus: s?.listingStatus ?? null,
      disabled: a?.disabled ?? false,
      claimMatches: a?.role === "photographer",
      joinedAt: toIso(u.createdAt),
    };
  });

  return paginate(
    rows
      .filter((r) => matches(q, r.name, r.email, r.studioName, r.city))
      .sort((a, b) => (b.joinedAt ?? "").localeCompare(a.joinedAt ?? "")),
    page,
  );
}

/* ============================================================= customers */

export interface AdminCustomerRow {
  uid: string;
  name: string;
  email: string | null;
  phone: string | null;
  joinedAt: string | null;
  bookingCount: number;
  applied: boolean;
}

export async function listCustomersAdmin({ q, page }: { q: string; page: number }) {
  const snap = await db().collection(collections.users).where("role", "==", "customer").limit(LIST_SCAN_LIMIT).get();
  const rows: AdminCustomerRow[] = snap.docs
    .map((d) => {
      const u = d.data() as UserDoc;
      return {
        uid: d.id,
        name: u.displayName,
        email: u.email,
        phone: u.phone,
        joinedAt: toIso(u.createdAt),
        bookingCount: 0,
        applied: false,
      };
    })
    .filter((r) => matches(q, r.name, r.email))
    .sort((a, b) => (b.joinedAt ?? "").localeCompare(a.joinedAt ?? ""));

  const result = paginate(rows, page);
  await Promise.all(
    result.items.map(async (r) => {
      const [bookingCount, application] = await Promise.all([
        count(db().collection(collections.bookings).where("customerId", "==", r.uid)),
        db().collection(collections.photographerApplications).doc(r.uid).get(),
      ]);
      r.bookingCount = bookingCount;
      r.applied = application.exists;
    }),
  );
  return result;
}

/* ============================================================== bookings */

export interface AdminBookingRow {
  id: string;
  customerName: string;
  studioId: string;
  studioName: string;
  packageName: string;
  shootDate: string;
  startTime: string;
  grossAmount: MinorUnits;
  commissionAmount: MinorUnits;
  photographerNetAmount: MinorUnits;
  commissionRateBps: number;
  bookingStatus: BookingStatus;
  paymentStatus: BookingDoc["paymentStatus"];
  createdAt: string | null;
}

export async function listBookingsAdmin({ status, q, page }: { status: BookingStatus | ""; q: string; page: number }) {
  const base = db().collection(collections.bookings);
  const snap = await (status ? base.where("bookingStatus", "==", status) : base.orderBy("createdAt", "desc"))
    .limit(LIST_SCAN_LIMIT)
    .get();
  const rows: AdminBookingRow[] = snap.docs
    .map((d) => {
      const b = d.data() as BookingDoc;
      return {
        id: d.id,
        customerName: b.customerName,
        studioId: b.studioId,
        studioName: b.studioSnapshot?.businessName ?? b.studioId,
        packageName: b.packageSnapshot?.name ?? "—",
        shootDate: b.shootDate,
        startTime: b.startTime,
        grossAmount: b.grossAmount,
        commissionAmount: b.commissionAmount,
        photographerNetAmount: b.photographerNetAmount,
        commissionRateBps: b.commissionRateBps,
        bookingStatus: b.bookingStatus,
        paymentStatus: b.paymentStatus,
        createdAt: toIso(b.createdAt),
      };
    })
    .filter((r) => matches(q, r.id, r.customerName, r.studioName, r.packageName))
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
  return paginate(rows, page);
}

/* ============================================================ commission */

export interface CommissionOverview {
  defaultRateBps: number;
  byStatus: { status: BookingStatus; count: number; gross: MinorUnits; commission: MinorUnits; net: MinorUnits }[];
  overrides: { id: string; businessName: string; rateBps: number }[];
}

export async function getCommissionOverview(): Promise<CommissionOverview> {
  const bookings = db().collection(collections.bookings);
  const statuses: BookingStatus[] = ["pending", "confirmed", "completed", "cancelled_by_customer", "cancelled_by_studio", "declined", "no_show"];
  const byStatus = await Promise.all(
    statuses.map(async (status) => {
      const q = bookings.where("bookingStatus", "==", status);
      const agg = await q.aggregate({ count: AggregateField.count(), ...MONEY_SUMS }).get();
      const d = agg.data();
      return { status, count: d.count, gross: d.gross ?? 0, commission: d.commission ?? 0, net: d.net ?? 0 };
    }),
  );

  const overrides = await db()
    .collection(collections.studios)
    .where("commissionRateBps", "!=", DEFAULT_COMMISSION_RATE_BPS)
    .limit(100)
    .get();

  return {
    defaultRateBps: DEFAULT_COMMISSION_RATE_BPS,
    byStatus,
    overrides: overrides.docs
      .filter((d) => typeof d.get("commissionRateBps") === "number")
      .map((d) => ({ id: d.id, businessName: d.get("businessName"), rateBps: d.get("commissionRateBps") })),
  };
}

/* =============================================================== reviews */

export interface AdminReviewRow {
  id: string;
  customerName: string;
  studioId: string;
  studioName: string;
  rating: number;
  comment: string;
  status: ReviewStatus;
  createdAt: string | null;
}

export async function listReviewsAdmin({ status, page }: { status: ReviewStatus | ""; page: number }) {
  const base = db().collection(collections.reviews);
  const snap = await (status ? base.where("status", "==", status) : base.orderBy("createdAt", "desc"))
    .limit(LIST_SCAN_LIMIT)
    .get();
  const studioIds = [...new Set(snap.docs.map((d) => d.get("studioId") as string))];
  const studios = new Map<string, string>();
  await Promise.all(
    studioIds.map(async (id) => {
      const s = await studioRef(id).get();
      studios.set(id, (s.get("businessName") as string) ?? id);
    }),
  );
  const rows: AdminReviewRow[] = snap.docs
    .map((d: DocumentSnapshot) => {
      const r = d.data() as ReviewDoc;
      return {
        id: d.id,
        customerName: r.customerDisplayName,
        studioId: r.studioId,
        studioName: studios.get(r.studioId) ?? r.studioId,
        rating: r.rating,
        comment: r.comment,
        status: r.status,
        createdAt: toIso(r.createdAt),
      };
    })
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
  return paginate(rows, page);
}

/* =============================================================== admins */

export async function listAdmins() {
  const snap = await db().collection(collections.users).where("role", "==", "admin").limit(50).get();
  const auth = await authUsers(snap.docs.map((d) => d.id));
  return snap.docs.map((d) => ({
    uid: d.id,
    name: (d.get("displayName") as string) ?? "",
    email: auth.get(d.id)?.email ?? (d.get("email") as string | null),
    claimActive: auth.get(d.id)?.role === "admin",
    lastSignInAt: auth.get(d.id)?.lastSignInAt ?? null,
  }));
}
