import Link from "next/link";

import { BookingStatusPill } from "@/components/bookings/booking-status";
import { ButtonLink } from "@/components/ui/button";
import { Card, PageHeader } from "@/components/ui/feedback";
import { requireUser } from "@/lib/auth/current-user";
import { listCustomerBookings } from "@/lib/data/bookings";
import { formatDate } from "@/lib/format";
import { formatMoney } from "@/lib/money";

export const metadata = { title: "My bookings" };

export default async function MyBookingsPage() {
  const user = await requireUser("account", "/account/bookings");
  const bookings = await listCustomerBookings(user.uid);

  return (
    <main className="space-y-6">
      <PageHeader
        title="My bookings"
        description="Your booking requests and confirmed sessions."
        actions={<ButtonLink href="/photographers" variant="secondary">Find photographers</ButtonLink>}
      />
      {bookings.length === 0 ? (
        <Card>
          <div className="py-8 text-center">
            <p className="font-medium text-neutral-900">No bookings yet</p>
            <p className="mt-1 text-sm text-neutral-500">When you request a booking with a studio, it will appear here.</p>
            <ButtonLink href="/photographers" className="mt-5">Browse photographers</ButtonLink>
          </div>
        </Card>
      ) : (
        <ul className="space-y-3">
          {bookings.map((b) => (
            <li key={b.id}>
              <Link href={`/account/bookings/${b.id}`} className="block rounded-xl border border-neutral-200 bg-white p-5 transition-shadow hover:shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-neutral-900">{b.studio.businessName}</p>
                    <p className="text-sm text-neutral-500">{b.packageName}</p>
                  </div>
                  <BookingStatusPill status={b.bookingStatus} />
                </div>
                <div className="mt-3 flex flex-wrap justify-between gap-2 text-sm text-neutral-600">
                  <span>
                    {formatDate(b.shootDate)} · {b.startTime}–{b.endTime}
                  </span>
                  <span className="font-medium text-neutral-900">{formatMoney(b.price)}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
