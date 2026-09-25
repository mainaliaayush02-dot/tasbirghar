import Link from "next/link";
import { notFound } from "next/navigation";

import { BookingActions } from "@/components/bookings/booking-ui";
import { BookingStatusPill, customerCopy } from "@/components/bookings/booking-status";
import { Alert, Card, PageHeader } from "@/components/ui/feedback";
import { requireUser } from "@/lib/auth/current-user";
import { nepalNowKey, nowMs } from "@/lib/booking/rules";
import { availableActions, bookingPhase } from "@/lib/booking/transitions";
import { ReviewForm } from "@/components/reviews/review-form";
import { getCustomerBooking } from "@/lib/data/bookings";
import { REVIEW_WINDOW_DAYS, reviewEligibility } from "@/lib/reviews/rules";
import { getOwnReview } from "@/lib/reviews/service";
import { formatDate, formatDay, formatTimeRange } from "@/lib/format";
import { formatMoney } from "@/lib/money";

export const metadata = { title: "Booking" };

export default async function BookingDetailPage({ params, searchParams }: PageProps<"/account/bookings/[bookingId]">) {
  const { bookingId } = await params;
  const user = await requireUser("account", `/account/bookings/${bookingId}`);
  const booking = await getCustomerBooking(user.uid, bookingId);
  if (!booking) notFound();
  const now = nepalNowKey();
  const phase = bookingPhase(booking, now);
  // The "request sent" banner only while the request is still open.
  const created = (await searchParams).created === "1" && phase === "upcoming" && booking.bookingStatus === "pending";
  const status = customerCopy(booking.bookingStatus, phase);
  const actions = availableActions(booking.bookingStatus, "customer", { shootDate: booking.shootDate, startTime: booking.startTime, now });
  const review = booking.bookingStatus === "completed" ? await getOwnReview(user.uid, booking.id) : null;
  const completedAtMs = booking.completedAt ? Date.parse(booking.completedAt) : null;
  const eligibility = reviewEligibility(
    { bookingStatus: booking.bookingStatus, completedAtMs, reviewed: Boolean(review || booking.reviewedAt) },
    nowMs(),
  );

  return (
    <main className="space-y-6">
      <Link href="/account/bookings" className="text-sm text-neutral-500 hover:text-neutral-900">
        ← My bookings
      </Link>
      <PageHeader title={booking.studio.businessName} description={booking.packageName} actions={<BookingStatusPill status={booking.bookingStatus} expired={phase === "expired"} />} />

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
          {booking.bookingStatus === "confirmed" && phase === "upcoming" && (
            <p className="text-sm text-neutral-500">
              Need to change or cancel a confirmed booking?{" "}
              <Link href="/contact" className="font-medium text-brand-700 hover:underline">Contact TasbirGhar</Link>
            </p>
          )}
        </div>
      </Card>
      {booking.bookingStatus === "completed" && (
        <Card title="Your review" description={review ? undefined : eligibility.ok ? `You can review this session until ${formatDate(new Date(eligibility.closesAtMs).toISOString())}.` : undefined}>
          {review ? (
            <div className="space-y-2" data-own-review>
              <p className="text-lg text-brand-600" aria-label={`${review.rating} out of 5 stars`}>
                {"★".repeat(review.rating)}
                <span className="text-neutral-300">{"★".repeat(5 - review.rating)}</span>
              </p>
              <p className="whitespace-pre-line text-sm text-neutral-800">{review.comment}</p>
              <p className="text-sm text-neutral-500">
                {review.status === "pending_moderation"
                  ? "Thanks! Your review is waiting to be checked by TasbirGhar before it appears on the studio page."
                  : review.status === "published"
                    ? "Published on the studio page."
                    : "This review isn't shown publicly."}{" "}
                Reviews can&apos;t be edited or deleted —{" "}
                <Link href="/contact" className="font-medium text-brand-700 hover:underline">contact TasbirGhar</Link> if something needs correcting.
              </p>
            </div>
          ) : eligibility.ok ? (
            <ReviewForm bookingId={booking.id} studioName={booking.studio.businessName} />
          ) : (
            <p className="text-sm text-neutral-500">
              The review window for this session has closed (reviews can be written up to {REVIEW_WINDOW_DAYS} days after completion).
            </p>
          )}
        </Card>
      )}
    </main>
  );
}
