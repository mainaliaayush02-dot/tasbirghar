import Image from "next/image";
import Link from "next/link";

import { CloudinaryImage } from "@/components/media/cloudinary-image";
import { JsonLd } from "@/components/public/json-ld";
import { categoryShort, NoStudiosYet, StudioGrid } from "@/components/public/studio-card";
import { PHOTOGRAPHY_CATEGORIES } from "@/config/categories";
import { LOCATIONS } from "@/config/locations";
import { absoluteUrl, siteConfig } from "@/config/site";
import { filterStudios, getFeaturedPortfolio, getPublishedStudios } from "@/lib/data/public";
import { buildMetadata } from "@/lib/seo";

// Rendered per request from the tagged marketplace cache (no build-time
// Firestore dependency; moderation changes show up immediately).
export const dynamic = "force-dynamic";

export const metadata = buildMetadata({
  title: "Find the right photographer for your moment",
  description:
    "Discover, compare and book newborn, maternity, baby, cake smash, family, couple and studio photographers in Kathmandu, Lalitpur and Bhaktapur. Verified studios, clear packages in NPR.",
  path: "/",
});

const CATEGORY_NOTES: Record<string, string> = {
  newborn: "Gentle, safe sessions in the first weeks.",
  maternity: "Portraits that celebrate the wait.",
  baby: "Milestones from first smiles to first steps.",
  "cake-smash": "First-birthday joy, beautifully messy.",
  family: "Every generation in one frame.",
  couple: "Pre-wedding, anniversaries and everyday love.",
  studio: "Portraits and headshots in a controlled studio.",
};

const STEPS = [
  {
    title: "Discover",
    body: "Browse studios by category and location. Every listing is reviewed by TasbirGhar before it goes live.",
  },
  {
    title: "Compare",
    body: "See real portfolios and clear packages — what's included, how long it takes and the price in NPR.",
  },
  {
    title: "Request & capture",
    body: "Pick a date and time and send a booking request. The studio confirms, and your booking is saved to your account.",
  },
];

export default async function HomePage() {
  const [studios, portfolio] = await Promise.all([getPublishedStudios(), getFeaturedPortfolio(6)]);
  const featured = filterStudios(studios, { sort: "recommended" }).slice(0, 8);
  const heroImages = portfolio.slice(0, 3);

  return (
    <>
      <JsonLd
        data={[
          {
            "@context": "https://schema.org",
            "@type": "Organization",
            name: siteConfig.name,
            alternateName: siteConfig.nameNe,
            url: absoluteUrl("/"),
            logo: absoluteUrl("/brand/logo.png"),
            slogan: "Discover. Book. Capture.",
            areaServed: LOCATIONS.map((l) => ({ "@type": "City", name: l.name })),
          },
          {
            "@context": "https://schema.org",
            "@type": "WebSite",
            name: siteConfig.name,
            url: absoluteUrl("/"),
            potentialAction: {
              "@type": "SearchAction",
              target: { "@type": "EntryPoint", urlTemplate: `${absoluteUrl("/photographers")}?q={search_term_string}` },
              "query-input": "required name=search_term_string",
            },
          },
        ]}
      />

      {/* ---------------------------------------------------------- hero */}
      <section className="relative overflow-hidden">
        <div className="mx-auto grid w-full max-w-7xl items-center gap-12 px-4 pt-12 pb-16 sm:px-6 md:pt-16 lg:grid-cols-[1.1fr_1fr] lg:gap-16 lg:px-8 lg:pt-20 lg:pb-24">
          <div>
            <p className="text-sm font-medium tracking-[0.16em] text-brand-600 uppercase">
              Photography marketplace · Kathmandu Valley
            </p>
            <h1 className="mt-5 font-display text-[40px] leading-[1.05] tracking-tight text-ink sm:text-6xl lg:text-[68px]">
              Find the right photographer for your moment.
            </h1>
            <p className="mt-6 max-w-xl text-lg text-ink/70">
              Compare verified studios, real portfolios and clear packages — then request a booking
              in minutes.
            </p>

            <form action="/photographers" method="get" role="search" className="mt-9 rounded-3xl bg-white p-2 shadow-[0_1px_2px_rgba(48,40,40,0.06),0_12px_32px_-12px_rgba(48,40,40,0.18)] ring-1 ring-ink/10 sm:rounded-full">
              <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                <label className="block rounded-full px-5 py-2.5 hover:bg-cream/70">
                  <span className="block text-[11px] font-semibold tracking-[0.12em] text-ink/50 uppercase">What</span>
                  <select name="category" defaultValue="" className="mt-0.5 w-full appearance-none bg-transparent text-[15px] text-ink focus:outline-none">
                    <option value="">Any photography</option>
                    {PHOTOGRAPHY_CATEGORIES.map((c) => (
                      <option key={c.slug} value={c.slug}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block rounded-full px-5 py-2.5 hover:bg-cream/70 sm:border-l sm:border-ink/10">
                  <span className="block text-[11px] font-semibold tracking-[0.12em] text-ink/50 uppercase">Where</span>
                  <select name="city" defaultValue="" className="mt-0.5 w-full appearance-none bg-transparent text-[15px] text-ink focus:outline-none">
                    <option value="">All of Kathmandu Valley</option>
                    {LOCATIONS.map((l) => (
                      <option key={l.slug} value={l.slug}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="submit" className="h-14 rounded-full bg-brand-600 px-8 text-[15px] font-medium text-white transition-colors hover:bg-brand-700">
                  Find photographers
                </button>
              </div>
            </form>

            <ul className="mt-6 flex flex-wrap gap-2" aria-label="Popular categories">
              {PHOTOGRAPHY_CATEGORIES.slice(0, 5).map((c) => (
                <li key={c.slug}>
                  <Link href={`/categories/${c.slug}`} className="inline-flex rounded-full border border-ink/15 px-3.5 py-1.5 text-sm text-ink/75 hover:border-ink/30 hover:text-ink">
                    {categoryShort(c.slug)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Real portfolio work when studios exist; otherwise the official mark. */}
          {heroImages.length >= 3 ? (
            <div className="grid h-[420px] grid-cols-2 grid-rows-2 gap-3 sm:h-[520px]">
              {heroImages.map((p, i) => (
                <Link
                  key={`${p.studio.slug}-${i}`}
                  href={`/photographers/${p.studio.slug}`}
                  className={`group relative overflow-hidden rounded-3xl bg-ink/5 ${i === 0 ? "row-span-2" : ""}`}
                >
                  <CloudinaryImage
                    asset={p.image}
                    preset="gallery"
                    fill
                    sizes="(min-width: 1024px) 300px, 50vw"
                    className="object-cover transition-transform duration-700 group-hover:scale-[1.03]"
                    alt={`Portfolio work by ${p.studio.businessName}`}
                    preload={i === 0}
                  />
                  <span className="absolute bottom-3 left-3 rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-ink">
                    {p.studio.businessName}
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="relative hidden aspect-square max-h-[520px] place-items-center rounded-[40px] bg-cream ring-1 ring-ink/10 lg:grid">
              <Image src="/brand/logo.png" alt="TasbirGhar — Discover. Book. Capture." width={1254} height={1254} className="w-3/4" sizes="420px" preload />
            </div>
          )}
        </div>
      </section>

      {/* ---------------------------------------------------- categories */}
      <section aria-labelledby="categories-heading" className="border-t border-ink/10 bg-white/50">
        <div className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h2 id="categories-heading" className="font-display text-3xl tracking-tight text-ink sm:text-4xl">
              What are you celebrating?
            </h2>
            <Link href="/photographers" className="text-sm font-medium text-brand-600 hover:text-brand-700">
              Browse all photographers →
            </Link>
          </div>
          <ul className="mt-10 grid gap-px overflow-hidden rounded-3xl bg-ink/10 ring-1 ring-ink/10 sm:grid-cols-2 lg:grid-cols-4">
            {PHOTOGRAPHY_CATEGORIES.map((c, i) => (
              <li key={c.slug} className="bg-cream">
                <Link href={`/categories/${c.slug}`} className="group flex h-full flex-col justify-between gap-8 p-6 transition-colors hover:bg-white">
                  <span className="text-xs font-medium text-ink/40">{String(i + 1).padStart(2, "0")}</span>
                  <span>
                    <span className="block font-display text-2xl text-ink group-hover:text-brand-600">{categoryShort(c.slug)}</span>
                    <span className="mt-1.5 block text-sm text-ink/60">{CATEGORY_NOTES[c.slug]}</span>
                  </span>
                </Link>
              </li>
            ))}
            <li className="bg-ink">
              <Link href="/packages" className="group flex h-full flex-col justify-between gap-8 p-6">
                <span className="text-xs font-medium text-cream/50">Compare</span>
                <span>
                  <span className="block font-display text-2xl text-cream">All packages →</span>
                  <span className="mt-1.5 block text-sm text-cream/65">Side-by-side prices in NPR.</span>
                </span>
              </Link>
            </li>
          </ul>
        </div>
      </section>

      {/* ------------------------------------------------------ featured */}
      <section aria-labelledby="featured-heading">
        <div className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 id="featured-heading" className="font-display text-3xl tracking-tight text-ink sm:text-4xl">
                Studios on TasbirGhar
              </h2>
              <p className="mt-2 text-ink/65">Every studio is reviewed before it appears here.</p>
            </div>
            {featured.length > 0 && (
              <Link href="/photographers" className="text-sm font-medium text-brand-600 hover:text-brand-700">
                See all {studios.length} →
              </Link>
            )}
          </div>
          <div className="mt-10">{featured.length ? <StudioGrid studios={featured} /> : <NoStudiosYet />}</div>
        </div>
      </section>

      {/* ------------------------------------------------- how it works */}
      <section aria-labelledby="how-heading" className="bg-ink text-cream">
        <div className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
          <h2 id="how-heading" className="max-w-2xl font-display text-3xl tracking-tight sm:text-4xl">
            Booking a photographer, without the guesswork.
          </h2>
          <ol className="mt-12 grid gap-10 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title}>
                <span className="font-display text-5xl text-brand-500">{i + 1}</span>
                <h3 className="mt-4 text-lg font-medium">{s.title}</h3>
                <p className="mt-2 text-cream/70">{s.body}</p>
              </li>
            ))}
          </ol>
          <Link href="/how-it-works" className="mt-12 inline-flex rounded-full border border-cream/25 px-5 py-2.5 text-sm font-medium hover:bg-cream/10">
            How TasbirGhar works
          </Link>
        </div>
      </section>

      {/* ----------------------------------------------- trust & pricing */}
      <section aria-labelledby="trust-heading">
        <div className="mx-auto grid w-full max-w-7xl gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:px-8 lg:py-24">
          <div>
            <h2 id="trust-heading" className="font-display text-3xl tracking-tight text-ink sm:text-4xl">
              Built on trust.
            </h2>
            <p className="mt-4 max-w-lg text-ink/70">
              Families trust photographers with their most personal moments. TasbirGhar is designed so
              that trust is earned, not assumed.
            </p>
          </div>
          <dl className="grid gap-8 sm:grid-cols-2">
            {[
              ["Reviewed studios", "Photographers apply, and every studio is checked by our team before it can be published."],
              ["Clear packages", "Each package lists what's included, the session length and the price in Nepali rupees."],
              ["Your booking, on record", "Requests and confirmations are saved to your TasbirGhar account — not lost in a chat."],
              ["Honest reviews", "Reviews can only come from customers whose booking was completed."],
            ].map(([title, body]) => (
              <div key={title} className="border-t border-ink/15 pt-5">
                <dt className="font-medium text-ink">{title}</dt>
                <dd className="mt-2 text-sm text-ink/65">{body}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ------------------------------------------------- photographers */}
      <section aria-labelledby="join-heading" className="px-4 pb-20 sm:px-6 lg:px-8">
        <div className="mx-auto flex w-full max-w-7xl flex-col items-start justify-between gap-8 rounded-[32px] bg-brand-600 px-8 py-12 text-white md:flex-row md:items-center lg:px-14">
          <div>
            <h2 id="join-heading" className="font-display text-3xl tracking-tight sm:text-4xl">
              Are you a photographer?
            </h2>
            <p className="mt-3 max-w-xl text-white/85">
              Show your best work, publish clear packages and receive booking requests from families
              across Kathmandu Valley.
            </p>
          </div>
          <Link href="/become-a-photographer" className="shrink-0 rounded-full bg-white px-6 py-3 font-medium text-ink hover:bg-cream">
            List your studio
          </Link>
        </div>
      </section>
    </>
  );
}
