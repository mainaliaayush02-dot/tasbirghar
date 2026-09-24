import Link from "next/link";

import { BOOKING_STATUS } from "@/components/admin/status";
import { AdminPageHeader, Panel, StatCard } from "@/components/admin/ui";
import { requireUser } from "@/lib/auth/current-user";
import { getCommissionOverview } from "@/lib/data/admin";
import { calculateCommission, formatMoney, toMinorUnits } from "@/lib/money";

export const metadata = { title: "Commission" };

export default async function CommissionPage() {
  await requireUser("admin", "/admin/commission");
  const overview = await getCommissionOverview();
  const completed = overview.byStatus.find((s) => s.status === "completed")!;
  const confirmed = overview.byStatus.find((s) => s.status === "confirmed")!;
  const totalBookings = overview.byStatus.reduce((n, s) => n + s.count, 0);
  // Worked example, computed with the same server-side money module bookings use.
  const example = calculateCommission(toMinorUnits(15_000), overview.defaultRateBps);

  return (
    <>
      <AdminPageHeader
        title="Commission"
        description="TasbirGhar earns a commission on every completed booking. Amounts are stored in paisa and computed on the server."
      />

      <section aria-label="Commission totals" className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Commission earned" value={formatMoney(completed.commission)} hint={totalBookings ? "Completed bookings" : "No bookings yet"} accent />
        <StatCard label="Completed booking value" value={formatMoney(completed.gross)} hint={`${completed.count} completed`} />
        <StatCard label="Photographer payouts" value={formatMoney(completed.net)} hint="Owed on completed bookings" />
        <StatCard label="Upcoming commission" value={formatMoney(confirmed.commission)} hint={`${confirmed.count} confirmed, not yet completed`} />
      </section>

      <div className="grid gap-6 lg:grid-cols-5">
        <Panel title="How commission works" className="lg:col-span-2">
          <p className="text-sm text-neutral-600">
            Default rate: <strong className="text-ink">{overview.defaultRateBps / 100}%</strong> ({overview.defaultRateBps} basis points).
            The rate is copied onto each booking when it is created, so later changes never alter past bookings.
          </p>
          <dl className="mt-5 divide-y divide-neutral-100 rounded-xl border border-neutral-200 text-sm">
            <div className="flex justify-between px-4 py-3">
              <dt className="text-neutral-600">Package price</dt>
              <dd className="font-medium text-ink">{formatMoney(example.grossAmount)}</dd>
            </div>
            <div className="flex justify-between px-4 py-3">
              <dt className="text-neutral-600">TasbirGhar commission ({example.commissionRateBps / 100}%)</dt>
              <dd className="font-medium text-brand-700">{formatMoney(example.commissionAmount)}</dd>
            </div>
            <div className="flex justify-between bg-cream/60 px-4 py-3">
              <dt className="text-neutral-600">Photographer receives</dt>
              <dd className="font-semibold text-ink">{formatMoney(example.photographerNetAmount)}</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-neutral-500">
            Stored as {example.grossAmount.toLocaleString("en-IN")} paisa − {example.commissionAmount.toLocaleString("en-IN")} ={" "}
            {example.photographerNetAmount.toLocaleString("en-IN")} paisa.
          </p>
        </Panel>

        <Panel title="By booking status" className="lg:col-span-3" bodyClassName="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <caption className="sr-only">Commission by booking status</caption>
              <thead>
                <tr className="border-b border-neutral-100 text-xs tracking-wide text-neutral-500 uppercase">
                  <th scope="col" className="px-5 py-3 font-medium">Status</th>
                  <th scope="col" className="px-5 py-3 text-right font-medium">Bookings</th>
                  <th scope="col" className="px-5 py-3 text-right font-medium">Value</th>
                  <th scope="col" className="px-5 py-3 text-right font-medium">Commission</th>
                  <th scope="col" className="px-5 py-3 text-right font-medium">Payout</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {overview.byStatus.map((s) => (
                  <tr key={s.status}>
                    <td className="px-5 py-3 text-ink">{BOOKING_STATUS[s.status].label}</td>
                    <td className="px-5 py-3 text-right">{s.count}</td>
                    <td className="px-5 py-3 text-right whitespace-nowrap">{formatMoney(s.gross)}</td>
                    <td className="px-5 py-3 text-right whitespace-nowrap text-brand-700">{formatMoney(s.commission)}</td>
                    <td className="px-5 py-3 text-right whitespace-nowrap">{formatMoney(s.net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalBookings === 0 && (
            <p className="border-t border-neutral-100 px-5 py-3 text-sm text-neutral-500">No bookings yet — all totals are Rs. 0.</p>
          )}
        </Panel>

        <Panel title="Per-studio rates" description="Negotiated overrides of the default rate" className="lg:col-span-5">
          {overview.overrides.length === 0 ? (
            <p className="text-sm text-neutral-500">
              All studios use the default {overview.defaultRateBps / 100}% rate. Per-studio overrides can only be set
              server-side and are not editable from the browser.
            </p>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {overview.overrides.map((o) => (
                <li key={o.id} className="flex justify-between py-2 text-sm">
                  <Link href={`/admin/studios/${o.id}`} className="text-brand-700 hover:underline">
                    {o.businessName}
                  </Link>
                  <span>{o.rateBps / 100}%</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
