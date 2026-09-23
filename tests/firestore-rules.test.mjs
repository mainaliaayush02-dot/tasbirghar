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

import { readFileSync } from "node:fs";
import { after, before, beforeEach, describe, test } from "node:test";

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
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

const studioDoc = (ownerId, slug, listingStatus, profileImage) => ({
  ownerId,
  businessName: `Studio ${slug}`,
  slug,
  description: "Newborn and maternity studio",
  phone: "9800000001",
  email: `${slug}@example.com`,
  location: { city: "kathmandu", area: "Baneshwor", address: null, geo: null },
  categories: ["newborn"],
  profileImage,
  coverImage: profileImage,
  facilities: ["Parking"],
  props: ["Moon prop"],
  verificationStatus: "pending",
  listingStatus,
  startingPrice: 1500000,
  currency: "NPR",
  commissionRateBps: null,
  stats: { ratingAverage: 4.8, reviewCount: 3, portfolioCount: 1, completedBookings: 3 },
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
      ["studios/studioA", studioDoc("pa", "studio-a", "published", MEDIA_A)],
      ["studios/studioB", studioDoc("pb", "studio-b", "draft", MEDIA_B)],
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
    await assertFails(setDoc(ref(anon(), "studios/new"), studioDoc("x", "new", "draft", null)));
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
    await assertFails(setDoc(ref(customer(), "studios/mine"), studioDoc("alice", "mine", "draft", null)));
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
  test("a Firestore role field grants nothing: role=photographer + studioId without ownership", async () => {
    await env.withSecurityRulesDisabled((ctx) =>
      setDoc(ref(ctx.firestore(), "users/mallory"), userDoc("photographer", { studioId: "studioA" })),
    );
    const mallory = photographer("mallory");
    await assertFails(updateDoc(ref(mallory, "studios/studioA"), { businessName: "x" }));
    await assertFails(setDoc(ref(mallory, "studios/studioA/packages/x"), packageDoc("studioA")));
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
    await assertFails(setDoc(ref(photographer(), "studios/new"), studioDoc("pa", "new", "draft", null)));
    // Overwriting own studio with a full doc that changes protected fields.
    await assertFails(
      setDoc(ref(photographer(), "studios/studioA"), {
        ...studioDoc("pa", "studio-a", "published", MEDIA_A),
        commissionRateBps: 0,
      }),
    );
  });
  test("CAN edit allowed profile fields on own studio", () =>
    assertSucceeds(
      updateDoc(ref(photographer(), "studios/studioA"), {
        businessName: "Studio A Renamed",
        description: "Updated",
        phone: "9800000009",
        email: "new@example.com",
        location: { city: "lalitpur", area: "Jhamsikhel", address: null, geo: null },
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
  test("CAN manage own availability", async () => {
    await assertSucceeds(
      setDoc(ref(photographer(), "studios/studioA/availability/2026-10-02"), availabilityDoc("studioA", "2026-10-02")),
    );
    await assertSucceeds(
      updateDoc(ref(photographer(), "studios/studioA/availability/2026-10-01"), { isClosed: true }),
    );
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
    await assertFails(setDoc(ref(db, "studios/new"), studioDoc("x", "new", "draft", null)));
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
