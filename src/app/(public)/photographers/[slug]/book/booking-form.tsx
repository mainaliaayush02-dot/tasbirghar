"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";

import { getCategory, type CategorySlug } from "@/config/categories";
import { api } from "@/lib/client/api";
import { fromMinutes, toMinutes } from "@/lib/booking/rules";
import { formatDay, formatTime, formatTimeRange } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { LIMITS } from "@/lib/validation/schemas";

import { BookingCalendar } from "./booking-calendar";

interface PackageOption {
  id: string;
  name: string;
  price: number;
  durationMinutes: number;
  editedPhotos: number;
  category: CategorySlug;
}

/** Bookable dates of one month → free start times (from the server). */
export interface MonthView {
  month: string;
  days: Record<string, string[]>;
}

const input =
  "h-12 w-full rounded-xl border border-ink/15 bg-white px-4 text-[15px] text-ink focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none aria-invalid:border-red-400";

const TAKEN = "This time is no longer available. Please choose another time.";

const PARTS = [
  { label: "Morning", test: (t: string) => toMinutes(t) < 12 * 60 },
  { label: "Afternoon", test: (t: string) => toMinutes(t) >= 12 * 60 && toMinutes(t) < 17 * 60 },
  { label: "Evening", test: (t: string) => toMinutes(t) >= 17 * 60 },
];

/**
 * Booking request form. Only dates/times the server reports as free are
 * offered; the server re-validates package, price, date, hours and conflicts
 * in a transaction and is the sole source of the booked price.
 */
export function BookingForm({
  studio,
  packages,
  initialPackageId,
  initialMonth,
  minMonth,
  maxMonth,
  defaults,
}: {
  studio: { id: string; slug: string; businessName: string };
  packages: PackageOption[];
  initialPackageId: string;
  initialMonth: MonthView;
  minMonth: string;
  maxMonth: string;
  defaults: { name: string; phone: string };
}) {
  const router = useRouter();
  const [packageId, setPackageId] = useState(initialPackageId);
  const [view, setView] = useState<MonthView | null>(initialMonth);
  const [month, setMonth] = useState(initialMonth.month);
  const [loading, setLoading] = useState(false);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const latest = useRef(0);

  const pkg = packages.find((p) => p.id === packageId)!;
  const times = date && view ? (view.days[date] ?? []) : [];

  /** Loads a month for a package; ignores responses that arrive out of order. */
  async function load(nextMonth: string, nextPackage: string, keepDate: string) {
    const request = ++latest.current;
    setLoading(true);
    setMonth(nextMonth);
    const r = await fetch(`/api/studios/${studio.id}/availability?month=${nextMonth}&packageId=${nextPackage}`, { cache: "no-store" }).catch(() => null);
    const data = r?.ok ? ((await r.json()) as MonthView) : null;
    if (request !== latest.current) return;
    setView(data);
    setLoading(false);
    setDate(keepDate && data?.days[keepDate] ? keepDate : "");
  }

  function choosePackage(id: string) {
    setPackageId(id);
    setTime("");
    setError(null);
    void load(month, id, date);
  }

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
    if (result.status === 409) {
      // The time was taken (or the studio changed its hours) — refresh.
      setError(TAKEN);
      setTime("");
      await load(month, packageId, date);
    } else {
      setError(result.message);
    }
  }

  const monthEmpty = view && Object.keys(view.days).length === 0;

  return (
    <form onSubmit={onSubmit} className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px]" noValidate>
      <div className="min-w-0 space-y-10">
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
                <input type="radio" name="package" value={p.id} checked={p.id === packageId} onChange={() => choosePackage(p.id)} className="sr-only" />
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
          <legend className="font-display text-2xl text-ink">2. Date</legend>
          <p className="mt-1 text-sm text-ink/60">Dates with free times for {pkg.name} are shown in bold.</p>
          <div className="mt-4">
            <BookingCalendar
              month={month}
              minMonth={minMonth}
              maxMonth={maxMonth}
              available={new Set(Object.keys(view?.days ?? {}))}
              selected={date}
              loading={loading}
              onSelect={(d) => {
                setDate(d);
                setTime("");
                setError(null);
              }}
              onMonth={(m) => void load(m, packageId, "")}
            />
          </div>
          <div className="mt-3" aria-live="polite">
            {loading ? (
              <p className="text-sm text-ink/55">Checking availability…</p>
            ) : !view ? (
              <p className="text-sm text-red-600">Couldn&apos;t load availability. Please try again.</p>
            ) : monthEmpty ? (
              <p className="text-sm text-ink/70">No availability this month. Try the next month.</p>
            ) : null}
            {fields.shootDate && !date && <p className="text-sm text-red-600">{fields.shootDate}</p>}
          </div>
        </fieldset>

        <fieldset>
          <legend className="font-display text-2xl text-ink">3. Time</legend>
          <div className="mt-4" aria-live="polite">
            {!date ? (
              <p className="text-sm text-ink/55">Choose a date to see available start times.</p>
            ) : times.length === 0 ? (
              <p className="text-sm text-ink/70">No availability on this date.</p>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-ink/60">
                  {formatDay(date, "long")} · each session lasts {pkg.durationMinutes} minutes (Nepal time)
                </p>
                {PARTS.map((part) => {
                  const inPart = times.filter(part.test);
                  if (!inPart.length) return null;
                  return (
                    <div key={part.label}>
                      <p className="text-xs font-semibold tracking-[0.12em] text-ink/50 uppercase">{part.label}</p>
                      <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label={`${part.label} start times`}>
                        {inPart.map((t) => (
                          <button
                            key={t}
                            type="button"
                            role="radio"
                            aria-checked={time === t}
                            data-time={t}
                            onClick={() => {
                              setTime(t);
                              setError(null);
                            }}
                            className={`min-w-[92px] rounded-full border px-4 py-2.5 text-sm transition-colors ${
                              time === t ? "border-ink bg-ink text-cream" : "border-ink/15 bg-white text-ink hover:border-ink/40"
                            }`}
                          >
                            {formatTime(t)}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {fields.startTime && !time && <p className="mt-2 text-sm text-red-600">{fields.startTime}</p>}
          </div>
        </fieldset>

        <fieldset>
          <legend className="font-display text-2xl text-ink">4. Your details</legend>
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
          <h2 className="font-medium text-ink">Booking summary</h2>
          <p className="mt-1 text-sm text-ink/60">{studio.businessName}</p>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between gap-4"><dt className="text-ink/60">Package</dt><dd className="text-right text-ink">{pkg.name}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-ink/60">Date</dt><dd className="text-right text-ink">{date ? formatDay(date) : "—"}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-ink/60">Time</dt><dd className="text-right text-ink">{time ? formatTimeRange(time, fromMinutes(toMinutes(time) + pkg.durationMinutes)) : "—"}</dd></div>
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
