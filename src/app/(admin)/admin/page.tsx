import Link from "next/link";

import { icons } from "@/components/admin/icons";
import { EmptyState, Panel, StatCard } from "@/components/admin/ui";
import { requireUser } from "@/lib/auth/current-user";
import { getMarketplaceStats, getRecentActivity, type ActivityItem } from "@/lib/data/admin";
import { greeting, timeAgo, todayLabel } from "@/lib/format";
import { DEFAULT_COMMISSION_RATE_BPS, formatMoney } from "@/lib/money";

export const metadata = { title: "Dashboard" };

const ACTIVITY_ICON: Record<ActivityItem["kind"], keyof typeof icons> = {
  application: "applications",
  review: "photographers",
  customer: "customers",
  studio_created: "studios",
  studio_updated: "studios",
  booking: "bookings",
};

export default async function AdminDashboard() {
  const user = await requireUser("admin", "/admin");
  const [stats, activity] = await Promise.all([getMarketplaceStats(), getRecentActivity(8)]);
  const firstName = user.displayName?.split(" ")[0];
  const noBookings = stats.bookings.total === 0;

  const loop = [
    { label: "Applications pending", value: stats.applications.pending, href: "/admin/applications?status=pending" },
    { label: "Photographers approved", value: stats.photographers, href: "/admin/photographers" },
    { label: "Studios in draft", value: stats.studios.draft + stats.studios.pending_review, href: "/admin/studios?status=draft" },
    { label: "Studios published", value: stats.studios.published, href: "/admin/studios?status=published" },
    { label: "Bookings", value: stats.bookings.total, href: "/admin/bookings" },
    { label: "Completed", value: stats.bookings.completed, href: "/admin/bookings?status=completed" },
  ];

  return (
    <div className="space-y-8">
      <header>
        <p className="text-sm font-medium text-brand-600">{todayLabel()}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
          {greeting()}, {firstName ?? "Admin"}
        </h1>
        <p className="mt-1 text-sm text-neutral-500">Manage the TasbirGhar photography marketplace.</p>
      </header>

      {stats.applications.pending > 0 && (
        <Link
          href="/admin/applications?status=pending"
          className="flex items-center justify-between gap-4 rounded-2xl border border-brand-200 bg-brand-50 px-5 py-4 text-sm transition-colors hover:bg-brand-100"
        >
          <span className="flex items-center gap-3 text-brand-700">
            {icons.applications}
            <span>
              <strong className="font-semibold">{stats.applications.pending}</strong> photographer
              {stats.applications.pending === 1 ? " application is" : " applications are"} waiting for your review.
            </span>
          </span>
          <span className="text-brand-700">{icons.arrowRight}</span>
        </Link>
      )}

      <section aria-label="Key metrics" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total studios" value={stats.studios.total} hint={`${stats.studios.published} published · ${stats.verifiedStudios} verified`} href="/admin/studios" />
        <StatCard label="Pending applications" value={stats.applications.pending} hint={`${stats.applications.approved} approved · ${stats.applications.rejected} rejected`} href="/admin/applications?status=pending" />
        <StatCard label="Total photographers" value={stats.photographers} hint="Approved photographer accounts" href="/admin/photographers" />
        <StatCard label="Customers" value={stats.customers} hint="Registered customer accounts" href="/admin/customers" />
        <StatCard label="Bookings" value={noBookings ? "0" : stats.bookings.total} hint={noBookings ? "No bookings yet" : `${stats.bookings.pending} awaiting confirmation`} href="/admin/bookings" />
        <StatCard label="Gross booking value" value={formatMoney(stats.money.bookingValue)} hint={noBookings ? "No bookings yet" : "Confirmed + completed bookings"} href="/admin/commission" />
        <StatCard label="TasbirGhar commission" value={formatMoney(stats.money.commission)} hint={noBookings ? "No bookings yet" : "Earned on completed bookings"} href="/admin/commission" accent />
        <StatCard label="Default commission" value={`${DEFAULT_COMMISSION_RATE_BPS / 100}%`} hint={`${DEFAULT_COMMISSION_RATE_BPS} basis points`} href="/admin/commission" />
      </section>

      <div className="grid gap-6 xl:grid-cols-5">
        <Panel
          title="Marketplace overview"
          description="From photographer application to completed booking."
          className="xl:col-span-3"
          bodyClassName="p-0"
        >
          <ol className="grid sm:grid-cols-2 lg:grid-cols-3">
            {loop.map((step, i) => (
              <li key={step.label} className="border-b border-neutral-100 sm:[&:nth-child(odd)]:border-r lg:border-r lg:[&:nth-child(3n)]:border-r-0">
                <Link href={step.href} className="block px-5 py-4 transition-colors hover:bg-cream/60">
                  <span className="text-xs font-medium text-neutral-400">Step {i + 1}</span>
                  <span className="mt-1 flex items-baseline justify-between gap-2">
                    <span className="text-sm text-neutral-600">{step.label}</span>
                    <span className="text-xl font-semibold text-ink">{step.value}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
          <dl className="grid gap-4 px-5 py-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-neutral-500">Suspended studios</dt>
              <dd className="mt-0.5 font-semibold text-ink">{stats.studios.suspended}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Booking value</dt>
              <dd className="mt-0.5 font-semibold text-ink">{formatMoney(stats.money.bookingValue)}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Commission earned</dt>
              <dd className="mt-0.5 font-semibold text-brand-700">{formatMoney(stats.money.commission)}</dd>
            </div>
          </dl>
        </Panel>

        <Panel
          title="Recent activity"
          description="Derived from record timestamps"
          className="xl:col-span-2"
          bodyClassName="p-0"
        >
          {activity.length === 0 ? (
            <EmptyState title="No activity yet" icon="dashboard">
              Sign-ups, applications and studio updates will appear here as they happen.
            </EmptyState>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {activity.map((item) => {
                const body = (
                  <>
                    <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-cream text-brand-600 ring-1 ring-brand-100">
                      {icons[ACTIVITY_ICON[item.kind]]}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-ink">{item.title}</span>
                      <span className="block truncate text-sm text-neutral-500">{item.detail}</span>
                    </span>
                    <time dateTime={item.at} className="shrink-0 text-xs text-neutral-400">
                      {timeAgo(item.at)}
                    </time>
                  </>
                );
                return (
                  <li key={item.id}>
                    {item.href ? (
                      <Link href={item.href} className="flex gap-3 px-5 py-3.5 transition-colors hover:bg-cream/60">
                        {body}
                      </Link>
                    ) : (
                      <div className="flex gap-3 px-5 py-3.5">{body}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
