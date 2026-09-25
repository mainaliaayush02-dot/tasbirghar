import Link from "next/link";

import { BookingActions } from "@/components/bookings/booking-ui";
import { BookingStatusPill } from "@/components/bookings/booking-status";
import { Alert, Card, PageHeader } from "@/components/ui/feedback";
import { nepalNowKey } from "@/lib/booking/rules";
import { availableActions, bookingPhase, type BookingPhase } from "@/lib/booking/transitions";
import { listStudioBookings, type StudioBookingDTO } from "@/lib/data/bookings";
import { requireStudio } from "@/lib/data/dashboard";
import { formatDate, formatDay, formatTime, formatTimeRange } from "@/lib/format";
import { formatMoney } from "@/lib/money";

export const metadata = { title: "Bookings" };

type Row = { b: StudioBookingDTO; phase: BookingPhase };

/** Tabs match on the stored status AND the booking's time (expiry is derived). */
const TABS: { value: string; label: string; match: (r: Row) => boolean }[] = [
  { value: "", label: "All", match: () => true },
  { value: "pending", label: "Pending", match: (r) => r.b.bookingStatus === "pending" && r.phase === "upcoming" },
  { value: "confirmed", label: "Confirmed", match: (r) => r.b.bookingStatus === "confirmed" },
  { value: "completed", label: "Completed", match: (r) => r.b.bookingStatus === "completed" },
  { value: "cancelled", label: "Cancelled", match: (r) => r.b.bookingStatus === "cancelled_by_customer" || r.b.bookingStatus === "cancelled_by_studio" },
  { value: "declined", label: "Declined", match: (r) => r.b.bookingStatus === "declined" },
  { value: "expired", label: "Expired", match: (r) => r.phase === "expired" },
];

/** Sessions to complete first, then upcoming (soonest first), then history (latest first). */
const RANK: Record<BookingPhase, number> = { needs_completion: 0, upcoming: 1, expired: 2, past: 2 };
function order(x: Row, y: Row) {
  if (RANK[x.phase] !== RANK[y.phase]) return RANK[x.phase] - RANK[y.phase];
  const key = (r: Row) => `${r.b.shootDate}${r.b.startTime}`;
  return RANK[x.phase] < 2 ? key(x).localeCompare(key(y)) : key(y).localeCompare(key(x));
}

export default async function StudioBookingsPage({ searchParams }: PageProps<"/dashboard/bookings">) {
  const { user, studio } = await requireStudio("/dashboard/bookings");
  const bookings = await listStudioBookings(studio.id, user.uid);
  const now = nepalNowKey();
  const rows: Row[] = bookings.map((b) => ({ b, phase: bookingPhase(b, now) }));
  const sp = await searchParams;
  const tab = TABS.find((t) => t.value === sp.status) ?? TABS[0];
  const shown = rows.filter(tab.match).sort(order);
  const count = (t: (typeof TABS)[number]) => rows.filter(t.match).length;
  const toComplete = rows.filter((r) => r.phase === "needs_completion").length;

  return (
    <>
      <PageHeader
        title="Bookings"
        description="Confirm or decline requests, then mark sessions completed. Confirmed times are reserved for the customer."
      />
      {toComplete > 0 && (
        <div className="mb-4">
          <Alert tone="warning" title={`${toComplete} session${toComplete === 1 ? "" : "s"} to mark completed`}>
            These confirmed sessions have started.{" "}
            <Link href="/dashboard/bookings?status=confirmed" className="font-medium underline">
              Mark them completed
            </Link>{" "}
            once they&apos;re done, or cancel any that didn&apos;t take place.
          </Alert>
        </div>
      )}
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
            {tab.value ? `No ${tab.label.toLowerCase()} bookings.` : "No bookings yet. Requests appear here when customers book from your studio page."}
          </p>
        </Card>
      ) : (
        <ul className="space-y-3">
          {shown.map(({ b, phase }) => {
            const actions = availableActions(b.bookingStatus, "studio", { shootDate: b.shootDate, startTime: b.startTime, now });
            return (
              <li key={b.id} data-booking={b.id} className="rounded-xl border border-neutral-200 bg-white p-4 shadow-xs sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-neutral-900">{b.customerName}</p>
                    <p className="text-sm text-neutral-600">{b.packageName}</p>
                  </div>
                  <BookingStatusPill status={b.bookingStatus} expired={phase === "expired"} />
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
                    {b.bookingStatus === "confirmed" && phase === "upcoming" && (
                      <p className="text-xs text-neutral-500">
                        Can be marked completed from {formatDay(b.shootDate)}, {formatTime(b.startTime)}.
                      </p>
                    )}
                    {phase === "expired" && (
                      <p className="text-xs text-neutral-500">Expired — the requested time passed without a reply.</p>
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
