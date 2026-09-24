import Link from "next/link";

import { PHOTOGRAPHY_CATEGORIES } from "@/config/categories";
import { LOCATIONS } from "@/config/locations";

const select =
  "h-12 w-full rounded-full border border-ink/15 bg-white px-4 text-sm text-ink focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none";

/**
 * GET form → URL params → server-rendered results. Works without JS and
 * makes every filtered view shareable.
 */
export function DiscoveryFilters({
  action = "/photographers",
  values,
  hide = [],
}: {
  action?: string;
  values: { category?: string; city?: string; q?: string; sort?: string };
  hide?: ("category" | "city")[];
}) {
  return (
    <form action={action} method="get" role="search" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_1fr_1fr_1fr_auto]">
      <label className="relative sm:col-span-2 lg:col-span-1">
        <span className="sr-only">Search by studio name or area</span>
        <input
          type="search"
          name="q"
          defaultValue={values.q}
          maxLength={80}
          placeholder="Studio name or area"
          className="h-12 w-full rounded-full border border-ink/15 bg-white px-5 text-sm text-ink placeholder:text-ink/40 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none"
        />
      </label>
      {!hide.includes("category") && (
        <label>
          <span className="sr-only">Category</span>
          <select name="category" defaultValue={values.category ?? ""} className={select}>
            <option value="">All categories</option>
            {PHOTOGRAPHY_CATEGORIES.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name.replace(" Photography", "")}
              </option>
            ))}
          </select>
        </label>
      )}
      {!hide.includes("city") && (
        <label>
          <span className="sr-only">Location</span>
          <select name="city" defaultValue={values.city ?? ""} className={select}>
            <option value="">All of Kathmandu Valley</option>
            {LOCATIONS.map((l) => (
              <option key={l.slug} value={l.slug}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label>
        <span className="sr-only">Sort</span>
        <select name="sort" defaultValue={values.sort ?? "recommended"} className={select}>
          <option value="recommended">Recommended</option>
          <option value="price_asc">Price: low to high</option>
          <option value="price_desc">Price: high to low</option>
          <option value="newest">Newest</option>
        </select>
      </label>
      <div className="flex gap-2">
        <button type="submit" className="h-12 flex-1 rounded-full bg-ink px-6 text-sm font-medium text-cream hover:bg-black lg:flex-none">
          Search
        </button>
        <Link href={action} className="grid h-12 place-items-center rounded-full px-4 text-sm text-ink/70 hover:bg-ink/5">
          Reset
        </Link>
      </div>
    </form>
  );
}
