import Link from "next/link";

import { BookingStatusPill, customerCopy } from "@/components/bookings/booking-status";
import { ButtonLink } from "@/components/ui/button";
import { Alert, Card, PageHeader } from "@/components/ui/feedback";
import { requireUser } from "@/lib/auth/current-user";
import { nepalNowKey, nowMs } from "@/lib/booking/rules";
import { bookingPhase, type BookingPhase } from "@/lib/booking/transitions";
import { reviewEligibility } from "@/lib/reviews/rules";
import { listCustomerBookings, type CustomerBookingDTO } from "@/lib/data/bookings";
import { formatDate, formatDay, formatTimeRange } from "@/lib/format";
import { formatMoney } from "@/lib/money";

export const metadata = { title: "My bookings" };

const ACCENT: Record<string, string> = {
  warning: "border-l-amber-400",
  success: "border-l-emerald-500",
  info: "border-l-sky-500",
  neutral: "border-l-neutral-300",
  danger: "border-l-red-400",
};

const canReview = (b: CustomerBookingDTO, nowMs: number) =>
  reviewEligibility(
    { bookingStatus: b.bookingStatus, completedAtMs: b.completedAt ? Date.parse(b.completedAt) : null, reviewed: Boolean(b.reviewedAt) },
    nowMs,
  ).ok;

function BookingCard({ b, phase, reviewable = false }: { b: CustomerBookingDTO; phase: BookingPhase; reviewable?: boolean }) {
  const copy = customerCopy(b.bookingStatus, phase);
  return (
    <li>
      <Link
        href={`/account/bookings/${b.id}`}
        className={`block rounded-xl border border-l-4 border-neutral-200 bg-white p-5 transition-shadow hover:shadow-sm ${ACCENT[copy.tone]}`}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-neutral-900">{copy.title}</p>
            <p className="mt-1 font-semibold text-neutral-900">{b.studio.businessName}</p>
            <p className="text-sm text-neutral-500">{b.packageName}</p>
          </div>
          <BookingStatusPill status={b.bookingStatus} expired={phase === "expired"} />
        </div>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-2 text-sm">
          <span className="text-neutral-700">
            <span className="block font-medium text-neutral-900">{formatDay(b.shootDate, "long")}</span>
            {formatTimeRange(b.startTime, b.endTime)}
          </span>
          <span className="font-display text-lg text-neutral-900">{formatMoney(b.price)}</span>
        </div>
        <p className="mt-3 text-xs text-neutral-500">
          <span className="font-mono break-all">#{b.id}</span> · requested {formatDate(b.createdAt)}
        </p>
        {reviewable && <p className="mt-2 text-sm font-medium text-brand-700">Leave a review →</p>}
      </Link>
    </li>
  );
}

export default async function MyBookingsPage() {
  const user = await requireUser("account", "/account/bookings");
  const bookings = await listCustomerBookings(user.uid);
  // Upcoming = pending/confirmed whose start time is still ahead (soonest first).
  // Everything else — including expired requests and sessions whose time has
  // passed — is history (latest first).
  const now = nepalNowKey();
  const withPhase = bookings.map((b) => ({ b, phase: bookingPhase(b, now) }));
  const upcoming = withPhase
    .filter((x) => x.phase === "upcoming")
    .sort((x, y) => `${x.b.shootDate}${x.b.startTime}`.localeCompare(`${y.b.shootDate}${y.b.startTime}`));
  const past = withPhase.filter((x) => x.phase !== "upcoming");
  // Dashboard prompt (derived — no stored reminders): completed sessions still open for review.
  const requestMs = nowMs();
  const toReview = bookings.filter((b) => canReview(b, requestMs));

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
        <>
          {toReview.length > 0 && (
            <Alert tone="info" title={`${toReview.length} session${toReview.length === 1 ? "" : "s"} ready for your review`}>
              Tell other families how it went:{" "}
              {toReview.map((b, i) => (
                <span key={b.id}>
                  {i > 0 && ", "}
                  <Link href={`/account/bookings/${b.id}`} className="font-medium underline">
                    {b.studio.businessName}
                  </Link>
                </span>
              ))}
              .
            </Alert>
          )}
          {upcoming.length > 0 && (
            <section aria-labelledby="upcoming">
              <h2 id="upcoming" className="mb-3 text-sm font-semibold tracking-wide text-neutral-500 uppercase">Upcoming</h2>
              <ul className="space-y-3">{upcoming.map((x) => <BookingCard key={x.b.id} b={x.b} phase={x.phase} />)}</ul>
            </section>
          )}
          {past.length > 0 && (
            <section aria-labelledby="history">
              <h2 id="history" className="mb-3 text-sm font-semibold tracking-wide text-neutral-500 uppercase">History</h2>
              <ul className="space-y-3">{past.map((x) => <BookingCard key={x.b.id} b={x.b} phase={x.phase} reviewable={canReview(x.b, requestMs)} />)}</ul>
            </section>
          )}
        </>
      )}
    </main>
  );
}
