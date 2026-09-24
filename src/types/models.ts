/**
 * Firestore data model. See docs/ARCHITECTURE.md → "Firestore collections".
 *
 *   users/{uid}
 *   studios/{studioId}
 *   studios/{studioId}/portfolio/{photoId}
 *   studios/{studioId}/gallery/{imageId}          studio / setup / prop images
 *   studios/{studioId}/packages/{packageId}
 *   studios/{studioId}/availability/{YYYY-MM-DD}
 *   studioSlugs/{slug}                             slug → studioId uniqueness lock
 *   photographerApplications/{uid}                 one application per user (server-only)
 *   bookings/{bookingId}
 *   reviews/{bookingId}                            one review per booking
 *
 * Document types omit `id`; the id is the document key and is attached when
 * reading (see `WithId`).
 */

import type { Timestamp } from "firebase/firestore";

import type { CategorySlug } from "@/config/categories";
import type { LocationSlug } from "@/config/locations";
import type { BasisPoints, Currency, MinorUnits } from "@/lib/money";

import type { MediaAsset } from "./media";

export type WithId<T> = T & { id: string };

interface Timestamps {
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/* ------------------------------------------------------------------ users */

export type UserRole = "customer" | "photographer" | "admin";

/**
 * users/{uid}. `role` is a read-only mirror of the Firebase Auth custom claim
 * `role` (see `@/lib/auth/roles`), kept for UI and admin queries. Clients can
 * only create it as "customer" and never change it; authorization decisions
 * in rules and server code always use the claim.
 */
export interface UserDoc extends Timestamps {
  uid: string;
  role: UserRole;
  displayName: string;
  email: string | null;
  phone: string | null;
  photo: MediaAsset | null;
  /** Set for photographers once they create a studio. */
  studioId: string | null;
}

/* ---------------------------------------------------------------- studios */

export type StudioVerificationStatus = "unverified" | "pending" | "verified" | "rejected";

/** Only `published` studios are publicly visible. Changed by admins. */
export type StudioListingStatus = "draft" | "pending_review" | "published" | "suspended";

export interface StudioLocation {
  city: LocationSlug;
  /** Neighbourhood, e.g. "Baneshwor". */
  area: string;
  geo: { lat: number; lng: number } | null;
}

/**
 * studios/{studioId} — the PUBLIC studio document. Readable by anyone once
 * published, so it holds only marketplace-facing data. Private data lives in
 * server-written sub-documents:
 *   studios/{studioId}/private/contact   phone, email, street address, website,
 *                                        instagram (owner + admin read)
 *   studios/{studioId}/private/internal  ownerId, commission, moderation
 *                                        (admin read)
 * Unbounded collections (portfolio, gallery, packages, availability) are
 * subcollections; `startingPrice` and `stats` are denormalized for listings.
 */
export interface StudioDoc extends Timestamps {
  businessName: string;
  slug: string;
  description: string;
  location: StudioLocation;
  yearsOfExperience: number | null;
  /** Free text: team members / roles. */
  team: string | null;
  /** Free text: what makes the studio different. */
  highlights: string | null;
  /** Also the "service areas" filter; bounded by the category list. */
  categories: CategorySlug[];
  profileImage: MediaAsset | null;
  coverImage: MediaAsset | null;
  /** Short labels, e.g. "Parking", "Baby changing room". Bounded (~20). */
  facilities: string[];
  /** Short labels for props/themes; imagery lives in `gallery` (kind "prop"). */
  props: string[];
  verificationStatus: StudioVerificationStatus;
  listingStatus: StudioListingStatus;
  /** Set by the server when an admin publishes the studio. */
  publishedAt: Timestamp | null;
  /** Lowest active package price, maintained server-side for budget filters. */
  startingPrice: MinorUnits | null;
  currency: Currency;
  stats: {
    ratingAverage: number;
    reviewCount: number;
    portfolioCount: number;
    completedBookings: number;
  };
}

/** studios/{studioId}/private/contact — owner + admin readable, server-written. */
export interface StudioContactDoc {
  phone: string;
  email: string | null;
  /** Street address; the public doc only carries city + area. */
  address: string | null;
  website: string | null;
  /** Instagram handle without "@". */
  instagram: string | null;
  updatedAt: Timestamp;
}

/** studios/{studioId}/private/internal — admin readable, server-written. */
export interface StudioInternalDoc {
  /** Authoritative owner for server code (rules use users/{uid}.studioId). */
  ownerId: string;
  /** Overrides the platform default when negotiated per studio. */
  commissionRateBps: BasisPoints | null;
  /** Last admin moderation action (full history in moderationLog). */
  lastModeration: {
    action: string;
    by: string;
    at: Timestamp;
    reason: string | null;
  } | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** studios/{studioId}/portfolio/{photoId} */
export interface PortfolioPhotoDoc extends Timestamps {
  studioId: string;
  image: MediaAsset;
  category: CategorySlug | null;
  caption: string | null;
  sortOrder: number;
  isFeatured: boolean;
}

export type GalleryImageKind = "studio" | "setup" | "prop";

/** studios/{studioId}/gallery/{imageId} */
export interface GalleryImageDoc extends Timestamps {
  studioId: string;
  kind: GalleryImageKind;
  image: MediaAsset;
  caption: string | null;
  sortOrder: number;
}

/**
 * studios/{studioId}/packages/{packageId}. `studioId` and `category` are
 * duplicated so a collection-group query over `packages` can filter by
 * category and price across all studios.
 */
export interface PackageDoc extends Timestamps {
  studioId: string;
  name: string;
  description: string;
  category: CategorySlug;
  price: MinorUnits;
  currency: Currency;
  durationMinutes: number;
  editedPhotos: number;
  /** Bullet points: "2 outfit changes", "1 printed 12x18 frame"... */
  includes: string[];
  /** A few showcase images (bounded, ≤ 6). */
  images: MediaAsset[];
  isActive: boolean;
  sortOrder: number;
}

/* ----------------------------------------------------------- availability */

export type SlotStatus = "open" | "held" | "booked" | "blocked";

export interface AvailabilitySlot {
  /** "HH:mm", Asia/Kathmandu local time. */
  start: string;
  end: string;
  status: SlotStatus;
  bookingId: string | null;
}

/**
 * studios/{studioId}/availability/{YYYY-MM-DD}. One document per calendar day
 * keeps each read cheap and each doc bounded; a month view is a range query
 * on the document id.
 */
export interface AvailabilityDayDoc extends Timestamps {
  studioId: string;
  date: string;
  isClosed: boolean;
  slots: AvailabilitySlot[];
}

/* --------------------------------------------------------------- bookings */

export type BookingStatus =
  | "pending"
  | "confirmed"
  | "declined"
  | "cancelled_by_customer"
  | "cancelled_by_studio"
  | "completed"
  | "no_show";

export type PaymentStatus =
  | "unpaid"
  | "pending"
  | "paid"
  | "failed"
  | "refunded"
  | "partially_refunded";

export type PayoutStatus = "not_due" | "pending" | "paid" | "on_hold";

/**
 * bookings/{bookingId} — top-level so customers, studios and admins can each
 * query it. Written ONLY by trusted server code (Admin SDK) so that prices
 * and commission cannot be tampered with from the client.
 *
 * All money fields are integer paisa; see `@/lib/money`.
 */
export interface BookingDoc extends Timestamps {
  customerId: string;
  studioId: string;
  /** Denormalized so rules/queries can scope to the studio owner cheaply. */
  studioOwnerId: string;
  packageId: string;
  photographyCategory: CategorySlug;

  /** "YYYY-MM-DD" and "HH:mm" in Asia/Kathmandu — avoids timezone drift. */
  shootDate: string;
  startTime: string;
  endTime: string;
  timezone: "Asia/Kathmandu";

  customerName: string;
  customerPhone: string;
  customerNote: string | null;

  /** Snapshot at booking time — later package edits must not change past bookings. */
  packageSnapshot: {
    name: string;
    price: MinorUnits;
    durationMinutes: number;
  };
  studioSnapshot: {
    businessName: string;
    slug: string;
  };

  bookingStatus: BookingStatus;
  paymentStatus: PaymentStatus;
  payoutStatus: PayoutStatus;

  currency: Currency;
  grossAmount: MinorUnits;
  commissionRateBps: BasisPoints;
  commissionAmount: MinorUnits;
  photographerNetAmount: MinorUnits;

  confirmedAt: Timestamp | null;
  completedAt: Timestamp | null;
  cancelledAt: Timestamp | null;
}

/* ---------------------------------------------------------------- reviews */

export type ReviewStatus = "published" | "hidden" | "pending_moderation";

/**
 * reviews/{bookingId}. Keyed by booking id, which enforces one review per
 * booking and makes every review "verified" (tied to a completed booking).
 */
export interface ReviewDoc extends Timestamps {
  bookingId: string;
  studioId: string;
  customerId: string;
  customerDisplayName: string;
  rating: 1 | 2 | 3 | 4 | 5;
  comment: string;
  status: ReviewStatus;
  studioReply: string | null;
}

/* ------------------------------------------------ photographer onboarding */

export type ApplicationStatus = "pending" | "approved" | "rejected";

/**
 * photographerApplications/{uid} — keyed by applicant uid (one per user;
 * resubmission allowed only after rejection). Read and written exclusively
 * by server code; clients have no Firestore access to this collection.
 */
export interface PhotographerApplicationDoc {
  applicantUid: string;
  /** From the verified Firebase Auth record, not from the form. */
  applicantEmail: string | null;
  fullName: string;
  phone: string;
  businessName: string;
  city: LocationSlug;
  area: string;
  categories: CategorySlug[];
  description: string;
  yearsOfExperience: number;
  instagram: string | null;
  website: string | null;
  portfolioIntro: string;
  status: ApplicationStatus;
  submittedAt: Timestamp;
  updatedAt: Timestamp;
  reviewedAt: Timestamp | null;
  reviewedBy: string | null;
  approvedAt: Timestamp | null;
  approvedBy: string | null;
  rejectionReason: string | null;
}

/** studioSlugs/{slug} — reserved atomically with the studio to keep slugs unique. */
export interface StudioSlugDoc {
  studioId: string;
}
