import Link from "next/link";

import { ButtonLink } from "@/components/ui/button";
import { Alert, Badge, Card, PageHeader } from "@/components/ui/feedback";
import { requireUser } from "@/lib/auth/current-user";
import { nepalNowKey } from "@/lib/booking/rules";
import { bookingPhase } from "@/lib/booking/transitions";
import { listStudioBookings } from "@/lib/data/bookings";
import { LISTING_LABEL, VERIFICATION_LABEL } from "@/lib/data/dashboard";
import { getOwnedStudio, listGallery, listPackages } from "@/lib/data/studios";
import { formatMoney } from "@/lib/money";

export const metadata = { title: "Dashboard" };

export default async function DashboardOverview() {
  const user = await requireUser("dashboard", "/dashboard");
  const studio = await getOwnedStudio(user.uid);

  if (!studio) {
    return (
      <>
        <PageHeader title="Welcome to TasbirGhar" description="You're approved as a photographer." />
        <Card title="Create your studio">
          <p className="text-sm text-neutral-600">
            Set up your studio profile to start building your portfolio and packages. It stays a
            private draft until our team reviews it.
          </p>
          <ButtonLink href="/dashboard/studio" className="mt-4">
            Create studio
          </ButtonLink>
        </Card>
      </>
    );
  }

  const [gallery, packages, bookings] = await Promise.all([
    listGallery(studio.id),
    listPackages(studio.id),
    listStudioBookings(studio.id, user.uid),
  ]);
  // Dashboard prompts (derived from bookings — no stored reminders).
  const now = nepalNowKey();
  const toReply = bookings.filter((b) => b.bookingStatus === "pending" && bookingPhase(b, now) === "upcoming").length;
  const toComplete = bookings.filter((b) => bookingPhase(b, now) === "needs_completion").length;
  const activePackages = packages.filter((p) => p.isActive);

  const checklist = [
    { done: true, label: "Create studio profile", href: "/dashboard/studio" },
    { done: Boolean(studio.profileImage), label: "Add a profile photo / logo", href: "/dashboard/studio" },
    { done: Boolean(studio.coverImage), label: "Add a cover image", href: "/dashboard/studio" },
    { done: studio.portfolioCount >= 6, label: `Upload at least 6 portfolio photos (${studio.portfolioCount}/6)`, href: "/dashboard/portfolio" },
    { done: gallery.length > 0, label: "Show your studio space", href: "/dashboard/gallery" },
    { done: activePackages.length > 0, label: "Create an active package", href: "/dashboard/packages" },
  ];
  const completed = checklist.filter((c) => c.done).length;
  const listing = LISTING_LABEL[studio.listingStatus];
  const verification = VERIFICATION_LABEL[studio.verificationStatus];

  return (
    <>
      <PageHeader
        title={studio.businessName}
        description={`tasbirghar.com/photographers/${studio.slug}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Badge tone={listing.tone}>{listing.label}</Badge>
            <Badge tone={verification.tone}>{verification.label}</Badge>
          </div>
        }
      />

      {(toReply > 0 || toComplete > 0) && (
        <div className="mb-6">
          <Alert tone="warning" title="Needs your attention">
            <ul className="mt-1 space-y-1">
              {toReply > 0 && (
                <li>
                  <Link href="/dashboard/bookings?status=pending" className="font-medium underline">
                    {toReply} booking request{toReply === 1 ? "" : "s"} waiting for your reply
                  </Link>
                </li>
              )}
              {toComplete > 0 && (
                <li>
                  <Link href="/dashboard/bookings?status=confirmed" className="font-medium underline">
                    {toComplete} session{toComplete === 1 ? "" : "s"} to mark completed
                  </Link>
                </li>
              )}
            </ul>
          </Alert>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Portfolio photos", value: studio.portfolioCount },
          { label: "Active packages", value: activePackages.length },
          {
            label: "Starting price",
            value: studio.startingPrice === null ? "—" : formatMoney(studio.startingPrice),
          },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl border border-neutral-200 bg-white p-5">
            <p className="text-sm text-neutral-500">{stat.label}</p>
            <p className="mt-1 text-2xl font-semibold text-neutral-900">{stat.value}</p>
          </div>
        ))}
      </div>

      <Card
        className="mt-6"
        title="Get your studio ready"
        description={`${completed} of ${checklist.length} complete`}
      >
        <div className="mb-4 h-2 overflow-hidden rounded-full bg-neutral-100">
          <div
            className="h-full rounded-full bg-brand-500 transition-all"
            style={{ width: `${(completed / checklist.length) * 100}%` }}
          />
        </div>
        <ul className="divide-y divide-neutral-100">
          {checklist.map((item) => (
            <li key={item.label} className="flex items-center justify-between gap-4 py-3">
              <span className="flex items-center gap-3 text-sm">
                <span
                  aria-hidden
                  className={`grid size-5 place-items-center rounded-full text-xs ${
                    item.done ? "bg-emerald-500 text-white" : "border border-neutral-300"
                  }`}
                >
                  {item.done ? "✓" : ""}
                </span>
                <span className={item.done ? "text-neutral-500 line-through" : "text-neutral-800"}>
                  {item.label}
                </span>
              </span>
              {!item.done && (
                <Link href={item.href} className="text-sm font-medium text-brand-700 hover:underline">
                  Start
                </Link>
              )}
            </li>
          ))}
        </ul>
        {studio.listingStatus === "draft" && (
          <p className="mt-4 text-sm text-neutral-500">
            Your studio is a private draft. Once your profile is complete, our team will review it
            before it appears on TasbirGhar.
          </p>
        )}
      </Card>
    </>
  );
}
