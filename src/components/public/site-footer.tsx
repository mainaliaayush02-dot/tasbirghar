import Link from "next/link";

import { PHOTOGRAPHY_CATEGORIES } from "@/config/categories";
import { LOCATIONS } from "@/config/locations";

import { BrandLogo } from "./brand-logo";

const shortName = (name: string) => name.replace(" Photography", "");

export function SiteFooter() {
  return (
    <footer className="border-t border-ink/10 bg-cream text-ink">
      <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-12 lg:px-8">
        <div className="md:col-span-4">
          <Link href="/" aria-label="TasbirGhar home" className="inline-block">
            <BrandLogo variant="lockup" className="w-44" />
          </Link>
          <p className="mt-4 max-w-xs text-sm text-ink/70">
            Nepal&apos;s photography marketplace — discover, compare and book trusted photographers
            across Kathmandu Valley.
          </p>
        </div>
        <nav aria-label="Photography categories" className="md:col-span-3">
          <h2 className="text-xs font-semibold tracking-[0.14em] text-ink/50 uppercase">Categories</h2>
          <ul className="mt-4 space-y-2 text-sm">
            {PHOTOGRAPHY_CATEGORIES.map((c) => (
              <li key={c.slug}>
                <Link href={`/categories/${c.slug}`} className="text-ink/80 hover:text-brand-600">
                  {shortName(c.name)} photographers
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <nav aria-label="Locations" className="md:col-span-2">
          <h2 className="text-xs font-semibold tracking-[0.14em] text-ink/50 uppercase">Locations</h2>
          <ul className="mt-4 space-y-2 text-sm">
            {LOCATIONS.map((l) => (
              <li key={l.slug}>
                <Link href={`/locations/${l.slug}`} className="text-ink/80 hover:text-brand-600">
                  {l.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <nav aria-label="Company" className="md:col-span-3">
          <h2 className="text-xs font-semibold tracking-[0.14em] text-ink/50 uppercase">TasbirGhar</h2>
          <ul className="mt-4 space-y-2 text-sm">
            {[
              ["/photographers", "Browse photographers"],
              ["/packages", "Compare packages"],
              ["/how-it-works", "How it works"],
              ["/about", "About"],
              ["/contact", "Contact"],
              ["/become-a-photographer", "List your studio"],
            ].map(([href, label]) => (
              <li key={href}>
                <Link href={href} className="text-ink/80 hover:text-brand-600">
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <div className="border-t border-ink/10">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-2 px-4 py-6 text-xs text-ink/55 sm:flex-row sm:justify-between sm:px-6 lg:px-8">
          <p>© {new Date().getFullYear()} TasbirGhar · तस्वीरघर</p>
          <p>Discover. Book. Capture.</p>
        </div>
      </div>
    </footer>
  );
}
