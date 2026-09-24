"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, type FormEvent } from "react";

import { getCategory, type CategorySlug } from "@/config/categories";
import { api } from "@/lib/client/api";
import { overlaps, startTimes, toMinutes, fromMinutes, type Window } from "@/lib/booking/rules";
import { formatMoney } from "@/lib/money";
import { LIMITS } from "@/lib/validation/schemas";

interface PackageOption {
  id: string;
  name: string;
  price: number;
  durationMinutes: number;
  editedPhotos: number;
  category: CategorySlug;
}

interface DayView {
  isClosed: boolean;
  open: Window[];
  busy: Window[];
  source: "studio" | "default";
}

const input =
  "h-12 w-full rounded-xl border border-ink/15 bg-white px-4 text-[15px] text-ink focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none aria-invalid:border-red-400";

/**
 * Booking request form. Shows live availability for convenience only; the
 * server re-validates package, price, date, hours and conflicts in a
 * transaction, and is the sole source of the booked price.
 */
export function BookingForm({
  studio,
  packages,
  initialPackageId,
  minDate,
  maxDate,
  defaults,
}: {
  studio: { id: string; slug: string; businessName: string };
  packages: PackageOption[];
  initialPackageId: string;
  minDate: string;
  maxDate: string;
  defaults: { name: string; phone: string };
}) {
  const router = useRouter();
  const [packageId, setPackageId] = useState(initialPackageId);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [day, setDay] = useState<DayView | null>(null);
  const [loadingDay, setLoadingDay] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const pkg = packages.find((p) => p.id === packageId)!;
  const latestDate = useRef("");

  async function fetchDay(value: string): Promise<DayView | null> {
    const r = await fetch(`/api/studios/${studio.id}/availability?date=${value}`, { cache: "no-store" }).catch(() => null);
    return r?.ok ? ((await r.json()) as DayView) : null;
  }

  async function chooseDate(value: string) {
    setDate(value);
    setTime("");
    setDay(null);
    if (!value) return;
    latestDate.current = value;
    setLoadingDay(true);
    const d = await fetchDay(value);
    // Ignore responses for a date the user has since changed.
    if (latestDate.current !== value) return;
    setDay(d);
    setLoadingDay(false);
  }

  const times = useMemo(() => {
    if (!day || day.isClosed) return [];
    return day.open
      .flatMap((w) => startTimes(w.start, w.end, pkg.durationMinutes))
      .map((start) => ({ start, taken: day.busy.some((b) => overlaps(b, { start, end: fromMinutes(toMinutes(start) + pkg.durationMinutes) })) }));
  }, [day, pkg.durationMinutes]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    const errors: Record<string, string> = {};
    if (!date) errors.shootDate = "Choose a date.";
    if (!time) errors.startTime = "Choose a start time.";
    setFields(errors);
    if (Object.keys(errors).length) return;

    setPending(true);
    setError(null);
    const result = await api<{ bookingId: string }>("/api/bookings", {
      body: {
        studioId: studio.id,
        packageId,
        shootDate: date,
        startTime: time,
        customerName: f.get("customerName"),
        customerPhone: f.get("customerPhone"),
        customerNote: f.get("customerNote"),
      },
    });
    if (result.ok) {
      router.push(`/account/bookings/${result.data.bookingId}?created=1`);
      return;
    }
    setPending(false);
    setFields(result.fields);
    setError(result.message);
    if (result.status === 409 && date) {
      // Someone may have taken the slot — refresh the day view.
      setDay(await fetchDay(date));
      setTime("");
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px]" noValidate>
      <div className="space-y-10">
        <fieldset>
          <legend className="font-display text-2xl text-ink">1. Package</legend>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {packages.map((p) => (
              <label
                key={p.id}
                className={`cursor-pointer rounded-2xl border p-5 transition-colors has-focus-visible:outline-2 has-focus-visible:outline-brand-500 ${
                  p.id === packageId ? "border-brand-600 bg-brand-50" : "border-ink/15 bg-white hover:border-ink/30"
                }`}
              >
                <input type="radio" name="package" value={p.id} checked={p.id === packageId} onChange={() => { setPackageId(p.id); setTime(""); }} className="sr-only" />
                <span className="block text-xs font-semibold tracking-[0.12em] text-brand-600 uppercase">{getCategory(p.category).name}</span>
                <span className="mt-1 block font-medium text-ink">{p.name}</span>
                <span className="mt-1 block text-sm text-ink/60">
                  {p.durationMinutes} min · {p.editedPhotos} edited photos
                </span>
                <span className="mt-3 block font-display text-xl text-ink">{formatMoney(p.price)}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="font-display text-2xl text-ink">2. Date & time</legend>
          <div className="mt-4 max-w-xs">
            <label htmlFor="shootDate" className="text-sm font-medium text-ink">Date</label>
            <input
              id="shootDate"
              type="date"
              min={minDate}
              max={maxDate}
              value={date}
              onChange={(e) => chooseDate(e.target.value)}
              aria-invalid={fields.shootDate ? true : undefined}
              className={`${input} mt-1.5`}
            />
            {fields.shootDate && <p className="mt-1 text-sm text-red-600">{fields.shootDate}</p>}
          </div>
          <div className="mt-6" aria-live="polite">
            {!date ? (
              <p className="text-sm text-ink/55">Choose a date to see available start times.</p>
            ) : loadingDay ? (
              <p className="text-sm text-ink/55">Checking availability…</p>
            ) : !day ? (
              <p className="text-sm text-red-600">Couldn&apos;t load availability. Please pick the date again.</p>
            ) : day.isClosed ? (
              <p className="text-sm text-ink/70">The studio isn&apos;t taking bookings on this date. Please choose another.</p>
            ) : (
              <>
                <p className="text-sm text-ink/60">
                  {day.source === "studio" ? "Times published by the studio." : "Studio hours 7:00–20:00. The studio will confirm."}
                </p>
                <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label="Start time">
                  {times.map((t) => (
                    <button
                      key={t.start}
                      type="button"
                      role="radio"
                      aria-checked={time === t.start}
                      disabled={t.taken}
                      onClick={() => setTime(t.start)}
                      className={`min-w-[76px] rounded-full border px-4 py-2.5 text-sm transition-colors disabled:cursor-not-allowed disabled:border-transparent disabled:bg-ink/5 disabled:text-ink/30 disabled:line-through ${
                        time === t.start ? "border-ink bg-ink text-cream" : "border-ink/15 bg-white text-ink hover:border-ink/40"
                      }`}
                    >
                      {t.start}
                    </button>
                  ))}
                  {times.length === 0 && <p className="text-sm text-ink/60">No start times fit this package on that date.</p>}
                </div>
                {fields.startTime && <p className="mt-2 text-sm text-red-600">{fields.startTime}</p>}
              </>
            )}
          </div>
        </fieldset>

        <fieldset>
          <legend className="font-display text-2xl text-ink">3. Your details</legend>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="customerName" className="text-sm font-medium text-ink">Name</label>
              <input id="customerName" name="customerName" defaultValue={defaults.name} maxLength={LIMITS.displayName} aria-invalid={fields.customerName ? true : undefined} className={`${input} mt-1.5`} />
              {fields.customerName && <p className="mt-1 text-sm text-red-600">{fields.customerName}</p>}
            </div>
            <div>
              <label htmlFor="customerPhone" className="text-sm font-medium text-ink">Phone</label>
              <input id="customerPhone" name="customerPhone" type="tel" defaultValue={defaults.phone} placeholder="98XXXXXXXX" maxLength={20} aria-invalid={fields.customerPhone ? true : undefined} className={`${input} mt-1.5`} />
              {fields.customerPhone && <p className="mt-1 text-sm text-red-600">{fields.customerPhone}</p>}
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="customerNote" className="text-sm font-medium text-ink">Note for the studio <span className="text-ink/40">(optional)</span></label>
              <textarea id="customerNote" name="customerNote" rows={3} maxLength={500} placeholder="Baby's age, outfits, anything the studio should know" className="mt-1.5 w-full rounded-xl border border-ink/15 bg-white px-4 py-3 text-[15px] text-ink focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none" />
            </div>
          </div>
        </fieldset>
      </div>

      <aside>
        <div className="rounded-3xl bg-white p-6 ring-1 ring-ink/10 lg:sticky lg:top-24">
          <h2 className="font-medium text-ink">{studio.businessName}</h2>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between gap-4"><dt className="text-ink/60">Package</dt><dd className="text-right text-ink">{pkg.name}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-ink/60">Date</dt><dd className="text-ink">{date || "—"}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-ink/60">Time</dt><dd className="text-ink">{time ? `${time}–${fromMinutes(toMinutes(time) + pkg.durationMinutes)}` : "—"}</dd></div>
          </dl>
          <div className="mt-5 flex items-baseline justify-between border-t border-ink/10 pt-5">
            <span className="text-ink/60">Package price</span>
            <span className="font-display text-2xl text-ink">{formatMoney(pkg.price)}</span>
          </div>
          {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <button type="submit" disabled={pending} className="mt-5 h-12 w-full rounded-full bg-brand-600 font-medium text-white transition-colors hover:bg-brand-700 disabled:opacity-60">
            {pending ? "Sending request…" : "Send booking request"}
          </button>
          <p className="mt-3 text-xs text-ink/55">
            The studio confirms requests. No payment is taken online. The price is set by the studio&apos;s current package.
          </p>
        </div>
      </aside>
    </form>
  );
}
