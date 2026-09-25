import Link from "next/link";
import { notFound } from "next/navigation";

import { BookingActions } from "@/components/bookings/booking-ui";
import { BookingStatusPill, CUSTOMER_STATUS_COPY } from "@/components/bookings/booking-status";
import { Alert, Card, PageHeader } from "@/components/ui/feedback";
import { requireUser } from "@/lib/auth/current-user";
import { nepalToday } from "@/lib/booking/rules";
import { availableActions } from "@/lib/booking/transitions";
import { getCustomerBooking } from "@/lib/data/bookings";
import { formatDate, formatDay, formatTimeRange } from "@/lib/format";
import { formatMoney } from "@/lib/money";

export const metadata = { title: "Booking" };

export default async function BookingDetailPage({ params, searchParams }: PageProps<"/account/bookings/[bookingId]">) {
  const { bookingId } = await params;
  const user = await requireUser("account", `/account/bookings/${bookingId}`);
  const booking = await getCustomerBooking(user.uid, bookingId);
  if (!booking) notFound();
  // The "request sent" banner only while the request is still pending.
  const created = (await searchParams).created === "1" && booking.bookingStatus === "pending";
  const status = CUSTOMER_STATUS_COPY[booking.bookingStatus];
  const actions = availableActions(booking.bookingStatus, "customer", { shootDate: booking.shootDate, today: nepalToday() });

  return (
    <main className="space-y-6">
      <Link href="/account/bookings" className="text-sm text-neutral-500 hover:text-neutral-900">
        ← My bookings
      </Link>
      <PageHeader title={booking.studio.businessName} description={booking.packageName} actions={<BookingStatusPill status={booking.bookingStatus} />} />

      {created ? (
        <Alert tone="success" title="Booking request sent">
          {booking.studio.businessName} has received your request and will confirm it. You&apos;ll see the status change here.
        </Alert>
      ) : (
        <Alert tone={status.tone} title={status.title}>
          {status.body}
        </Alert>
      )}

      <Card title="Details">
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-neutral-500">Date</dt>
            <dd className="mt-0.5 font-medium text-neutral-900">{formatDay(booking.shootDate, "long")}</dd>
          </div>
          <div>
            <dt className="text-neutral-500">Time</dt>
            <dd className="mt-0.5 font-medium text-neutral-900">
              {formatTimeRange(booking.startTime, booking.endTime)} (Nepal time)
            </dd>
          </div>
          <div>
            <dt className="text-neutral-500">Package price</dt>
            <dd className="mt-0.5 font-medium text-neutral-900">{formatMoney(booking.price)}</dd>
          </div>
          <div>
            <dt className="text-neutral-500">Payment</dt>
            <dd className="mt-0.5 text-neutral-900">Not taken online — arrange with the studio</dd>
          </div>
          <div>
            <dt className="text-neutral-500">Contact on booking</dt>
            <dd className="mt-0.5 text-neutral-900">
              {booking.customerName} · {booking.customerPhone}
            </dd>
          </div>
          <div>
            <dt className="text-neutral-500">Requested</dt>
            <dd className="mt-0.5 text-neutral-900">{formatDate(booking.createdAt, true)}</dd>
          </div>
          <div>
            <dt className="text-neutral-500">Booking ID</dt>
            <dd className="mt-0.5 font-mono text-xs break-all text-neutral-900">{booking.id}</dd>
          </div>
          {booking.customerNote && (
            <div className="sm:col-span-2">
              <dt className="text-neutral-500">Your note</dt>
              <dd className="mt-0.5 whitespace-pre-line text-neutral-900">{booking.customerNote}</dd>
            </div>
          )}
        </dl>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-neutral-100 pt-4">
          <Link href={`/photographers/${booking.studio.slug}`} className="text-sm font-medium text-brand-700 hover:underline">
            View studio
          </Link>
          {actions.length > 0 && <BookingActions bookingId={booking.id} actions={actions} />}
          {booking.bookingStatus === "confirmed" && (
            <p className="text-sm text-neutral-500">
              Need to change or cancel a confirmed booking?{" "}
              <Link href="/contact" className="font-medium text-brand-700 hover:underline">Contact TasbirGhar</Link>
            </p>
          )}
        </div>
      </Card>
    </main>
  );
}
