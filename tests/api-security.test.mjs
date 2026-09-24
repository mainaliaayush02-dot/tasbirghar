/**
 * Phase 2 acceptance + security tests against a running app wired to the
 * Firebase emulators (never production). Uploads go to real Cloudinary and
 * are deleted afterwards.
 *
 * Setup (see README → Testing):
 *   1. Firestore emulator on 127.0.0.1:8080 and Auth emulator on 127.0.0.1:9099
 *   2. Build + start the app with the emulator env (demo-tasbirghar project)
 *   3. npm run test:api
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { after, before, describe, test } from "node:test";

import { v2 as cloudinary } from "cloudinary";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3124";
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const PROJECT_ID = process.env.FIREBASE_ADMIN_PROJECT_ID;

if (!AUTH_HOST || !process.env.FIRESTORE_EMULATOR_HOST || !PROJECT_ID?.startsWith("demo-")) {
  throw new Error("Refusing to run: set emulator hosts and a demo- FIREBASE_ADMIN_PROJECT_ID.");
}

const app = initializeApp({ projectId: PROJECT_ID }, "api-tests");
const adminAuth = getAuth(app);
const db = getFirestore(app);
cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const RUN = Date.now().toString(36);
const PASSWORD = "correct-horse-42";
// 1×1 PNG.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

/* ------------------------------------------------------------------ helpers */

async function identity(path, body) {
  const res = await fetch(`http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/${path}?key=demo`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, returnSecureToken: true }),
  });
  const json = await res.json();
  assert.ok(res.ok, JSON.stringify(json));
  return json;
}

/** Sign up (or in) exactly like the browser SDK, then exchange for a session cookie. */
async function login(email, { signup = false, profile } = {}) {
  const { idToken, localId } = await identity(
    signup ? "accounts:signUp" : "accounts:signInWithPassword",
    { email, password: PASSWORD },
  );
  const res = await fetch(`${BASE}/api/auth/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE },
    body: JSON.stringify(profile ? { idToken, profile } : { idToken }),
  });
  const json = await res.json();
  assert.equal(res.status, 200, JSON.stringify(json));
  const cookie = res.headers.get("set-cookie")?.match(/__session=[^;]+/)?.[0];
  assert.ok(cookie, "session cookie set");
  assert.match(res.headers.get("set-cookie"), /HttpOnly/i);
  assert.match(res.headers.get("set-cookie"), /SameSite=lax/i);
  return { uid: localId, cookie, email, role: json.role };
}

async function call(user, method, path, body, headers = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    redirect: "manual",
    headers: {
      Origin: BASE,
      ...(user ? { Cookie: user.cookie } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* html */
  }
  return { status: res.status, json, location: res.headers.get("location") };
}

async function upload(user, studioId, target, galleryKind = null) {
  const signed = await call(user, "POST", "/api/media/sign", { studioId, target, galleryKind });
  assert.equal(signed.status, 200, JSON.stringify(signed.json));
  const form = new FormData();
  for (const [k, v] of Object.entries(signed.json.fields)) form.append(k, v);
  form.append("file", new Blob([PNG], { type: "image/png" }), "t.png");
  const res = await fetch(signed.json.uploadUrl, { method: "POST", body: form });
  const json = await res.json();
  assert.equal(res.status, 200, JSON.stringify(json));
  return json.public_id;
}

const confirm = (user, studioId, target, publicId, galleryKind = null) =>
  call(user, "POST", "/api/media/confirm", { studioId, target, galleryKind, publicId, alt: null });

const cloudinaryExists = (publicId) =>
  cloudinary.api.resource(publicId).then(() => true, () => false);

const application = (extra = {}) => ({
  fullName: "Asha Shrestha",
  phone: "9812345678",
  businessName: "Asha Newborn Studio",
  city: "kathmandu",
  area: "Baneshwor",
  categories: ["newborn", "maternity"],
  description: "Newborn and maternity photographer with a warm, natural-light home studio.",
  yearsOfExperience: 5,
  instagram: "@asha.studio",
  website: "asha-studio.com.np",
  portfolioIntro: "Soft, natural-light newborn work — see instagram for recent sessions.",
  ...extra,
});

const studio = (slug, extra = {}) => ({
  businessName: `Studio ${slug}`,
  slug,
  description: "A calm, safe studio for newborn and maternity sessions in Kathmandu.",
  city: "kathmandu",
  area: "Baneshwor",
  address: null,
  phone: "9812345678",
  email: "studio@example.com",
  website: null,
  instagram: null,
  categories: ["newborn"],
  yearsOfExperience: 5,
  facilities: ["Parking", "AC"],
  props: ["Moon prop"],
  team: null,
  highlights: null,
  ...extra,
});

/** Studio profile body for PUT (the slug is fixed at creation). */
const profileOf = (body) => Object.fromEntries(Object.entries(body).filter(([key]) => key !== "slug"));

const pkg = (extra = {}) => ({
  name: "Newborn Classic",
  description: "Two hour newborn session with two setups.",
  category: "newborn",
  priceNpr: 15000,
  durationMinutes: 120,
  editedPhotos: 15,
  includes: ["2 setups", "Parent shots"],
  isActive: true,
  sortOrder: 0,
  ...extra,
});

/* -------------------------------------------------------------------- state */

const S = {};

before(async () => {
  const res = await fetch(`${BASE}/robots.txt`).catch(() => null);
  assert.ok(res?.ok, `App not reachable at ${BASE}`);
});

after(async () => {
  for (const studioId of [S.studioA, S.studioB].filter(Boolean)) {
    await cloudinary.api.delete_resources_by_prefix(`tasbirghar/studios/${studioId}/`).catch(() => {});
  }
});

/* ============================================================== 1. customer */

describe("customer: signup → session → account", () => {
  test("signup creates a session and a server-written users doc", async () => {
    S.alice = await login(`alice-${RUN}@example.com`, {
      signup: true,
      profile: { displayName: "Alice Customer", phone: "98 1234 5678" },
    });
    assert.equal(S.alice.role, "customer");
    const doc = (await db.doc(`users/${S.alice.uid}`).get()).data();
    assert.equal(doc.uid, S.alice.uid);
    assert.equal(doc.email, `alice-${RUN}@example.com`); // from the verified token
    assert.equal(doc.role, "customer");
    assert.equal(doc.displayName, "Alice Customer");
    assert.equal(doc.phone, "+9779812345678"); // normalized
    assert.ok(doc.createdAt && doc.updatedAt);
  });

  test("session exchange rejects client-supplied email/role and bad tokens", async () => {
    const { idToken } = await identity("accounts:signUp", { email: `mallory-${RUN}@example.com`, password: PASSWORD });
    const withEmail = await call(null, "POST", "/api/auth/session", {
      idToken,
      profile: { displayName: "M", phone: null, email: "ceo@tasbirghar.com" },
    });
    assert.equal(withEmail.status, 422);
    const withRole = await call(null, "POST", "/api/auth/session", { idToken, role: "admin" });
    assert.equal(withRole.status, 422);
    const forged = await call(null, "POST", "/api/auth/session", { idToken: "not-a-token" });
    assert.equal(forged.status, 401);
  });

  test("account page renders for the signed-in customer", async () => {
    const page = await call(S.alice, "GET", "/account");
    assert.equal(page.status, 200);
  });

  test("customer edits only permitted fields, with validation", async () => {
    const ok = await call(S.alice, "PATCH", "/api/account", { displayName: "Alice K", phone: "9800000001" });
    assert.equal(ok.status, 200);
    const role = await call(S.alice, "PATCH", "/api/account", { displayName: "A", phone: null, role: "admin" });
    assert.equal(role.status, 422);
    assert.ok(role.json.error.fields.role);
    const studioId = await call(S.alice, "PATCH", "/api/account", { displayName: "Alice", phone: null, studioId: "x" });
    assert.equal(studioId.status, 422);
    const bad = await call(S.alice, "PATCH", "/api/account", { displayName: "x".repeat(200), phone: "12" });
    assert.equal(bad.status, 422);
    assert.ok(bad.json.error.fields.displayName && bad.json.error.fields.phone);
    const doc = (await db.doc(`users/${S.alice.uid}`).get()).data();
    assert.equal(doc.role, "customer");
    assert.equal(doc.studioId, null);
  });

  test("mutations require same-origin", async () => {
    const noOrigin = await call(S.alice, "PATCH", "/api/account", { displayName: "Alice", phone: null }, { Origin: "" });
    assert.equal(noOrigin.status, 403);
    const evil = await call(S.alice, "PATCH", "/api/account", { displayName: "Alice", phone: null }, { Origin: "https://evil.example" });
    assert.equal(evil.status, 403);
  });

  test("customer cannot become photographer/admin, create a studio or use admin/media APIs", async () => {
    assert.equal((await call(S.alice, "POST", "/api/studios", studio(`alice-${RUN}`))).status, 403);
    assert.equal((await call(S.alice, "POST", `/api/admin/applications/${S.alice.uid}`, { action: "approve" })).status, 403);
    assert.equal((await call(S.alice, "POST", "/api/media/sign", { studioId: "x", target: "portfolio" })).status, 403);
    const dash = await call(S.alice, "GET", "/dashboard");
    assert.equal(dash.status, 307);
    assert.match(dash.location, /\/become-a-photographer$/);
    assert.equal((await call(S.alice, "GET", "/admin")).status, 404);
    const claims = (await adminAuth.getUser(S.alice.uid)).customClaims ?? {};
    assert.equal(claims.role, undefined);
  });

  test("signed-out requests are rejected", async () => {
    assert.equal((await call(null, "PATCH", "/api/account", { displayName: "x", phone: null })).status, 401);
    assert.equal((await call(null, "POST", "/api/studios", studio("anon"))).status, 401);
    assert.equal((await call(null, "GET", "/dashboard")).status, 307);
  });
});

/* ========================================= 2. application → admin approval */

describe("photographer onboarding: application → admin approval → claim", () => {
  test("application is validated and cannot carry status/approval fields", async () => {
    const invalid = await call(S.alice, "POST", "/api/photographer-applications", application({
      phone: "123", website: "javascript:alert(1)", categories: ["wedding-spam"], description: "short",
    }));
    assert.equal(invalid.status, 422);
    for (const f of ["phone", "website", "categories", "description"]) assert.ok(invalid.json.error.fields[f], f);

    const smuggled = await call(S.alice, "POST", "/api/photographer-applications", {
      ...application(), status: "approved", approvedBy: S.alice.uid,
    });
    assert.equal(smuggled.status, 422);
  });

  test("customer submits an application (pending), cannot resubmit while pending", async () => {
    const res = await call(S.alice, "POST", "/api/photographer-applications", application());
    assert.equal(res.status, 201);
    const doc = (await db.doc(`photographerApplications/${S.alice.uid}`).get()).data();
    assert.equal(doc.status, "pending");
    assert.equal(doc.applicantUid, S.alice.uid);
    assert.equal(doc.applicantEmail, S.alice.email);
    assert.equal(doc.website, "https://asha-studio.com.np/");
    assert.equal(doc.instagram, "asha.studio");
    assert.equal((await call(S.alice, "POST", "/api/photographer-applications", application())).status, 409);
  });

  test("applicant cannot approve their own application", async () => {
    const res = await call(S.alice, "POST", `/api/admin/applications/${S.alice.uid}`, { action: "approve" });
    assert.equal(res.status, 403);
  });

  test("admin bootstrap is a local script, not an endpoint", async () => {
    S.admin = await login(`admin-${RUN}@example.com`, { signup: true, profile: { displayName: "Ops Admin", phone: null } });
    // Revocation has 1-second granularity (auth_time < validSince), so a session
    // minted in the same second as the revoke would survive; real bootstraps
    // happen long after sign-in.
    await new Promise((r) => setTimeout(r, 1100));
    execFileSync("node", ["scripts/grant-admin.mjs", "--email", S.admin.email, "--yes"], { env: process.env });
    assert.equal((await adminAuth.getUser(S.admin.uid)).customClaims.role, "admin");
    // Bootstrap revokes old sessions; the admin signs in again.
    assert.equal((await call(S.admin, "PATCH", "/api/account", { displayName: "Ops", phone: null })).status, 401);
    S.admin = await login(S.admin.email);
    assert.equal(S.admin.role, "admin");
    assert.equal((await call(S.admin, "GET", "/admin")).status, 200);
    assert.equal((await call(S.admin, "GET", "/admin/applications")).status, 200);
  });

  test("admin approves: claim + application + role mirror updated server-side", async () => {
    const res = await call(S.admin, "POST", `/api/admin/applications/${S.alice.uid}`, { action: "approve" });
    assert.equal(res.status, 200, JSON.stringify(res.json));
    assert.equal((await adminAuth.getUser(S.alice.uid)).customClaims.role, "photographer");
    const app = (await db.doc(`photographerApplications/${S.alice.uid}`).get()).data();
    assert.equal(app.status, "approved");
    assert.equal(app.approvedBy, S.admin.uid);
    assert.ok(app.approvedAt);
    assert.equal((await db.doc(`users/${S.alice.uid}`).get()).get("role"), "photographer");
    const again = await call(S.admin, "POST", `/api/admin/applications/${S.alice.uid}`, { action: "approve" });
    assert.equal(again.status, 409);
  });

  test("the new role takes effect immediately on the existing session (live claims)", async () => {
    assert.equal((await call(S.alice, "GET", "/dashboard")).status, 200);
    assert.equal((await call(S.alice, "GET", "/admin")).status, 404);
  });

  test("admin can reject; rejected applicant may reapply", async () => {
    S.carol = await login(`carol-${RUN}@example.com`, { signup: true, profile: { displayName: "Carol", phone: null } });
    await call(S.carol, "POST", "/api/photographer-applications", application({ businessName: "Carol Studio" }));
    const rej = await call(S.admin, "POST", `/api/admin/applications/${S.carol.uid}`, { action: "reject", reason: "Please share more portfolio work." });
    assert.equal(rej.status, 200);
    assert.equal((await adminAuth.getUser(S.carol.uid)).customClaims?.role, undefined);
    assert.equal((await call(S.carol, "POST", "/api/photographer-applications", application())).status, 201);
  });

  test("second photographer (studio B owner) onboarded for isolation tests", async () => {
    S.bob = await login(`bob-${RUN}@example.com`, { signup: true, profile: { displayName: "Bob", phone: null } });
    await call(S.bob, "POST", "/api/photographer-applications", application({ businessName: "Bob Studio" }));
    assert.equal((await call(S.admin, "POST", `/api/admin/applications/${S.bob.uid}`, { action: "approve" })).status, 200);
  });
});

/* ========================================================= 3. studio create */

describe("studio creation (server-authoritative)", () => {
  test("browser cannot supply ownerId / commission / status fields", async () => {
    for (const extra of [
      { ownerId: S.bob.uid },
      { commissionRateBps: 0 },
      { verificationStatus: "verified" },
      { listingStatus: "published" },
      { profileImage: { publicId: "x", secureUrl: "y" } },
    ]) {
      const res = await call(S.alice, "POST", "/api/studios", studio(`a-${RUN}`, extra));
      assert.equal(res.status, 422, JSON.stringify(extra));
    }
  });

  test("validation: categories, slug, phone, url", async () => {
    const res = await call(S.alice, "POST", "/api/studios", studio("admin", {
      categories: ["wedding"], phone: "abc", website: "not a url",
    }));
    assert.equal(res.status, 422);
    for (const f of ["slug", "categories", "phone", "website"]) assert.ok(res.json.error.fields[f], f);
  });

  test("photographer creates studio: normalized slug, owner from session, 800 bps, draft", async () => {
    const res = await call(S.alice, "POST", "/api/studios", studio(`  Alice Studio ${RUN}!! `));
    assert.equal(res.status, 201, JSON.stringify(res.json));
    S.studioA = res.json.studioId;
    assert.equal(res.json.slug, `alice-studio-${RUN}`);
    const doc = (await db.doc(`studios/${S.studioA}`).get()).data();
    assert.equal(doc.ownerId, S.alice.uid);
    assert.equal(doc.commissionRateBps, 800);
    assert.equal(doc.listingStatus, "draft");
    assert.equal(doc.verificationStatus, "unverified");
    assert.equal(doc.currency, "NPR");
    assert.equal((await db.doc(`studioSlugs/${doc.slug}`).get()).get("studioId"), S.studioA);
    assert.equal((await db.doc(`users/${S.alice.uid}`).get()).get("studioId"), S.studioA);
  });

  test("one studio per photographer; slugs are unique", async () => {
    assert.equal((await call(S.alice, "POST", "/api/studios", studio(`another-${RUN}`))).status, 409);
    const taken = await call(S.bob, "POST", "/api/studios", studio(`alice-studio-${RUN}`));
    assert.equal(taken.status, 409);
    const b = await call(S.bob, "POST", "/api/studios", studio(`bob-studio-${RUN}`));
    assert.equal(b.status, 201);
    S.studioB = b.json.studioId;
  });

  test("owner updates own profile; protected fields cannot be changed", async () => {
    const ok = await call(S.alice, "PUT", `/api/studios/${S.studioA}`, { ...profileOf(studio("x")), businessName: "Alice Studio Renamed", team: "Alice + 1 assistant" });
    assert.equal(ok.status, 200, JSON.stringify(ok.json));
    const withSlug = await call(S.alice, "PUT", `/api/studios/${S.studioA}`, studio("new-slug"));
    assert.equal(withSlug.status, 422);
    const withCommission = await call(S.alice, "PUT", `/api/studios/${S.studioA}`, { ...profileOf(studio("x")), commissionRateBps: 0 });
    assert.equal(withCommission.status, 422);
    const doc = (await db.doc(`studios/${S.studioA}`).get()).data();
    assert.equal(doc.businessName, "Alice Studio Renamed");
    assert.equal(doc.commissionRateBps, 800);
    assert.equal(doc.slug, `alice-studio-${RUN}`);
  });
});

/* ======================================================= 4. cross-studio */

describe("cross-studio isolation (photographer A vs studio B)", () => {
  const profile = profileOf(studio("x"));

  test("A cannot update B's profile or sign uploads for B", async () => {
    assert.equal((await call(S.alice, "PUT", `/api/studios/${S.studioB}`, profile)).status, 403);
    assert.equal((await call(S.alice, "POST", "/api/media/sign", { studioId: S.studioB, target: "portfolio" })).status, 403);
    assert.equal((await call(S.alice, "POST", "/api/media/sign", { studioId: S.studioB, target: "profile" })).status, 403);
  });

  test("A cannot create/edit/delete B's packages", async () => {
    assert.equal((await call(S.alice, "POST", `/api/studios/${S.studioB}/packages`, pkg())).status, 403);
    const bPkg = await call(S.bob, "POST", `/api/studios/${S.studioB}/packages`, pkg());
    assert.equal(bPkg.status, 201);
    S.bPackage = bPkg.json.id;
    assert.equal((await call(S.alice, "PUT", `/api/studios/${S.studioB}/packages/${S.bPackage}`, pkg({ priceNpr: 500 }))).status, 403);
    assert.equal((await call(S.alice, "DELETE", `/api/studios/${S.studioB}/packages/${S.bPackage}`)).status, 403);
  });

  test("admin is not a studio owner: cannot edit studios through owner routes", async () => {
    assert.equal((await call(S.admin, "PUT", `/api/studios/${S.studioA}`, profile)).status, 403);
    assert.equal((await call(S.admin, "POST", `/api/studios/${S.studioA}/packages`, pkg())).status, 403);
  });

  test("path-injection ids are rejected", async () => {
    const res = await call(S.alice, "PATCH", `/api/studios/${S.studioA}/portfolio/a%2Fb%2Fc`, { caption: null, category: null, sortOrder: 0, isFeatured: false });
    assert.equal(res.status, 404);
  });
});

/* ============================================================== 5. media */

describe("media: signed direct upload → confirm → Firestore", () => {
  test("portfolio upload is confirmed and recorded server-side", async () => {
    S.aPhoto = await upload(S.alice, S.studioA, "portfolio");
    assert.ok(S.aPhoto.startsWith(`tasbirghar/studios/${S.studioA}/portfolio/`));
    const res = await confirm(S.alice, S.studioA, "portfolio", S.aPhoto);
    assert.equal(res.status, 201, JSON.stringify(res.json));
    S.aPhotoId = res.json.id;
    const doc = (await db.doc(`studios/${S.studioA}/portfolio/${S.aPhotoId}`).get()).data();
    assert.equal(doc.image.publicId, S.aPhoto);
    assert.match(doc.image.secureUrl, /^https:\/\/res\.cloudinary\.com\//);
    assert.equal(doc.image.format, "png");
    assert.equal((await db.doc(`studios/${S.studioA}`).get()).get("stats.portfolioCount"), 1);
  });

  test("confirming the same upload twice is rejected and does not delete the asset", async () => {
    const res = await confirm(S.alice, S.studioA, "portfolio", S.aPhoto);
    assert.equal(res.status, 409);
    assert.ok(await cloudinaryExists(S.aPhoto));
  });

  test("owner edits caption/category/order/featured; image identity is immutable", async () => {
    const ok = await call(S.alice, "PATCH", `/api/studios/${S.studioA}/portfolio/${S.aPhotoId}`, {
      caption: "Sleeping baby", category: "newborn", sortOrder: 3, isFeatured: true,
    });
    assert.equal(ok.status, 200);
    const tamper = await call(S.alice, "PATCH", `/api/studios/${S.studioA}/portfolio/${S.aPhotoId}`, {
      caption: null, category: null, sortOrder: 0, isFeatured: false, image: { publicId: "tasbirghar/studios/x/portfolio/y", secureUrl: "https://evil" },
    });
    assert.equal(tamper.status, 422);
    const doc = (await db.doc(`studios/${S.studioA}/portfolio/${S.aPhotoId}`).get()).data();
    assert.equal(doc.image.publicId, S.aPhoto);
    assert.equal(doc.caption, "Sleeping baby");
    assert.equal(doc.isFeatured, true);
  });

  test("A cannot claim B's asset, and B cannot edit/delete A's portfolio", async () => {
    const bPhoto = await upload(S.bob, S.studioB, "portfolio");
    const steal = await confirm(S.alice, S.studioA, "portfolio", bPhoto);
    assert.equal(steal.status, 400);
    assert.ok(await cloudinaryExists(bPhoto), "B's asset untouched");
    // Cross-target: a portfolio asset cannot be confirmed as a profile image.
    assert.equal((await confirm(S.bob, S.studioB, "profile", bPhoto)).status, 400);
    assert.equal((await call(S.bob, "PATCH", `/api/studios/${S.studioA}/portfolio/${S.aPhotoId}`, { caption: "pwned", category: null, sortOrder: 0, isFeatured: false })).status, 403);
    assert.equal((await call(S.bob, "DELETE", `/api/studios/${S.studioA}/portfolio/${S.aPhotoId}`)).status, 403);
    assert.ok(await cloudinaryExists(S.aPhoto));
  });

  test("gallery upload requires a kind and lands in the matching folder", async () => {
    const noKind = await call(S.alice, "POST", "/api/media/sign", { studioId: S.studioA, target: "gallery", galleryKind: null });
    assert.equal(noKind.status, 422);
    const pid = await upload(S.alice, S.studioA, "gallery", "prop");
    assert.ok(pid.startsWith(`tasbirghar/studios/${S.studioA}/props/`));
    const res = await confirm(S.alice, S.studioA, "gallery", pid, "prop");
    assert.equal(res.status, 201);
    assert.equal((await db.doc(`studios/${S.studioA}/gallery/${res.json.id}`).get()).get("kind"), "prop");
    // Kind must match the folder it was signed for.
    assert.equal((await confirm(S.alice, S.studioA, "gallery", pid, "studio")).status, 400);
  });

  test("profile image: set, then replace deletes the old asset", async () => {
    const first = await upload(S.alice, S.studioA, "profile");
    assert.equal((await confirm(S.alice, S.studioA, "profile", first)).status, 200);
    assert.equal((await db.doc(`studios/${S.studioA}`).get()).get("profileImage.publicId"), first);
    const second = await upload(S.alice, S.studioA, "profile");
    assert.equal((await confirm(S.alice, S.studioA, "profile", second)).status, 200);
    assert.equal((await db.doc(`studios/${S.studioA}`).get()).get("profileImage.publicId"), second);
    assert.equal(await cloudinaryExists(first), false, "old profile asset deleted");
  });

  test("delete removes the record, decrements count and deletes the asset", async () => {
    const res = await call(S.alice, "DELETE", `/api/studios/${S.studioA}/portfolio/${S.aPhotoId}`);
    assert.equal(res.status, 200);
    assert.equal((await db.doc(`studios/${S.studioA}/portfolio/${S.aPhotoId}`).get()).exists, false);
    assert.equal((await db.doc(`studios/${S.studioA}`).get()).get("stats.portfolioCount"), 0);
    assert.equal(await cloudinaryExists(S.aPhoto), false);
  });
});

/* =========================================================== 6. packages */

describe("packages", () => {
  test("create stores integer paisa, NPR, no images; updates startingPrice", async () => {
    const res = await call(S.alice, "POST", `/api/studios/${S.studioA}/packages`, pkg());
    assert.equal(res.status, 201, JSON.stringify(res.json));
    S.aPackage = res.json.id;
    const doc = (await db.doc(`studios/${S.studioA}/packages/${S.aPackage}`).get()).data();
    assert.equal(doc.price, 1_500_000);
    assert.equal(doc.currency, "NPR");
    assert.deepEqual(doc.images, []);
    assert.equal(doc.studioId, S.studioA);
    assert.equal((await db.doc(`studios/${S.studioA}`).get()).get("startingPrice"), 1_500_000);
  });

  test("edit name/description/price/includes; protected fields rejected", async () => {
    const ok = await call(S.alice, "PUT", `/api/studios/${S.studioA}/packages/${S.aPackage}`, pkg({ name: "Newborn Deluxe", priceNpr: 12000, includes: ["3 setups"] }));
    assert.equal(ok.status, 200);
    const doc = (await db.doc(`studios/${S.studioA}/packages/${S.aPackage}`).get()).data();
    assert.equal(doc.price, 1_200_000);
    assert.equal(doc.name, "Newborn Deluxe");
    assert.equal((await db.doc(`studios/${S.studioA}`).get()).get("startingPrice"), 1_200_000);

    for (const extra of [{ commissionRateBps: 0 }, { images: [{ publicId: "x" }] }, { studioId: S.studioB }, { currency: "USD" }, { price: 1 }]) {
      const res = await call(S.alice, "PUT", `/api/studios/${S.studioA}/packages/${S.aPackage}`, pkg(extra));
      assert.equal(res.status, 422, JSON.stringify(extra));
    }
    for (const priceNpr of [-1, 99.5, "abc", 10, 50_000_000]) {
      const res = await call(S.alice, "POST", `/api/studios/${S.studioA}/packages`, pkg({ priceNpr }));
      assert.equal(res.status, 422, String(priceNpr));
    }
  });

  test("delete updates startingPrice", async () => {
    assert.equal((await call(S.alice, "DELETE", `/api/studios/${S.studioA}/packages/${S.aPackage}`)).status, 200);
    assert.equal((await db.doc(`studios/${S.studioA}`).get()).get("startingPrice"), null);
  });
});

/* ======================================================= 7. admin console */

const ADMIN_PAGES = [
  "/admin",
  "/admin/applications",
  "/admin/applications?status=all",
  "/admin/studios",
  "/admin/studios?status=draft&q=alice",
  "/admin/photographers",
  "/admin/customers",
  "/admin/bookings",
  "/admin/reviews",
  "/admin/commission",
  "/admin/settings",
];

describe("admin console", () => {
  test("every admin page renders for the admin", async () => {
    for (const path of [...ADMIN_PAGES, `/admin/studios/${S.studioA}`, `/admin/applications/${S.alice.uid}`]) {
      const res = await call(S.admin, "GET", path);
      assert.equal(res.status, 200, path);
    }
  });

  test("admin pages are hidden (404) from customers and photographers", async () => {
    for (const user of [S.carol, S.alice]) {
      for (const path of [...ADMIN_PAGES, `/admin/studios/${S.studioA}`]) {
        assert.equal((await call(user, "GET", path)).status, 404, path);
      }
    }
    const anon = await call(null, "GET", "/admin/studios");
    assert.equal(anon.status, 307);
  });

  test("unknown studio / application ids render the not-found screen (noindex)", async () => {
    // Admin pages stream behind a loading skeleton, so Next.js commits a 200
    // before notFound() runs ("soft 404", documented in loading.md → Status
    // Codes). The role check runs in the layout BEFORE streaming, which is why
    // non-admins get a real 404 above.
    for (const path of ["/admin/studios/does-not-exist", "/admin/applications/does-not-exist"]) {
      const res = await fetch(`${BASE}${path}`, { headers: { Cookie: S.admin.cookie } });
      const html = await res.text();
      assert.match(html, /couldn(&#x27;|')t find that record/, path);
      assert.match(html, /<meta name="robots" content="noindex/, path);
      assert.doesNotMatch(html, /Marketplace status|Portfolio introduction/, path);
    }
  });
});

describe("studio moderation (server route, admin claim)", () => {
  const moderate = (user, studioId, body) => call(user, "POST", `/api/admin/studios/${studioId}`, body);

  test("owners, customers and anonymous users cannot moderate", async () => {
    assert.equal((await moderate(S.alice, S.studioA, { action: "publish", reason: null })).status, 403);
    assert.equal((await moderate(S.alice, S.studioA, { action: "verify", reason: null })).status, 403);
    assert.equal((await moderate(S.carol, S.studioA, { action: "publish", reason: null })).status, 403);
    assert.equal((await moderate(null, S.studioA, { action: "publish", reason: null })).status, 401);
    assert.equal((await db.doc(`studios/${S.studioA}`).get()).get("listingStatus"), "draft");
  });

  test("input is validated; unknown actions and smuggled fields are rejected", async () => {
    assert.equal((await moderate(S.admin, S.studioA, { action: "delete", reason: null })).status, 422);
    assert.equal((await moderate(S.admin, S.studioA, { action: "publish", reason: null, listingStatus: "published" })).status, 422);
    assert.equal((await moderate(S.admin, S.studioA, { action: "publish", reason: null, commissionRateBps: 0 })).status, 422);
    assert.equal((await moderate(S.admin, "a%2Fb", { action: "publish", reason: null })).status, 404);
  });

  test("an incomplete studio cannot be published", async () => {
    const res = await moderate(S.admin, S.studioB, { action: "publish", reason: null });
    assert.equal(res.status, 409);
    assert.equal(res.json.error.code, "INCOMPLETE_LISTING");
  });

  test("admin publishes a complete studio; audit trail recorded", async () => {
    // Studio A has a profile image; add a portfolio photo and an active package.
    const pid = await upload(S.alice, S.studioA, "portfolio");
    assert.equal((await confirm(S.alice, S.studioA, "portfolio", pid)).status, 201);
    assert.equal((await call(S.alice, "POST", `/api/studios/${S.studioA}/packages`, pkg())).status, 201);

    const res = await moderate(S.admin, S.studioA, { action: "publish", reason: null });
    assert.equal(res.status, 200, JSON.stringify(res.json));
    const doc = (await db.doc(`studios/${S.studioA}`).get()).data();
    assert.equal(doc.listingStatus, "published");
    assert.equal(doc.lastModeration.action, "publish");
    assert.equal(doc.lastModeration.by, S.admin.uid);
    assert.equal(doc.commissionRateBps, 800, "moderation never touches commission");
    const log = await db.collection(`studios/${S.studioA}/moderationLog`).get();
    assert.equal(log.size, 1);
    assert.equal(log.docs[0].get("to.listingStatus"), "published");
    // Invalid transition.
    assert.equal((await moderate(S.admin, S.studioA, { action: "publish", reason: null })).status, 409);
  });

  test("suspend requires a reason; reinstate returns to draft; verify toggles", async () => {
    assert.equal((await moderate(S.admin, S.studioA, { action: "suspend", reason: null })).status, 422);
    assert.equal((await moderate(S.admin, S.studioA, { action: "suspend", reason: "Customer complaint under review" })).status, 200);
    assert.equal((await db.doc(`studios/${S.studioA}`).get()).get("listingStatus"), "suspended");
    // Owner cannot lift a suspension.
    assert.equal((await moderate(S.alice, S.studioA, { action: "reinstate", reason: null })).status, 403);
    assert.equal((await moderate(S.admin, S.studioA, { action: "reinstate", reason: null })).status, 200);
    assert.equal((await db.doc(`studios/${S.studioA}`).get()).get("listingStatus"), "draft");
    assert.equal((await moderate(S.admin, S.studioA, { action: "verify", reason: null })).status, 200);
    assert.equal((await db.doc(`studios/${S.studioA}`).get()).get("verificationStatus"), "verified");
    assert.equal((await moderate(S.admin, S.studioA, { action: "verify", reason: null })).status, 409);
    assert.equal((await db.collection(`studios/${S.studioA}/moderationLog`).get()).size, 4);
  });

  test("owner profile edits cannot touch moderation state", async () => {
    const res = await call(S.alice, "PUT", `/api/studios/${S.studioA}`, { ...profileOf(studio("x")), lastModeration: null });
    assert.equal(res.status, 422);
    const ok = await call(S.alice, "PUT", `/api/studios/${S.studioA}`, profileOf(studio("x")));
    assert.equal(ok.status, 200);
    const doc = (await db.doc(`studios/${S.studioA}`).get()).data();
    assert.equal(doc.verificationStatus, "verified");
    assert.equal(doc.lastModeration.action, "verify");
  });
});

describe("review moderation (server route, admin claim)", () => {
  const reviewId = `rv-${RUN}`;

  before(async () => {
    await db.doc(`reviews/${reviewId}`).set({
      bookingId: reviewId,
      studioId: S.studioA,
      customerId: S.carol.uid,
      customerDisplayName: "Carol",
      rating: 5,
      comment: "Lovely newborn session.",
      status: "published",
      studioReply: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });
  after(() => db.doc(`reviews/${reviewId}`).delete());

  test("only admins can moderate; hiding needs a reason", async () => {
    const path = `/api/admin/reviews/${reviewId}`;
    assert.equal((await call(S.alice, "POST", path, { action: "hide", reason: "x" })).status, 403);
    assert.equal((await call(S.carol, "POST", path, { action: "hide", reason: "x" })).status, 403);
    assert.equal((await call(S.admin, "POST", path, { action: "hide", reason: null })).status, 422);
    assert.equal((await call(S.admin, "POST", path, { action: "hide", reason: "Contains personal data" })).status, 200);
    const doc = (await db.doc(`reviews/${reviewId}`).get()).data();
    assert.equal(doc.status, "hidden");
    assert.equal(doc.moderation.by, S.admin.uid);
    assert.equal(doc.comment, "Lovely newborn session.", "text is never edited");
    assert.equal((await call(S.admin, "POST", path, { action: "hide", reason: "again" })).status, 409);
    assert.equal((await call(S.admin, "POST", path, { action: "publish", reason: null, rating: 1 })).status, 422);
    assert.equal((await call(S.admin, "POST", path, { action: "publish", reason: null })).status, 200);
    assert.equal((await call(S.admin, "POST", "/api/admin/reviews/nope", { action: "hide", reason: "x" })).status, 404);
  });

  test("the reviews admin page lists the review", async () => {
    assert.equal((await call(S.admin, "GET", "/admin/reviews")).status, 200);
  });
});

/* ============================================================== 8. logout */

describe("logout", () => {
  test("DELETE /api/auth/session clears the cookie", async () => {
    const res = await fetch(`${BASE}/api/auth/session`, { method: "DELETE", headers: { Origin: BASE, Cookie: S.alice.cookie } });
    assert.equal(res.status, 200);
    assert.match(res.headers.get("set-cookie") ?? "", /__session=;|Max-Age=0|Expires=Thu, 01 Jan 1970/i);
  });

  test("after admin logout, the old session cookie no longer opens /admin (server-side revocation)", async () => {
    assert.equal((await call(S.admin, "GET", "/admin")).status, 200);
    // Revocation has 1-second granularity relative to sign-in time.
    await new Promise((r) => setTimeout(r, 1100));
    const res = await fetch(`${BASE}/api/auth/session`, { method: "DELETE", headers: { Origin: BASE, Cookie: S.admin.cookie } });
    assert.equal(res.status, 200);
    const replay = await call(S.admin, "GET", "/admin");
    assert.equal(replay.status, 307);
    assert.match(replay.location ?? "", /\/login/);
    assert.equal((await call(S.admin, "POST", `/api/admin/studios/${S.studioA}`, { action: "unverify", reason: null })).status, 401);
  });
});
