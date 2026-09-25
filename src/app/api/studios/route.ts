import { FieldValue } from "firebase-admin/firestore";

import { apiRoute, ApiError, readJson, requireApiUser, validated } from "@/lib/api/http";
import { studioContactRef, studioInternalRef } from "@/lib/data/studios";
import { adminDb } from "@/lib/firebase/admin";
import { collections } from "@/lib/firestore/paths";
import { DEFAULT_COMMISSION_RATE_BPS } from "@/lib/money";
import { validate } from "@/lib/validation/core";
import { studioCreateSchema } from "@/lib/validation/schemas";

/**
 * POST /api/studios — an approved photographer creates their studio.
 *
 * Writes three documents atomically: the public studio doc, private/contact
 * (phone, email, street address, website, instagram) and private/internal (ownerId,
 * commission). Server-controlled, never read from the body (the schema
 * rejects them): ownerId (session uid), commissionRateBps (platform default, 800),
 * verificationStatus ("unverified"), listingStatus ("draft"), stats,
 * startingPrice, media. The slug is normalized and reserved atomically in
 * studioSlugs/{slug}; one studio per photographer.
 */
export const POST = apiRoute(async (request) => {
  const user = await requireApiUser("photographer");
  const input = validated(validate(studioCreateSchema, await readJson(request)));

  const db = adminDb();
  const userRef = db.collection(collections.users).doc(user.uid);
  const slugRef = db.collection(collections.studioSlugs).doc(input.slug);
  const studioRef = db.collection(collections.studios).doc();

  await db.runTransaction(async (tx) => {
    const [userSnap, slugSnap] = await Promise.all([tx.get(userRef), tx.get(slugRef)]);
    if (userSnap.get("studioId")) {
      throw new ApiError(409, "STUDIO_EXISTS", "You already have a studio.");
    }
    if (slugSnap.exists) {
      throw new ApiError(409, "SLUG_TAKEN", "That studio URL is taken.", {
        slug: "That studio URL is taken. Try another.",
      });
    }

    // Public document: marketplace-facing fields only.
    tx.create(studioRef, {
      slug: input.slug,
      businessName: input.businessName,
      description: input.description,
      location: { city: input.city, area: input.area, geo: null },
      categories: input.categories,
      yearsOfExperience: input.yearsOfExperience,
      facilities: input.facilities,
      props: input.props,
      team: input.team,
      highlights: input.highlights,
      profileImage: null,
      coverImage: null,
      verificationStatus: "unverified",
      listingStatus: "draft",
      publishedAt: null,
      startingPrice: null,
      currency: "NPR",
      stats: { ratingAverage: 0, reviewCount: 0, ratingSum: 0, portfolioCount: 0, completedBookings: 0 },
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    // Private contact (owner + admin readable).
    tx.create(studioContactRef(studioRef.id), {
      phone: input.phone,
      email: input.email,
      address: input.address,
      website: input.website,
      instagram: input.instagram,
      updatedAt: FieldValue.serverTimestamp(),
    });
    // Private internal record (admin readable): authoritative owner + commission.
    tx.create(studioInternalRef(studioRef.id), {
      ownerId: user.uid,
      commissionRateBps: DEFAULT_COMMISSION_RATE_BPS,
      lastModeration: null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.create(slugRef, { studioId: studioRef.id });
    tx.set(userRef, { studioId: studioRef.id, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  });

  return Response.json({ studioId: studioRef.id, slug: input.slug }, { status: 201 });
});
