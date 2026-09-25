/**
 * Firestore security rules tests.
 *
 * Requires a running Firestore emulator (default 127.0.0.1:8080):
 *   npx firebase-tools emulators:start --only firestore --project tasbirghar-f285b
 *   npm run test:rules
 *
 * Uses a separate "demo-" project id so it never touches data in the
 * emulator's tasbirghar-f285b namespace (and can never reach production).
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, beforeEach, describe, test } from "node:test";

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  setLogLevel,
  updateDoc,
  where,
} from "firebase/firestore";

const PROJECT_ID = "demo-tasbirghar-rules";
const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080").split(":");

/* ----------------------------------------------------------------- fixtures */

const media = (studioId, name) => ({
  publicId: `tasbirghar/studios/${studioId}/portfolio/${name}`,
  secureUrl: `https://res.cloudinary.com/db3gc28tp/image/upload/v1/tasbirghar/studios/${studioId}/portfolio/${name}.jpg`,
  width: 1600,
  height: 1200,
  format: "jpg",
  bytes: 250000,
});

const MEDIA_A = media("studioA", "a1");
const MEDIA_B = media("studioB", "b1");

const userDoc = (role, extra = {}) => ({
  role,
  displayName: `User ${role}`,
  email: `${role}@example.com`,
  phone: "9800000000",
  photo: null,
  studioId: null,
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
  ...extra,
});

// The PUBLIC studio document: marketplace fields only. Owner, contact,
// commission and moderation data live in studios/{id}/private/*.
const studioDoc = (slug, listingStatus, profileImage) => ({
  businessName: `Studio ${slug}`,
  slug,
  description: "Newborn and maternity studio",
  location: { city: "kathmandu", area: "Baneshwor", geo: null },
  categories: ["newborn"],
  profileImage,
  coverImage: profileImage,
  facilities: ["Parking"],
  props: ["Moon prop"],
  verificationStatus: "pending",
  listingStatus,
  startingPrice: 1500000,
  currency: "NPR",
  publishedAt: null,
  stats: { ratingAverage: 4.8, reviewCount: 3, portfolioCount: 1, completedBookings: 3 },
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
});

const contactDoc = (slug) => ({
  phone: "9800000001",
  email: `${slug}@example.com`,
  address: "Private street 1",
  website: null,
  instagram: null,
  updatedAt: "2026-01-01",
});

const internalDoc = (ownerId) => ({
  ownerId,
  commissionRateBps: 800,
  lastModeration: null,
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
});

const portfolioDoc = (studioId, image) => ({
  studioId,
  image,
  category: "newborn",
  caption: "Sleeping baby",
  sortOrder: 1,
  isFeatured: false,
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
});

const galleryDoc = (studioId, image) => ({
  studioId,
  kind: "studio",
  image,
  caption: "Main room",
  sortOrder: 1,
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
});

const packageDoc = (studioId, extra = {}) => ({
  studioId,
  name: "Newborn Basic",
  description: "2 hour session",
  category: "newborn",
  price: 1500000,
  currency: "NPR",
  durationMinutes: 120,
  editedPhotos: 15,
  includes: ["2 setups"],
  images: [],
  isActive: true,
  sortOrder: 1,
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
  ...extra,
});

const availabilityDoc = (studioId, date) => ({
  studioId,
  date,
  isClosed: false,
  slots: [{ start: "10:00", end: "12:00", status: "open", bookingId: null }],
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
});

const bookingDoc = (customerId, studioId, studioOwnerId) => ({
  customerId,
  studioId,
  studioOwnerId,
  packageId: "pkg1",
  photographyCategory: "newborn",
  shootDate: "2026-10-01",
  startTime: "10:00",
  endTime: "12:00",
  timezone: "Asia/Kathmandu",
  customerName: "Customer",
  customerPhone: "9800000002",
  customerNote: null,
  bookingStatus: "pending",
  paymentStatus: "unpaid",
  payoutStatus: "not_due",
  currency: "NPR",
  grossAmount: 1500000,
  commissionRateBps: 800,
  commissionAmount: 120000,
  photographerNetAmount: 1380000,
});

const reviewDoc = (bookingId, customerId, studioId, status) => ({
  bookingId,
  studioId,
  customerId,
  customerDisplayName: "Customer",
  rating: 5,
  comment: "Wonderful",
  status,
  studioReply: null,
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
});

const applicationDoc = (uid, status) => ({
  applicantUid: uid,
  applicantEmail: `${uid}@example.com`,
  fullName: "Applicant",
  phone: "+9779800000000",
  businessName: "Applicant Studio",
  city: "kathmandu",
  area: "Baneshwor",
  categories: ["newborn"],
  description: "Newborn photographer with a home studio.",
  yearsOfExperience: 3,
  instagram: null,
  website: null,
  portfolioIntro: "Soft natural light newborn work.",
  status,
  submittedAt: "2026-01-01",
  updatedAt: "2026-01-01",
  reviewedAt: null,
  reviewedBy: null,
  approvedAt: null,
  approvedBy: null,
  rejectionReason: null,
});

/* -------------------------------------------------------------------- setup */

let env;

before(async () => {
  // Denied writes are expected; keep the SDK from logging each one.
  setLogLevel("silent");
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { host, port: Number(port), rules: readFileSync(process.env.RULES_FILE ?? "firestore.rules", "utf8") },
  });
});

after(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const seed = [
      ["users/alice", userDoc("customer")],
      ["users/bob", userDoc("customer")],
      ["users/pa", userDoc("photographer", { studioId: "studioA" })],
      ["users/pb", userDoc("photographer", { studioId: "studioB" })],
      ["users/admin", userDoc("admin")],
      // studioA is published; studioB is a draft (not public).
      ["studios/studioA", studioDoc("studio-a", "published", MEDIA_A)],
      ["studios/studioB", studioDoc("studio-b", "draft", MEDIA_B)],
      ["studios/studioA/private/contact", contactDoc("studio-a")],
      ["studios/studioA/private/internal", internalDoc("pa")],
      ["studios/studioB/private/contact", contactDoc("studio-b")],
      ["studios/studioB/private/internal", internalDoc("pb")],
      ["studios/studioA/portfolio/p1", portfolioDoc("studioA", MEDIA_A)],
      ["studios/studioB/portfolio/p1", portfolioDoc("studioB", MEDIA_B)],
      ["studios/studioA/gallery/g1", galleryDoc("studioA", MEDIA_A)],
      ["studios/studioB/gallery/g1", galleryDoc("studioB", MEDIA_B)],
      ["studios/studioA/packages/pkg1", packageDoc("studioA", { images: [MEDIA_A] })],
      ["studios/studioB/packages/pkg1", packageDoc("studioB", { images: [MEDIA_B] })],
      ["studios/studioA/availability/2026-10-01", availabilityDoc("studioA", "2026-10-01")],
      ["studios/studioB/availability/2026-10-01", availabilityDoc("studioB", "2026-10-01")],
      ["studioSlugs/studio-a", { studioId: "studioA" }],
      ["studioSlugs/studio-b", { studioId: "studioB" }],
      ["bookings/b1", bookingDoc("alice", "studioA", "pa")],
      ["bookings/b2", bookingDoc("bob", "studioB", "pb")],
      ["reviews/b1", reviewDoc("b1", "alice", "studioA", "published")],
      ["reviews/b2", reviewDoc("b2", "bob", "studioB", "pending_moderation")],
      ["platform/settings", { defaultCommissionRateBps: 800 }],
      ["photographerApplications/alice", applicationDoc("alice", "pending")],
      ["photographerApplications/bob", applicationDoc("bob", "rejected")],
    ];
    for (const [path, data] of seed) await setDoc(doc(db, path), data);
  });
});

/* ----------------------------------------------------------------- contexts */

const anon = () => env.unauthenticatedContext().firestore();
const customer = (uid = "alice") => env.authenticatedContext(uid).firestore();
const customerWithClaim = (uid = "alice") =>
  env.authenticatedContext(uid, { role: "customer" }).firestore();
const photographer = (uid = "pa") =>
  env.authenticatedContext(uid, { role: "photographer" }).firestore();
const admin = (uid = "admin") => env.authenticatedContext(uid, { role: "admin" }).firestore();

const ref = (db, path) => doc(db, path);

/* ---------------------------------------------------------- unauthenticated */

describe("unauthenticated", () => {
  test("cannot create a user doc", () =>
    assertFails(setDoc(ref(anon(), "users/newbie"), userDoc("customer"))));
  test("cannot read or modify users", async () => {
    await assertFails(getDoc(ref(anon(), "users/alice")));
    await assertFails(updateDoc(ref(anon(), "users/alice"), { displayName: "x" }));
  });
  test("cannot create or modify studios", async () => {
    await assertFails(setDoc(ref(anon(), "studios/new"), studioDoc("new", "draft", null)));
    await assertFails(updateDoc(ref(anon(), "studios/studioA"), { businessName: "x" }));
  });
  test("cannot create portfolio / gallery / packages / availability", async () => {
    await assertFails(setDoc(ref(anon(), "studios/studioA/portfolio/x"), portfolioDoc("studioA", MEDIA_A)));
    await assertFails(setDoc(ref(anon(), "studios/studioA/gallery/x"), galleryDoc("studioA", MEDIA_A)));
    await assertFails(setDoc(ref(anon(), "studios/studioA/packages/x"), packageDoc("studioA")));
    await assertFails(setDoc(ref(anon(), "studios/studioA/availability/2026-10-02"), availabilityDoc("studioA", "2026-10-02")));
  });
  test("cannot read bookings, create bookings or reviews", async () => {
    await assertFails(getDoc(ref(anon(), "bookings/b1")));
    await assertFails(getDocs(collection(anon(), "bookings")));
    await assertFails(setDoc(ref(anon(), "bookings/new"), bookingDoc("x", "studioA", "pa")));
    await assertFails(setDoc(ref(anon(), "reviews/b1"), reviewDoc("b1", "x", "studioA", "published")));
  });
  test("cannot touch undeclared collections", async () => {
    await assertFails(getDoc(ref(anon(), "platform/settings")));
    await assertFails(setDoc(ref(anon(), "platform/settings"), { defaultCommissionRateBps: 0 }));
  });
  test("CAN read published studio and its content (intended public marketplace)", async () => {
    await assertSucceeds(getDoc(ref(anon(), "studios/studioA")));
    await assertSucceeds(getDoc(ref(anon(), "studios/studioA/portfolio/p1")));
    await assertSucceeds(getDoc(ref(anon(), "studios/studioA/gallery/g1")));
    await assertSucceeds(getDoc(ref(anon(), "studios/studioA/packages/pkg1")));
    await assertSucceeds(getDoc(ref(anon(), "studios/studioA/availability/2026-10-01")));
    await assertSucceeds(
      getDocs(query(collection(anon(), "studios"), where("listingStatus", "==", "published"))),
    );
  });
  test("cannot read draft studio or its content", async () => {
    await assertFails(getDoc(ref(anon(), "studios/studioB")));
    await assertFails(getDoc(ref(anon(), "studios/studioB/portfolio/p1")));
    await assertFails(getDoc(ref(anon(), "studios/studioB/packages/pkg1")));
    await assertFails(getDocs(collection(anon(), "studios")));
  });
  test("CAN get a slug but cannot list slugs (no draft enumeration)", async () => {
    await assertSucceeds(getDoc(ref(anon(), "studioSlugs/studio-a")));
    await assertFails(getDocs(collection(anon(), "studioSlugs")));
    await assertFails(setDoc(ref(anon(), "studioSlugs/hijack"), { studioId: "studioA" }));
  });
  test("CAN read published reviews only", async () => {
    await assertSucceeds(getDoc(ref(anon(), "reviews/b1")));
    await assertFails(getDoc(ref(anon(), "reviews/b2")));
  });
});

/* ------------------------------------------------------------------ customer */

describe("customer", () => {
  test("CAN create own user doc as customer", () =>
    assertSucceeds(setDoc(ref(customer("carol"), "users/carol"), userDoc("customer"))));
  test("CAN read and edit own displayName / phone", async () => {
    await assertSucceeds(getDoc(ref(customer(), "users/alice")));
    await assertSucceeds(
      updateDoc(ref(customer(), "users/alice"), { displayName: "Alice", phone: "9811111111", updatedAt: "2026-02-01" }),
    );
  });
  test("cannot read or edit another user's profile", async () => {
    await assertFails(getDoc(ref(customer(), "users/bob")));
    await assertFails(updateDoc(ref(customer(), "users/bob"), { displayName: "hacked" }));
    await assertFails(setDoc(ref(customer(), "users/bob"), userDoc("customer")));
  });
  test("cannot create a user doc for someone else", () =>
    assertFails(setDoc(ref(customer("carol"), "users/dave"), userDoc("customer"))));
  test("cannot delete own user doc", () => assertFails(deleteDoc(ref(customer(), "users/alice"))));
  test("cannot write server-managed user fields (email, photo, studioId, createdAt)", async () => {
    await assertFails(updateDoc(ref(customer(), "users/alice"), { email: "other@example.com" }));
    await assertFails(updateDoc(ref(customer(), "users/alice"), { photo: MEDIA_B }));
    await assertFails(updateDoc(ref(customer(), "users/alice"), { studioId: "studioA" }));
    await assertFails(updateDoc(ref(customer(), "users/alice"), { createdAt: "2020-01-01" }));
    await assertFails(updateDoc(ref(customer(), "users/alice"), { isVerified: true }));
  });
  test("cannot create a studio directly or edit a studio", async () => {
    await assertFails(setDoc(ref(customer(), "studios/mine"), studioDoc("mine", "draft", null)));
    await assertFails(updateDoc(ref(customer(), "studios/studioA"), { businessName: "x" }));
    await assertFails(updateDoc(ref(customer(), "studios/studioA"), { commissionRateBps: 0 }));
  });
  test("cannot create portfolio / gallery / packages / availability for any studio", async () => {
    const db = customer();
    await assertFails(setDoc(ref(db, "studios/studioA/portfolio/x"), portfolioDoc("studioA", MEDIA_A)));
    await assertFails(setDoc(ref(db, "studios/studioA/gallery/x"), galleryDoc("studioA", MEDIA_A)));
    await assertFails(setDoc(ref(db, "studios/studioA/packages/x"), packageDoc("studioA")));
    await assertFails(setDoc(ref(db, "studios/studioA/availability/2026-10-02"), availabilityDoc("studioA", "2026-10-02")));
    await assertFails(updateDoc(ref(db, "studios/studioA/portfolio/p1"), { caption: "x" }));
  });
  test("CAN read own booking, cannot read others' or list all", async () => {
    await assertSucceeds(getDoc(ref(customer(), "bookings/b1")));
    await assertSucceeds(getDocs(query(collection(customer(), "bookings"), where("customerId", "==", "alice"))));
    await assertFails(getDoc(ref(customer(), "bookings/b2")));
    await assertFails(getDocs(collection(customer(), "bookings")));
  });
  test("cannot create or edit bookings (server-only)", async () => {
    await assertFails(setDoc(ref(customer(), "bookings/new"), bookingDoc("alice", "studioA", "pa")));
    await assertFails(updateDoc(ref(customer(), "bookings/b1"), { bookingStatus: "completed" }));
    await assertFails(updateDoc(ref(customer(), "bookings/b1"), { grossAmount: 100 }));
    await assertFails(deleteDoc(ref(customer(), "bookings/b1")));
  });
  test("cannot fabricate or edit reviews", async () => {
    await assertFails(setDoc(ref(customer(), "reviews/b1"), reviewDoc("b1", "alice", "studioA", "published")));
    await assertFails(setDoc(ref(customer(), "reviews/fake"), reviewDoc("fake", "alice", "studioA", "published")));
    await assertFails(updateDoc(ref(customer(), "reviews/b1"), { rating: 1 }));
    await assertFails(setDoc(ref(customer("bob"), "reviews/b1"), reviewDoc("b1", "bob", "studioA", "published")));
  });
  test("CAN read own unpublished review, not someone else's", async () => {
    await assertSucceeds(getDoc(ref(customer("bob"), "reviews/b2")));
    await assertFails(getDoc(ref(customer("alice"), "reviews/b2")));
  });
  test("cannot access admin-only / undeclared data", async () => {
    await assertFails(getDoc(ref(customer(), "platform/settings")));
    await assertFails(getDocs(collection(customer(), "users")));
  });
});

/* ------------------------------------------------------------ role escalation */

describe("role escalation", () => {
  test("cannot create own user doc as photographer or admin", async () => {
    await assertFails(setDoc(ref(customer("carol"), "users/carol"), userDoc("photographer")));
    await assertFails(setDoc(ref(customer("carol"), "users/carol"), userDoc("admin")));
  });
  test("cannot sign up with a studioId, photo or extra fields", async () => {
    await assertFails(setDoc(ref(customer("carol"), "users/carol"), userDoc("customer", { studioId: "studioA" })));
    await assertFails(setDoc(ref(customer("carol"), "users/carol"), userDoc("customer", { photo: MEDIA_A })));
    await assertFails(setDoc(ref(customer("carol"), "users/carol"), userDoc("customer", { isAdmin: true })));
  });
  test("cannot change role after creation", async () => {
    await assertFails(updateDoc(ref(customer(), "users/alice"), { role: "photographer" }));
    await assertFails(updateDoc(ref(customer(), "users/alice"), { role: "admin" }));
    await assertFails(setDoc(ref(customer(), "users/alice"), userDoc("admin")));
    await assertFails(setDoc(ref(customer(), "users/alice"), { role: "admin" }, { merge: true }));
  });
  test("a Firestore role field grants nothing: users/*.role=admin without claim is not admin", async () => {
    await env.withSecurityRulesDisabled((ctx) =>
      setDoc(ref(ctx.firestore(), "users/mallory"), userDoc("admin")),
    );
    const mallory = customer("mallory");
    await assertFails(getDoc(ref(mallory, "users/alice")));
    await assertFails(getDoc(ref(mallory, "bookings/b1")));
    await assertFails(getDoc(ref(mallory, "studios/studioB")));
  });
  test("a photographer claim alone owns nothing (ownership = server-written users/{uid}.studioId)", async () => {
    await env.withSecurityRulesDisabled((ctx) =>
      setDoc(ref(ctx.firestore(), "users/mallory"), userDoc("photographer")),
    );
    const mallory = photographer("mallory");
    await assertFails(updateDoc(ref(mallory, "studios/studioA"), { businessName: "x" }));
    await assertFails(setDoc(ref(mallory, "studios/studioA/packages/x"), packageDoc("studioA")));
    await assertFails(getDoc(ref(mallory, "studios/studioB")));
    await assertFails(getDoc(ref(mallory, "studios/studioA/private/contact")));
    // …and cannot claim a studio by writing studioId itself.
    await assertFails(updateDoc(ref(mallory, "users/mallory"), { studioId: "studioA" }));
    await assertFails(updateDoc(ref(photographer("pa"), "users/pa"), { studioId: "studioB" }));
    await assertFails(setDoc(ref(customer("eve"), "users/eve"), userDoc("customer", { studioId: "studioA" })));
  });
  test("customer-claim user is treated like any customer", async () => {
    await assertFails(setDoc(ref(customerWithClaim(), "users/alice"), userDoc("admin")));
    await assertFails(getDoc(ref(customerWithClaim(), "bookings/b2")));
  });
  test("photographer claim cannot promote self to admin", async () => {
    await assertFails(updateDoc(ref(photographer(), "users/pa"), { role: "admin" }));
    await assertFails(getDocs(collection(photographer(), "users")));
  });
});

/* -------------------------------------------------------------- photographer */

describe("photographer (owner of studioA)", () => {
  test("cannot create a studio directly (server-only)", async () => {
    await assertFails(setDoc(ref(photographer(), "studios/new"), studioDoc("new", "draft", null)));
    // Overwriting own studio with a full doc that changes protected fields.
    await assertFails(
      setDoc(ref(photographer(), "studios/studioA"), {
        ...studioDoc("studio-a", "published", MEDIA_A),
        commissionRateBps: 0,
      }),
    );
  });
  test("CAN edit allowed profile fields on own studio", () =>
    assertSucceeds(
      updateDoc(ref(photographer(), "studios/studioA"), {
        businessName: "Studio A Renamed",
        description: "Updated",
        location: { city: "lalitpur", area: "Jhamsikhel", geo: null },
        categories: ["newborn", "maternity"],
        facilities: ["Parking", "AC"],
        props: ["Moon prop", "Basket"],
        updatedAt: "2026-02-01",
      }),
    ));
  test("CAN read own draft studio and its content", async () => {
    const pb = photographer("pb");
    await assertSucceeds(getDoc(ref(pb, "studios/studioB")));
    await assertSucceeds(getDoc(ref(pb, "studios/studioB/portfolio/p1")));
  });
  test("cannot delete own studio", () => assertFails(deleteDoc(ref(photographer(), "studios/studioA"))));

  for (const [field, value] of [
    ["ownerId", "mallory"],
    ["ownerId", "pa"],
    ["phone", "9800000009"],
    ["email", "leak@example.com"],
    ["website", "https://example.com"],
    ["instagram", "leak"],
    ["lastModeration", null],
    ["publishedAt", "2026-01-01"],
    ["slug", "better-slug"],
    ["commissionRateBps", 0],
    ["commissionRateBps", 100],
    ["verificationStatus", "verified"],
    ["listingStatus", "draft"],
    ["listingStatus", "suspended"],
    ["stats", { ratingAverage: 5, reviewCount: 999, portfolioCount: 1, completedBookings: 999 }],
    ["startingPrice", 1],
    ["currency", "USD"],
    ["profileImage", MEDIA_B],
    ["coverImage", MEDIA_B],
    ["profileImage", null],
    ["createdAt", "2020-01-01"],
    ["isFeatured", true],
  ]) {
    test(`cannot change protected studio field ${field}=${JSON.stringify(value)}`, () =>
      assertFails(updateDoc(ref(photographer(), "studios/studioA"), { [field]: value })));
  }

  test("owner of a draft studio cannot self-publish or self-verify", async () => {
    const pb = photographer("pb");
    await assertFails(updateDoc(ref(pb, "studios/studioB"), { listingStatus: "published" }));
    await assertFails(updateDoc(ref(pb, "studios/studioB"), { listingStatus: "pending_review" }));
    await assertFails(updateDoc(ref(pb, "studios/studioB"), { verificationStatus: "rejected" }));
  });

  test("cannot put private contact data inside the public location map", async () => {
    const db = photographer();
    await assertFails(
      updateDoc(ref(db, "studios/studioA"), { location: { city: "kathmandu", area: "Baneshwor", address: "Street 1", geo: null } }),
    );
    await assertFails(
      updateDoc(ref(db, "studios/studioA"), { location: { city: "kathmandu", area: "Baneshwor", geo: null, phone: "98" } }),
    );
    await assertFails(updateDoc(ref(db, "studios/studioA"), { "location.address": "Street 1" }));
  });

  test("cannot sneak a protected field alongside allowed ones", () =>
    assertFails(
      updateDoc(ref(photographer(), "studios/studioA"), { businessName: "ok", commissionRateBps: 0 }),
    ));

  test("CAN edit caption / category / order / featured on own portfolio", () =>
    assertSucceeds(
      updateDoc(ref(photographer(), "studios/studioA/portfolio/p1"), {
        caption: "New caption",
        category: "maternity",
        sortOrder: 2,
        isFeatured: true,
        updatedAt: "2026-02-01",
      }),
    ));
  test("CAN edit caption / order on own gallery", () =>
    assertSucceeds(
      updateDoc(ref(photographer(), "studios/studioA/gallery/g1"), { caption: "Lobby", sortOrder: 3 }),
    ));
  test("CAN delete own portfolio photo", () =>
    assertSucceeds(deleteDoc(ref(photographer(), "studios/studioA/portfolio/p1"))));

  test("CAN create a package without media and edit allowed package fields", async () => {
    await assertSucceeds(
      setDoc(ref(photographer(), "studios/studioA/packages/new"), packageDoc("studioA")),
    );
    await assertSucceeds(
      updateDoc(ref(photographer(), "studios/studioA/packages/pkg1"), {
        name: "Newborn Deluxe",
        description: "3 hours",
        category: "family",
        price: 2500000,
        durationMinutes: 180,
        editedPhotos: 25,
        includes: ["3 setups", "1 frame"],
        isActive: false,
        sortOrder: 2,
        updatedAt: "2026-02-01",
      }),
    );
    await assertSucceeds(deleteDoc(ref(photographer(), "studios/studioA/packages/new")));
  });
  test("CAN read own availability (even while the studio is a draft)", async () => {
    await assertSucceeds(getDoc(ref(photographer(), "studios/studioA/availability/2026-10-01")));
    await assertSucceeds(getDoc(ref(photographer("pb"), "studios/studioB/availability/2026-10-01")));
  });
  test("availability is server-written only: the owner cannot create, edit or delete it directly (Phase 4A)", async () => {
    // Owners manage availability through PUT/DELETE /api/studios/{id}/availability/{date},
    // which validates slots and serializes with bookings under the studio-day lock.
    const db = photographer();
    await assertFails(setDoc(ref(db, "studios/studioA/availability/2026-10-02"), availabilityDoc("studioA", "2026-10-02")));
    await assertFails(updateDoc(ref(db, "studios/studioA/availability/2026-10-01"), { isClosed: true }));
    await assertFails(updateDoc(ref(db, "studios/studioA/availability/2026-10-01"), {
      slots: [{ start: "10:00", end: "12:00", status: "open", bookingId: null }, { start: "11:00", end: "13:00", status: "open", bookingId: null }],
    }));
    await assertFails(deleteDoc(ref(db, "studios/studioA/availability/2026-10-01")));
  });
  test("cannot create availability with mismatched date or studioId", async () => {
    await assertFails(
      setDoc(ref(photographer(), "studios/studioA/availability/2026-10-03"), availabilityDoc("studioA", "2026-12-25")),
    );
    await assertFails(
      setDoc(ref(photographer(), "studios/studioA/availability/2026-10-03"), availabilityDoc("studioB", "2026-10-03")),
    );
  });

  test("cannot create bookings or reviews", async () => {
    await assertFails(setDoc(ref(photographer(), "bookings/new"), bookingDoc("alice", "studioA", "pa")));
    await assertFails(setDoc(ref(photographer(), "reviews/b1"), reviewDoc("b1", "alice", "studioA", "published")));
  });
  test("CAN read own studio's bookings; cannot change commission on them", async () => {
    await assertSucceeds(getDoc(ref(photographer(), "bookings/b1")));
    await assertSucceeds(getDocs(query(collection(photographer(), "bookings"), where("studioOwnerId", "==", "pa"))));
    await assertFails(updateDoc(ref(photographer(), "bookings/b1"), { commissionAmount: 0 }));
    await assertFails(updateDoc(ref(photographer(), "bookings/b1"), { photographerNetAmount: 1500000 }));
    await assertFails(updateDoc(ref(photographer(), "bookings/b1"), { bookingStatus: "completed" }));
  });
  test("cannot access admin-only data", async () => {
    await assertFails(getDocs(collection(photographer(), "users")));
    await assertFails(getDoc(ref(photographer(), "users/alice")));
    await assertFails(getDoc(ref(photographer(), "platform/settings")));
  });
});

/* ------------------------------------------------------- cross-studio (A→B) */

describe("cross-studio isolation (photographer A vs studio B)", () => {
  test("cannot read studio B while it is a draft", () =>
    assertFails(getDoc(ref(photographer(), "studios/studioB"))));
  test("cannot edit studio B", async () => {
    await assertFails(updateDoc(ref(photographer(), "studios/studioB"), { businessName: "pwned" }));
    await assertFails(updateDoc(ref(photographer(), "studios/studioB"), { ownerId: "pa" }));
  });
  test("cannot read, edit or delete studio B's portfolio / gallery", async () => {
    const db = photographer();
    await assertFails(getDoc(ref(db, "studios/studioB/portfolio/p1")));
    await assertFails(updateDoc(ref(db, "studios/studioB/portfolio/p1"), { caption: "pwned" }));
    await assertFails(deleteDoc(ref(db, "studios/studioB/portfolio/p1")));
    await assertFails(updateDoc(ref(db, "studios/studioB/gallery/g1"), { caption: "pwned" }));
    await assertFails(deleteDoc(ref(db, "studios/studioB/gallery/g1")));
  });
  test("cannot create, edit or delete studio B's packages / availability", async () => {
    const db = photographer();
    await assertFails(setDoc(ref(db, "studios/studioB/packages/x"), packageDoc("studioB")));
    await assertFails(updateDoc(ref(db, "studios/studioB/packages/pkg1"), { price: 1 }));
    await assertFails(deleteDoc(ref(db, "studios/studioB/packages/pkg1")));
    await assertFails(setDoc(ref(db, "studios/studioB/availability/2026-10-02"), availabilityDoc("studioB", "2026-10-02")));
    await assertFails(updateDoc(ref(db, "studios/studioB/availability/2026-10-01"), { isClosed: true }));
  });
  test("cannot create a package under own studio claiming studio B", () =>
    assertFails(setDoc(ref(photographer(), "studios/studioA/packages/x"), packageDoc("studioB"))));
  test("cannot read studio B's bookings", async () => {
    await assertFails(getDoc(ref(photographer(), "bookings/b2")));
    await assertFails(getDocs(query(collection(photographer(), "bookings"), where("studioOwnerId", "==", "pb"))));
  });
  test("cannot write to a studio that does not exist", async () => {
    await assertFails(setDoc(ref(photographer(), "studios/ghost/packages/x"), packageDoc("ghost")));
    await assertFails(setDoc(ref(photographer(), "studios/ghost/availability/2026-10-01"), availabilityDoc("ghost", "2026-10-01")));
  });
});

/* -------------------------------------------------------------------- media */

describe("media identity is server-controlled", () => {
  test("cannot create portfolio or gallery records directly (even own studio, own media)", async () => {
    await assertFails(setDoc(ref(photographer(), "studios/studioA/portfolio/x"), portfolioDoc("studioA", MEDIA_A)));
    await assertFails(setDoc(ref(photographer(), "studios/studioA/gallery/x"), galleryDoc("studioA", MEDIA_A)));
  });
  test("cannot reference studio B's media in own portfolio / gallery", async () => {
    await assertFails(setDoc(ref(photographer(), "studios/studioA/portfolio/x"), portfolioDoc("studioA", MEDIA_B)));
    await assertFails(updateDoc(ref(photographer(), "studios/studioA/portfolio/p1"), { image: MEDIA_B }));
    await assertFails(updateDoc(ref(photographer(), "studios/studioA/gallery/g1"), { image: MEDIA_B }));
  });
  for (const field of ["publicId", "secureUrl", "width", "height", "format", "bytes"]) {
    test(`cannot change portfolio image.${field}`, () =>
      assertFails(
        updateDoc(ref(photographer(), "studios/studioA/portfolio/p1"), {
          [`image.${field}`]: field === "publicId" || field === "secureUrl" || field === "format" ? "tampered" : 1,
        }),
      ));
  }
  test("cannot change gallery kind or studioId", async () => {
    await assertFails(updateDoc(ref(photographer(), "studios/studioA/gallery/g1"), { kind: "prop" }));
    await assertFails(updateDoc(ref(photographer(), "studios/studioA/gallery/g1"), { studioId: "studioB" }));
    await assertFails(updateDoc(ref(photographer(), "studios/studioA/portfolio/p1"), { studioId: "studioB" }));
  });
  test("cannot replace studio profile/cover image or user photo", async () => {
    await assertFails(updateDoc(ref(photographer(), "studios/studioA"), { profileImage: MEDIA_B }));
    await assertFails(updateDoc(ref(photographer(), "studios/studioA"), { "profileImage.publicId": "tasbirghar/studios/studioB/profile/x" }));
    await assertFails(updateDoc(ref(photographer(), "studios/studioA"), { "coverImage.secureUrl": "https://evil.example/x.jpg" }));
    await assertFails(updateDoc(ref(photographer(), "users/pa"), { photo: MEDIA_B }));
    await assertFails(updateDoc(ref(customer(), "users/alice"), { photo: MEDIA_A }));
  });
});

/* ----------------------------------------------------------------- packages */

describe("package security", () => {
  test("cannot create a package with media attached", async () => {
    await assertFails(setDoc(ref(photographer(), "studios/studioA/packages/x"), packageDoc("studioA", { images: [MEDIA_A] })));
    await assertFails(setDoc(ref(photographer(), "studios/studioA/packages/x"), packageDoc("studioA", { images: [MEDIA_B] })));
  });
  test("cannot change package images", async () => {
    await assertFails(updateDoc(ref(photographer(), "studios/studioA/packages/pkg1"), { images: [MEDIA_B] }));
    await assertFails(updateDoc(ref(photographer(), "studios/studioA/packages/pkg1"), { images: [] }));
  });
  test("cannot change package studioId, currency or createdAt", async () => {
    const pkg = ref(photographer(), "studios/studioA/packages/pkg1");
    await assertFails(updateDoc(pkg, { studioId: "studioB" }));
    await assertFails(updateDoc(pkg, { currency: "USD" }));
    await assertFails(updateDoc(pkg, { createdAt: "2020-01-01" }));
  });
  test("price must be a non-negative integer (paisa)", async () => {
    const col = "studios/studioA/packages";
    await assertFails(setDoc(ref(photographer(), `${col}/neg`), packageDoc("studioA", { price: -100 })));
    await assertFails(setDoc(ref(photographer(), `${col}/float`), packageDoc("studioA", { price: 15000.5 })));
    await assertFails(setDoc(ref(photographer(), `${col}/str`), packageDoc("studioA", { price: "15000" })));
    await assertFails(updateDoc(ref(photographer(), `${col}/pkg1`), { price: -1 }));
    await assertFails(updateDoc(ref(photographer(), `${col}/pkg1`), { price: 99.99 }));
  });
  test("cannot create a package with non-NPR currency or extra fields", async () => {
    await assertFails(setDoc(ref(photographer(), "studios/studioA/packages/x"), packageDoc("studioA", { currency: "USD" })));
    await assertFails(setDoc(ref(photographer(), "studios/studioA/packages/x"), packageDoc("studioA", { commissionRateBps: 0 })));
  });
});

/* -------------------------------------------------------------------- admin */

describe("admin (read-only in rules; mutations are server-side)", () => {
  test("CAN read any user, studio (incl. draft), subcollections, bookings, reviews", async () => {
    const db = admin();
    await assertSucceeds(getDoc(ref(db, "users/alice")));
    await assertSucceeds(getDocs(collection(db, "users")));
    await assertSucceeds(getDoc(ref(db, "studios/studioB")));
    await assertSucceeds(getDocs(collection(db, "studios")));
    await assertSucceeds(getDoc(ref(db, "studios/studioB/portfolio/p1")));
    await assertSucceeds(getDoc(ref(db, "studios/studioB/packages/pkg1")));
    await assertSucceeds(getDoc(ref(db, "bookings/b2")));
    await assertSucceeds(getDocs(collection(db, "bookings")));
    await assertSucceeds(getDoc(ref(db, "reviews/b2")));
  });
  test("cannot write via client SDK: studios, commission, listing, media", async () => {
    const db = admin();
    await assertFails(setDoc(ref(db, "studios/new"), studioDoc("new", "draft", null)));
    await assertFails(updateDoc(ref(db, "studios/studioB"), { listingStatus: "published" }));
    await assertFails(updateDoc(ref(db, "studios/studioA"), { commissionRateBps: 500 }));
    await assertFails(updateDoc(ref(db, "studios/studioA"), { profileImage: MEDIA_B }));
    await assertFails(deleteDoc(ref(db, "studios/studioA")));
    await assertFails(setDoc(ref(db, "studios/studioA/portfolio/x"), portfolioDoc("studioA", MEDIA_A)));
    await assertFails(updateDoc(ref(db, "studios/studioA/packages/pkg1"), { price: 1 }));
  });
  test("cannot write users, bookings, reviews, slugs via client SDK", async () => {
    const db = admin();
    await assertFails(updateDoc(ref(db, "users/alice"), { role: "photographer" }));
    await assertFails(deleteDoc(ref(db, "users/alice")));
    await assertFails(updateDoc(ref(db, "bookings/b1"), { commissionAmount: 0 }));
    await assertFails(setDoc(ref(db, "reviews/b9"), reviewDoc("b9", "alice", "studioA", "published")));
    await assertFails(updateDoc(ref(db, "reviews/b2"), { status: "published" }));
    await assertFails(setDoc(ref(db, "studioSlugs/x"), { studioId: "studioA" }));
  });
  test("cannot read undeclared collections", () =>
    assertFails(getDoc(ref(admin(), "platform/settings"))));
});

/* ------------------------------------------- photographer applications (P2) */

describe("photographerApplications are server-only", () => {
  const approved = { status: "approved", approvedBy: "alice", approvedAt: "2026-02-01" };

  test("applicant cannot read, create, or self-approve their application", async () => {
    const db = customer("alice");
    await assertFails(getDoc(ref(db, "photographerApplications/alice")));
    await assertFails(setDoc(ref(db, "photographerApplications/alice"), applicationDoc("alice", "approved")));
    await assertFails(updateDoc(ref(db, "photographerApplications/alice"), approved));
    await assertFails(deleteDoc(ref(db, "photographerApplications/alice")));
    await assertFails(setDoc(ref(customer("carol"), "photographerApplications/carol"), applicationDoc("carol", "pending")));
  });
  test("other users and photographers cannot read or modify applications", async () => {
    await assertFails(getDoc(ref(customer("bob"), "photographerApplications/alice")));
    await assertFails(getDocs(collection(customer("bob"), "photographerApplications")));
    await assertFails(updateDoc(ref(photographer(), "photographerApplications/alice"), approved));
    await assertFails(getDoc(ref(anon(), "photographerApplications/alice")));
  });
  test("admin cannot approve via client SDK (approval is a server route)", async () => {
    await assertFails(updateDoc(ref(admin(), "photographerApplications/alice"), approved));
    await assertFails(setDoc(ref(admin(), "photographerApplications/alice"), applicationDoc("alice", "approved")));
  });
  test("approval side effects cannot be forged: role mirror and studioId stay server-only", async () => {
    await assertFails(updateDoc(ref(customer("alice"), "users/alice"), { role: "photographer" }));
    await assertFails(updateDoc(ref(customer("alice"), "users/alice"), { studioId: "studioA" }));
    await assertFails(setDoc(ref(customer("alice"), "studios/aliceStudio"), studioDoc("alice", "draft", null)));
    await assertFails(setDoc(ref(customer("alice"), "studioSlugs/alice"), { studioId: "aliceStudio" }));
  });
  test("server-written Phase 2 studio fields are not client-writable", async () => {
    for (const field of ["website", "instagram", "yearsOfExperience", "team", "highlights"]) {
      await assertFails(updateDoc(ref(photographer(), "studios/studioA"), { [field]: "x" }));
    }
  });
});

/* -------------------------------------------- admin moderation fields (P2.1) */

describe("moderation state is server-only", () => {
  const entry = { action: "publish", by: "pa", at: "2026-09-24", reason: null };

  test("owner cannot write lastModeration or the moderation log", async () => {
    await assertFails(updateDoc(ref(photographer(), "studios/studioA"), { lastModeration: entry }));
    await assertFails(setDoc(ref(photographer(), "studios/studioA/moderationLog/x"), entry));
    await assertFails(getDocs(collection(photographer(), "studios/studioA/moderationLog")));
  });
  test("admin cannot write moderation state via the client SDK either", async () => {
    await assertFails(updateDoc(ref(admin(), "studios/studioA"), { lastModeration: entry, listingStatus: "published" }));
    await assertFails(setDoc(ref(admin(), "studios/studioA/moderationLog/x"), entry));
  });
  test("nobody can read the moderation log from the client", async () => {
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), "studios/studioA/moderationLog/l1"), entry));
    await assertFails(getDoc(ref(anon(), "studios/studioA/moderationLog/l1")));
    await assertFails(getDoc(ref(photographer(), "studios/studioA/moderationLog/l1")));
    await assertFails(getDoc(ref(customer(), "studios/studioA/moderationLog/l1")));
  });
  test("review moderation cannot be done from the client", async () => {
    await assertFails(updateDoc(ref(admin(), "reviews/b1"), { status: "hidden", moderation: entry }));
    await assertFails(updateDoc(ref(customer(), "reviews/b1"), { status: "hidden" }));
  });
});


/* ------------------------------------------ private studio sub-documents */

describe("private studio contact / internal documents", () => {
  const CONTACT_A = "studios/studioA/private/contact";
  const INTERNAL_A = "studios/studioA/private/internal";

  test("signed-out users cannot read private contact or internal docs (even of a published studio)", async () => {
    await assertFails(getDoc(ref(anon(), CONTACT_A)));
    await assertFails(getDoc(ref(anon(), INTERNAL_A)));
    await assertFails(getDoc(ref(anon(), "studios/studioB/private/contact")));
    await assertFails(getDocs(collection(anon(), "studios/studioA/private")));
  });
  test("customers cannot read any studio's private docs", async () => {
    for (const db of [customer(), customerWithClaim()]) {
      await assertFails(getDoc(ref(db, CONTACT_A)));
      await assertFails(getDoc(ref(db, INTERNAL_A)));
      await assertFails(getDocs(collection(db, "studios/studioA/private")));
    }
  });
  test("another photographer cannot read another studio's private contact", async () => {
    await assertFails(getDoc(ref(photographer("pb"), CONTACT_A)));
    await assertFails(getDoc(ref(photographer("pa"), "studios/studioB/private/contact")));
    await assertFails(getDoc(ref(photographer("pb"), INTERNAL_A)));
  });
  test("the owner CAN read their own contact doc", async () => {
    await assertSucceeds(getDoc(ref(photographer("pa"), CONTACT_A)));
    await assertSucceeds(getDoc(ref(photographer("pb"), "studios/studioB/private/contact")));
  });
  test("the owner cannot read their internal doc (owner id / commission / moderation are admin-only)", () =>
    assertFails(getDoc(ref(photographer("pa"), INTERNAL_A))));
  test("private docs cannot be listed or queried, even by the owner", async () => {
    await assertFails(getDocs(collection(photographer("pa"), "studios/studioA/private")));
    await assertFails(getDocs(collectionGroup(photographer("pa"), "private")));
    await assertFails(getDocs(collectionGroup(anon(), "private")));
  });
  test("admin CAN read both private docs (read-only)", async () => {
    await assertSucceeds(getDoc(ref(admin(), CONTACT_A)));
    await assertSucceeds(getDoc(ref(admin(), INTERNAL_A)));
    await assertSucceeds(getDoc(ref(admin(), "studios/studioB/private/contact")));
  });
  test("nobody can write private docs from the client (server-only)", async () => {
    for (const db of [anon(), customer(), photographer("pa"), photographer("pb"), admin()]) {
      await assertFails(updateDoc(ref(db, CONTACT_A), { phone: "9811111111" }));
      await assertFails(setDoc(ref(db, CONTACT_A), contactDoc("x")));
      await assertFails(updateDoc(ref(db, INTERNAL_A), { commissionRateBps: 0 }));
      await assertFails(updateDoc(ref(db, INTERNAL_A), { ownerId: "mallory" }));
      await assertFails(setDoc(ref(db, "studios/studioA/private/other"), { x: 1 }));
      await assertFails(deleteDoc(ref(db, CONTACT_A)));
    }
  });
  test("other private doc ids are unreadable", async () => {
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), "studios/studioA/private/other"), { x: 1 }));
    await assertFails(getDoc(ref(photographer("pa"), "studios/studioA/private/other")));
    await assertFails(getDoc(ref(admin(), "studios/studioA/private/other")));
  });
  test("the public studio document holds no private fields", async () => {
    const snap = await assertSucceeds(getDoc(ref(anon(), "studios/studioA")));
    const data = snap.data();
    for (const key of ["ownerId", "phone", "email", "website", "instagram", "commissionRateBps", "lastModeration"]) {
      assert.equal(key in data, false, `public studio doc exposes ${key}`);
    }
    assert.equal("address" in data.location, false);
  });
});

/* --------------------------------------------------------- bookings (P3) */

describe("booking writes stay server-only (Phase 3)", () => {
  const lock = { studioId: "studioA", date: "2026-10-01", writes: 1 };

  test("no client can read or write booking lock documents", async () => {
    for (const db of [anon(), customer(), photographer(), admin()]) {
      await assertFails(getDoc(ref(db, "bookingLocks/studioA_2026-10-01")));
      await assertFails(setDoc(ref(db, "bookingLocks/studioA_2026-10-01"), lock));
    }
  });
  test("customers cannot create, confirm or re-price bookings from the client", async () => {
    await assertFails(setDoc(ref(customer(), "bookings/fake"), { ...bookingDoc("alice", "studioA", "pa"), grossAmount: 1 }));
    await assertFails(updateDoc(ref(customer(), "bookings/b1"), { bookingStatus: "confirmed" }));
    await assertFails(updateDoc(ref(customer(), "bookings/b1"), { bookingStatus: "cancelled_by_customer" }));
    await assertFails(updateDoc(ref(photographer(), "bookings/b1"), { bookingStatus: "confirmed" }));
  });
});


/* ---------------------------------------------- availability + bookings (4A) */

describe("availability and booking integrity (Phase 4A)", () => {
  const AV_A = "studios/studioA/availability/2026-10-01";
  const AV_B = "studios/studioB/availability/2026-10-01";

  test("nobody can write availability from the client (owner, other photographer, customer, admin, anon)", async () => {
    for (const db of [photographer("pa"), photographer("pb"), customer(), customerWithClaim(), admin(), anon()]) {
      await assertFails(updateDoc(ref(db, AV_A), { isClosed: true }));
      await assertFails(setDoc(ref(db, "studios/studioA/availability/2026-11-01"), availabilityDoc("studioA", "2026-11-01")));
      await assertFails(deleteDoc(ref(db, AV_A)));
    }
  });
  test("another photographer cannot read or manage a draft studio's availability", async () => {
    await assertFails(getDoc(ref(photographer("pa"), AV_B)));
    await assertFails(updateDoc(ref(photographer("pa"), AV_B), { isClosed: false }));
  });
  test("no availability for a nonexistent studio", async () => {
    await assertFails(setDoc(ref(photographer(), "studios/ghost/availability/2026-10-01"), availabilityDoc("ghost", "2026-10-01")));
    await assertFails(getDoc(ref(photographer(), "studios/ghost/availability/2026-10-01")));
  });

  const TAMPER = [
    ["bookingStatus", "confirmed"],
    ["bookingStatus", "completed"],
    ["bookingStatus", "cancelled_by_studio"],
    ["grossAmount", 1],
    ["commissionRateBps", 0],
    ["commissionAmount", 0],
    ["photographerNetAmount", 1500000],
    ["studioOwnerId", "pb"],
    ["customerId", "bob"],
    ["studioId", "studioB"],
    ["packageId", "cheap"],
    ["shootDate", "2026-12-25"],
    ["startTime", "06:00"],
    ["paymentStatus", "paid"],
  ];

  test("the studio owner cannot alter any booking field directly", async () => {
    for (const [field, value] of TAMPER) {
      await assertFails(updateDoc(ref(photographer("pa"), "bookings/b1"), { [field]: value }));
    }
    await assertFails(deleteDoc(ref(photographer("pa"), "bookings/b1")));
  });
  test("a photographer cannot read or modify another studio's booking", async () => {
    await assertFails(getDoc(ref(photographer("pa"), "bookings/b2")));
    await assertFails(updateDoc(ref(photographer("pa"), "bookings/b2"), { bookingStatus: "confirmed" }));
  });
  test("the customer can read their booking but cannot change status, price, studio or photographer", async () => {
    await assertSucceeds(getDoc(ref(customer("alice"), "bookings/b1")));
    for (const [field, value] of TAMPER) {
      await assertFails(updateDoc(ref(customer("alice"), "bookings/b1"), { [field]: value }));
    }
  });
  test("no one can create a booking document directly (even a well-formed one)", async () => {
    for (const db of [customer("alice"), photographer("pa"), admin()]) {
      await assertFails(setDoc(ref(db, "bookings/direct"), bookingDoc("alice", "studioA", "pa")));
    }
  });
  test("admin client writes to bookings stay denied", async () => {
    for (const [field, value] of TAMPER) {
      await assertFails(updateDoc(ref(admin(), "bookings/b1"), { [field]: value }));
    }
    await assertFails(deleteDoc(ref(admin(), "bookings/b1")));
  });
});
