import Link from "next/link";

import type { CalendarDay } from "@/lib/booking/service";
import type { BookingStatus } from "@/types/models";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Booking dots: only statuses that occupy the day are shown. */
const DOT: Partial<Record<BookingStatus, { className: string; label: string }>> = {
  pending: { className: "bg-amber-500", label: "pending" },
  confirmed: { className: "bg-emerald-600", label: "confirmed" },
  completed: { className: "bg-sky-600", label: "completed" },
};

export const LEGEND = [
  { label: "Available", swatch: "bg-white ring-1 ring-neutral-300" },
  { label: "Pending booking", swatch: "bg-amber-500" },
  { label: "Confirmed booking", swatch: "bg-emerald-600" },
  { label: "Completed booking", swatch: "bg-sky-600" },
  { label: "Unavailable", swatch: "bg-neutral-300" },
];

function dayLabel(day: CalendarDay) {
  if (day.mode === "closed") return "Unavailable";
  if (day.mode === "custom") return `${day.slots.length} slot${day.slots.length === 1 ? "" : "s"}`;
  return "Standard";
}

/**
 * Month grid for the studio's own schedule. Each day links to itself (server
 * re-render) so the selected date is part of the URL and works without JS.
 */
export function AvailabilityCalendar({
  month,
  monthLabel,
  days,
  selected,
  today,
  hrefFor,
}: {
  month: string;
  monthLabel: string;
  days: CalendarDay[];
  selected: string;
  today: string;
  hrefFor: (params: { month: string; date?: string }) => string;
}) {
  const lead = new Date(`${month}-01T00:00:00Z`).getUTCDay();

  return (
    <div>
      <h2 className="sr-only">{monthLabel}</h2>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium tracking-wide text-neutral-500 uppercase sm:gap-1.5">
        {WEEKDAYS.map((d) => (
          <div key={d} className="py-1.5">
            {d}
          </div>
        ))}
      </div>
      <ol className="grid grid-cols-7 gap-1 sm:gap-1.5" aria-label={`Days in ${monthLabel}`}>
        {Array.from({ length: lead }, (_, i) => (
          <li key={`lead-${i}`} aria-hidden />
        ))}
        {days.map((day) => {
          const isSelected = day.date === selected;
          const isPast = day.date < today;
          const dots = day.bookings.filter((b) => DOT[b.status]);
          const occupied = dots.length ? `, ${dots.length} booking${dots.length === 1 ? "" : "s"}` : "";
          return (
            <li key={day.date}>
              <Link
                href={hrefFor({ month, date: day.date })}
                scroll={false}
                aria-current={isSelected ? "date" : undefined}
                aria-label={`${day.date}: ${dayLabel(day)}${occupied}`}
                data-date={day.date}
                className={`flex aspect-square min-h-11 flex-col items-center justify-between rounded-lg border p-1 text-sm transition-colors sm:aspect-auto sm:h-20 sm:items-start sm:p-2 ${
                  isSelected
                    ? "border-brand-600 ring-2 ring-brand-200"
                    : day.mode === "closed"
                      ? "border-transparent bg-neutral-200/70 hover:border-neutral-300"
                      : "border-neutral-200 bg-white hover:border-neutral-400"
                } ${isPast ? "opacity-50" : ""}`}
              >
                <span className={`font-medium ${day.date === today ? "rounded-full bg-ink px-1.5 text-cream" : "text-neutral-900"}`}>
                  {Number(day.date.slice(8))}
                </span>
                <span className="hidden text-[11px] leading-tight text-neutral-500 sm:block">{dayLabel(day)}</span>
                <span className="flex min-h-1.5 flex-wrap justify-center gap-0.5 sm:justify-start">
                  {dots.slice(0, 4).map((b) => (
                    <span key={b.id} className={`size-1.5 rounded-full ${DOT[b.status]!.className}`} />
                  ))}
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
