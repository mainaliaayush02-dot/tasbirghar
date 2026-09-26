"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Alert } from "@/components/ui/feedback";
import {
  DEFAULT_CLOSE,
  DEFAULT_OPEN,
  WEEKDAY_KEYS,
  WEEKDAY_LABELS,
  weeklyHoursError,
  type WeekdayKey,
  type WeeklyDay,
  type WeeklyHours,
} from "@/lib/booking/rules";
import { api } from "@/lib/client/api";
import { describeHours } from "@/lib/format";

import { SlotRows } from "./slot-rows";

const DEFAULT_WEEK = Object.fromEntries(WEEKDAY_KEYS.map((k) => [k, { closed: false, slots: [{ start: DEFAULT_OPEN, end: DEFAULT_CLOSE }] }])) as WeeklyHours;

/**
 * Standard weekly opening hours. Instant feedback here; the server
 * re-validates and refuses a change that would leave an upcoming booking
 * outside the new hours.
 */
export function WeeklyHoursEditor({ studioId, initial }: { studioId: string; initial: WeeklyHours | null }) {
  const router = useRouter();
  const [week, setWeek] = useState<WeeklyHours>(initial ?? DEFAULT_WEEK);
  const [saved, setSaved] = useState<string>(JSON.stringify(initial ?? DEFAULT_WEEK));
  // Whether the studio has weekly hours stored (vs. falling back to defaults).
  const [stored, setStored] = useState(initial !== null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  const error = weeklyHoursError(week);
  const dirty = JSON.stringify(week) !== saved;
  const setDay = (key: WeekdayKey, day: WeeklyDay) => {
    setWeek((prev) => ({ ...prev, [key]: day }));
    setMessage(null);
  };

  async function save() {
    setSaving(true);
    setMessage(null);
    const result = await api(`/api/studios/${studioId}/weekly-hours`, { method: "PUT", body: { days: week } });
    setSaving(false);
    if (!result.ok) {
      setMessage({ tone: "danger", text: result.message });
      return;
    }
    setSaved(JSON.stringify(week));
    setStored(true);
    setMessage({ tone: "success", text: "Weekly hours saved." });
    router.refresh();
  }

  async function reset(): Promise<string | void> {
    const result = await api(`/api/studios/${studioId}/weekly-hours`, { method: "DELETE" });
    if (!result.ok) return result.message;
    setWeek(DEFAULT_WEEK);
    setSaved(JSON.stringify(DEFAULT_WEEK));
    setStored(false);
    setMessage({ tone: "success", text: "Weekly hours cleared — every day uses the default hours." });
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <ul className="divide-y divide-neutral-100 overflow-hidden rounded-xl border border-neutral-200 bg-white">
        {WEEKDAY_KEYS.map((key) => {
          const day = week[key];
          const dayError = weeklyHoursError({ ...DEFAULT_WEEK, [key]: day });
          return (
            <li key={key} data-weekday={key} className="grid gap-3 px-4 py-4 sm:grid-cols-[140px_minmax(0,1fr)] sm:px-5">
              <div className="flex items-center justify-between gap-3 sm:block">
                <p className="font-medium text-neutral-900">{WEEKDAY_LABELS[key]}</p>
                <label className="flex items-center gap-2 text-sm text-neutral-700 sm:mt-2">
                  <input
                    type="checkbox"
                    checked={!day.closed}
                    aria-label={`${WEEKDAY_LABELS[key]} open`}
                    onChange={(e) => setDay(key, e.target.checked ? { closed: false, slots: day.slots.length ? day.slots : [{ start: "10:00", end: "18:00" }] } : { closed: true, slots: [] })}
                    className="size-4 accent-brand-600"
                  />
                  {day.closed ? "Closed" : "Open"}
                </label>
              </div>
              <div className="min-w-0 space-y-2">
                {day.closed ? (
                  <p className="text-sm text-neutral-500">Closed every {WEEKDAY_LABELS[key]} (you can still open single dates on the calendar).</p>
                ) : (
                  <SlotRows label={WEEKDAY_LABELS[key]} slots={day.slots} onChange={(slots) => setDay(key, { closed: false, slots })} />
                )}
                {dayError && <p className="text-sm text-red-600">{dayError.replace(`${WEEKDAY_LABELS[key]}: `, "")}</p>}
                <button
                  type="button"
                  className="text-xs font-medium text-brand-700 hover:underline disabled:text-neutral-400 disabled:no-underline"
                  disabled={!!dayError}
                  onClick={() => {
                    setWeek(Object.fromEntries(WEEKDAY_KEYS.map((k) => [k, { closed: day.closed, slots: day.slots.map((s) => ({ ...s })) }])) as WeeklyHours);
                    setMessage(null);
                  }}
                >
                  Copy {WEEKDAY_LABELS[key]}&apos;s hours to every day
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {message && <Alert tone={message.tone}>{message.text}</Alert>}

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={save} loading={saving} disabled={(!dirty && stored) || !!error}>
          Save weekly hours
        </Button>
        {dirty && !saving && <span className="text-sm text-neutral-500">Unsaved changes</span>}
        {stored && (
          <ConfirmDialog
            title="Use the default hours?"
            description={`Every day goes back to ${describeHours({ closed: false, slots: [{ start: DEFAULT_OPEN, end: DEFAULT_CLOSE }] })}. Dates you changed on the calendar keep their own hours.`}
            confirmLabel="Use default hours"
            onConfirm={reset}
            trigger={(open) => (
              <Button variant="ghost" onClick={open}>
                Use default hours
              </Button>
            )}
          />
        )}
      </div>
    </div>
  );
}
