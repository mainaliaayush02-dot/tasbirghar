import "server-only";

import { unstable_cache } from "next/cache";

import type { CategorySlug } from "@/config/categories";
import type { LocationSlug } from "@/config/locations";
import { adminDb } from "@/lib/firebase/admin";
import { collections } from "@/lib/firestore/paths";
import type { MinorUnits } from "@/lib/money";
import type { GalleryImageDTO, PackageDTO, PortfolioPhotoDTO } from "@/types/dto";
import type { MediaAsset } from "@/types/media";
import type { ReviewDoc, StudioDoc } from "@/types/models";

import { toIso } from "./serialize";
import { listGallery, listPackages, listPortfolio, studioSub } from "./studios";

/**
 * Public marketplace read model.
 *
 * - ONLY studios with listingStatus == "published" are ever returned. Draft,
 *   pending, suspended and unpublished studios never leave this module.
 * - The public studio document itself holds no owner id, contact details,
 *   commission or moderation data (those live in server-only
 *   studios/{id}/private/*), and public DTOs expose only marketplace fields.
 *   Customers book through TasbirGhar, not off-platform.
 * - Results are cached (tag MARKETPLACE_TAG). Every mutation that can change
 *   public data calls `invalidateMarketplace()` (expire: 0), so moderation
 *   takes effect on the very next request — never served stale.
 */

export const MARKETPLACE_TAG = "marketplace";
const CACHE = { tags: [MARKETPLACE_TAG], revalidate: 300 };
const MAX_PUBLISHED = 500;

export interface PublicStudioCard {
  id: string;
  slug: string;
  businessName: string;
  city: LocationSlug;
  area: string;
  categories: CategorySlug[];
  profileImage: MediaAsset | null;
  coverImage: MediaAsset | null;
  verified: boolean;
  startingPrice: MinorUnits | null;
  portfolioCount: number;
  ratingAverage: number;
  reviewCount: number;
  yearsOfExperience: number | null;
  publishedAt: string | null;
}

export interface PublicReview {
  id: string;
  customerDisplayName: string;
  rating: number;
  comment: string;
  studioReply: string | null;
  createdAt: string | null;
}

export interface PublicStudioProfile extends PublicStudioCard {
  description: string;
  facilities: string[];
  props: string[];
  team: string | null;
  highlights: string | null;
  portfolio: PortfolioPhotoDTO[];
  gallery: GalleryImageDTO[];
  packages: PackageDTO[];
  reviews: PublicReview[];
  updatedAt: string | null;
}

function toCard(id: string, s: StudioDoc): PublicStudioCard {
  return {
    id,
    slug: s.slug,
    businessName: s.businessName,
    city: s.location.city,
    area: s.location.area,
    categories: s.categories,
    profileImage: s.profileImage,
    coverImage: s.coverImage,
    verified: s.verificationStatus === "verified",
    startingPrice: s.startingPrice,
    portfolioCount: s.stats?.portfolioCount ?? 0,
    ratingAverage: s.stats?.ratingAverage ?? 0,
    reviewCount: s.stats?.reviewCount ?? 0,
    yearsOfExperience: s.yearsOfExperience ?? null,
    publishedAt: toIso(s.publishedAt ?? s.createdAt),
  };
}

/** Every published studio (bounded). Filtering/sorting happens per request. */
export const getPublishedStudios = unstable_cache(
  async (): Promise<PublicStudioCard[]> => {
    const snap = await adminDb()
      .collection(collections.studios)
      .where("listingStatus", "==", "published")
      .limit(MAX_PUBLISHED)
      .get();
    return snap.docs.map((d) => toCard(d.id, d.data() as StudioDoc));
  },
  ["public-published-studios"],
  CACHE,
);

/** Slug → published profile, or null (unknown, draft, suspended…). */
export const getPublishedStudioBySlug = unstable_cache(
  async (slug: string): Promise<PublicStudioProfile | null> => {
    if (!/^[a-z0-9-]{3,60}$/.test(slug)) return null;
    const slugDoc = await adminDb().collection(collections.studioSlugs).doc(slug).get();
    const studioId = slugDoc.get("studioId") as string | undefined;
    if (!studioId) return null;
    const snap = await adminDb().collection(collections.studios).doc(studioId).get();
    const studio = snap.data() as StudioDoc | undefined;
    if (!studio || studio.listingStatus !== "published" || studio.slug !== slug) return null;

    const [portfolio, gallery, packages, reviews] = await Promise.all([
      listPortfolio(studioId),
      listGallery(studioId),
      listPackages(studioId),
      adminDb()
        .collection(collections.reviews)
        .where("studioId", "==", studioId)
        .where("status", "==", "published")
        .limit(50)
        .get(),
    ]);

    return {
      ...toCard(studioId, studio),
      description: studio.description,
      facilities: studio.facilities,
      props: studio.props,
      team: studio.team ?? null,
      highlights: studio.highlights ?? null,
      portfolio,
      gallery,
      packages: packages.filter((p) => p.isActive),
      reviews: reviews.docs
        .map((d) => {
          const r = d.data() as ReviewDoc;
          return {
            id: d.id,
            customerDisplayName: r.customerDisplayName,
            rating: r.rating,
            comment: r.comment,
            studioReply: r.studioReply,
            createdAt: toIso(r.createdAt),
          };
        })
        .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? "")),
      updatedAt: toIso(studio.updatedAt),
    };
  },
  ["public-studio-by-slug"],
  CACHE,
);

export interface PublicPackage extends PackageDTO {
  studio: Pick<PublicStudioCard, "slug" | "businessName" | "city" | "area" | "verified" | "profileImage">;
}

/** Active packages across published studios (for /packages). */
export const getPublishedPackages = unstable_cache(
  async (): Promise<PublicPackage[]> => {
    const studios = await getPublishedStudios();
    const lists = await Promise.all(
      studios.map(async (s) => {
        const packages = await listPackages(s.id);
        return packages
          .filter((p) => p.isActive)
          .map((p) => ({
            ...p,
            studio: {
              slug: s.slug,
              businessName: s.businessName,
              city: s.city,
              area: s.area,
              verified: s.verified,
              profileImage: s.profileImage,
            },
          }));
      }),
    );
    return lists.flat();
  },
  ["public-published-packages"],
  CACHE,
);

/** A few featured portfolio images from published studios (home page). */
export const getFeaturedPortfolio = unstable_cache(
  async (limit = 8): Promise<{ image: MediaAsset; studio: Pick<PublicStudioCard, "slug" | "businessName">; category: CategorySlug | null }[]> => {
    const studios = (await getPublishedStudios())
      .filter((s) => s.portfolioCount > 0)
      .sort((a, b) => Number(b.verified) - Number(a.verified) || b.portfolioCount - a.portfolioCount)
      .slice(0, 8);
    const photos = await Promise.all(
      studios.map(async (s) => {
        const snap = await studioSub(s.id, "portfolio").orderBy("sortOrder").limit(6).get();
        const docs = snap.docs.map((d) => d.data() as { image: MediaAsset; isFeatured: boolean; category: CategorySlug | null });
        const pick = docs.find((d) => d.isFeatured) ?? docs[0];
        return pick ? { image: pick.image, category: pick.category, studio: { slug: s.slug, businessName: s.businessName } } : null;
      }),
    );
    return photos.filter((p) => p !== null).slice(0, limit);
  },
  ["public-featured-portfolio"],
  CACHE,
);

/* ------------------------------------------------------------ discovery */

export type StudioSort = "recommended" | "price_asc" | "price_desc" | "newest";

export function filterStudios(
  studios: PublicStudioCard[],
  { category, city, q, sort }: { category?: string; city?: string; q?: string; sort?: StudioSort },
): PublicStudioCard[] {
  const query = q?.trim().toLowerCase();
  const filtered = studios.filter(
    (s) =>
      (!category || s.categories.includes(category as CategorySlug)) &&
      (!city || s.city === city) &&
      (!query || [s.businessName, s.area, s.city].some((f) => f.toLowerCase().includes(query))),
  );
  const price = (s: PublicStudioCard) => s.startingPrice ?? Number.MAX_SAFE_INTEGER;
  return filtered.sort((a, b) => {
    switch (sort) {
      case "price_asc":
        return price(a) - price(b);
      case "price_desc":
        return (b.startingPrice ?? -1) - (a.startingPrice ?? -1);
      case "newest":
        return (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "");
      default:
        // Verified first, then rating (only when reviews exist), then depth of portfolio.
        return (
          Number(b.verified) - Number(a.verified) ||
          b.reviewCount * b.ratingAverage - a.reviewCount * a.ratingAverage ||
          b.portfolioCount - a.portfolioCount
        );
    }
  });
}
