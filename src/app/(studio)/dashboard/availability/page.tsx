import Link from "next/link";

import { AvailabilityCalendar, LEGEND } from "@/components/availability/calendar";
import { DayEditor } from "@/components/availability/day-editor";
import { buttonClass } from "@/components/ui/button";
import { Card, PageHeader } from "@/components/ui/feedback";
import { addMonths, bookableRange, DEFAULT_CLOSE, DEFAULT_OPEN, isRealDate, MONTH_RE, nepalToday, WEEKDAY_KEYS, WEEKDAY_LABELS } from "@/lib/booking/rules";
import { getStudioCalendar, getWeeklyHours } from "@/lib/booking/service";
import { requireStudio } from "@/lib/data/dashboard";
import { listPackages } from "@/lib/data/studios";
import { describeHours } from "@/lib/format";

export const metadata = { title: "Availability" };

export default async function AvailabilityPage({ searchParams }: PageProps<"/dashboard/availability">) {
  const { studio } = await requireStudio("/dashboard/availability");
  const sp = await searchParams;
  const today = nepalToday();
  const thisMonth = today.slice(0, 7);
  const { min, max } = bookableRange();

  // Month: requested (clamped to 1 month back … the last bookable month).
  const requested = typeof sp.month === "string" && MONTH_RE.test(sp.month) ? sp.month : thisMonth;
  const month = requested < addMonths(thisMonth, -1) ? addMonths(thisMonth, -1) : requested > max.slice(0, 7) ? max.slice(0, 7) : requested;

  const [days, packages, weekly] = await Promise.all([getStudioCalendar(studio.id, month), listPackages(studio.id), getWeeklyHours(studio.id)]);
  const dateParam = typeof sp.date === "string" && isRealDate(sp.date) && sp.date.startsWith(month) ? sp.date : null;
  const selected = dateParam ?? (today.startsWith(month) ? (min.startsWith(month) ? min : today) : `${month}-01`);
  const day = days.find((d) => d.date === selected)!;

  const monthLabel = new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC", month: "long", year: "numeric" });
  const hrefFor = ({ month: m, date }: { month: string; date?: string }) =>
    `/dashboard/availability?month=${m}${date ? `&date=${date}` : ""}`;
  const prev = addMonths(month, -1);
  const next = addMonths(month, 1);
  const canPrev = prev >= addMonths(thisMonth, -1);
  const canNext = next <= max.slice(0, 7);
  const activeDurations = packages.filter((p) => p.isActive).map((p) => p.durationMinutes);

  return (
    <>
      <PageHeader
        title="Availability"
        description="Choose which days and times families can book. Existing bookings always keep their time."
      />
      <Card
        className="mb-6"
        title="Weekly hours"
        description={weekly ? "Your standard hours for each weekday." : `Not set — every day uses ${describeHours({ closed: false, slots: [{ start: DEFAULT_OPEN, end: DEFAULT_CLOSE }] })}.`}
        actions={
          <Link href="/dashboard/availability/weekly" className={buttonClass("secondary", "sm")}>
            {weekly ? "Edit weekly hours" : "Set weekly hours"}
          </Link>
        }
      >
        {weekly ? (
          <dl className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2" data-weekly-summary>
            {WEEKDAY_KEYS.map((k) => (
              <div key={k} className="flex justify-between gap-3">
                <dt className="text-neutral-500">{WEEKDAY_LABELS[k]}</dt>
                <dd className={`text-right ${weekly[k].closed ? "text-neutral-400" : "text-neutral-900"}`}>{describeHours(weekly[k])}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-sm text-neutral-600">Set opening hours once for each weekday; change individual dates below.</p>
        )}
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card>
          <div className="mb-4 flex items-center justify-between gap-2">
            <Link
              href={hrefFor({ month: prev })}
              scroll={false}
              aria-disabled={!canPrev}
              tabIndex={canPrev ? undefined : -1}
              className={buttonClass("secondary", "sm", canPrev ? "" : "pointer-events-none opacity-40")}
            >
              <span aria-hidden>←</span>
              <span className="sr-only sm:not-sr-only">Previous</span>
            </Link>
            <div className="text-center">
              <p className="font-semibold text-neutral-900" aria-live="polite">{monthLabel}</p>
              {month !== thisMonth && (
                <Link href={hrefFor({ month: thisMonth })} scroll={false} className="text-xs text-brand-700 hover:underline">
                  Back to this month
                </Link>
              )}
            </div>
            <Link
              href={hrefFor({ month: next })}
              scroll={false}
              aria-disabled={!canNext}
              tabIndex={canNext ? undefined : -1}
              className={buttonClass("secondary", "sm", canNext ? "" : "pointer-events-none opacity-40")}
            >
              <span className="sr-only sm:not-sr-only">Next</span>
              <span aria-hidden>→</span>
            </Link>
          </div>
          <AvailabilityCalendar month={month} monthLabel={monthLabel} days={days} selected={selected} today={today} hrefFor={hrefFor} />
          <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-neutral-600" aria-label="Legend">
            {LEGEND.map((l) => (
              <li key={l.label} className="flex items-center gap-1.5">
                <span className={`size-2.5 rounded-full ${l.swatch}`} aria-hidden />
                {l.label}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-neutral-500">
            Days without changes use standard hours. Customers only ever see times that are still free — pending,
            confirmed and completed bookings are never offered again.
          </p>
        </Card>
        <Card className="xl:self-start">
          <DayEditor
            key={day.date}
            studioId={studio.id}
            day={day}
            monthDays={days.map((d) => ({ date: d.date, editable: d.editable }))}
            packageDurations={activeDurations}
          />
        </Card>
      </div>
    </>
  );
}
