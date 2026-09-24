import Link from "next/link";
import type { ReactNode } from "react";

import { filterStudios, getPublishedStudios, type StudioSort } from "@/lib/data/public";

import { DiscoveryFilters } from "./discovery-filters";
import { NoStudiosYet, StudioGrid } from "./studio-card";

const SORTS: StudioSort[] = ["recommended", "price_asc", "price_desc", "newest"];

export function readDiscoveryParams(sp: Record<string, string | string[] | undefined>) {
  const one = (k: string) => {
    const v = sp[k];
    return ((Array.isArray(v) ? v[0] : v) ?? "").trim().slice(0, 80);
  };
  const sort = SORTS.find((s) => s === one("sort")) ?? "recommended";
  return { category: one("category"), city: one("city"), q: one("q"), sort };
}

/** Shared server-rendered listing for /photographers, categories and locations. */
export async function Discovery({
  eyebrow,
  title,
  intro,
  params,
  fixed = {},
  action = "/photographers",
  breadcrumbs,
}: {
  eyebrow: string;
  title: string;
  intro: ReactNode;
  params: ReturnType<typeof readDiscoveryParams>;
  fixed?: { category?: string; city?: string };
  action?: string;
  breadcrumbs?: { href: string; label: string }[];
}) {
  const query = { ...params, ...fixed };
  const all = await getPublishedStudios();
  const results = filterStudios(all, query);
  const filtered = Boolean(params.q || params.category || params.city || fixed.category || fixed.city);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 pt-10 pb-20 sm:px-6 lg:px-8 lg:pt-14">
      {breadcrumbs && (
        <nav aria-label="Breadcrumb" className="mb-6 text-sm text-ink/55">
          <ol className="flex flex-wrap items-center gap-1.5">
            {breadcrumbs.map((b, i) => (
              <li key={b.href} className="flex items-center gap-1.5">
                {i > 0 && <span aria-hidden>/</span>}
                {i === breadcrumbs.length - 1 ? (
                  <span aria-current="page" className="text-ink">
                    {b.label}
                  </span>
                ) : (
                  <Link href={b.href} className="hover:text-ink">
                    {b.label}
                  </Link>
                )}
              </li>
            ))}
          </ol>
        </nav>
      )}
      <header className="max-w-3xl">
        <p className="text-sm font-medium tracking-[0.16em] text-brand-600 uppercase">{eyebrow}</p>
        <h1 className="mt-3 font-display text-4xl leading-tight tracking-tight text-ink sm:text-5xl">{title}</h1>
        <div className="mt-4 text-lg text-ink/70">{intro}</div>
      </header>

      <div className="mt-10">
        <DiscoveryFilters
          action={action}
          values={query}
          hide={[...(fixed.category ? (["category"] as const) : []), ...(fixed.city ? (["city"] as const) : [])]}
        />
      </div>

      <p className="mt-8 text-sm text-ink/60" role="status">
        {results.length === 1 ? "1 studio" : `${results.length} studios`}
      </p>
      <div className="mt-6">
        {results.length ? <StudioGrid studios={results} priorityCount={4} /> : <NoStudiosYet filtered={filtered && all.length > 0} />}
      </div>
    </div>
  );
}
