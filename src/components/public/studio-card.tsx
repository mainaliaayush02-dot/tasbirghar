import Image from "next/image";
import Link from "next/link";

import { CloudinaryImage } from "@/components/media/cloudinary-image";
import { getCategory } from "@/config/categories";
import { LOCATIONS } from "@/config/locations";
import type { PublicStudioCard } from "@/lib/data/public";
import { formatMoney } from "@/lib/money";

export const cityName = (slug: string) => LOCATIONS.find((l) => l.slug === slug)?.name ?? slug;
export const categoryShort = (slug: Parameters<typeof getCategory>[0]) =>
  getCategory(slug).name.replace(" Photography", "");

export function VerifiedBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-white/95 px-2 py-0.5 text-[11px] font-semibold tracking-wide text-ink uppercase shadow-sm ${className}`}
      title="Identity and work checked by TasbirGhar"
    >
      <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="size-3.5 text-brand-600">
        <path fillRule="evenodd" d="M10 1.5 3.5 4v5.2c0 4 2.8 7.6 6.5 8.8 3.7-1.2 6.5-4.8 6.5-8.8V4L10 1.5Zm3.2 6.3a.75.75 0 0 0-1.1-1l-3 3.3-1.3-1.3a.75.75 0 1 0-1.1 1l1.9 1.9c.3.3.8.3 1.1 0l3.5-3.9Z" clipRule="evenodd" />
      </svg>
      Verified
    </span>
  );
}

/** Editorial studio card: image-led, restrained type, honest data only. */
export function StudioCard({ studio, priority = false }: { studio: PublicStudioCard; priority?: boolean }) {
  const image = studio.coverImage ?? studio.profileImage;
  return (
    <article className="group relative">
      <div className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-ink/5">
        {image ? (
          <CloudinaryImage
            asset={image}
            preset="card"
            fill
            sizes="(min-width: 1280px) 300px, (min-width: 768px) 33vw, (min-width: 640px) 50vw, 100vw"
            className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
            alt={`${studio.businessName} — photography studio in ${cityName(studio.city)}`}
            preload={priority}
          />
        ) : (
          <div className="grid h-full place-items-center">
            <Image src="/brand/tasbirghar-mark.png" alt="" width={96} height={96} className="opacity-40" />
          </div>
        )}
        {studio.verified && <VerifiedBadge className="absolute top-3 left-3" />}
      </div>
      <div className="mt-4 space-y-1.5">
        <h3 className="font-display text-xl leading-snug text-ink">
          <Link href={`/photographers/${studio.slug}`} className="after:absolute after:inset-0 focus-visible:outline-none">
            {studio.businessName}
          </Link>
        </h3>
        <p className="text-sm text-ink/60">
          {studio.area}, {cityName(studio.city)}
          {studio.reviewCount > 0 && (
            <>
              {" · "}
              <span className="text-ink">★ {studio.ratingAverage.toFixed(1)}</span> ({studio.reviewCount})
            </>
          )}
        </p>
        <p className="text-sm text-ink/60">{studio.categories.slice(0, 3).map(categoryShort).join(" · ")}</p>
        {studio.startingPrice !== null && (
          <p className="pt-1 text-sm">
            <span className="text-ink/60">From </span>
            <span className="font-semibold text-ink">{formatMoney(studio.startingPrice)}</span>
          </p>
        )}
      </div>
      <span className="pointer-events-none absolute inset-0 rounded-2xl ring-brand-500 ring-offset-4 ring-offset-cream group-has-[a:focus-visible]:ring-2" />
    </article>
  );
}

export function StudioGrid({ studios, priorityCount = 0 }: { studios: PublicStudioCard[]; priorityCount?: number }) {
  return (
    <ul className="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {studios.map((s, i) => (
        <li key={s.id}>
          <StudioCard studio={s} priority={i < priorityCount} />
        </li>
      ))}
    </ul>
  );
}

/** Shown instead of fabricated listings when nothing is published yet. */
export function NoStudiosYet({ filtered = false }: { filtered?: boolean }) {
  return (
    <div className="rounded-3xl border border-dashed border-ink/20 px-6 py-16 text-center">
      <Image src="/brand/tasbirghar-mark.png" alt="" width={72} height={72} className="mx-auto opacity-80" />
      <h2 className="mt-5 font-display text-2xl text-ink">
        {filtered ? "No studios match these filters yet" : "Our first studios are being verified"}
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-ink/65">
        {filtered
          ? "Try another category or location — new studios are added as they pass verification."
          : "Every studio on TasbirGhar is reviewed before it appears here. Check back soon, or list your own studio."}
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        {filtered && (
          <Link href="/photographers" className="rounded-full border border-ink/15 px-5 py-2.5 text-sm font-medium text-ink hover:bg-ink/5">
            Clear filters
          </Link>
        )}
        <Link href="/become-a-photographer" className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-cream hover:bg-black">
          List your studio
        </Link>
      </div>
    </div>
  );
}
