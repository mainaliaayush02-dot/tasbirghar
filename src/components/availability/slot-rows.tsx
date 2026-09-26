"use client";

import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { fromMinutes, MAX_SLOTS_PER_DAY, SLOT_STEP_MINUTES, toMinutes, type Window } from "@/lib/booking/rules";
import { formatTime, formatTimeRange } from "@/lib/format";

const TIMES = Array.from({ length: (24 * 60) / SLOT_STEP_MINUTES }, (_, i) => fromMinutes(i * SLOT_STEP_MINUTES));

/** Suggest the next free hour after the last slot. */
export function nextSlot(slots: Window[]): Window {
  const last = slots.length ? Math.max(...slots.map((s) => toMinutes(s.end))) : 10 * 60;
  const start = Math.min(last, 22 * 60);
  return { start: fromMinutes(start), end: fromMinutes(Math.min(start + 60, 23 * 60 + 30)) };
}

/**
 * Editable list of time slots (start/end on 30-minute steps). `label` prefixes
 * the accessible names, e.g. "Monday" → "Monday slot 1 start"; without it the
 * names are "Slot 1 start".
 */
export function SlotRows({ slots, onChange, label }: { slots: Window[]; onChange: (next: Window[]) => void; label?: string }) {
  const name = (i: number, part: "start" | "end") => (label ? `${label} slot ${i + 1} ${part}` : `Slot ${i + 1} ${part}`);
  const update = (i: number, key: keyof Window, value: string) => onChange(slots.map((s, j) => (j === i ? { ...s, [key]: value } : s)));
  return (
    <div className="space-y-2">
      <ul className="space-y-2" aria-label={label ? `${label} time slots` : "Time slots"}>
        {slots.map((s, i) => (
          <li key={i} className="flex items-center gap-2" data-slot={i}>
            <Select aria-label={name(i, "start")} value={s.start} onChange={(e) => update(i, "start", e.target.value)} className="min-w-0 flex-1">
              {TIMES.map((t) => (
                <option key={t} value={t}>
                  {formatTime(t)}
                </option>
              ))}
            </Select>
            <span className="text-neutral-400">–</span>
            <Select aria-label={name(i, "end")} value={s.end} onChange={(e) => update(i, "end", e.target.value)} className="min-w-0 flex-1">
              {TIMES.map((t) => (
                <option key={t} value={t}>
                  {formatTime(t)}
                </option>
              ))}
            </Select>
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Delete ${label ? `${label} ` : ""}slot ${formatTimeRange(s.start, s.end)}`}
              onClick={() => onChange(slots.filter((_, j) => j !== i))}
            >
              Delete
            </Button>
          </li>
        ))}
      </ul>
      <Button variant="secondary" size="sm" disabled={slots.length >= MAX_SLOTS_PER_DAY} onClick={() => onChange([...slots, nextSlot(slots)])} aria-label={label ? `Add ${label} time slot` : undefined}>
        + Add time slot
      </Button>
    </div>
  );
}
