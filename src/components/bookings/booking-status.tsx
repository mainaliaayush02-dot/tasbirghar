import type { BookingPhase } from "@/lib/booking/transitions";
import type { BookingStatus } from "@/types/models";

/** Customer/studio-facing booking status labels. */
export const BOOKING_LABEL: Record<BookingStatus, { label: string; className: string }> = {
  pending: { label: "Requested", className: "bg-amber-50 text-amber-800" },
  confirmed: { label: "Confirmed", className: "bg-emerald-50 text-emerald-700" },
  completed: { label: "Completed", className: "bg-sky-50 text-sky-700" },
  declined: { label: "Declined", className: "bg-neutral-100 text-neutral-600" },
  cancelled_by_customer: { label: "Cancelled by customer", className: "bg-neutral-100 text-neutral-600" },
  cancelled_by_studio: { label: "Cancelled by studio", className: "bg-red-50 text-red-700" },
  no_show: { label: "No-show", className: "bg-red-50 text-red-700" },
};

/** Derived (never stored) label for a pending request whose start time has passed. */
export const EXPIRED_LABEL = { label: "Expired", className: "bg-neutral-100 text-neutral-500" };

export function BookingStatusPill({ status, expired = false }: { status: BookingStatus; expired?: boolean }) {
  const s = expired && status === "pending" ? EXPIRED_LABEL : BOOKING_LABEL[status];
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${s.className}`}>{s.label}</span>;
}

/** Headline + explanation for the customer's booking page. */
export const CUSTOMER_STATUS_COPY: Record<BookingStatus, { title: string; body: string; tone: "warning" | "success" | "info" | "neutral" | "danger" }> = {
  pending: { title: "Waiting for the studio", body: "Your request has been sent. The studio will confirm or decline it.", tone: "warning" },
  confirmed: { title: "Booking confirmed", body: "The studio has reserved this time for you.", tone: "success" },
  completed: { title: "Session completed", body: "The studio marked this session as completed.", tone: "info" },
  declined: { title: "Request declined", body: "The studio couldn't take this booking. You can request another date or studio.", tone: "neutral" },
  cancelled_by_customer: { title: "You cancelled this request", body: "This time is no longer reserved.", tone: "neutral" },
  cancelled_by_studio: { title: "Cancelled by the studio", body: "The studio cancelled this booking. You can request another time, or contact TasbirGhar if you need help.", tone: "danger" },
  no_show: { title: "Marked as a no-show", body: "The studio recorded that the session did not take place.", tone: "danger" },
};

type CustomerCopy = (typeof CUSTOMER_STATUS_COPY)[BookingStatus];

/** Customer copy for a booking, taking its time into account (expired / time passed). */
export function customerCopy(status: BookingStatus, phase: BookingPhase): CustomerCopy {
  if (phase === "expired") {
    return { title: "Request expired", body: "The studio didn't respond before the requested time. You're welcome to request another time.", tone: "neutral" };
  }
  if (phase === "needs_completion") {
    return { title: "Session time has passed", body: "Your confirmed session time has passed. The studio will mark it as completed.", tone: "info" };
  }
  return CUSTOMER_STATUS_COPY[status];
}
