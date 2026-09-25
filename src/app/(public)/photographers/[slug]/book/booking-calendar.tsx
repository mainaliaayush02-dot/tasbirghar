"use client";

import { addMonths, monthDates } from "@/lib/booking/rules";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

const monthLabel = (month: string) =>
  new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC", month: "long", year: "numeric" });

/**
 * Customer date picker: only dates with at least one free start time for the
 * chosen package are selectable. Availability itself comes from the server.
 */
export function BookingCalendar({
  month,
  minMonth,
  maxMonth,
  available,
  selected,
  loading,
  onSelect,
  onMonth,
}: {
  month: string;
  minMonth: string;
  maxMonth: string;
  available: Set<string>;
  selected: string;
  loading: boolean;
  onSelect: (date: string) => void;
  onMonth: (month: string) => void;
}) {
  const dates = monthDates(month);
  const lead = new Date(`${month}-01T00:00:00Z`).getUTCDay();
  const prev = addMonths(month, -1);
  const next = addMonths(month, 1);

  return (
    <div className="max-w-md rounded-2xl bg-white p-4 ring-1 ring-ink/10 sm:p-5">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => onMonth(prev)}
          disabled={prev < minMonth || loading}
          aria-label="Previous month"
          className="grid size-10 place-items-center rounded-full text-ink transition-colors hover:bg-ink/5 disabled:opacity-30"
        >
          <span aria-hidden>←</span>
        </button>
        <p className="font-medium text-ink" aria-live="polite">
          {monthLabel(month)}
        </p>
        <button
          type="button"
          onClick={() => onMonth(next)}
          disabled={next > maxMonth || loading}
          aria-label="Next month"
          className="grid size-10 place-items-center rounded-full text-ink transition-colors hover:bg-ink/5 disabled:opacity-30"
        >
          <span aria-hidden>→</span>
        </button>
      </div>
      <div className="mt-3 grid grid-cols-7 text-center text-xs font-medium text-ink/45" aria-hidden>
        {WEEKDAYS.map((d, i) => (
          <span key={i} className="py-1">
            {d}
          </span>
        ))}
      </div>
      <div role="group" aria-label={`Dates in ${monthLabel(month)}`} aria-busy={loading} className={`grid grid-cols-7 gap-1 ${loading ? "opacity-50" : ""}`}>
        {Array.from({ length: lead }, (_, i) => (
          <span key={`lead-${i}`} aria-hidden />
        ))}
        {dates.map((date) => {
          const open = available.has(date);
          const isSelected = date === selected;
          return (
            <button
              key={date}
              type="button"
              data-date={date}
              disabled={!open || loading}
              aria-pressed={isSelected}
              aria-label={`${new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" })}${open ? "" : ", not available"}`}
              onClick={() => onSelect(date)}
              className={`grid aspect-square min-h-10 place-items-center rounded-full text-sm transition-colors ${
                isSelected
                  ? "bg-ink font-medium text-cream"
                  : open
                    ? "font-medium text-ink hover:bg-brand-50 hover:text-brand-700"
                    : "cursor-not-allowed text-ink/25"
              }`}
            >
              {Number(date.slice(8))}
            </button>
          );
        })}
      </div>
    </div>
  );
}
