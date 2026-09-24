import { BookingActions } from "@/components/bookings/booking-ui";
import { BookingStatusPill } from "@/components/bookings/booking-status";
import { Card, PageHeader } from "@/components/ui/feedback";
import { nepalToday } from "@/lib/booking/rules";
import { listStudioBookings } from "@/lib/data/bookings";
import { requireStudio } from "@/lib/data/dashboard";
import { formatDate } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import type { BookingAction } from "@/lib/validation/schemas";

export const metadata = { title: "Bookings" };

export default async function StudioBookingsPage() {
  const { user, studio } = await requireStudio("/dashboard/bookings");
  const bookings = await listStudioBookings(studio.id, user.uid);
  const today = nepalToday();
  const requested = bookings.filter((b) => b.bookingStatus === "pending");
  const rest = bookings.filter((b) => b.bookingStatus !== "pending");

  const actionsFor = (status: string, shootDate: string): BookingAction[] =>
    status === "pending" ? ["decline", "confirm"] : status === "confirmed" && shootDate <= today ? ["complete"] : [];

  const Row = ({ b }: { b: (typeof bookings)[number] }) => (
    <li className="flex flex-col gap-4 py-5 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold text-neutral-900">{b.customerName}</p>
          <BookingStatusPill status={b.bookingStatus} />
        </div>
        <p className="mt-1 text-sm text-neutral-600">
          {b.packageName} · {formatDate(b.shootDate)} · {b.startTime}–{b.endTime}
        </p>
        <p className="mt-1 text-sm text-neutral-500">
          {b.customerPhone}
          {b.customerNote ? ` · “${b.customerNote}”` : ""}
        </p>
        <p className="mt-1 text-xs text-neutral-500">
          Price {formatMoney(b.price)} · your payout {formatMoney(b.photographerNetAmount)} after {formatMoney(b.commissionAmount)} TasbirGhar commission
        </p>
      </div>
      <BookingActions bookingId={b.id} actions={actionsFor(b.bookingStatus, b.shootDate)} />
    </li>
  );

  return (
    <>
      <PageHeader title="Bookings" description="Confirm or decline requests. Confirmed times are reserved for the customer." />
      <div className="space-y-6">
        <Card title="New requests" description={requested.length ? `${requested.length} waiting for your reply` : undefined}>
          {requested.length ? (
            <ul className="-my-5 divide-y divide-neutral-100">{requested.map((b) => <Row key={b.id} b={b} />)}</ul>
          ) : (
            <p className="text-sm text-neutral-500">No new requests. Requests appear here when customers book from your studio page.</p>
          )}
        </Card>
        <Card title="All bookings">
          {rest.length ? (
            <ul className="-my-5 divide-y divide-neutral-100">{rest.map((b) => <Row key={b.id} b={b} />)}</ul>
          ) : (
            <p className="text-sm text-neutral-500">No bookings yet.</p>
          )}
        </Card>
      </div>
    </>
  );
}
