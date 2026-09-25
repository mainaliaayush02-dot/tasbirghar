import { PHOTOGRAPHY_CATEGORIES, type CategorySlug } from "@/config/categories";
import { LOCATIONS, type LocationSlug } from "@/config/locations";
import { MAX_SLOTS_PER_DAY } from "@/lib/booking/rules";
import { BOOKING_ACTIONS, type BookingAction } from "@/lib/booking/transitions";
import type { GalleryImageKind } from "@/types/models";

import {
  bool,
  email,
  int,
  listOf,
  oneOf,
  optionalInstagram,
  optionalInt,
  optionalPhone,
  optionalText,
  optionalUrl,
  phone,
  slug,
  text,
  textList,
  type Schema,
} from "./core";

export const CATEGORY_SLUGS = PHOTOGRAPHY_CATEGORIES.map((c) => c.slug) as CategorySlug[];
export const LOCATION_SLUGS = LOCATIONS.map((l) => l.slug) as LocationSlug[];
export const GALLERY_KINDS = ["studio", "setup", "prop"] as const satisfies readonly GalleryImageKind[];

/** Limits shared with forms (maxLength attributes, counters). */
export const LIMITS = {
  displayName: 60,
  businessName: 80,
  area: 80,
  address: 160,
  shortText: 160,
  description: 2000,
  longText: 1500,
  caption: 200,
  packageName: 80,
  packageDescription: 1000,
  includeItem: 120,
  includes: 15,
  listItems: 20,
  listItemLength: 60,
  maxPortfolioPhotos: 60,
  maxGalleryPhotos: 30,
  maxPackages: 20,
  /** Rs. 500 – Rs. 10,00,000 per package. */
  minPriceNpr: 500,
  maxPriceNpr: 1_000_000,
} as const;

/* ---------------------------------------------------------------- auth */

export interface SignupProfileInput {
  displayName: string | null;
  phone: string | null;
}

export const signupProfileSchema: Schema<SignupProfileInput> = {
  displayName: optionalText({ min: 2, max: LIMITS.displayName }),
  phone: optionalPhone(),
};

/* -------------------------------------------------------------- account */

export interface AccountUpdateInput {
  displayName: string;
  phone: string | null;
}

export const accountUpdateSchema: Schema<AccountUpdateInput> = {
  displayName: text({ min: 2, max: LIMITS.displayName }),
  phone: optionalPhone(),
};

/* --------------------------------------------------------- application */

export interface ApplicationInput {
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
}

export const applicationSchema: Schema<ApplicationInput> = {
  fullName: text({ min: 2, max: LIMITS.displayName }),
  phone: phone(),
  businessName: text({ min: 2, max: LIMITS.businessName }),
  city: oneOf(LOCATION_SLUGS, "Choose a city."),
  area: text({ min: 2, max: LIMITS.area }),
  categories: listOf(CATEGORY_SLUGS, { min: 1, max: CATEGORY_SLUGS.length }),
  description: text({ min: 30, max: LIMITS.longText, multiline: true }),
  yearsOfExperience: int({ min: 0, max: 60 }),
  instagram: optionalInstagram(),
  website: optionalUrl(),
  portfolioIntro: text({ min: 20, max: LIMITS.longText, multiline: true }),
};

export interface ApplicationReviewInput {
  reason: string | null;
}

export const applicationReviewSchema: Schema<ApplicationReviewInput> = {
  reason: optionalText({ max: 500, multiline: true }),
};

/* --------------------------------------------------------------- studio */

/** Fields a photographer may set on their studio. Everything else is server-owned. */
export interface StudioProfileInput {
  businessName: string;
  description: string;
  city: LocationSlug;
  area: string;
  address: string | null;
  phone: string;
  email: string | null;
  website: string | null;
  instagram: string | null;
  categories: CategorySlug[];
  yearsOfExperience: number | null;
  facilities: string[];
  props: string[];
  team: string | null;
  highlights: string | null;
}

export const studioProfileSchema: Schema<StudioProfileInput> = {
  businessName: text({ min: 2, max: LIMITS.businessName }),
  description: text({ min: 30, max: LIMITS.description, multiline: true }),
  city: oneOf(LOCATION_SLUGS, "Choose a city."),
  area: text({ min: 2, max: LIMITS.area }),
  address: optionalText({ max: LIMITS.address }),
  phone: phone(),
  email: email(),
  website: optionalUrl(),
  instagram: optionalInstagram(),
  categories: listOf(CATEGORY_SLUGS, { min: 1, max: CATEGORY_SLUGS.length }),
  yearsOfExperience: optionalInt({ min: 0, max: 60 }),
  facilities: textList({ maxItems: LIMITS.listItems, maxLength: LIMITS.listItemLength }),
  props: textList({ maxItems: LIMITS.listItems, maxLength: LIMITS.listItemLength }),
  team: optionalText({ max: LIMITS.longText, multiline: true }),
  highlights: optionalText({ max: LIMITS.longText, multiline: true }),
};

export interface StudioCreateInput extends StudioProfileInput {
  slug: string;
}

export const studioCreateSchema: Schema<StudioCreateInput> = {
  ...studioProfileSchema,
  slug: slug(),
};

/* ---------------------------------------------------------------- media */

export const MEDIA_TARGETS = ["portfolio", "gallery", "profile", "cover"] as const;
export type MediaTarget = (typeof MEDIA_TARGETS)[number];

export interface MediaSignInput {
  studioId: string;
  target: MediaTarget;
  galleryKind: GalleryImageKind | null;
}

const studioIdRule = text({ max: 64, pattern: /^[A-Za-z0-9_-]+$/, patternMessage: "Invalid studio." });

const optionalGalleryKind = (value: unknown, field: string) =>
  value === undefined || value === null
    ? { ok: true as const, value: null }
    : oneOf(GALLERY_KINDS)(value, field);

export const mediaSignSchema: Schema<MediaSignInput> = {
  studioId: studioIdRule,
  target: oneOf(MEDIA_TARGETS),
  galleryKind: optionalGalleryKind,
};

export interface MediaConfirmInput extends MediaSignInput {
  publicId: string;
  alt: string | null;
}

export const mediaConfirmSchema: Schema<MediaConfirmInput> = {
  ...mediaSignSchema,
  publicId: text({ max: 255, pattern: /^[A-Za-z0-9_\-/]+$/, patternMessage: "Invalid asset." }),
  alt: optionalText({ max: LIMITS.caption }),
};

export interface PortfolioUpdateInput {
  caption: string | null;
  category: CategorySlug | null;
  sortOrder: number;
  isFeatured: boolean;
}

export const portfolioUpdateSchema: Schema<PortfolioUpdateInput> = {
  caption: optionalText({ max: LIMITS.caption }),
  category: (value, field) =>
    value === null || value === "" ? { ok: true, value: null } : oneOf(CATEGORY_SLUGS)(value, field),
  sortOrder: int({ min: 0, max: 10_000 }),
  isFeatured: bool(),
};

export interface GalleryUpdateInput {
  caption: string | null;
  sortOrder: number;
}

export const galleryUpdateSchema: Schema<GalleryUpdateInput> = {
  caption: optionalText({ max: LIMITS.caption }),
  sortOrder: int({ min: 0, max: 10_000 }),
};

/* ------------------------------------------------------------- packages */

export interface PackageInput {
  name: string;
  description: string;
  category: CategorySlug;
  /** Whole rupees from the form; stored as integer paisa. */
  priceNpr: number;
  durationMinutes: number;
  editedPhotos: number;
  includes: string[];
  isActive: boolean;
  sortOrder: number;
}

export const packageSchema: Schema<PackageInput> = {
  name: text({ min: 2, max: LIMITS.packageName }),
  description: text({ min: 10, max: LIMITS.packageDescription, multiline: true }),
  category: oneOf(CATEGORY_SLUGS, "Choose a category."),
  priceNpr: int({ min: LIMITS.minPriceNpr, max: LIMITS.maxPriceNpr }),
  durationMinutes: int({ min: 15, max: 24 * 60 }),
  editedPhotos: int({ min: 0, max: 2000 }),
  includes: textList({ maxItems: LIMITS.includes, maxLength: LIMITS.includeItem }),
  isActive: bool(),
  sortOrder: int({ min: 0, max: 10_000 }),
};

/* ------------------------------------------------------------ moderation */

export const STUDIO_MODERATION_ACTIONS = [
  "publish",
  "unpublish",
  "suspend",
  "reinstate",
  "verify",
  "unverify",
] as const;
export type StudioModerationAction = (typeof STUDIO_MODERATION_ACTIONS)[number];

export interface StudioModerationInput {
  action: StudioModerationAction;
  reason: string | null;
}

export const studioModerationSchema: Schema<StudioModerationInput> = {
  action: oneOf(STUDIO_MODERATION_ACTIONS, "Unknown action."),
  reason: optionalText({ max: 500, multiline: true }),
};

export const REVIEW_MODERATION_ACTIONS = ["publish", "hide"] as const;

export interface ReviewModerationInput {
  action: (typeof REVIEW_MODERATION_ACTIONS)[number];
  reason: string | null;
}

export const reviewModerationSchema: Schema<ReviewModerationInput> = {
  action: oneOf(REVIEW_MODERATION_ACTIONS, "Unknown action."),
  reason: optionalText({ max: 500, multiline: true }),
};


/* -------------------------------------------------------------- bookings */

export interface BookingCreateInput {
  studioId: string;
  packageId: string;
  shootDate: string;
  startTime: string;
  customerName: string;
  customerPhone: string;
  customerNote: string | null;
}

const docIdRule = text({ max: 128, pattern: /^[A-Za-z0-9_-]+$/, patternMessage: "Invalid id." });

/**
 * The client sends only WHAT it wants (studio, package, date, time, contact).
 * Price, commission, owner, end time and status are all derived server-side
 * — they are not in the schema, so sending them is rejected.
 */
export const bookingCreateSchema: Schema<BookingCreateInput> = {
  studioId: docIdRule,
  packageId: docIdRule,
  shootDate: text({ max: 10, pattern: /^\d{4}-\d{2}-\d{2}$/, patternMessage: "Choose a date." }),
  startTime: text({ max: 5, pattern: /^([01]\d|2[0-3]):[0-5]\d$/, patternMessage: "Choose a start time." }),
  customerName: text({ min: 2, max: LIMITS.displayName }),
  customerPhone: phone(),
  customerNote: optionalText({ max: 500, multiline: true }),
};

export { BOOKING_ACTIONS, type BookingAction };

export interface BookingActionInput {
  action: BookingAction;
}

export const bookingActionSchema: Schema<BookingActionInput> = {
  action: oneOf(BOOKING_ACTIONS, "Unknown action."),
};

/* ---------------------------------------------------------- availability */

export interface AvailabilitySlotInput {
  start: string;
  end: string;
}

export interface AvailabilityDayInput {
  /** true = the studio takes no bookings that day (slots must be empty). */
  isClosed: boolean;
  /** Custom windows for the day; sessions must fit inside one of them. */
  slots: AvailabilitySlotInput[];
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** A list of { start, end } objects with no other keys. Semantic checks
 * (steps, order, overlaps) happen in `slotsError` on the server. */
function slotList(max: number): (value: unknown) => { ok: true; value: AvailabilitySlotInput[] } | { ok: false; error: string } {
  return (value) => {
    if (!Array.isArray(value)) return { ok: false, error: "Required." };
    if (value.length > max) return { ok: false, error: `Up to ${max} time slots per day.` };
    const out: AvailabilitySlotInput[] = [];
    for (const item of value) {
      if (typeof item !== "object" || item === null || Array.isArray(item)) return { ok: false, error: "Invalid time slot." };
      const keys = Object.keys(item);
      if (keys.length !== 2 || !keys.includes("start") || !keys.includes("end")) return { ok: false, error: "Invalid time slot." };
      const { start, end } = item as Record<string, unknown>;
      if (typeof start !== "string" || typeof end !== "string" || !HHMM.test(start) || !HHMM.test(end)) {
        return { ok: false, error: "Times must be HH:mm." };
      }
      out.push({ start, end });
    }
    return { ok: true, value: out };
  };
}

export const availabilityDaySchema: Schema<AvailabilityDayInput> = {
  isClosed: bool(),
  slots: slotList(MAX_SLOTS_PER_DAY),
};
