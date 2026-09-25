import Link from "next/link";

import { BOOKING_STATUS, PAYMENT_STATUS, pageParam, param, withParams } from "@/components/admin/status";
import { AdminPageHeader, DataTable, EmptyState, FilterBar, Pagination, Panel, StatusPill } from "@/components/admin/ui";
import { requireUser } from "@/lib/auth/current-user";
import { nepalNowKey } from "@/lib/booking/rules";
import { isExpiredPending } from "@/lib/booking/transitions";
import { listBookingsAdmin, type AdminBookingRow } from "@/lib/data/admin";
import { formatDate } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import type { BookingStatus } from "@/types/models";

export const metadata = { title: "Bookings" };

const TABS: { value: BookingStatus | ""; label: string }[] = [
  { value: "", label: "All" },
  { value: "pending", label: "Requested" },
  { value: "confirmed", label: "Confirmed" },
  { value: "completed", label: "Completed" },
  { value: "cancelled_by_customer", label: "Cancelled by customer" },
  { value: "cancelled_by_studio", label: "Cancelled by studio" },
  { value: "declined", label: "Declined" },
];

export default async function BookingsPage({ searchParams }: PageProps<"/admin/bookings">) {
  await requireUser("admin", "/admin/bookings");
  const sp = await searchParams;
  const status = (Object.keys(BOOKING_STATUS) as BookingStatus[]).find((s) => s === param(sp, "status")) ?? "";
  const q = param(sp, "q");
  const result = await listBookingsAdmin({ status, q, page: pageParam(sp) });
  const now = nepalNowKey();

  return (
    <>
      <AdminPageHeader
        title="Bookings"
        description="Every booking with its commission split. Amounts are computed and stored server-side at booking time."
      />
      <Panel bodyClassName="p-0">
        <FilterBar
          action="/admin/bookings"
          tabs={{ name: "status", value: status, keep: q ? { q } : {}, options: TABS }}
          search={{ name: "q", value: q, placeholder: "Search booking ID, customer, studio…" }}
        />
        {result.total === 0 ? (
          <EmptyState title="No bookings yet" icon="bookings">
            {status || q
              ? "No bookings match these filters."
              : "Bookings appear here as soon as customers request a session with a published studio."}
          </EmptyState>
        ) : (
          <>
            <DataTable<AdminBookingRow>
              caption="Bookings"
              rows={result.items}
              rowKey={(b) => b.id}
              columns={[
                {
                  header: "Booking",
                  cell: (b) => (
                    <span className="block min-w-0">
                      <span className="block font-mono text-xs text-neutral-500">{b.id}</span>
                      <span className="block font-medium text-ink">{b.customerName}</span>
                    </span>
                  ),
                },
                {
                  header: "Studio / package",
                  cell: (b) => (
                    <span className="block min-w-0 text-sm">
                      <Link href={`/admin/studios/${b.studioId}`} className="block font-medium text-brand-700 hover:underline">
                        {b.studioName}
                      </Link>
                      <span className="block text-neutral-500">{b.packageName}</span>
                    </span>
                  ),
                },
                { header: "Shoot date", cell: (b) => `${formatDate(b.shootDate)} · ${b.startTime}`, className: "whitespace-nowrap" },
                { header: "Amount", cell: (b) => <span className="font-medium whitespace-nowrap">{formatMoney(b.grossAmount)}</span> },
                {
                  header: "Commission",
                  cell: (b) => (
                    <span className="whitespace-nowrap text-brand-700">
                      {formatMoney(b.commissionAmount)} <span className="text-xs text-neutral-400">({b.commissionRateBps / 100}%)</span>
                    </span>
                  ),
                },
                { header: "Payout", cell: (b) => <span className="whitespace-nowrap">{formatMoney(b.photographerNetAmount)}</span> },
                {
                  header: "Status",
                  cell: (b) => (
                    <span className="flex flex-wrap gap-1">
                      {isExpiredPending(b, now) ? (
                        <StatusPill tone="neutral">Expired</StatusPill>
                      ) : (
                        <StatusPill tone={BOOKING_STATUS[b.bookingStatus].tone}>{BOOKING_STATUS[b.bookingStatus].label}</StatusPill>
                      )}
                      <StatusPill tone={PAYMENT_STATUS[b.paymentStatus].tone}>{PAYMENT_STATUS[b.paymentStatus].label}</StatusPill>
                    </span>
                  ),
                },
              ]}
            />
            <Pagination page={result.page} pageCount={result.pageCount} total={result.total} hrefFor={(page) => withParams("/admin/bookings", { status, q }, { page })} />
          </>
        )}
      </Panel>
    </>
  );
}
