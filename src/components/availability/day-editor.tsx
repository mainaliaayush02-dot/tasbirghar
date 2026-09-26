"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { BookingStatusPill } from "@/components/bookings/booking-status";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { api } from "@/lib/client/api";
import { slotsError, toMinutes, WEEKDAY_LABELS, weekdayKey, type Window } from "@/lib/booking/rules";
import type { BulkDayResult, CalendarDay } from "@/lib/booking/service";
import { describeHours, formatDay, formatTimeRange } from "@/lib/format";

import { nextSlot, SlotRows } from "./slot-rows";

type Mode = CalendarDay["mode"];

/**
 * Edits one day of the studio's own schedule, optionally applying the same
 * hours to more days of the month. Validation here is instant feedback only —
 * the server re-validates everything and refuses edits that would leave a
 * pending/confirmed booking outside the open hours.
 */
export function DayEditor({
  studioId,
  day,
  monthDays,
  packageDurations,
}: {
  studioId: string;
  day: CalendarDay;
  /** The calendar month, for "apply to more days". */
  monthDays: { date: string; editable: boolean }[];
  packageDurations: number[];
}) {
  const router = useRouter();
  const root = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<Mode>(day.mode);
  const [slots, setSlots] = useState<Window[]>(day.mode === "custom" ? day.slots : []);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "danger" | "warning"; text: string } | null>(null);
  // What is saved on the server. Updated immediately on a successful save, so
  // "unsaved changes" stays correct while router.refresh() is still loading.
  const [saved, setSaved] = useState<{ mode: Mode; slots: Window[] }>({ mode: day.mode, slots: day.mode === "custom" ? day.slots : [] });
  const [extra, setExtra] = useState<string[]>([]);

  const localError = mode === "custom" ? slotsError(slots) : null;
  const dirty = mode !== saved.mode || (mode === "custom" && JSON.stringify(slots) !== JSON.stringify(saved.slots));
  const longest = packageDurations.length ? Math.max(...packageDurations) : 0;
  const tooShort = mode === "custom" && longest > 0 && slots.length > 0 && slots.every((s) => toMinutes(s.end) - toMinutes(s.start) < Math.min(...packageDurations));
  const standardText = `${describeHours(day.standard)}${day.standard.source === "weekly" ? " (weekly hours)" : ""}`;
  const weekday = weekdayKey(day.date);
  const others = monthDays.filter((d) => d.editable && d.date !== day.date);

  const edit = (next: Window[]) => {
    setSlots(next);
    setMessage(null);
  };
  const toggleExtra = (date: string) => {
    setExtra((prev) => (prev.includes(date) ? prev.filter((d) => d !== date) : [...prev, date]));
    setMessage(null);
  };

  // Below xl the editor sits under the calendar: bring the tapped day into view.
  useEffect(() => {
    if (window.matchMedia("(max-width: 1279px)").matches && new URLSearchParams(window.location.search).has("date")) {
      root.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  async function save() {
    setSaving(true);
    setMessage(null);
    const hours = { isClosed: mode === "closed", slots: mode === "custom" ? slots : [] };
    if (extra.length === 0) {
      const url = `/api/studios/${studioId}/availability/${day.date}`;
      const result = mode === "standard" ? await api(url, { method: "DELETE" }) : await api(url, { method: "PUT", body: hours });
      setSaving(false);
      if (!result.ok) {
        setMessage({ tone: "danger", text: result.message });
        return;
      }
      setSaved({ mode, slots: mode === "custom" ? slots : [] });
      setMessage({ tone: "success", text: "Availability saved." });
      router.refresh();
      return;
    }
    // Same hours for this day and the selected days (one locked transaction per date).
    const dates = [day.date, ...extra];
    const result = await api<{ saved: number; results: BulkDayResult[] }>(`/api/studios/${studioId}/availability/bulk`, {
      method: "PUT",
      body: mode === "standard" ? { dates, reset: true } : { dates, hours },
    });
    setSaving(false);
    if (!result.ok) {
      setMessage({ tone: "danger", text: result.message });
      return;
    }
    const failed = result.data.results.filter((r) => !r.ok);
    if (!failed.some((r) => r.date === day.date)) setSaved({ mode, slots: mode === "custom" ? slots : [] });
    setExtra(failed.map((r) => r.date).filter((d) => d !== day.date));
    setMessage(
      failed.length
        ? { tone: "warning", text: `Saved ${result.data.saved} of ${dates.length} days. Not changed — ${failed.map((r) => `${formatDay(r.date)}: ${r.message}`).join(" ")}` }
        : { tone: "success", text: `Availability saved for ${dates.length} days.` },
    );
    router.refresh();
  }

  return (
    <div ref={root} className="scroll-mt-4 space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-neutral-900">{formatDay(day.date, "long")}</h2>
        <p className="mt-0.5 text-sm text-neutral-500">
          {day.mode === "closed" ? "Unavailable" : day.mode === "custom" ? "Custom time slots" : `Standard hours · ${standardText}`}
        </p>
      </div>

      <section aria-labelledby="day-bookings">
        <h3 id="day-bookings" className="text-sm font-medium text-neutral-900">Bookings</h3>
        {day.bookings.length ? (
          <ul className="mt-2 divide-y divide-neutral-100 rounded-lg border border-neutral-200">
            {day.bookings.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm">
                <span className="min-w-0">
                  <span className="block font-medium text-neutral-900">{formatTimeRange(b.start, b.end)}</span>
                  <span className="block truncate text-neutral-500">
                    {b.customerName} · {b.packageName}
                  </span>
                </span>
                <BookingStatusPill status={b.status} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-sm text-neutral-500">No bookings on this date.</p>
        )}
        {day.bookings.length > 0 && (
          <Link href="/dashboard/bookings" className="mt-2 inline-block text-sm font-medium text-brand-700 hover:underline">
            Manage bookings
          </Link>
        )}
      </section>

      {!day.editable ? (
        <p className="rounded-lg bg-neutral-100 px-3 py-2.5 text-sm text-neutral-600">
          Availability can be changed from tomorrow up to 6 months ahead.
        </p>
      ) : (
        <section aria-labelledby="day-hours" className="space-y-4 border-t border-neutral-100 pt-5">
          <h3 id="day-hours" className="text-sm font-medium text-neutral-900">Hours for this day</h3>
          <div role="radiogroup" aria-labelledby="day-hours" className="grid gap-2">
            {(
              [
                ["standard", "Standard hours", standardText],
                ["custom", "Custom time slots", "Only the times you add can be booked"],
                ["closed", "Unavailable", "No bookings on this day"],
              ] as const
            ).map(([value, label, hint]) => (
              <label
                key={value}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 has-focus-visible:outline-2 has-focus-visible:outline-brand-500 ${
                  mode === value ? "border-brand-600 bg-brand-50" : "border-neutral-200 bg-white hover:border-neutral-300"
                }`}
              >
                <input
                  type="radio"
                  name="mode"
                  value={value}
                  checked={mode === value}
                  onChange={() => {
                    setMode(value);
                    setMessage(null);
                    if (value === "custom" && slots.length === 0) setSlots([nextSlot([])]);
                  }}
                  className="mt-1 accent-brand-600"
                />
                <span>
                  <span className="block text-sm font-medium text-neutral-900">{label}</span>
                  <span className="block text-xs text-neutral-500">{hint}</span>
                </span>
              </label>
            ))}
          </div>
          <p className="text-xs text-neutral-500">
            <Link href="/dashboard/availability/weekly" className="font-medium text-brand-700 hover:underline">
              Change your weekly hours
            </Link>{" "}
            to update standard hours for every {WEEKDAY_LABELS[weekday]}.
          </p>

          {mode === "custom" && (
            <div className="space-y-3">
              <SlotRows slots={slots} onChange={edit} />
              {longest > 0 && (
                <p className="text-xs text-neutral-500">
                  A session must fit inside one slot. Your packages last {Math.min(...packageDurations)}–{longest} minutes.
                </p>
              )}
              {localError && slots.length > 0 && <p className="text-sm text-red-600">{localError}</p>}
              {!localError && tooShort && <p className="text-sm text-amber-700">These slots are shorter than every package, so nothing can be booked.</p>}
            </div>
          )}

          {others.length > 0 && (
            <details className="rounded-lg border border-neutral-200 bg-white px-3 py-2.5" open={extra.length > 0}>
              <summary className="cursor-pointer text-sm font-medium text-neutral-900">
                Apply to more days{extra.length > 0 ? ` · ${extra.length} selected` : ""}
              </summary>
              <div className="mt-3 space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setExtra(others.filter((d) => weekdayKey(d.date) === weekday).map((d) => d.date));
                      setMessage(null);
                    }}
                  >
                    All {WEEKDAY_LABELS[weekday]}s this month
                  </Button>
                  {extra.length > 0 && (
                    <Button size="sm" variant="ghost" onClick={() => setExtra([])}>
                      Clear
                    </Button>
                  )}
                </div>
                <div role="group" aria-label="Also apply to" className="grid grid-cols-7 gap-1">
                  {Array.from({ length: new Date(`${monthDays[0].date}T00:00:00Z`).getUTCDay() }, (_, i) => (
                    <span key={`lead-${i}`} aria-hidden />
                  ))}
                  {monthDays.map((d) => {
                    const selectable = d.editable && d.date !== day.date;
                    const on = extra.includes(d.date) || d.date === day.date;
                    return (
                      <button
                        key={d.date}
                        type="button"
                        data-apply-date={d.date}
                        disabled={!selectable}
                        aria-pressed={on}
                        aria-label={formatDay(d.date, "long")}
                        onClick={() => toggleExtra(d.date)}
                        className={`grid h-9 place-items-center rounded-md text-xs transition-colors ${
                          d.date === day.date
                            ? "bg-ink text-cream"
                            : on
                              ? "bg-brand-600 font-medium text-white"
                              : selectable
                                ? "bg-neutral-100 text-neutral-800 hover:bg-neutral-200"
                                : "text-neutral-300"
                        }`}
                      >
                        {Number(d.date.slice(8))}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-neutral-500">
                  The hours above are applied to each selected day. Days with a booking that wouldn&apos;t fit are left unchanged and listed.
                </p>
              </div>
            </details>
          )}

          {message && <Alert tone={message.tone}>{message.text}</Alert>}

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={save} loading={saving} disabled={(!dirty && extra.length === 0) || (mode === "custom" && !!localError)}>
              {extra.length > 0 ? `Save for ${extra.length + 1} days` : "Save availability"}
            </Button>
            {dirty && !saving && <span className="text-sm text-neutral-500">Unsaved changes</span>}
          </div>
        </section>
      )}
    </div>
  );
}
