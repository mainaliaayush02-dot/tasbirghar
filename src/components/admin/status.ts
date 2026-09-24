import type {
  ApplicationStatus,
  BookingStatus,
  PaymentStatus,
  ReviewStatus,
  StudioListingStatus,
  StudioVerificationStatus,
} from "@/types/models";

type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "brand";
type Label = { label: string; tone: Tone };

export const LISTING_STATUS: Record<StudioListingStatus, Label> = {
  draft: { label: "Draft", tone: "neutral" },
  pending_review: { label: "In review", tone: "warning" },
  published: { label: "Published", tone: "success" },
  suspended: { label: "Suspended", tone: "danger" },
};

export const VERIFICATION_STATUS: Record<StudioVerificationStatus, Label> = {
  unverified: { label: "Unverified", tone: "neutral" },
  pending: { label: "Verification pending", tone: "warning" },
  verified: { label: "Verified", tone: "info" },
  rejected: { label: "Verification declined", tone: "danger" },
};

export const APPLICATION_STATUS: Record<ApplicationStatus, Label> = {
  pending: { label: "Pending", tone: "warning" },
  approved: { label: "Approved", tone: "success" },
  rejected: { label: "Rejected", tone: "danger" },
};

export const BOOKING_STATUS: Record<BookingStatus, Label> = {
  pending: { label: "Requested", tone: "warning" },
  confirmed: { label: "Confirmed", tone: "info" },
  completed: { label: "Completed", tone: "success" },
  declined: { label: "Declined", tone: "neutral" },
  cancelled_by_customer: { label: "Cancelled (customer)", tone: "neutral" },
  cancelled_by_studio: { label: "Cancelled (studio)", tone: "danger" },
  no_show: { label: "No-show", tone: "danger" },
};

export const PAYMENT_STATUS: Record<PaymentStatus, Label> = {
  unpaid: { label: "Unpaid", tone: "neutral" },
  pending: { label: "Payment pending", tone: "warning" },
  paid: { label: "Paid", tone: "success" },
  failed: { label: "Failed", tone: "danger" },
  refunded: { label: "Refunded", tone: "neutral" },
  partially_refunded: { label: "Partly refunded", tone: "neutral" },
};

export const REVIEW_STATUS: Record<ReviewStatus, Label> = {
  published: { label: "Published", tone: "success" },
  hidden: { label: "Hidden", tone: "neutral" },
  pending_moderation: { label: "Awaiting moderation", tone: "warning" },
};

/** Read a single string search param. */
export function param(
  sp: Record<string, string | string[] | undefined>,
  key: string,
): string {
  const v = sp[key];
  return (Array.isArray(v) ? v[0] : v)?.trim().slice(0, 100) ?? "";
}

export function pageParam(sp: Record<string, string | string[] | undefined>): number {
  const n = Number(param(sp, "page"));
  return Number.isInteger(n) && n > 0 ? n : 1;
}

/** Build a URL with updated query params (drops empty values). */
export function withParams(path: string, current: Record<string, string>, next: Record<string, string | number>) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...current, ...next })) {
    if (v !== "" && v !== undefined && !(k === "page" && Number(v) === 1)) params.set(k, String(v));
  }
  return params.size ? `${path}?${params}` : path;
}
