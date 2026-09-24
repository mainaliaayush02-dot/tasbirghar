import Link from "next/link";

import { cityName, NoStudiosYet, VerifiedBadge } from "@/components/public/studio-card";
import { getCategory, isCategorySlug, PHOTOGRAPHY_CATEGORIES } from "@/config/categories";
import { getPublishedPackages } from "@/lib/data/public";
import { formatMoney } from "@/lib/money";
import { buildMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

export async function generateMetadata({ searchParams }: PageProps<"/packages">) {
  const sp = await searchParams;
  return buildMetadata({
    title: "Photography packages & prices in Kathmandu",
    description:
      "Compare photography packages from verified studios in Kathmandu Valley — what's included, session length and price in NPR.",
    path: "/packages",
    index: !sp.category && !sp.sort,
  });
}

export default async function PackagesPage({ searchParams }: PageProps<"/packages">) {
  const sp = await searchParams;
  const category = typeof sp.category === "string" && isCategorySlug(sp.category) ? sp.category : "";
  const sort = sp.sort === "price_desc" ? "price_desc" : "price_asc";
  const all = await getPublishedPackages();
  const packages = all
    .filter((p) => !category || p.category === category)
    .sort((a, b) => (sort === "price_asc" ? a.price - b.price : b.price - a.price));

  return (
    <div className="mx-auto w-full max-w-7xl px-4 pt-10 pb-20 sm:px-6 lg:px-8 lg:pt-14">
      <header className="max-w-3xl">
        <p className="text-sm font-medium tracking-[0.16em] text-brand-600 uppercase">Compare</p>
        <h1 className="mt-3 font-display text-4xl leading-tight tracking-tight text-ink sm:text-5xl">Packages & prices</h1>
        <p className="mt-4 text-lg text-ink/70">
          Every package lists what&apos;s included, how long the session takes and the price in Nepali rupees — set by
          the studio.
        </p>
      </header>

      <nav aria-label="Filter packages" className="mt-10 flex flex-wrap items-center gap-2">
        {[{ slug: "", name: "All" }, ...PHOTOGRAPHY_CATEGORIES].map((c) => {
          const params = new URLSearchParams({ ...(c.slug ? { category: c.slug } : {}), ...(sort !== "price_asc" ? { sort } : {}) });
          const active = category === c.slug;
          return (
            <Link
              key={c.slug || "all"}
              href={`/packages${params.size ? `?${params}` : ""}`}
              aria-current={active ? "page" : undefined}
              className={`rounded-full px-4 py-2 text-sm transition-colors ${active ? "bg-ink text-cream" : "border border-ink/15 text-ink/75 hover:border-ink/30"}`}
            >
              {c.slug ? c.name.replace(" Photography", "") : c.name}
            </Link>
          );
        })}
        <Link
          href={`/packages?${new URLSearchParams({ ...(category ? { category } : {}), sort: sort === "price_asc" ? "price_desc" : "price_asc" })}`}
          className="ml-auto text-sm text-ink/70 hover:text-ink"
        >
          Price: {sort === "price_asc" ? "low → high" : "high → low"} ⇅
        </Link>
      </nav>

      <p className="mt-8 text-sm text-ink/60" role="status">
        {packages.length === 1 ? "1 package" : `${packages.length} packages`}
      </p>
      {packages.length === 0 ? (
        <div className="mt-6">
          <NoStudiosYet filtered={Boolean(category) && all.length > 0} />
        </div>
      ) : (
        <ul className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {packages.map((p) => (
            <li key={`${p.studio.slug}-${p.id}`} className="flex flex-col rounded-3xl bg-white p-6 ring-1 ring-ink/10">
              <p className="text-xs font-semibold tracking-[0.14em] text-brand-600 uppercase">{getCategory(p.category).name}</p>
              <h2 className="mt-2 font-display text-xl text-ink">{p.name}</h2>
              <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink/60">
                <Link href={`/photographers/${p.studio.slug}`} className="font-medium text-ink hover:text-brand-600">
                  {p.studio.businessName}
                </Link>
                · {p.studio.area}, {cityName(p.studio.city)}
                {p.studio.verified && <VerifiedBadge className="ring-1 ring-ink/10" />}
              </p>
              <p className="mt-4 text-sm text-ink/75">{p.description}</p>
              {p.includes.length > 0 && (
                <ul className="mt-4 space-y-1.5 text-sm text-ink/80">
                  {p.includes.slice(0, 4).map((inc) => (
                    <li key={inc} className="flex gap-2">
                      <span aria-hidden className="text-brand-600">✓</span>
                      {inc}
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-auto flex items-end justify-between gap-4 pt-6">
                <div>
                  <p className="font-display text-2xl text-ink">{formatMoney(p.price)}</p>
                  <p className="text-xs text-ink/55">
                    {p.durationMinutes} min · {p.editedPhotos} edited photos
                  </p>
                </div>
                <Link href={`/photographers/${p.studio.slug}/book?package=${p.id}`} className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-cream hover:bg-black">
                  Request
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
