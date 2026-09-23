import "server-only";

import type { DocumentSnapshot } from "firebase-admin/firestore";

import { docId, forbidden, notFound } from "@/lib/api/http";
import { adminDb } from "@/lib/firebase/admin";
import { collections, studioSubcollections } from "@/lib/firestore/paths";
import { toMinorUnits } from "@/lib/money";
import type { PackageInput } from "@/lib/validation/schemas";
import type {
  GalleryImageDTO,
  PackageDTO,
  PortfolioPhotoDTO,
  StudioDTO,
} from "@/types/dto";
import type {
  GalleryImageDoc,
  PackageDoc,
  PortfolioPhotoDoc,
  StudioDoc,
} from "@/types/models";

import { toIso } from "./serialize";
import { getUserStudioId } from "./users";

export const studioRef = (studioId: string) =>
  adminDb().collection(collections.studios).doc(studioId);

export const studioSub = (studioId: string, sub: keyof typeof studioSubcollections) =>
  studioRef(studioId).collection(studioSubcollections[sub]);

function toStudioDTO(snap: DocumentSnapshot): StudioDTO {
  const d = snap.data() as StudioDoc;
  return {
    id: snap.id,
    ownerId: d.ownerId,
    slug: d.slug,
    businessName: d.businessName,
    description: d.description,
    city: d.location.city,
    area: d.location.area,
    address: d.location.address,
    phone: d.phone,
    email: d.email,
    website: d.website ?? null,
    instagram: d.instagram ?? null,
    categories: d.categories,
    yearsOfExperience: d.yearsOfExperience ?? null,
    facilities: d.facilities,
    props: d.props,
    team: d.team ?? null,
    highlights: d.highlights ?? null,
    profileImage: d.profileImage,
    coverImage: d.coverImage,
    verificationStatus: d.verificationStatus,
    listingStatus: d.listingStatus,
    startingPrice: d.startingPrice,
    portfolioCount: d.stats?.portfolioCount ?? 0,
    updatedAt: toIso(d.updatedAt),
  };
}

/** The signed-in photographer's studio (one per photographer in the MVP). */
export async function getOwnedStudio(uid: string): Promise<StudioDTO | null> {
  const studioId = await getUserStudioId(uid);
  if (!studioId) return null;
  const snap = await studioRef(studioId).get();
  if (!snap.exists || snap.get("ownerId") !== uid) return null;
  return toStudioDTO(snap);
}

/**
 * Ownership gate for API routes: the studio must exist and its ownerId must be
 * the verified session uid. Admins are NOT owners — studio content edits are
 * the photographer's; admin moderation uses dedicated routes.
 */
export async function assertStudioOwner(studioId: string, uid: string): Promise<StudioDoc> {
  const snap = await studioRef(docId(studioId, "Studio")).get();
  if (!snap.exists) throw notFound("Studio");
  const studio = snap.data() as StudioDoc;
  if (studio.ownerId !== uid) throw forbidden();
  return studio;
}

export async function listPortfolio(studioId: string): Promise<PortfolioPhotoDTO[]> {
  const snap = await studioSub(studioId, "portfolio").orderBy("sortOrder").get();
  return snap.docs.map((doc) => {
    const d = doc.data() as PortfolioPhotoDoc;
    return {
      id: doc.id,
      image: d.image,
      category: d.category,
      caption: d.caption,
      sortOrder: d.sortOrder,
      isFeatured: d.isFeatured,
    };
  });
}

export async function listGallery(studioId: string): Promise<GalleryImageDTO[]> {
  const snap = await studioSub(studioId, "gallery").orderBy("sortOrder").get();
  return snap.docs.map((doc) => {
    const d = doc.data() as GalleryImageDoc;
    return { id: doc.id, kind: d.kind, image: d.image, caption: d.caption, sortOrder: d.sortOrder };
  });
}

export async function listPackages(studioId: string): Promise<PackageDTO[]> {
  const snap = await studioSub(studioId, "packages").orderBy("sortOrder").get();
  return snap.docs.map((doc) => {
    const d = doc.data() as PackageDoc;
    return {
      id: doc.id,
      name: d.name,
      description: d.description,
      category: d.category,
      price: d.price,
      currency: "NPR",
      durationMinutes: d.durationMinutes,
      editedPhotos: d.editedPhotos,
      includes: d.includes,
      isActive: d.isActive,
      sortOrder: d.sortOrder,
    };
  });
}

/** Keep the denormalized `startingPrice` (lowest active package) in sync. */
export async function refreshStartingPrice(studioId: string): Promise<void> {
  const packages = await studioSub(studioId, "packages").where("isActive", "==", true).get();
  const prices = packages.docs.map((d) => d.get("price") as number);
  await studioRef(studioId).update({
    startingPrice: prices.length ? Math.min(...prices) : null,
  });
}

/** Form input → stored package fields. Rupees become integer paisa here, once. */
export function packageFields(input: PackageInput) {
  return {
    name: input.name,
    description: input.description,
    category: input.category,
    price: toMinorUnits(input.priceNpr),
    durationMinutes: input.durationMinutes,
    editedPhotos: input.editedPhotos,
    includes: input.includes,
    isActive: input.isActive,
    sortOrder: input.sortOrder,
  };
}
