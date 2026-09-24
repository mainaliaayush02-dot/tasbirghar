import Link from "next/link";
import type { ReactNode } from "react";

import { icons } from "./icons";

/* ------------------------------------------------------------- page header */

export function AdminPageHeader({
  title,
  description,
  actions,
  back,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <div className="mb-6 space-y-3">
      {back && (
        <Link href={back.href} className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-ink">
          <span className="rotate-180">{icons.arrowRight}</span>
          {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-[28px]">{title}</h1>
          {description && <p className="mt-1 text-sm text-neutral-500">{description}</p>}
        </div>
        {actions}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- panel */

export function Panel({
  title,
  description,
  actions,
  children,
  className = "",
  bodyClassName = "p-5",
}: {
  title?: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={`rounded-2xl border border-neutral-200/80 bg-white shadow-[0_1px_2px_rgba(43,38,35,0.04)] ${className}`}>
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-neutral-100 px-5 py-4">
          <div className="min-w-0">
            {title && <h2 className="font-semibold text-ink">{title}</h2>}
            {description && <p className="mt-0.5 text-sm text-neutral-500">{description}</p>}
          </div>
          {actions}
        </header>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

/* --------------------------------------------------------------- stat card */

export function StatCard({
  label,
  value,
  hint,
  href,
  accent = false,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  href?: string;
  accent?: boolean;
}) {
  const body = (
    <>
      <p className="text-sm text-neutral-500">{label}</p>
      <p className={`mt-2 text-[26px] leading-none font-semibold tracking-tight ${accent ? "text-brand-700" : "text-ink"}`}>
        {value}
      </p>
      {hint && <p className="mt-2 text-xs text-neutral-500">{hint}</p>}
    </>
  );
  const cls =
    "block rounded-2xl border border-neutral-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(43,38,35,0.04)]";
  return href ? (
    <Link href={href} className={`${cls} transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-brand-500`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/* ------------------------------------------------------------ empty state */

export function EmptyState({
  title,
  children,
  icon = "dashboard",
  action,
}: {
  title: string;
  children?: ReactNode;
  icon?: keyof typeof icons;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <span className="grid size-12 place-items-center rounded-2xl bg-cream text-brand-600 ring-1 ring-brand-100">
        {icons[icon]}
      </span>
      <h3 className="mt-4 font-semibold text-ink">{title}</h3>
      {children && <div className="mt-1 max-w-md text-sm text-neutral-500">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/* ----------------------------------------------------------------- status */

type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "brand";

const tones: Record<Tone, string> = {
  neutral: "bg-neutral-100 text-neutral-700",
  success: "bg-emerald-50 text-emerald-700",
  warning: "bg-amber-50 text-amber-800",
  danger: "bg-red-50 text-red-700",
  info: "bg-sky-50 text-sky-700",
  brand: "bg-brand-50 text-brand-700",
};

const dots: Record<Tone, string> = {
  neutral: "bg-neutral-400",
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  danger: "bg-red-500",
  info: "bg-sky-500",
  brand: "bg-brand-500",
};

export function StatusPill({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${tones[tone]}`}>
      <span aria-hidden className={`size-1.5 rounded-full ${dots[tone]}`} />
      {children}
    </span>
  );
}

export function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex rounded-md bg-neutral-100 px-2 py-0.5 text-xs whitespace-nowrap text-neutral-700">
      {children}
    </span>
  );
}

/* --------------------------------------------------------- responsive table */

export interface Column<T> {
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
  /** Hide on the mobile card view (shown in the table only). */
  mobileHidden?: boolean;
}

/**
 * Real <table> from xl up (wide enough beside the sidebar); stacked cards
 * below that, so there is never horizontal page overflow. The table sits in
 * its own scroll container as a safety net. The first column is the card
 * title in the stacked view.
 */
export function DataTable<T>({
  rows,
  columns,
  rowKey,
  caption,
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  caption: string;
}) {
  const [first, ...rest] = columns;
  return (
    <>
      <div className="hidden overflow-x-auto xl:block">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-neutral-100 text-xs tracking-wide text-neutral-500 uppercase">
              {columns.map((c) => (
                <th key={c.header} scope="col" className={`px-5 py-3 font-medium ${c.className ?? ""}`}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {rows.map((row) => (
              <tr key={rowKey(row)} className="align-top transition-colors hover:bg-cream/50">
                {columns.map((c) => (
                  <td key={c.header} className={`px-5 py-3.5 ${c.className ?? ""}`}>
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="grid divide-y divide-neutral-100 md:grid-cols-2 md:divide-y-0 md:gap-px md:bg-neutral-100 xl:hidden" aria-label={caption}>
        {rows.map((row) => (
          <li key={rowKey(row)} className="min-w-0 space-y-2 bg-white px-4 py-4">
            <div className="min-w-0">{first.cell(row)}</div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              {rest
                .filter((c) => !c.mobileHidden)
                .map((c) => (
                  <div key={c.header} className="contents">
                    <dt className="text-neutral-500">{c.header}</dt>
                    <dd className="min-w-0 break-words text-neutral-800">{c.cell(row)}</dd>
                  </div>
                ))}
            </dl>
          </li>
        ))}
      </ul>
    </>
  );
}

/* ------------------------------------------------------------- filter bar */

/**
 * GET form → URL search params → server-rendered results. Works without
 * client JavaScript and keeps filters shareable/bookmarkable.
 */
export function FilterBar({
  action,
  search,
  selects = [],
  tabs,
}: {
  action: string;
  search?: { name: string; value: string; placeholder: string };
  selects?: { name: string; label: string; value: string; options: { value: string; label: string }[] }[];
  tabs?: { name: string; value: string; options: { value: string; label: string; count?: number }[]; keep?: Record<string, string> };
}) {
  return (
    <div className="space-y-3 border-b border-neutral-100 px-4 py-4 sm:px-5">
      {tabs && (
        <nav aria-label="Status filter" className="-mx-1 flex flex-wrap gap-1">
          {tabs.options.map((t) => {
            const params = new URLSearchParams({ ...(tabs.keep ?? {}), ...(t.value ? { [tabs.name]: t.value } : {}) });
            const active = tabs.value === t.value;
            return (
              <Link
                key={t.value || "all"}
                href={`${action}${params.size ? `?${params}` : ""}`}
                aria-current={active ? "page" : undefined}
                className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
                  active ? "bg-ink text-cream" : "text-neutral-600 hover:bg-neutral-100"
                }`}
              >
                {t.label}
                {t.count !== undefined && (
                  <span className={`ml-1.5 text-xs ${active ? "text-cream/70" : "text-neutral-400"}`}>{t.count}</span>
                )}
              </Link>
            );
          })}
        </nav>
      )}
      {(search || selects.length > 0) && (
        <form action={action} method="get" className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          {tabs?.value && <input type="hidden" name={tabs.name} value={tabs.value} />}
          {search && (
            <label className="relative min-w-0 flex-1 sm:min-w-56">
              <span className="sr-only">Search</span>
              <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-neutral-400">
                {icons.search}
              </span>
              <input
                type="search"
                name={search.name}
                defaultValue={search.value}
                placeholder={search.placeholder}
                maxLength={100}
                className="h-10 w-full rounded-lg border border-neutral-300 bg-white pr-3 pl-9 text-sm placeholder:text-neutral-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none"
              />
            </label>
          )}
          {selects.map((s) => (
            <label key={s.name} className="sm:w-44">
              <span className="sr-only">{s.label}</span>
              <select
                name={s.name}
                defaultValue={s.value}
                className="h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none"
              >
                <option value="">{s.label}</option>
                {s.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <div className="flex gap-2">
            <button type="submit" className="h-10 rounded-lg bg-ink px-4 text-sm font-medium text-cream hover:bg-black">
              Apply
            </button>
            <Link href={action} className="grid h-10 place-items-center rounded-lg px-3 text-sm text-neutral-600 hover:bg-neutral-100">
              Reset
            </Link>
          </div>
        </form>
      )}
    </div>
  );
}

/* -------------------------------------------------------------- pagination */

export function Pagination({
  page,
  pageCount,
  hrefFor,
  total,
}: {
  page: number;
  pageCount: number;
  hrefFor: (page: number) => string;
  total: number;
}) {
  if (pageCount <= 1) return null;
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between border-t border-neutral-100 px-5 py-3 text-sm">
      <span className="text-neutral-500">
        Page {page} of {pageCount} · {total} total
      </span>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link href={hrefFor(page - 1)} className="rounded-lg border border-neutral-300 px-3 py-1.5 hover:bg-neutral-50">
            Previous
          </Link>
        ) : null}
        {page < pageCount ? (
          <Link href={hrefFor(page + 1)} className="rounded-lg border border-neutral-300 px-3 py-1.5 hover:bg-neutral-50">
            Next
          </Link>
        ) : null}
      </div>
    </nav>
  );
}

/* ---------------------------------------------------------------- skeleton */

export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded-lg bg-neutral-200/70 ${className}`} />;
}
