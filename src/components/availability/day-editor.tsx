"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { BookingStatusPill } from "@/components/bookings/booking-status";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Select } from "@/components/ui/field";
import { api } from "@/lib/client/api";
import { DEFAULT_CLOSE, DEFAULT_OPEN, fromMinutes, MAX_SLOTS_PER_DAY, SLOT_STEP_MINUTES, slotsError, toMinutes, type Window } from "@/lib/booking/rules";
import type { CalendarDay } from "@/lib/booking/service";
import { formatDay, formatTime, formatTimeRange } from "@/lib/format";

type Mode = CalendarDay["mode"];

const TIMES = Array.from({ length: (24 * 60) / SLOT_STEP_MINUTES }, (_, i) => fromMinutes(i * SLOT_STEP_MINUTES));

/** Suggest the next free hour after the last slot. */
function nextSlot(slots: Window[]): Window {
  const last = slots.length ? Math.max(...slots.map((s) => toMinutes(s.end))) : 10 * 60;
  const start = Math.min(last, 22 * 60);
  return { start: fromMinutes(start), end: fromMinutes(Math.min(start + 60, 23 * 60 + 30)) };
}

/**
 * Edits one day of the studio's own schedule. Validation here is instant
 * feedback only — the server re-validates everything and refuses edits that
 * would leave a pending/confirmed booking outside the open hours.
 */
export function DayEditor({ studioId, day, packageDurations }: { studioId: string; day: CalendarDay; packageDurations: number[] }) {
  const router = useRouter();
  const root = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<Mode>(day.mode);
  const [slots, setSlots] = useState<Window[]>(day.mode === "custom" ? day.slots : []);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  const localError = mode === "custom" ? slotsError(slots) : null;
  const dirty = mode !== day.mode || (mode === "custom" && JSON.stringify(slots) !== JSON.stringify(day.slots));
  const longest = packageDurations.length ? Math.max(...packageDurations) : 0;
  const tooShort = mode === "custom" && longest > 0 && slots.length > 0 && slots.every((s) => toMinutes(s.end) - toMinutes(s.start) < Math.min(...packageDurations));

  const edit = (next: (prev: Window[]) => Window[]) => {
    setSlots(next);
    setMessage(null);
  };
  const update = (i: number, key: keyof Window, value: string) =>
    edit((prev) => prev.map((s, j) => (j === i ? { ...s, [key]: value } : s)));

  // Below xl the editor sits under the calendar: bring the tapped day into view.
  useEffect(() => {
    if (window.matchMedia("(max-width: 1279px)").matches && new URLSearchParams(window.location.search).has("date")) {
      root.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  async function save() {
    setSaving(true);
    setMessage(null);
    const url = `/api/studios/${studioId}/availability/${day.date}`;
    const result =
      mode === "standard"
        ? await api(url, { method: "DELETE" })
        : await api(url, { method: "PUT", body: { isClosed: mode === "closed", slots: mode === "custom" ? slots : [] } });
    setSaving(false);
    if (!result.ok) {
      setMessage({ tone: "danger", text: result.message });
      return;
    }
    setMessage({ tone: "success", text: "Availability saved." });
    router.refresh();
  }

  return (
    <div ref={root} className="scroll-mt-4 space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-neutral-900">{formatDay(day.date, "long")}</h2>
        <p className="mt-0.5 text-sm text-neutral-500">
          {day.mode === "closed" ? "Unavailable" : day.mode === "custom" ? "Custom time slots" : `Standard hours · ${formatTimeRange(DEFAULT_OPEN, DEFAULT_CLOSE)}`}
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
                ["standard", "Standard hours", `${formatTimeRange(DEFAULT_OPEN, DEFAULT_CLOSE)}`],
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

          {mode === "custom" && (
            <div className="space-y-3">
              <ul className="space-y-2" aria-label="Time slots">
                {slots.map((s, i) => (
                  <li key={i} className="flex items-center gap-2" data-slot={i}>
                    <Select aria-label={`Slot ${i + 1} start`} value={s.start} onChange={(e) => update(i, "start", e.target.value)} className="min-w-0 flex-1">
                      {TIMES.map((t) => (
                        <option key={t} value={t}>
                          {formatTime(t)}
                        </option>
                      ))}
                    </Select>
                    <span className="text-neutral-400">–</span>
                    <Select aria-label={`Slot ${i + 1} end`} value={s.end} onChange={(e) => update(i, "end", e.target.value)} className="min-w-0 flex-1">
                      {TIMES.map((t) => (
                        <option key={t} value={t}>
                          {formatTime(t)}
                        </option>
                      ))}
                    </Select>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Delete slot ${formatTimeRange(s.start, s.end)}`}
                      onClick={() => edit((prev) => prev.filter((_, j) => j !== i))}
                    >
                      Delete
                    </Button>
                  </li>
                ))}
              </ul>
              <Button
                variant="secondary"
                size="sm"
                disabled={slots.length >= MAX_SLOTS_PER_DAY}
                onClick={() => edit((prev) => [...prev, nextSlot(prev)])}
              >
                + Add time slot
              </Button>
              {longest > 0 && (
                <p className="text-xs text-neutral-500">
                  A session must fit inside one slot. Your packages last {Math.min(...packageDurations)}–{longest} minutes.
                </p>
              )}
              {localError && slots.length > 0 && <p className="text-sm text-red-600">{localError}</p>}
              {!localError && tooShort && <p className="text-sm text-amber-700">These slots are shorter than every package, so nothing can be booked.</p>}
            </div>
          )}

          {message && <Alert tone={message.tone}>{message.text}</Alert>}

          <div className="flex items-center gap-3">
            <Button onClick={save} loading={saving} disabled={!dirty || (mode === "custom" && !!localError)}>
              Save availability
            </Button>
            {dirty && !saving && <span className="text-sm text-neutral-500">Unsaved changes</span>}
          </div>
        </section>
      )}
    </div>
  );
}
