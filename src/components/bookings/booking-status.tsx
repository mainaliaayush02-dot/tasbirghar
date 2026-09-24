import type { BookingStatus } from "@/types/models";

/** Customer/studio-facing booking status labels. */
export const BOOKING_LABEL: Record<BookingStatus, { label: string; className: string }> = {
  pending: { label: "Requested", className: "bg-amber-50 text-amber-800" },
  confirmed: { label: "Confirmed", className: "bg-emerald-50 text-emerald-700" },
  completed: { label: "Completed", className: "bg-sky-50 text-sky-700" },
  declined: { label: "Declined", className: "bg-neutral-100 text-neutral-600" },
  cancelled_by_customer: { label: "Cancelled", className: "bg-neutral-100 text-neutral-600" },
  cancelled_by_studio: { label: "Cancelled by studio", className: "bg-red-50 text-red-700" },
  no_show: { label: "No-show", className: "bg-red-50 text-red-700" },
};

export function BookingStatusPill({ status }: { status: BookingStatus }) {
  const s = BOOKING_LABEL[status];
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${s.className}`}>{s.label}</span>;
}
