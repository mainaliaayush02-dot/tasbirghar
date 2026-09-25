import Link from "next/link";
import { notFound } from "next/navigation";

import { CloudinaryImage } from "@/components/media/cloudinary-image";
import { JsonLd } from "@/components/public/json-ld";
import { PortfolioLightbox } from "@/components/public/portfolio-lightbox";
import { categoryShort, cityName, VerifiedBadge } from "@/components/public/studio-card";
import { getCategory } from "@/config/categories";
import { absoluteUrl } from "@/config/site";
import { cloudinaryUrl } from "@/lib/cloudinary/delivery";
import { getPublishedStudioBySlug } from "@/lib/data/public";
import { formatDate } from "@/lib/format";
import { formatMoney, MINOR_UNITS_PER_MAJOR } from "@/lib/money";
import { buildMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

const KIND_LABEL = { studio: "Studio space", setup: "Setup", prop: "Prop" } as const;

function duration(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return [h ? `${h} hr` : "", m ? `${m} min` : ""].filter(Boolean).join(" ");
}

export async function generateMetadata({ params }: PageProps<"/photographers/[slug]">) {
  const studio = await getPublishedStudioBySlug((await params).slug);
  if (!studio) return { title: "Studio not found", robots: { index: false } };
  const categories = studio.categories.map((c) => getCategory(c).name.toLowerCase()).join(", ");
  const price = studio.startingPrice !== null ? ` Packages from ${formatMoney(studio.startingPrice)}.` : "";
  const hero = studio.coverImage ?? studio.profileImage;
  return buildMetadata({
    title: `${studio.businessName} — ${studio.categories.map(categoryShort).slice(0, 2).join(" & ")} photographer in ${cityName(studio.city)}`,
    description: `${studio.businessName} in ${studio.area}, ${cityName(studio.city)}: ${categories}.${price} ${studio.description}`.slice(0, 300),
    path: `/photographers/${studio.slug}`,
    image: hero
      ? { url: cloudinaryUrl(hero.publicId, { width: 1200, height: 630, crop: "fill", gravity: "auto" }), width: 1200, height: 630, alt: studio.businessName }
      : undefined,
  });
}

export default async function StudioProfilePage({ params }: PageProps<"/photographers/[slug]">) {
  const studio = await getPublishedStudioBySlug((await params).slug);
  if (!studio) notFound();

  const url = absoluteUrl(`/photographers/${studio.slug}`);
  const bookHref = `/photographers/${studio.slug}/book`;
  const hasReviews = studio.reviews.length > 0;

  return (
    <article>
      <JsonLd
        data={[
          {
            "@context": "https://schema.org",
            "@type": "ProfessionalService",
            "@id": url,
            name: studio.businessName,
            url,
            description: studio.description,
            image: [studio.coverImage, studio.profileImage].filter(Boolean).map((m) => cloudinaryUrl(m!.publicId, "gallery")),
            address: { "@type": "PostalAddress", addressLocality: `${studio.area}, ${cityName(studio.city)}`, addressCountry: "NP" },
            areaServed: cityName(studio.city),
            knowsAbout: studio.categories.map((c) => getCategory(c).name),
            ...(studio.startingPrice !== null && { priceRange: `From NPR ${studio.startingPrice / MINOR_UNITS_PER_MAJOR.NPR}` }),
            ...(studio.packages.length && {
              makesOffer: studio.packages.map((p) => ({
                "@type": "Offer",
                name: p.name,
                description: p.description,
                price: p.price / MINOR_UNITS_PER_MAJOR.NPR,
                priceCurrency: "NPR",
                url: `${absoluteUrl(bookHref)}?package=${p.id}`,
              })),
            }),
            // Only when real, completed-booking reviews exist.
            ...(hasReviews && {
              aggregateRating: { "@type": "AggregateRating", ratingValue: studio.ratingAverage.toFixed(1), reviewCount: studio.reviewCount },
            }),
          },
          {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "Photographers", item: absoluteUrl("/photographers") },
              { "@type": "ListItem", position: 2, name: cityName(studio.city), item: absoluteUrl(`/locations/${studio.city}`) },
              { "@type": "ListItem", position: 3, name: studio.businessName, item: url },
            ],
          },
        ]}
      />

      {/* ------------------------------------------------------ cover */}
      <div className="mx-auto w-full max-w-7xl px-4 pt-6 sm:px-6 lg:px-8">
        <nav aria-label="Breadcrumb" className="mb-4 text-sm text-ink/55">
          <ol className="flex flex-wrap items-center gap-1.5">
            <li><Link href="/photographers" className="hover:text-ink">Photographers</Link></li>
            <li aria-hidden>/</li>
            <li><Link href={`/locations/${studio.city}`} className="hover:text-ink">{cityName(studio.city)}</Link></li>
            <li aria-hidden>/</li>
            <li aria-current="page" className="text-ink">{studio.businessName}</li>
          </ol>
        </nav>
        <div className="relative aspect-[16/9] overflow-hidden rounded-[28px] bg-ink/5 sm:aspect-[21/8]">
          {studio.coverImage || studio.portfolio[0] ? (
            <CloudinaryImage
              asset={studio.coverImage ?? studio.portfolio[0].image}
              preset={{ width: 1600, aspectRatio: 21 / 8, crop: "fill", gravity: "auto" }}
              fill
              sizes="(min-width: 1280px) 1216px, 100vw"
              className="object-cover"
              alt={`${studio.businessName} cover photo`}
              preload
            />
          ) : null}
        </div>
      </div>

      <div className="mx-auto grid w-full max-w-7xl gap-12 px-4 pb-20 sm:px-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:px-8">
        <div className="min-w-0">
          {/* --------------------------------------------------- identity */}
          <header className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-5">
            <div className="relative -mt-12 size-24 shrink-0 overflow-hidden rounded-full bg-cream ring-4 ring-cream sm:-mt-14 sm:size-28">
              {studio.profileImage && (
                <CloudinaryImage asset={studio.profileImage} preset="thumbnail" fill sizes="112px" className="object-cover" alt={`${studio.businessName} profile photo`} />
              )}
            </div>
            <div className="min-w-0 sm:pt-4">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-display text-3xl leading-tight tracking-tight text-ink sm:text-4xl">{studio.businessName}</h1>
                {studio.verified && <VerifiedBadge className="ring-1 ring-ink/10" />}
              </div>
              <p className="mt-1.5 text-ink/65">
                {studio.area}, {cityName(studio.city)}
                {studio.yearsOfExperience ? ` · ${studio.yearsOfExperience} years of experience` : ""}
                {hasReviews && ` · ★ ${studio.ratingAverage.toFixed(1)} (${studio.reviewCount} reviews)`}
              </p>
            </div>
          </header>

          <ul className="mt-6 flex flex-wrap gap-2" aria-label="Specialities">
            {studio.categories.map((c) => (
              <li key={c}>
                <Link href={`/categories/${c}`} className="inline-flex rounded-full border border-ink/15 px-3.5 py-1.5 text-sm text-ink/80 hover:border-ink/30">
                  {getCategory(c).name}
                </Link>
              </li>
            ))}
          </ul>

          <section aria-labelledby="about-heading" className="mt-10">
            <h2 id="about-heading" className="sr-only">About {studio.businessName}</h2>
            <p className="max-w-3xl text-lg leading-relaxed whitespace-pre-line text-ink/80">{studio.description}</p>
          </section>

          {/* -------------------------------------------------- portfolio */}
          <section aria-labelledby="portfolio-heading" className="mt-14">
            <h2 id="portfolio-heading" className="font-display text-2xl text-ink sm:text-3xl">Portfolio</h2>
            {studio.portfolio.length ? (
              <div className="mt-6">
                <PortfolioLightbox
                  variant="masonry"
                  items={studio.portfolio.map((p, i) => ({
                    id: p.id,
                    image: p.image,
                    caption: p.caption,
                    alt: p.caption ?? `${p.category ? getCategory(p.category).name : "Portfolio"} photo ${i + 1} by ${studio.businessName}`,
                  }))}
                />
              </div>
            ) : (
              <p className="mt-4 text-ink/60">This studio hasn&apos;t added portfolio photos yet.</p>
            )}
          </section>

          {/* --------------------------------------------------- packages */}
          <section aria-labelledby="packages-heading" className="mt-16">
            <h2 id="packages-heading" className="font-display text-2xl text-ink sm:text-3xl">Packages</h2>
            {studio.packages.length ? (
              <ul className="mt-6 grid gap-4 md:grid-cols-2">
                {studio.packages.map((p) => (
                  <li key={p.id} className="flex flex-col rounded-3xl bg-white p-6 ring-1 ring-ink/10">
                    <p className="text-xs font-semibold tracking-[0.14em] text-brand-600 uppercase">{getCategory(p.category).name}</p>
                    <h3 className="mt-2 font-display text-xl text-ink">{p.name}</h3>
                    <p className="mt-1 text-sm text-ink/60">
                      {duration(p.durationMinutes)} · {p.editedPhotos} edited photos
                    </p>
                    <p className="mt-4 text-sm text-ink/75">{p.description}</p>
                    {p.includes.length > 0 && (
                      <ul className="mt-4 space-y-1.5 text-sm text-ink/80">
                        {p.includes.map((inc) => (
                          <li key={inc} className="flex gap-2">
                            <span aria-hidden className="text-brand-600">✓</span>
                            {inc}
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="mt-auto flex items-end justify-between gap-4 pt-6">
                      <p className="font-display text-2xl text-ink">{formatMoney(p.price)}</p>
                      <Link href={`${bookHref}?package=${p.id}`} className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-cream hover:bg-black">
                        Request booking
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-ink/60">Packages will appear here once the studio publishes them.</p>
            )}
          </section>

          {/* ---------------------------------------------- studio photos */}
          {studio.gallery.length > 0 && (
            <section aria-labelledby="studio-heading" className="mt-16">
              <h2 id="studio-heading" className="font-display text-2xl text-ink sm:text-3xl">The studio</h2>
              <div className="mt-6">
                <PortfolioLightbox
                  items={studio.gallery.map((g) => ({
                    id: g.id,
                    image: g.image,
                    caption: g.caption ?? KIND_LABEL[g.kind],
                    alt: g.caption ?? `${KIND_LABEL[g.kind]} at ${studio.businessName}`,
                  }))}
                />
              </div>
            </section>
          )}

          {(studio.facilities.length > 0 || studio.props.length > 0 || studio.team || studio.highlights) && (
            <section aria-labelledby="details-heading" className="mt-16">
              <h2 id="details-heading" className="font-display text-2xl text-ink sm:text-3xl">Good to know</h2>
              <dl className="mt-6 grid gap-8 sm:grid-cols-2">
                {studio.highlights && (
                  <div className="sm:col-span-2">
                    <dt className="text-sm font-medium text-ink/50">What makes us different</dt>
                    <dd className="mt-2 whitespace-pre-line text-ink/80">{studio.highlights}</dd>
                  </div>
                )}
                {studio.facilities.length > 0 && (
                  <div>
                    <dt className="text-sm font-medium text-ink/50">Facilities</dt>
                    <dd className="mt-2 text-ink/80">{studio.facilities.join(" · ")}</dd>
                  </div>
                )}
                {studio.props.length > 0 && (
                  <div>
                    <dt className="text-sm font-medium text-ink/50">Props & setups</dt>
                    <dd className="mt-2 text-ink/80">{studio.props.join(" · ")}</dd>
                  </div>
                )}
                {studio.team && (
                  <div className="sm:col-span-2">
                    <dt className="text-sm font-medium text-ink/50">Team</dt>
                    <dd className="mt-2 whitespace-pre-line text-ink/80">{studio.team}</dd>
                  </div>
                )}
              </dl>
            </section>
          )}

          {/* ---------------------------------------------------- reviews */}
          <section aria-labelledby="reviews-heading" className="mt-16">
            <h2 id="reviews-heading" className="font-display text-2xl text-ink sm:text-3xl">Reviews</h2>
            {hasReviews ? (
              <ul className="mt-6 space-y-6">
                {studio.reviews.map((r, i) => (
                  <li key={i} className="border-t border-ink/10 pt-6">
                    <p className="text-brand-600" aria-label={`${r.rating} out of 5 stars`}>
                      {"★".repeat(r.rating)}
                      <span className="text-ink/15">{"★".repeat(5 - r.rating)}</span>
                    </p>
                    <p className="mt-2 text-ink/80">{r.comment}</p>
                    <p className="mt-2 text-sm text-ink/50">
                      {r.customerDisplayName} · {formatDate(r.createdAt)}
                    </p>
                    {r.studioReply && <p className="mt-3 rounded-2xl bg-white p-4 text-sm text-ink/70 ring-1 ring-ink/10">Studio reply: {r.studioReply}</p>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-ink/60">No reviews yet. Reviews can only be written by customers after a completed booking.</p>
            )}
          </section>
        </div>

        {/* ------------------------------------------------ booking card */}
        <aside className="lg:pt-10">
          <div className="rounded-3xl bg-white p-6 shadow-[0_1px_2px_rgba(48,40,40,0.06),0_16px_40px_-20px_rgba(48,40,40,0.25)] ring-1 ring-ink/10 lg:sticky lg:top-24">
            {studio.startingPrice !== null ? (
              <p className="text-ink/60">
                From <span className="font-display text-3xl text-ink">{formatMoney(studio.startingPrice)}</span>
              </p>
            ) : (
              <p className="text-ink/60">Packages coming soon</p>
            )}
            <p className="mt-2 text-sm text-ink/60">
              {studio.packages.length} {studio.packages.length === 1 ? "package" : "packages"} · prices in NPR
            </p>
            {studio.packages.length > 0 ? (
              <Link href={bookHref} className="mt-6 block rounded-full bg-brand-600 px-6 py-3.5 text-center font-medium text-white transition-colors hover:bg-brand-700">
                Request a booking
              </Link>
            ) : null}
            <ul className="mt-6 space-y-3 border-t border-ink/10 pt-6 text-sm text-ink/70">
              <li className="flex gap-2"><span aria-hidden className="text-brand-600">✓</span>Choose a package, date and time</li>
              <li className="flex gap-2"><span aria-hidden className="text-brand-600">✓</span>The studio confirms your request</li>
              <li className="flex gap-2"><span aria-hidden className="text-brand-600">✓</span>No payment is taken online yet</li>
            </ul>
          </div>
        </aside>
      </div>
    </article>
  );
}
