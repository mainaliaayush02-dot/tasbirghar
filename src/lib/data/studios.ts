import "server-only";

import { docId, forbidden, notFound } from "@/lib/api/http";
import { adminDb } from "@/lib/firebase/admin";
import {
  collections,
  STUDIO_CONTACT_DOC,
  STUDIO_INTERNAL_DOC,
  STUDIO_PRIVATE,
  studioSubcollections,
} from "@/lib/firestore/paths";
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
  StudioContactDoc,
  StudioDoc,
  StudioInternalDoc,
} from "@/types/models";

import { toIso } from "./serialize";
import { getUserStudioId } from "./users";

export const studioRef = (studioId: string) =>
  adminDb().collection(collections.studios).doc(studioId);

export const studioSub = (studioId: string, sub: keyof typeof studioSubcollections) =>
  studioRef(studioId).collection(studioSubcollections[sub]);

export const studioContactRef = (studioId: string) =>
  studioRef(studioId).collection(STUDIO_PRIVATE).doc(STUDIO_CONTACT_DOC);

export const studioInternalRef = (studioId: string) =>
  studioRef(studioId).collection(STUDIO_PRIVATE).doc(STUDIO_INTERNAL_DOC);

/** Server-only: the private internal record (owner, commission, moderation). */
export async function getStudioInternal(studioId: string): Promise<StudioInternalDoc | null> {
  const snap = await studioInternalRef(studioId).get();
  return snap.exists ? (snap.data() as StudioInternalDoc) : null;
}

function toStudioDTO(id: string, d: StudioDoc, contact: StudioContactDoc | undefined): StudioDTO {
  return {
    id,
    slug: d.slug,
    businessName: d.businessName,
    description: d.description,
    city: d.location.city,
    area: d.location.area,
    address: contact?.address ?? null,
    phone: contact?.phone ?? "",
    email: contact?.email ?? null,
    website: contact?.website ?? null,
    instagram: contact?.instagram ?? null,
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

/**
 * The signed-in photographer's studio (one per photographer in the MVP),
 * including its private contact details. Ownership is verified against the
 * server-written private/internal record.
 */
export async function getOwnedStudio(uid: string): Promise<StudioDTO | null> {
  const studioId = await getUserStudioId(uid);
  if (!studioId) return null;
  const [snap, internal, contact] = await adminDb().getAll(
    studioRef(studioId),
    studioInternalRef(studioId),
    studioContactRef(studioId),
  );
  if (!snap.exists || internal.get("ownerId") !== uid) return null;
  return toStudioDTO(snap.id, snap.data() as StudioDoc, contact.data() as StudioContactDoc | undefined);
}

/**
 * Ownership gate for API routes: the studio must exist and its private
 * internal ownerId must be the verified session uid. Admins are NOT owners —
 * studio content edits are the photographer's; admin moderation uses
 * dedicated routes. Returns the public studio document.
 */
export async function assertStudioOwner(studioId: string, uid: string): Promise<StudioDoc> {
  const id = docId(studioId, "Studio");
  const [snap, internal] = await adminDb().getAll(studioRef(id), studioInternalRef(id));
  if (!snap.exists) throw notFound("Studio");
  if (internal.get("ownerId") !== uid) throw forbidden();
  return snap.data() as StudioDoc;
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
