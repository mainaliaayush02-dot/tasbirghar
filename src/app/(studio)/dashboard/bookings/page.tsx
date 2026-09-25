import Link from "next/link";

import { BookingActions } from "@/components/bookings/booking-ui";
import { BookingStatusPill } from "@/components/bookings/booking-status";
import { Card, PageHeader } from "@/components/ui/feedback";
import { ACTIVE_BOOKING_STATUSES, nepalToday } from "@/lib/booking/rules";
import { availableActions } from "@/lib/booking/transitions";
import { listStudioBookings, type StudioBookingDTO } from "@/lib/data/bookings";
import { requireStudio } from "@/lib/data/dashboard";
import { formatDate, formatDay, formatTimeRange } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import type { BookingStatus } from "@/types/models";

export const metadata = { title: "Bookings" };

const TABS: { value: string; label: string; statuses: BookingStatus[] | null }[] = [
  { value: "", label: "All", statuses: null },
  { value: "pending", label: "Pending", statuses: ["pending"] },
  { value: "confirmed", label: "Confirmed", statuses: ["confirmed"] },
  { value: "completed", label: "Completed", statuses: ["completed"] },
  { value: "cancelled", label: "Cancelled", statuses: ["cancelled_by_customer", "cancelled_by_studio"] },
  { value: "declined", label: "Declined", statuses: ["declined"] },
];

/** Upcoming open bookings first (soonest first), then history (latest first). */
function order(a: StudioBookingDTO, b: StudioBookingDTO) {
  const openA = ACTIVE_BOOKING_STATUSES.includes(a.bookingStatus);
  const openB = ACTIVE_BOOKING_STATUSES.includes(b.bookingStatus);
  if (openA !== openB) return openA ? -1 : 1;
  const key = (x: StudioBookingDTO) => `${x.shootDate}${x.startTime}`;
  return openA ? key(a).localeCompare(key(b)) : key(b).localeCompare(key(a));
}

export default async function StudioBookingsPage({ searchParams }: PageProps<"/dashboard/bookings">) {
  const { user, studio } = await requireStudio("/dashboard/bookings");
  const bookings = await listStudioBookings(studio.id, user.uid);
  const today = nepalToday();
  const sp = await searchParams;
  const tab = TABS.find((t) => t.value === sp.status) ?? TABS[0];
  const shown = bookings.filter((b) => !tab.statuses || tab.statuses.includes(b.bookingStatus)).sort(order);
  const count = (t: (typeof TABS)[number]) => bookings.filter((b) => !t.statuses || t.statuses.includes(b.bookingStatus)).length;

  return (
    <>
      <PageHeader
        title="Bookings"
        description="Confirm or decline requests, then mark sessions completed. Confirmed times are reserved for the customer."
      />
      <nav aria-label="Booking status" className="-mx-4 mb-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ul className="flex w-max gap-1 rounded-xl border border-neutral-200 bg-white p-1">
          {TABS.map((t) => {
            const active = t.value === tab.value;
            return (
              <li key={t.value || "all"}>
                <Link
                  href={t.value ? `/dashboard/bookings?status=${t.value}` : "/dashboard/bookings"}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm whitespace-nowrap transition-colors ${
                    active ? "bg-brand-50 font-medium text-brand-700" : "text-neutral-600 hover:bg-neutral-100"
                  }`}
                >
                  {t.label}
                  <span className={`rounded-full px-1.5 text-xs ${active ? "bg-brand-100" : "bg-neutral-100"}`}>{count(t)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {shown.length === 0 ? (
        <Card>
          <p className="py-6 text-center text-sm text-neutral-500">
            {tab.statuses ? `No ${tab.label.toLowerCase()} bookings.` : "No bookings yet. Requests appear here when customers book from your studio page."}
          </p>
        </Card>
      ) : (
        <ul className="space-y-3">
          {shown.map((b) => {
            const actions = availableActions(b.bookingStatus, "studio", { shootDate: b.shootDate, today });
            return (
              <li key={b.id} data-booking={b.id} className="rounded-xl border border-neutral-200 bg-white p-4 shadow-xs sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-neutral-900">{b.customerName}</p>
                    <p className="text-sm text-neutral-600">{b.packageName}</p>
                  </div>
                  <BookingStatusPill status={b.bookingStatus} />
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">
                  <div>
                    <dt className="text-xs text-neutral-500">Date</dt>
                    <dd className="font-medium text-neutral-900">{formatDay(b.shootDate)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-neutral-500">Time</dt>
                    <dd className="font-medium text-neutral-900">{formatTimeRange(b.startTime, b.endTime)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-neutral-500">Amount</dt>
                    <dd className="font-medium text-neutral-900">{formatMoney(b.price)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-neutral-500">Requested</dt>
                    <dd className="text-neutral-900">{formatDate(b.createdAt)}</dd>
                  </div>
                </dl>
                <p className="mt-3 text-sm text-neutral-600">
                  {b.customerPhone}
                  {b.customerNote ? <span className="text-neutral-500"> · “{b.customerNote}”</span> : null}
                </p>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-neutral-100 pt-3">
                  <p className="text-xs text-neutral-500">
                    <span className="font-mono break-all">#{b.id}</span> · your payout {formatMoney(b.photographerNetAmount)} after{" "}
                    {formatMoney(b.commissionAmount)} commission
                  </p>
                  <div className="flex flex-wrap items-center gap-3">
                    {b.bookingStatus === "confirmed" && b.shootDate > today && (
                      <p className="text-xs text-neutral-500">Can be marked completed from {formatDay(b.shootDate)}.</p>
                    )}
                    {actions.length > 0 && <BookingActions bookingId={b.id} actions={actions} />}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
