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
  address: "Private Lane 7, Old Baneshwor",
  phone: "9812345678",
  email: "studio-contact@example.com",
  website: "private-site.example.com",
  instagram: "private.handle",
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

/** The public studio doc must never carry owner / contact / internal fields. */
function assertNoPrivateFields(doc) {
  for (const key of ["ownerId", "phone", "email", "website", "instagram", "commissionRateBps", "lastModeration"]) {
    assert.equal(key in doc, false, `public studio doc has ${key}`);
  }
  assert.equal("address" in doc.location, false, "public studio doc has location.address");
}

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
    const internal = (await db.doc(`studios/${S.studioA}/private/internal`).get()).data();
    const contact = (await db.doc(`studios/${S.studioA}/private/contact`).get()).data();
    assert.equal(internal.ownerId, S.alice.uid);
    assert.equal(internal.commissionRateBps, 800);
    assert.equal(internal.lastModeration, null);
    assert.equal(contact.phone, "+9779812345678");
    assert.equal(contact.email, "studio-contact@example.com");
    assert.equal(contact.address, "Private Lane 7, Old Baneshwor");
    assert.equal(contact.instagram, "private.handle");
    assertNoPrivateFields(doc);
    assert.equal(doc.publishedAt, null);
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
    assert.equal((await db.doc(`studios/${S.studioA}/private/internal`).get()).get("commissionRateBps"), 800);
    assert.equal(doc.slug, `alice-studio-${RUN}`);
    assertNoPrivateFields(doc);
  });

  test("contact edits are written to private/contact only, never to the public doc", async () => {
    const res = await call(S.alice, "PUT", `/api/studios/${S.studioA}`, {
      ...profileOf(studio("x")),
      businessName: "Alice Studio Renamed",
      team: "Alice + 1 assistant",
      phone: "9801112233",
      email: "alice-owner@example.com",
    });
    assert.equal(res.status, 200, JSON.stringify(res.json));
    const contact = (await db.doc(`studios/${S.studioA}/private/contact`).get()).data();
    assert.equal(contact.phone, "+9779801112233");
    assert.equal(contact.email, "alice-owner@example.com");
    assertNoPrivateFields((await db.doc(`studios/${S.studioA}`).get()).data());
    // Put the fixture values back for the later leak checks.
    assert.equal((await call(S.alice, "PUT", `/api/studios/${S.studioA}`, { ...profileOf(studio("x")), businessName: "Alice Studio Renamed", team: "Alice + 1 assistant" })).status, 200);
  });

  test("the owner's dashboard shows their private contact; another owner's does not", async () => {
    const mine = await fetch(`${BASE}/dashboard/studio`, { headers: { Cookie: S.alice.cookie } }).then((r) => r.text());
    assert.ok(mine.includes("studio-contact@example.com"), "owner sees own email");
    assert.ok(mine.includes("Private Lane 7"), "owner sees own address");
    const other = await fetch(`${BASE}/dashboard/studio`, { headers: { Cookie: S.bob.cookie } }).then((r) => r.text());
    assert.ok(!other.includes(S.studioA), "B's dashboard is not about studio A");
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
    const internal = (await db.doc(`studios/${S.studioA}/private/internal`).get()).data();
    assert.equal(doc.listingStatus, "published");
    assert.ok(doc.publishedAt, "publishedAt set on publish");
    assertNoPrivateFields(doc);
    assert.equal(internal.lastModeration.action, "publish");
    assert.equal(internal.lastModeration.by, S.admin.uid);
    assert.equal(internal.ownerId, S.alice.uid, "moderation never touches ownership");
    assert.equal(internal.commissionRateBps, 800, "moderation never touches commission");
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
    assert.equal((await db.doc(`studios/${S.studioA}/private/internal`).get()).get("lastModeration.action"), "verify");
  });

  test("admin studio detail shows the private contact, owner and commission", async () => {
    const res = await fetch(`${BASE}/admin/studios/${S.studioA}`, { headers: { Cookie: S.admin.cookie } });
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.ok(html.includes("studio-contact@example.com"), "admin sees contact email");
    assert.ok(html.includes("Private Lane 7"), "admin sees address");
    assert.ok(html.includes("+9779812345678"), "admin sees phone");
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
      status: "pending_moderation",
      studioReply: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });
  // Hide first (so the studio's rating totals are restored), then remove the fixture.
  after(async () => {
    await call(S.admin, "POST", `/api/admin/reviews/${reviewId}`, { action: "hide", reason: "test cleanup" });
    await db.doc(`reviews/${reviewId}`).delete();
  });

  test("only admins can moderate; hiding needs a reason", async () => {
    const path = `/api/admin/reviews/${reviewId}`;
    assert.equal((await call(S.alice, "POST", path, { action: "hide", reason: "x" })).status, 403);
    assert.equal((await call(S.carol, "POST", path, { action: "hide", reason: "x" })).status, 403);
    assert.equal((await call(S.admin, "POST", path, { action: "hide", reason: null })).status, 422);
    assert.equal((await call(S.admin, "POST", path, { action: "publish", reason: null })).status, 200);
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

/* ============================================ 8. public marketplace (P3) */

const nepalToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kathmandu" });
const plusDays = (n) => {
  const d = new Date(`${nepalToday()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const page = async (path, user) => {
  const res = await fetch(`${BASE}${path}`, { redirect: "manual", headers: user ? { Cookie: user.cookie } : {} });
  return { status: res.status, html: await res.text(), location: res.headers.get("location") };
};

describe("public marketplace visibility (published only)", () => {
  test("a draft studio is not public anywhere", async () => {
    const slug = (await db.doc(`studios/${S.studioA}`).get()).get("slug");
    S.slugA = slug;
    S.slugB = (await db.doc(`studios/${S.studioB}`).get()).get("slug");
    assert.equal((await db.doc(`studios/${S.studioA}`).get()).get("listingStatus"), "draft");
    assert.equal((await page(`/photographers/${slug}`)).status, 404);
    assert.doesNotMatch((await page("/photographers")).html, new RegExp(`/photographers/${slug}"`));
    assert.doesNotMatch((await page("/sitemap.xml")).html, new RegExp(slug));
    assert.equal((await call(null, "GET", `/api/studios/${S.studioA}/availability?date=${plusDays(10)}`)).status, 404);
    const alias = await page(`/studios/${slug}`);
    assert.equal(alias.status, 308);
    assert.match(alias.location, new RegExp(`/photographers/${slug}$`));
  });

  test("after publishing, the studio appears (cache invalidated immediately)", async () => {
    assert.equal((await call(S.admin2 ?? S.admin, "POST", `/api/admin/studios/${S.studioA}`, { action: "publish", reason: null })).status, 200);
    const profile = await page(`/photographers/${S.slugA}`);
    assert.equal(profile.status, 200);
    assert.match(profile.html, /Request a booking/);
    assert.match(profile.html, /Rs\. 15,000/);
    assert.match(profile.html, /"@type":"ProfessionalService"/);
    assert.match(profile.html, /<link rel="canonical" href="[^"]*\/photographers\//);
    assert.match((await page("/photographers")).html, new RegExp(`/photographers/${S.slugA}"`));
    assert.match((await page("/categories/newborn")).html, new RegExp(`/photographers/${S.slugA}"`));
    assert.match((await page("/sitemap.xml")).html, new RegExp(`/photographers/${S.slugA}</loc>`));
  });

  test("public pages never expose private studio data", async () => {
    const html = (await page(`/photographers/${S.slugA}`)).html + (await page("/photographers")).html + (await page("/packages")).html;
    const contact = (await db.doc(`studios/${S.studioA}/private/contact`).get()).data();
    const internal = (await db.doc(`studios/${S.studioA}/private/internal`).get()).data();
    assert.ok(!html.includes(contact.phone) && !html.includes(contact.phone.slice(4)), "studio phone");
    assert.ok(!html.includes(contact.email), "studio email");
    assert.ok(!html.includes("Private Lane 7"), "street address");
    assert.ok(!html.includes(contact.website) && !html.includes("private.handle"), "website / instagram");
    assert.ok(!html.includes(internal.ownerId), "owner uid");
    assert.doesNotMatch(html, /commissionRateBps|commissionAmount|photographerNet|lastModeration/);
    assertNoPrivateFields((await db.doc(`studios/${S.studioA}`).get()).data());
  });

  test("public studio pages still render (profile, listings, categories, locations, packages, booking)", async () => {
    const name = (await db.doc(`studios/${S.studioA}`).get()).get("businessName");
    for (const path of [`/photographers/${S.slugA}`, "/photographers", "/categories/newborn", "/locations/kathmandu", "/packages"]) {
      const res = await page(path);
      assert.equal(res.status, 200, path);
      assert.ok(res.html.includes(name), path);
    }
    assert.equal((await page("/")).status, 200);
    const book = await page(`/photographers/${S.slugA}/book`, S.carol);
    assert.equal(book.status, 200);
    assert.ok(book.html.includes(name));
    assert.ok(!book.html.includes("studio-contact@example.com") && !book.html.includes("Private Lane 7"), "booking page leaks contact");
  });

  test("path traversal / malformed slugs are 404", async () => {
    for (const slug of ["..%2F..%2Fadmin", "a%2Fb", "UPPER", "x"]) {
      assert.equal((await page(`/photographers/${slug}`)).status, 404, slug);
    }
  });
});

describe("booking creation (server-authoritative)", () => {
  const book = (user, extra = {}) =>
    call(user, "POST", "/api/bookings", {
      studioId: S.studioA,
      packageId: S.pkgA,
      shootDate: plusDays(14),
      startTime: "10:00",
      customerName: "Dev Customer",
      customerPhone: "9811111111",
      customerNote: null,
      ...extra,
    });

  before(async () => {
    const pkgs = await db.collection(`studios/${S.studioA}/packages`).where("isActive", "==", true).get();
    S.pkgA = pkgs.docs[0].id;
    S.pkgAPrice = pkgs.docs[0].get("price");
    S.pkgADuration = pkgs.docs[0].get("durationMinutes");
    S.dave = await login(`dave-${RUN}@example.com`, { signup: true, profile: { displayName: "Dave", phone: null } });
    S.erin = await login(`erin-${RUN}@example.com`, { signup: true, profile: { displayName: "Erin", phone: null } });
  });

  test("requires a signed-in customer account", async () => {
    assert.equal((await book(null)).status, 401);
    assert.equal((await book(S.alice)).status, 403);
    assert.equal((await book(S.admin2 ?? S.admin)).status !== 201, true);
  });

  test("client cannot set price, commission, owner, status or end time", async () => {
    for (const extra of [{ grossAmount: 1 }, { price: 1 }, { commissionRateBps: 0 }, { studioOwnerId: S.dave.uid }, { bookingStatus: "confirmed" }, { endTime: "23:00" }, { paymentStatus: "paid" }]) {
      assert.equal((await book(S.dave, extra)).status, 422, JSON.stringify(extra));
    }
  });

  test("validates dates, times, studio and package", async () => {
    for (const shootDate of [nepalToday(), plusDays(-3), plusDays(400), "2026-02-30", "tomorrow"]) {
      assert.equal((await book(S.dave, { shootDate })).status, 422, shootDate);
    }
    assert.equal((await book(S.dave, { startTime: "10:15" })).status, 422);
    assert.equal((await book(S.dave, { startTime: "25:00" })).status, 422);
    assert.equal((await book(S.dave, { studioId: S.studioB })).status, 404, "unpublished studio");
    assert.equal((await book(S.dave, { studioId: "a/b" })).status, 422, "malformed id");
    assert.equal((await book(S.dave, { packageId: "nope" })).status, 404);
    assert.equal((await book(S.dave, { customerPhone: "123" })).status, 422);
  });

  test("creates a pending booking priced from Firestore (paisa + commission)", async () => {
    const res = await book(S.dave);
    assert.equal(res.status, 201, JSON.stringify(res.json));
    S.bookingDave = res.json.bookingId;
    const b = (await db.doc(`bookings/${S.bookingDave}`).get()).data();
    assert.equal(b.bookingStatus, "pending");
    assert.equal(b.customerId, S.dave.uid);
    assert.equal(b.studioOwnerId, S.alice.uid);
    assert.equal(b.grossAmount, S.pkgAPrice);
    assert.equal(b.commissionRateBps, 800);
    assert.equal(b.commissionAmount + b.photographerNetAmount, b.grossAmount);
    assert.equal(b.commissionAmount, Math.floor((S.pkgAPrice * 800 + 5000) / 10000));
    assert.equal(b.packageSnapshot.price, S.pkgAPrice);
    assert.equal(b.startTime, "10:00");
    const end = 10 * 60 + S.pkgADuration;
    assert.equal(b.endTime, `${String(Math.floor(end / 60)).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`);
  });

  test("no double booking: same and overlapping times are rejected, adjacent is allowed", async () => {
    assert.equal((await book(S.erin)).status, 409);
    assert.equal((await book(S.erin, { startTime: "10:30" })).status, 409);
    const endTime = (await db.doc(`bookings/${S.bookingDave}`).get()).get("endTime");
    const adjacent = await book(S.erin, { startTime: endTime });
    assert.equal(adjacent.status, 201, JSON.stringify(adjacent.json));
    S.bookingErin = adjacent.json.bookingId;
    // The public day view exposes published hours only — never booking data.
    const day = await call(null, "GET", `/api/studios/${S.studioA}/availability?date=${plusDays(14)}`);
    assert.equal(day.status, 200);
    assert.deepEqual(Object.keys(day.json).sort(), ["date", "isClosed", "open", "source"]);
    const body = JSON.stringify(day.json);
    for (const secret of [S.bookingDave, S.bookingErin, "Dev Customer", "9811111111", S.alice.uid, "pending", "busy", "commission"]) {
      assert.ok(!body.includes(secret), `public day view leaks ${secret}`);
    }
  });

  test("concurrent requests for the same slot: exactly one succeeds", async () => {
    const racers = await Promise.all(
      [1, 2, 3, 4, 5].map((i) => login(`racer${i}-${RUN}@example.com`, { signup: true, profile: { displayName: `Racer ${i}`, phone: null } })),
    );
    const results = await Promise.all(racers.map((u) => book(u, { shootDate: plusDays(20), startTime: "09:00" })));
    const statuses = results.map((r) => r.status).sort();
    assert.deepEqual(statuses, [201, 409, 409, 409, 409], JSON.stringify(results.map((r) => r.json)));
    const snap = await db.collection("bookings").where("studioId", "==", S.studioA).where("shootDate", "==", plusDays(20)).get();
    assert.equal(snap.size, 1);
  });

  test("studio availability: closed days and restricted hours are enforced", async () => {
    const closed = plusDays(25);
    await db.doc(`studios/${S.studioA}/availability/${closed}`).set({ studioId: S.studioA, date: closed, isClosed: true, slots: [] });
    assert.equal((await book(S.erin, { shootDate: closed })).status, 409);
    const limited = plusDays(26);
    await db.doc(`studios/${S.studioA}/availability/${limited}`).set({
      studioId: S.studioA, date: limited, isClosed: false,
      slots: [{ start: "10:00", end: "14:00", status: "open", bookingId: null }],
    });
    assert.equal((await book(S.erin, { shootDate: limited, startTime: "15:00" })).status, 409);
    assert.equal((await book(S.erin, { shootDate: limited, startTime: "10:00" })).status, 201);
  });

  test("editing the package later never changes an existing booking's price", async () => {
    const res = await call(S.alice, "PUT", `/api/studios/${S.studioA}/packages/${S.pkgA}`, pkg({ priceNpr: 99000 }));
    assert.equal(res.status, 200);
    assert.equal((await db.doc(`bookings/${S.bookingDave}`).get()).get("grossAmount"), S.pkgAPrice);
    await call(S.alice, "PUT", `/api/studios/${S.studioA}/packages/${S.pkgA}`, pkg({ priceNpr: S.pkgAPrice / 100 }));
  });
});

describe("booking transitions and customer pages", () => {
  test("customers see only their own bookings", async () => {
    assert.equal((await page(`/account/bookings/${S.bookingDave}`, S.dave)).status, 200);
    assert.equal((await page(`/account/bookings/${S.bookingDave}`, S.erin)).status, 404);
    assert.equal((await page("/account/bookings", S.dave)).status, 200);
  });

  test("only the booking's customer can cancel, only while pending", async () => {
    assert.equal((await call(S.erin, "POST", `/api/bookings/${S.bookingDave}`, { action: "cancel" })).status, 404);
    assert.equal((await call(S.dave, "POST", `/api/bookings/${S.bookingDave}`, { action: "confirm" })).status, 403);
    assert.equal((await call(S.dave, "POST", `/api/bookings/${S.bookingDave}`, { action: "cancel" })).status, 200);
    assert.equal((await call(S.dave, "POST", `/api/bookings/${S.bookingDave}`, { action: "cancel" })).status, 409);
    // The freed window can be requested again.
    assert.equal((await call(S.dave, "POST", "/api/bookings", {
      studioId: S.studioA, packageId: S.pkgA, shootDate: plusDays(14), startTime: "10:00",
      customerName: "Dave", customerPhone: "9811111111", customerNote: null,
    })).status, 201);
  });

  test("only the studio owner confirms; completion waits for the shoot date", async () => {
    assert.equal((await call(S.bob, "POST", `/api/bookings/${S.bookingErin}`, { action: "confirm" })).status, 404);
    assert.equal((await call(S.admin2 ?? S.admin, "POST", `/api/bookings/${S.bookingErin}`, { action: "confirm" })).status, 403);
    assert.equal((await call(S.alice, "POST", `/api/bookings/${S.bookingErin}`, { action: "confirm" })).status, 200);
    assert.equal((await db.doc(`bookings/${S.bookingErin}`).get()).get("bookingStatus"), "confirmed");
    assert.equal((await call(S.alice, "POST", `/api/bookings/${S.bookingErin}`, { action: "complete" })).status, 409);
    assert.equal((await call(S.alice, "POST", `/api/bookings/${S.bookingErin}`, { action: "bogus" })).status, 422);
    assert.equal((await page("/dashboard/bookings", S.alice)).status, 200);
  });

  test("a customer can hold at most 5 pending requests", async () => {
    const results = [];
    for (let i = 0; i < 6; i++) {
      results.push((await call(S.erin, "POST", "/api/bookings", {
        studioId: S.studioA, packageId: S.pkgA, shootDate: plusDays(40 + i), startTime: "09:00",
        customerName: "Erin", customerPhone: "9811111112", customerNote: null,
      })).status);
    }
    // Erin already has 1 pending (restricted-hours test) → 4 more allowed, then 429.
    assert.deepEqual(results, [201, 201, 201, 201, 429, 429]);
  });

  test("suspending the studio removes it from public view immediately", async () => {
    assert.equal((await call(S.admin2 ?? S.admin, "POST", `/api/admin/studios/${S.studioA}`, { action: "suspend", reason: "Test suspension" })).status, 200);
    assert.equal((await page(`/photographers/${S.slugA}`)).status, 404);
    assert.doesNotMatch((await page("/photographers")).html, new RegExp(`/photographers/${S.slugA}"`));
    assert.doesNotMatch((await page("/sitemap.xml")).html, new RegExp(S.slugA));
    assert.equal((await call(null, "GET", `/api/studios/${S.studioA}/availability?date=${plusDays(30)}`)).status, 404);
    assert.equal((await call(S.erin, "POST", "/api/bookings", {
      studioId: S.studioA, packageId: S.pkgA, shootDate: plusDays(60), startTime: "09:00",
      customerName: "Erin", customerPhone: "9811111112", customerNote: null,
    })).status, 404);
  });

  test("public header session endpoint reveals only display data", async () => {
    const anonRes = await call(null, "GET", "/api/auth/session");
    assert.deepEqual(anonRes.json, { user: null });
    const me = await call(S.dave, "GET", "/api/auth/session");
    assert.deepEqual(Object.keys(me.json.user).sort(), ["displayName", "home", "role"]);
    assert.equal(me.json.user.role, "customer");
  });
});

/* ================================================= 8b. Phase 4A: availability */

describe("Phase 4A: availability management and the booking lifecycle", () => {
  const av = (user, date, body, method = "PUT", studioId = S.studioA) =>
    call(user, method, `/api/studios/${studioId}/availability/${date}`, body);
  const month = (date, packageId = S.pkgA, studioId = S.studioA) =>
    call(null, "GET", `/api/studios/${studioId}/availability?month=${date.slice(0, 7)}&packageId=${packageId}`);
  const slot = (start, end) => ({ start, end });
  const book = (user, shootDate, startTime, extra = {}) =>
    call(user, "POST", "/api/bookings", {
      studioId: S.studioA, packageId: S.pkgA, shootDate, startTime,
      customerName: "Phase Four", customerPhone: "9811111199", customerNote: null, ...extra,
    });
  const act = (user, bookingId, action) => call(user, "POST", `/api/bookings/${bookingId}`, { action });
  const status = async (id) => (await db.doc(`bookings/${id}`).get()).get("bookingStatus");
  /** Test fixture written with the Admin SDK: a booking in a state the public API can't reach yet (e.g. a past shoot date). */
  const seedBooking = async (fields) => {
    const ref = db.collection("bookings").doc();
    await ref.set({
      customerId: S.fay.uid, studioId: S.studioA, studioOwnerId: S.alice.uid, packageId: S.pkgA, photographyCategory: "newborn",
      startTime: "10:00", endTime: "12:00", timezone: "Asia/Kathmandu", customerName: "Seeded", customerPhone: "+9779811111100",
      customerNote: null, packageSnapshot: { name: "Seeded", price: 1500000, durationMinutes: 120 },
      studioSnapshot: { businessName: "Seeded", slug: "seeded" }, paymentStatus: "unpaid", payoutStatus: "not_due", currency: "NPR",
      grossAmount: 1500000, commissionRateBps: 800, commissionAmount: 120000, photographerNetAmount: 1380000,
      confirmedAt: null, completedAt: null, cancelledAt: null, createdAt: new Date(), updatedAt: new Date(), ...fields,
    });
    return ref.id;
  };

  before(async () => {
    // Studio A was suspended by the previous suite: reinstate + publish again.
    const admin = S.admin2 ?? S.admin;
    assert.equal((await call(admin, "POST", `/api/admin/studios/${S.studioA}`, { action: "reinstate", reason: null })).status, 200);
    assert.equal((await call(admin, "POST", `/api/admin/studios/${S.studioA}`, { action: "publish", reason: null })).status, 200);
    assert.equal(S.pkgADuration, 120, "fixture package is 2 hours");
    [S.fay, S.gus, S.hal, S.ivy] = await Promise.all(
      ["fay", "gus", "hal", "ivy"].map((n) => login(`${n}-${RUN}@example.com`, { signup: true, profile: { displayName: n, phone: null } })),
    );
  });

  test("owner sets custom slots; the public month view offers only free start times, nothing else", async () => {
    const d = plusDays(90);
    const res = await av(S.alice, d, { isClosed: false, slots: [slot("14:00", "16:00"), slot("10:00", "12:00")] });
    assert.equal(res.status, 200, JSON.stringify(res.json));
    assert.equal(res.json.mode, "custom");
    const doc = (await db.doc(`studios/${S.studioA}/availability/${d}`).get()).data();
    assert.deepEqual(doc.slots.map((s) => `${s.start}-${s.end}`), ["10:00-12:00", "14:00-16:00"], "stored sorted");
    assert.equal(doc.studioId, S.studioA);
    assert.equal(doc.date, d);

    const view = await month(d);
    assert.equal(view.status, 200);
    assert.deepEqual(Object.keys(view.json).sort(), ["days", "month"]);
    assert.deepEqual(view.json.days[d], ["10:00", "14:00"]);
  });

  test("owner edits and deletes slots, and resets a day to standard hours", async () => {
    const d = plusDays(90);
    assert.equal((await av(S.alice, d, { isClosed: false, slots: [slot("09:00", "12:00")] })).status, 200);
    assert.deepEqual((await month(d)).json.days[d], ["09:00", "09:30", "10:00"]);
    const reset = await av(S.alice, d, undefined, "DELETE");
    assert.equal(reset.status, 200);
    assert.equal(reset.json.mode, "standard");
    assert.equal((await db.doc(`studios/${S.studioA}/availability/${d}`).get()).exists, false);
    assert.equal((await month(d)).json.days[d][0], "07:00", "standard hours again");
    const closed = await av(S.alice, d, { isClosed: true, slots: [] });
    assert.equal(closed.json.mode, "closed");
    assert.equal((await month(d)).json.days[d], undefined, "closed day is not offered");
  });

  test("invalid availability input is rejected server-side", async () => {
    const d = plusDays(91);
    for (const [label, body] of [
      ["end before start", { isClosed: false, slots: [slot("11:00", "10:00")] }],
      ["zero length", { isClosed: false, slots: [slot("10:00", "10:00")] }],
      ["overlapping", { isClosed: false, slots: [slot("10:00", "12:00"), slot("11:30", "13:00")] }],
      ["duplicate", { isClosed: false, slots: [slot("10:00", "11:00"), slot("10:00", "11:00")] }],
      ["off the 30-minute step", { isClosed: false, slots: [slot("10:15", "11:00")] }],
      ["malformed time", { isClosed: false, slots: [slot("9:00", "11:00")] }],
      ["hour 24", { isClosed: false, slots: [slot("23:00", "24:00")] }],
      ["no slots on an open custom day", { isClosed: false, slots: [] }],
      ["slots on a closed day", { isClosed: true, slots: [slot("10:00", "11:00")] }],
      ["too many slots", { isClosed: false, slots: Array.from({ length: 13 }, (_, i) => slot(`${String(6 + i).padStart(2, "0")}:00`, `${String(6 + i).padStart(2, "0")}:30`)) }],
      ["extra slot fields", { isClosed: false, slots: [{ start: "10:00", end: "11:00", status: "booked" }] }],
      ["smuggled booking id", { isClosed: false, slots: [{ start: "10:00", end: "11:00", bookingId: "x" }] }],
      ["extra body fields", { isClosed: false, slots: [slot("10:00", "11:00")], studioId: S.studioB }],
      ["missing isClosed", { slots: [slot("10:00", "11:00")] }],
      ["slots not a list", { isClosed: false, slots: "10:00-11:00" }],
    ]) {
      assert.equal((await av(S.alice, d, body)).status, 422, label);
    }
    for (const date of [nepalToday(), plusDays(-3), plusDays(181), "2026-02-30", "2026-13-01", "tomorrow"]) {
      const res = await av(S.alice, date, { isClosed: true, slots: [] });
      assert.equal(res.status, 422, `date ${date}`);
    }
    assert.equal((await db.doc(`studios/${S.studioA}/availability/${d}`).get()).exists, false, "nothing was written");
  });

  test("only the studio owner can manage its availability", async () => {
    const d = plusDays(92);
    const body = { isClosed: true, slots: [] };
    assert.equal((await av(null, d, body)).status, 401, "signed out");
    assert.equal((await av(S.dave, d, body)).status, 403, "customer");
    assert.equal((await av(S.admin2 ?? S.admin, d, body)).status, 403, "admin has no owner write path");
    assert.equal((await av(S.bob, d, body)).status, 403, "other photographer");
    assert.equal((await av(S.bob, d, undefined, "DELETE")).status, 403, "other photographer delete");
    assert.equal((await av(S.alice, d, body, "PUT", "no-such-studio")).status, 404, "nonexistent studio");
    assert.equal((await av(S.alice, d, body, "PUT", S.studioB)).status, 403, "A on B's studio");
    const noOrigin = await call(S.alice, "PUT", `/api/studios/${S.studioA}/availability/${d}`, body, { Origin: "https://evil.example" });
    assert.equal(noOrigin.status, 403, "cross-origin");
    assert.equal((await db.doc(`studios/${S.studioA}/availability/${d}`).get()).exists, false);
    // Bob can manage his OWN studio's schedule (even while it is a draft).
    assert.equal((await av(S.bob, d, body, "PUT", S.studioB)).status, 200);
  });

  test("month view: validation and visibility", async () => {
    const d = plusDays(92);
    assert.equal((await call(null, "GET", `/api/studios/${S.studioA}/availability?month=2026-13&packageId=${S.pkgA}`)).status, 422);
    assert.equal((await call(null, "GET", `/api/studios/${S.studioA}/availability?month=${d.slice(0, 7)}`)).status, 404, "package required");
    assert.equal((await month(d, "nope")).status, 404);
    assert.equal((await month(d, S.pkgA, S.studioB)).status, 404, "draft studio");
  });

  test("bookings against an unavailable date or time are refused", async () => {
    const closed = plusDays(93);
    const custom = plusDays(94);
    assert.equal((await av(S.alice, closed, { isClosed: true, slots: [] })).status, 200);
    assert.equal((await av(S.alice, custom, { isClosed: false, slots: [slot("10:00", "12:00")] })).status, 200);
    const onClosed = await book(S.fay, closed, "10:00");
    assert.equal(onClosed.status, 409);
    assert.equal(onClosed.json.error.code, "DAY_CLOSED");
    const outside = await book(S.fay, custom, "14:00");
    assert.equal(outside.status, 409);
    assert.equal(outside.json.error.code, "OUTSIDE_HOURS");
    assert.equal((await book(S.fay, custom, "11:00")).status, 409, "2h session does not fit 11:00-12:00");
    const ok = await book(S.fay, custom, "10:00");
    assert.equal(ok.status, 201, JSON.stringify(ok.json));
    S.p4Custom = ok.json.bookingId;
    assert.deepEqual((await month(custom)).json.days[custom], undefined, "fully booked day disappears");
  });

  test("availability edits can never strand a pending or confirmed booking", async () => {
    const d = plusDays(94); // Fay's pending 10:00-12:00
    for (const [label, body] of [
      ["close the day", { isClosed: true, slots: [] }],
      ["move the slot", { isClosed: false, slots: [slot("14:00", "16:00")] }],
      ["shrink the slot", { isClosed: false, slots: [slot("10:00", "11:00")] }],
    ]) {
      const res = await av(S.alice, d, body);
      assert.equal(res.status, 409, label);
      assert.equal(res.json.error.code, "BOOKED_TIME");
    }
    // Widening is fine, and standard hours (07:00-20:00) still cover it.
    assert.equal((await av(S.alice, d, { isClosed: false, slots: [slot("09:00", "13:00")] })).status, 200);
    assert.equal((await av(S.alice, d, undefined, "DELETE")).status, 200);
    assert.equal((await act(S.alice, S.p4Custom, "confirm")).status, 200);
    assert.equal((await av(S.alice, d, { isClosed: true, slots: [] })).status, 409, "confirmed booking protected too");
  });

  test("scenario B/C: pending and confirmed bookings block the slot", async () => {
    const d = plusDays(95);
    const first = await book(S.fay, d, "10:00");
    assert.equal(first.status, 201);
    assert.equal((await book(S.gus, d, "10:00")).status, 409, "pending blocks same time");
    assert.equal((await book(S.gus, d, "11:00")).status, 409, "pending blocks overlap");
    assert.equal((await act(S.alice, first.json.bookingId, "confirm")).status, 200);
    const again = await book(S.gus, d, "10:00");
    assert.equal(again.status, 409, "confirmed blocks same time");
    assert.equal(again.json.error.code, "SLOT_TAKEN");
    assert.equal((await book(S.gus, d, "09:00")).status, 409, "confirmed blocks overlap");
    assert.equal((await book(S.gus, d, "12:00")).status, 201, "adjacent is free");
  });

  test("public availability APIs expose only free times / published hours — no booking, customer or studio-private data", async () => {
    const d = plusDays(95); // has a confirmed (Fay 10:00) and a pending (Gus 12:00) booking
    const bookings = (await db.collection("bookings").where("studioId", "==", S.studioA).where("shootDate", "==", d).get()).docs;
    assert.ok(bookings.length >= 2, "fixture: bookings exist on this day");
    const contact = (await db.doc(`studios/${S.studioA}/private/contact`).get()).data();
    const needles = [
      ...bookings.map((b) => b.id),
      ...bookings.flatMap((b) => [b.get("customerName"), b.get("customerPhone"), b.get("customerId")]),
      S.alice.uid, contact.phone, contact.email, contact.address, contact.website, contact.instagram,
      "busy", "pending", "confirmed", "completed", "bookingStatus", "customer", "commission", "photographerNet",
      "grossAmount", "ownerId", "lastModeration", "moderation",
    ].filter(Boolean).map(String);

    const dayView = await call(null, "GET", `/api/studios/${S.studioA}/availability?date=${d}`);
    assert.equal(dayView.status, 200);
    assert.deepEqual(Object.keys(dayView.json).sort(), ["date", "isClosed", "open", "source"]);
    for (const w of dayView.json.open) assert.deepEqual(Object.keys(w).sort(), ["end", "start"]);

    const monthView = await month(d);
    assert.equal(monthView.status, 200);
    assert.deepEqual(Object.keys(monthView.json).sort(), ["days", "month"]);
    for (const times of Object.values(monthView.json.days)) {
      assert.ok(Array.isArray(times) && times.every((t) => /^\d\d:\d\d$/.test(t)), "only HH:mm strings");
    }
    assert.ok(!(monthView.json.days[d] ?? []).includes("10:00"), "booked time is not offered");

    for (const [label, json] of [["?date=", dayView.json], ["?month=", monthView.json]]) {
      const body = JSON.stringify(json);
      for (const n of needles) assert.ok(!body.includes(n), `${label} leaks ${n}`);
    }
  });

  test("scenario D: cancelled, declined and studio-cancelled bookings free the slot", async () => {
    const d = plusDays(96);
    const a = await book(S.hal, d, "10:00");
    assert.equal((await act(S.hal, a.json.bookingId, "cancel")).status, 200);
    const b = await book(S.ivy, d, "10:00");
    assert.equal(b.status, 201, "free again after customer cancel");
    assert.equal((await act(S.alice, b.json.bookingId, "decline")).status, 200);
    const c = await book(S.hal, d, "10:00");
    assert.equal(c.status, 201, "free again after decline");
    assert.equal((await act(S.alice, c.json.bookingId, "confirm")).status, 200);
    assert.equal((await act(S.alice, c.json.bookingId, "studio_cancel")).status, 200);
    assert.equal(await status(c.json.bookingId), "cancelled_by_studio");
    assert.ok((await db.doc(`bookings/${c.json.bookingId}`).get()).get("cancelledAt"));
    assert.equal((await book(S.ivy, d, "10:00")).status, 201, "free again after studio cancel");
  });

  test("scenario E: a completed booking blocks its slot but not other dates; past dates can't be booked", async () => {
    const d = plusDays(97);
    await seedBooking({ shootDate: d, bookingStatus: "completed", completedAt: new Date() });
    const same = await book(S.gus, d, "10:00");
    assert.equal(same.status, 409, "completed window stays blocked");
    assert.equal((await book(S.gus, d, "11:00")).status, 409);
    assert.equal((await book(S.gus, plusDays(98), "10:00")).status, 201, "a future date is not blocked");
    assert.equal((await book(S.gus, plusDays(-2), "10:00")).status, 422, "historical date");
  });

  test("scenario A: two customers racing for the same slot — exactly one wins", async () => {
    const d = plusDays(99);
    const results = await Promise.all([book(S.fay, d, "15:00"), book(S.ivy, d, "15:00")]);
    assert.deepEqual(results.map((r) => r.status).sort(), [201, 409], JSON.stringify(results.map((r) => r.json)));
    const snap = await db.collection("bookings").where("studioId", "==", S.studioA).where("shootDate", "==", d).get();
    assert.equal(snap.size, 1);
  });

  test("race: closing a day while a booking is requested never leaves both in effect", async () => {
    for (const n of [100, 101, 102]) {
      const d = plusDays(n);
      const [close, req] = await Promise.all([av(S.alice, d, { isClosed: true, slots: [] }), book(S.hal, d, "10:00")]);
      const closed = (await db.doc(`studios/${S.studioA}/availability/${d}`).get()).get("isClosed") === true;
      const active = (await db.collection("bookings").where("studioId", "==", S.studioA).where("shootDate", "==", d).get()).docs
        .filter((b) => ["pending", "confirmed"].includes(b.get("bookingStatus")));
      assert.ok(!(closed && active.length), `day ${d}: closed=${closed} active=${active.length} (PUT ${close.status}, POST ${req.status})`);
      assert.ok((close.status === 200) !== (req.status === 201), `exactly one wins: PUT ${close.status}, POST ${req.status}`);
      if (req.status === 201) await act(S.hal, req.json.bookingId, "cancel");
    }
  });

  test("race: moving a slot while a booking inside the old slot is requested never leaves an invalid booking", async () => {
    for (const n of [110, 111, 112]) {
      const d = plusDays(n);
      assert.equal((await av(S.alice, d, { isClosed: false, slots: [slot("10:00", "12:00")] })).status, 200);
      const [move, req] = await Promise.all([
        av(S.alice, d, { isClosed: false, slots: [slot("14:00", "16:00")] }),
        book(S.ivy, d, "10:00"),
      ]);
      assert.ok((move.status === 200) !== (req.status === 201), `exactly one wins: PUT ${move.status}, POST ${req.status}`);
      if (move.status !== 200) assert.equal(move.json.error.code, "BOOKED_TIME");
      if (req.status !== 201) assert.equal(req.status, 409);
      // Every active booking lies inside the day's current open slots.
      const slots = (await db.doc(`studios/${S.studioA}/availability/${d}`).get()).get("slots");
      const active = (await db.collection("bookings").where("studioId", "==", S.studioA).where("shootDate", "==", d).get()).docs
        .filter((b) => ["pending", "confirmed"].includes(b.get("bookingStatus")));
      for (const b of active) {
        assert.ok(slots.some((s) => s.start <= b.get("startTime") && b.get("endTime") <= s.end), `booking ${b.get("startTime")} outside ${JSON.stringify(slots)}`);
      }
      if (req.status === 201) await act(S.ivy, req.json.bookingId, "cancel");
    }
  });

  test("studio transitions: valid ones succeed, invalid ones are refused", async () => {
    const d = plusDays(103);
    const p = (await book(S.fay, d, "09:00")).json.bookingId;
    assert.equal((await act(S.alice, p, "complete")).status, 409, "pending → completed");
    assert.equal((await act(S.alice, p, "studio_cancel")).status, 409, "pending → studio cancel (use decline)");
    assert.equal((await act(S.alice, p, "cancel")).status, 403, "studio cannot use the customer's cancel");
    assert.equal((await act(S.bob, p, "confirm")).status, 404, "other photographer");
    assert.equal((await act(S.admin2 ?? S.admin, p, "confirm")).status, 403, "admin has no booking write path");
    assert.equal((await act(S.alice, p, "confirm")).status, 200);
    assert.equal((await act(S.alice, p, "confirm")).status, 409, "confirmed → confirmed");
    assert.equal((await act(S.alice, p, "decline")).status, 409, "confirmed → declined");
    const notYet = await act(S.alice, p, "complete");
    assert.equal(notYet.status, 409, "before the shoot date");
    assert.equal(notYet.json.error.code, "NOT_YET");

    // A confirmed session happening today can be completed — once.
    // Starts at 00:00 so its start time has always passed (completion requires that since 4B-1).
    const today = await seedBooking({ shootDate: nepalToday(), startTime: "00:00", endTime: "02:00", bookingStatus: "confirmed", confirmedAt: new Date() });
    const before = (await db.doc(`studios/${S.studioA}`).get()).get("stats.completedBookings") ?? 0;
    assert.equal((await act(S.alice, today, "complete")).status, 200);
    const done = (await db.doc(`bookings/${today}`).get()).data();
    assert.equal(done.bookingStatus, "completed");
    assert.equal(done.payoutStatus, "pending");
    assert.ok(done.completedAt);
    assert.equal((await db.doc(`studios/${S.studioA}`).get()).get("stats.completedBookings"), before + 1);
    for (const action of ["complete", "confirm", "decline", "studio_cancel"]) {
      assert.equal((await act(S.alice, today, action)).status, 409, `completed → ${action}`);
    }
    assert.equal((await act(S.fay, today, "cancel")).status, 409, "customer cannot cancel a completed booking");
  });

  test("customer cancellation: only their own pending request", async () => {
    const d = plusDays(104);
    const p = (await book(S.gus, d, "09:00")).json.bookingId;
    assert.equal((await act(S.fay, p, "cancel")).status, 404, "someone else's booking");
    assert.equal((await act(S.gus, p, "cancel")).status, 200);
    assert.equal(await status(p), "cancelled_by_customer");
    assert.equal((await act(S.gus, p, "cancel")).status, 409, "cancelled → cancelled");

    const c = (await book(S.gus, d, "13:00")).json.bookingId;
    assert.equal((await act(S.alice, c, "confirm")).status, 200);
    assert.equal((await act(S.gus, c, "cancel")).status, 409, "confirmed bookings are not cancellable online (no policy yet)");
    const dec = (await book(S.gus, d, "16:00")).json.bookingId;
    assert.equal((await act(S.alice, dec, "decline")).status, 200);
    assert.equal((await act(S.gus, dec, "cancel")).status, 409, "declined → cancelled");
  });

  test("customers cannot change status or tamper with the booking through the API", async () => {
    const p = (await book(S.ivy, plusDays(105), "09:00")).json.bookingId;
    for (const action of ["confirm", "decline", "complete", "studio_cancel"]) {
      assert.equal((await act(S.ivy, p, action)).status, 403, action);
    }
    for (const body of [
      { action: "cancelled" },
      { action: "cancel", bookingStatus: "confirmed" },
      { bookingStatus: "confirmed" },
      { action: "confirm", grossAmount: 1 },
    ]) {
      assert.equal((await call(S.ivy, "POST", `/api/bookings/${p}`, body)).status, 422, JSON.stringify(body));
    }
    assert.equal(await status(p), "pending");
    for (const extra of [
      { studioOwnerId: S.ivy.uid }, { photographerNetAmount: 1 }, { commissionAmount: 0 }, { commissionRateBps: 0 },
      { startingPrice: 1 }, { role: "admin" }, { bookingStatus: "confirmed" }, { grossAmount: 100 },
    ]) {
      assert.equal((await book(S.ivy, plusDays(106), "09:00", extra)).status, 422, JSON.stringify(extra));
    }
    const priced = await book(S.ivy, plusDays(106), "09:00");
    assert.equal(priced.status, 201);
    const b = (await db.doc(`bookings/${priced.json.bookingId}`).get()).data();
    assert.equal(b.grossAmount, S.pkgAPrice, "price from Firestore");
    assert.equal(b.studioOwnerId, S.alice.uid, "owner from private/internal");
    assert.equal(b.commissionAmount + b.photographerNetAmount, b.grossAmount);
  });

  test("dashboard and account pages render for their owners only", async () => {
    assert.equal((await page("/dashboard/availability", S.alice)).status, 200);
    const cal = await page(`/dashboard/availability?month=${plusDays(94).slice(0, 7)}&date=${plusDays(94)}`, S.alice);
    assert.equal(cal.status, 200);
    assert.match(cal.html, /Save availability|Availability can be changed/);
    assert.equal((await page("/dashboard/availability?month=1999-01&date=nonsense", S.alice)).status, 200, "bad params are clamped");
    assert.equal((await page("/dashboard/availability", S.dave)).status, 307, "customer is redirected");
    for (const tab of ["", "?status=pending", "?status=confirmed", "?status=completed", "?status=cancelled", "?status=declined", "?status=bogus"]) {
      assert.equal((await page(`/dashboard/bookings${tab}`, S.alice)).status, 200, tab);
    }
    const mine = await page("/account/bookings", S.gus);
    assert.equal(mine.status, 200);
    assert.match(mine.html, /Booking confirmed|Waiting for the studio|Request declined/);
    assert.equal((await page("/admin/bookings?status=cancelled_by_studio", S.admin2 ?? S.admin)).status, 200);
  });
});

/* ======================================== 8c. Phase 4B-1: lifecycle hardening */

describe("Phase 4B-1: booking lifecycle hardening", () => {
  const book = (user, shootDate, startTime) =>
    call(user, "POST", "/api/bookings", {
      studioId: S.studioA, packageId: S.pkgA, shootDate, startTime,
      customerName: "Lifecycle", customerPhone: "9811111177", customerNote: null,
    });
  const act = (user, bookingId, action) => call(user, "POST", `/api/bookings/${bookingId}`, { action });
  const statusOf = async (id) => (await db.doc(`bookings/${id}`).get()).get("bookingStatus");
  /** Nepal wall-clock "now" as YYYY-MM-DD / HH:mm. */
  const nepalNow = () => {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kathmandu", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date()).map((x) => [x.type, x.value]));
    return { date: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) };
  };
  const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  /** Admin-SDK fixture: a booking in a state/time the public API can't create (e.g. a past start). */
  const seed = async (customer, fields) => {
    const ref = db.collection("bookings").doc();
    await ref.set({
      customerId: customer.uid, studioId: S.studioA, studioOwnerId: S.alice.uid, packageId: S.pkgA, photographyCategory: "newborn",
      startTime: "10:00", endTime: "12:00", timezone: "Asia/Kathmandu", customerName: "Seeded", customerPhone: "+9779811111100",
      customerNote: null, packageSnapshot: { name: "Seeded", price: 1500000, durationMinutes: 120 },
      studioSnapshot: { businessName: "Seeded", slug: "seeded" }, paymentStatus: "unpaid", payoutStatus: "not_due", currency: "NPR",
      grossAmount: 1500000, commissionRateBps: 800, commissionAmount: 120000, photographerNetAmount: 1380000,
      confirmedAt: null, completedAt: null, cancelledAt: null, createdAt: new Date(), updatedAt: new Date(), ...fields,
    });
    return ref.id;
  };

  before(async () => {
    [S.jay, S.kim, S.lee] = await Promise.all(
      ["jay", "kim", "lee"].map((n) => login(`${n}-${RUN}@example.com`, { signup: true, profile: { displayName: n, phone: null } })),
    );
    assert.equal((await db.doc(`studios/${S.studioA}`).get()).get("listingStatus"), "published", "studio A is published");
  });

  test("a request whose start time has passed can't be confirmed, declined or cancelled (derived expiry)", async () => {
    const today0000 = await seed(S.jay, { shootDate: nepalToday(), startTime: "00:00", endTime: "02:00", bookingStatus: "pending" });
    const pastDay = await seed(S.jay, { shootDate: plusDays(-3), bookingStatus: "pending" });
    for (const id of [today0000, pastDay]) {
      for (const [user, action] of [[S.alice, "confirm"], [S.alice, "decline"], [S.jay, "cancel"]]) {
        const res = await act(user, id, action);
        assert.equal(res.status, 409, `${action} on expired`);
        assert.equal(res.json.error.code, "EXPIRED");
      }
      assert.equal(await statusOf(id), "pending", "stored status is unchanged (expiry is derived)");
    }
    S.expiredJay = today0000;
    // Still refused for the wrong actor with the right error.
    assert.equal((await act(S.jay, today0000, "confirm")).status, 403);
    // A request still in the future can be confirmed.
    const future = await book(S.jay, plusDays(130), "09:00");
    assert.equal(future.status, 201);
    assert.equal((await act(S.alice, future.json.bookingId, "confirm")).status, 200);
  });

  test("completion requires the session's start time to have passed", async () => {
    const now = nepalNow();
    // Start ~1 hour from now (rolls to tomorrow near midnight — still in the future either way).
    const startMin = Math.ceil((now.minutes + 60) / 30) * 30;
    const later = startMin < 24 * 60 ? { shootDate: now.date, startTime: hhmm(startMin) } : { shootDate: plusDays(1), startTime: "00:30" };
    const notYet = await seed(S.jay, { ...later, endTime: "23:59", bookingStatus: "confirmed", confirmedAt: new Date() });
    const res = await act(S.alice, notYet, "complete");
    assert.equal(res.status, 409);
    assert.equal(res.json.error.code, "NOT_YET");
    assert.equal(await statusOf(notYet), "confirmed");

    const started = await seed(S.jay, { shootDate: nepalToday(), startTime: "00:00", endTime: "02:00", bookingStatus: "confirmed", confirmedAt: new Date() });
    assert.equal((await act(S.jay, started, "complete")).status, 403, "customers can't complete");
    assert.equal((await act(S.bob, started, "complete")).status, 404, "other studios can't complete");
    assert.equal((await act(S.alice, started, "complete")).status, 200);
    assert.equal(await statusOf(started), "completed");
    S.needsCompletion = await seed(S.jay, { shootDate: plusDays(-1), bookingStatus: "confirmed", confirmedAt: new Date() });
  });

  test("expired requests don't count toward the 5 open-request limit", async () => {
    for (let i = 0; i < 5; i++) await seed(S.kim, { shootDate: plusDays(-10 - i), bookingStatus: "pending" });
    const results = [];
    for (let i = 0; i < 6; i++) results.push((await book(S.kim, plusDays(140 + i), "09:00")).status);
    assert.deepEqual(results, [201, 201, 201, 201, 201, 429]);
  });

  test("8 concurrent requests from one customer create at most 5 open requests", async () => {
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => book(S.lee, plusDays(150 + i), "09:00")));
    const statuses = results.map((r) => r.status).sort();
    assert.deepEqual(statuses, [201, 201, 201, 201, 201, 429, 429, 429], JSON.stringify(results.map((r) => r.json?.error?.code ?? r.status)));
    const pending = await db.collection("bookings").where("customerId", "==", S.lee.uid).where("bookingStatus", "==", "pending").get();
    assert.equal(pending.size, 5, "exactly 5 open requests stored");
    assert.ok((await db.doc(`customerLocks/${S.lee.uid}`).get()).exists, "customer lock written by the server");
    // A second burst adds nothing.
    const again = await Promise.all(Array.from({ length: 3 }, (_, i) => book(S.lee, plusDays(160 + i), "09:00")));
    assert.deepEqual(again.map((r) => r.status), [429, 429, 429]);
  });

  test("dashboards classify bookings by status AND time", async () => {
    // Customer: an expired request is history, never upcoming, and offers no cancel.
    const list = await page("/account/bookings", S.jay);
    assert.equal(list.status, 200);
    const historyAt = list.html.indexOf('id="history"');
    assert.ok(historyAt > 0, "history section");
    assert.ok(list.html.indexOf(S.expiredJay) > historyAt, "expired request listed under History");
    assert.match(list.html, /Request expired/);
    const detail = await page(`/account/bookings/${S.expiredJay}?created=1`, S.jay);
    assert.match(detail.html, /Request expired/);
    assert.doesNotMatch(detail.html, /Booking request sent|>Cancel request</);

    // Studio: expired requests leave the Pending tab and have no actions; sessions to complete are prompted.
    const expiredTab = await page("/dashboard/bookings?status=expired", S.alice);
    assert.ok(expiredTab.html.includes(S.expiredJay));
    const pendingTab = await page("/dashboard/bookings?status=pending", S.alice);
    assert.ok(!pendingTab.html.includes(S.expiredJay), "expired request not in Pending");
    const all = await page("/dashboard/bookings", S.alice);
    assert.match(all.html, /to mark completed/);
    const card = all.html.slice(all.html.indexOf(`data-booking="${S.expiredJay}"`), all.html.indexOf(`data-booking="${S.expiredJay}"`) + 4000);
    assert.doesNotMatch(card.split("</li>")[0], />(Confirm|Decline)</, "no actions on an expired request");
    assert.match((await page("/dashboard", S.alice)).html, /Needs your attention/);

    // Admin sees the derived label (read-only).
    assert.match((await page("/admin/bookings", S.admin2 ?? S.admin)).html, />Expired</);
  });
});

/* ============================================= 8d. Phase 4B-2: reviews and ratings */

describe("Phase 4B-2: reviews and rating accounting", () => {
  const DAY = 24 * 60 * 60 * 1000;
  const submit = (user, bookingId, body) => call(user, "POST", `/api/bookings/${bookingId}/review`, body);
  const moderate = (bookingId, action, reason = action === "hide" ? "Not appropriate" : null) =>
    call(S.admin, "POST", `/api/admin/reviews/${bookingId}`, { action, reason });
  const good = (rating = 5) => ({ rating, comment: "Warm, patient team and beautiful newborn photos. Highly recommended!" });
  const stats = async () => {
    const s = (await db.doc(`studios/${S.studioA}`).get()).get("stats");
    return { ratingSum: s.ratingSum ?? 0, reviewCount: s.reviewCount, ratingAverage: s.ratingAverage };
  };
  const expectStats = async (base, sum, count, label) => {
    const want = { ratingSum: base.ratingSum + sum, reviewCount: base.reviewCount + count };
    const got = await stats();
    assert.equal(got.ratingSum, want.ratingSum, `${label}: ratingSum`);
    assert.equal(got.reviewCount, want.reviewCount, `${label}: reviewCount`);
    assert.equal(got.ratingAverage, want.reviewCount ? Math.round((want.ratingSum / want.reviewCount) * 100) / 100 : 0, `${label}: ratingAverage`);
  };
  /** Admin-SDK fixture: a booking in a state the public API reaches only over time (completed, old, etc.). */
  const seed = async (customer, fields) => {
    const ref = db.collection("bookings").doc();
    await ref.set({
      customerId: customer.uid, studioId: S.studioA, studioOwnerId: S.alice.uid, packageId: S.pkgA, photographyCategory: "newborn",
      shootDate: plusDays(-5), startTime: "10:00", endTime: "12:00", timezone: "Asia/Kathmandu", customerName: "Seeded Customer",
      customerPhone: "+9779811111155", customerNote: null, packageSnapshot: { name: "Seeded", price: 1500000, durationMinutes: 120 },
      studioSnapshot: { businessName: "Seeded", slug: "seeded" }, paymentStatus: "unpaid", payoutStatus: "pending", currency: "NPR",
      grossAmount: 1500000, commissionRateBps: 800, commissionAmount: 120000, photographerNetAmount: 1380000,
      bookingStatus: "completed", confirmedAt: new Date(Date.now() - 10 * DAY), completedAt: new Date(Date.now() - DAY),
      cancelledAt: null, reviewedAt: null, createdAt: new Date(), updatedAt: new Date(), ...fields,
    });
    return ref.id;
  };
  const B = {};

  before(async () => {
    [S.nora, S.omar, S.pia, S.quin] = await Promise.all(
      [["nora", "Nora Gurung"], ["omar", "Omar Karki"], ["pia", "Pia Thapa"], ["quin", "Quin Rai"]].map(([n, name]) =>
        login(`${n}-${RUN}@example.com`, { signup: true, profile: { displayName: name, phone: "98" + String(10000000 + n.length * 1111111).slice(0, 8) } }),
      ),
    );
    B.done = await seed(S.nora);
    B.race = await seed(S.nora, { completedAt: new Date(Date.now() - 2 * DAY) });
    B.omar = await seed(S.omar);
    B.old = await seed(S.pia, { completedAt: new Date(Date.now() - 61 * DAY) });
    B.edge = await seed(S.pia, { completedAt: new Date(Date.now() - 59 * DAY) });
    B.quin = await seed(S.quin);
    B.pending = await seed(S.nora, { bookingStatus: "pending", shootDate: plusDays(100), completedAt: null, confirmedAt: null });
    B.confirmed = await seed(S.nora, { bookingStatus: "confirmed", shootDate: plusDays(100), completedAt: null });
    B.cancelled = await seed(S.nora, { bookingStatus: "cancelled_by_customer", completedAt: null, cancelledAt: new Date() });
    B.studioCancelled = await seed(S.nora, { bookingStatus: "cancelled_by_studio", completedAt: null, cancelledAt: new Date() });
    B.declined = await seed(S.nora, { bookingStatus: "declined", completedAt: null, cancelledAt: new Date() });
    B.expired = await seed(S.nora, { bookingStatus: "pending", shootDate: plusDays(-2), completedAt: null, confirmedAt: null });
    S.statsBase = await stats();
  });

  test("only completed bookings within 60 days can be reviewed", async () => {
    for (const key of ["pending", "confirmed", "cancelled", "studioCancelled", "declined", "expired"]) {
      const res = await submit(S.nora, B[key], good());
      assert.equal(res.status, 409, key);
      assert.equal(res.json.error.code, "NOT_COMPLETED", key);
    }
    const old = await submit(S.pia, B.old, good());
    assert.equal(old.status, 409);
    assert.equal(old.json.error.code, "REVIEW_WINDOW_CLOSED");
    assert.equal((await submit(S.pia, B.edge, good(4))).status, 201, "day 59 is still open");
    for (const key of ["pending", "old"]) assert.equal((await db.doc(`reviews/${B[key]}`).get()).exists, false, `no review for ${key}`);
  });

  test("only the booking's own customer can review it", async () => {
    assert.equal((await submit(null, B.done, good())).status, 401, "signed out");
    assert.equal((await submit(S.omar, B.done, good())).status, 404, "another customer");
    assert.equal((await submit(S.alice, B.done, good())).status, 403, "studio owner (photographer)");
    assert.equal((await submit(S.bob, B.done, good())).status, 403, "other photographer");
    assert.equal((await submit(S.admin, B.done, good())).status, 403, "admin");
    assert.equal((await submit(S.nora, "does-not-exist", good())).status, 404);
    assert.equal((await submit(S.nora, "a%2Fb", good())).status, 404);
    assert.equal((await db.doc(`reviews/${B.done}`).get()).exists, false);
  });

  test("rating, comment and body shape are validated server-side", async () => {
    for (const rating of [0, 6, 3.5, "5", null, -1, true]) {
      assert.equal((await submit(S.nora, B.done, { ...good(), rating })).status, 422, `rating ${JSON.stringify(rating)}`);
    }
    for (const comment of ["Too short, 19 chars", "x".repeat(1001), "", "                    short                    ", null, 42]) {
      assert.equal((await submit(S.nora, B.done, { ...good(), comment })).status, 422, `comment length ${String(comment).length}`);
    }
    assert.equal((await submit(S.nora, B.done, { rating: 5 })).status, 422, "missing comment");
    for (const extra of [
      { studioId: S.studioB }, { customerId: S.omar.uid }, { bookingId: B.omar }, { customerDisplayName: "Real Name" },
      { status: "published" }, { createdAt: "2020-01-01" }, { ratingSum: 999 }, { moderation: null }, { studioReply: "hi" },
    ]) {
      assert.equal((await submit(S.nora, B.done, { ...good(), ...extra })).status, 422, JSON.stringify(extra));
    }
    assert.equal((await db.doc(`reviews/${B.done}`).get()).exists, false, "nothing was created");
  });

  test("a valid review is created server-side as pending moderation, with a privacy-safe name", async () => {
    const res = await submit(S.nora, B.done, good(5));
    assert.equal(res.status, 201, JSON.stringify(res.json));
    assert.equal(res.json.status, "pending_moderation");
    const r = (await db.doc(`reviews/${B.done}`).get()).data();
    assert.equal(r.bookingId, B.done);
    assert.equal(r.studioId, S.studioA, "studio from the booking");
    assert.equal(r.customerId, S.nora.uid);
    assert.equal(r.customerDisplayName, "Nora G.");
    assert.equal(r.status, "pending_moderation");
    assert.equal(r.rating, 5);
    assert.equal(r.studioReply, null);
    assert.ok(!JSON.stringify(r).includes("9811111155"), "no phone in the review");
    assert.ok((await db.doc(`bookings/${B.done}`).get()).get("reviewedAt"), "booking.reviewedAt set");
    await expectStats(S.statsBase, 0, 0, "pending reviews don't count");
    const page = await call(null, "GET", `/photographers/${S.slugA}`);
    assert.ok(!(await fetch(`${BASE}/photographers/${S.slugA}`).then((x) => x.text())).includes("Warm, patient team"), "not public before moderation");
    assert.equal(page.status, 200);
  });

  test("duplicates are refused and reviews can't be edited or deleted", async () => {
    const again = await submit(S.nora, B.done, good(1));
    assert.equal(again.status, 409);
    assert.equal(again.json.error.code, "ALREADY_REVIEWED");
    assert.equal((await db.doc(`reviews/${B.done}`).get()).get("rating"), 5, "original kept");
    for (const method of ["PUT", "PATCH", "DELETE", "GET"]) {
      assert.equal((await call(S.nora, method, `/api/bookings/${B.done}/review`, method === "GET" || method === "DELETE" ? undefined : good(1))).status, 405, method);
    }
  });

  test("simultaneous submissions for one booking create exactly one review", async () => {
    const results = await Promise.all(Array.from({ length: 6 }, (_, i) => submit(S.nora, B.race, good(1 + (i % 5)))));
    const statuses = results.map((r) => r.status).sort();
    assert.deepEqual(statuses, [201, 409, 409, 409, 409, 409], JSON.stringify(results.map((r) => r.json)));
    const snap = await db.collection("reviews").where("customerId", "==", S.nora.uid).get();
    assert.equal(snap.docs.filter((d) => d.id === B.race).length, 1);
  });

  test("moderation keeps published-only rating totals exact through repeated changes", async () => {
    const base = S.statsBase;
    assert.equal((await submit(S.omar, B.omar, { rating: 2, comment: "OMAR-HIDDEN-MARKER: the lighting was not what we expected." })).status, 201);
    // B.done = 5★ (Nora), B.omar = 2★ (Omar), B.edge = 4★ (Pia), all pending.
    assert.equal((await moderate(B.done, "publish")).status, 200);
    await expectStats(base, 5, 1, "publish 5★");
    const repeat = await moderate(B.done, "publish");
    assert.equal(repeat.status, 409);
    assert.equal(repeat.json.error.code, "NO_CHANGE");
    await expectStats(base, 5, 1, "repeat publish is a no-op");
    assert.equal((await moderate(B.omar, "publish")).status, 200);
    await expectStats(base, 7, 2, "publish 2★");
    assert.equal((await call(S.admin, "POST", `/api/admin/reviews/${B.done}`, { action: "hide", reason: null })).status, 422, "hide needs a reason");
    assert.equal((await moderate(B.done, "hide")).status, 200);
    await expectStats(base, 2, 1, "hide 5★ removes it");
    assert.equal((await moderate(B.done, "hide")).status, 409);
    await expectStats(base, 2, 1, "repeat hide is a no-op");
    assert.equal((await moderate(B.done, "publish")).status, 200);
    await expectStats(base, 7, 2, "re-publish restores exactly once");
    assert.equal((await moderate(B.edge, "hide")).status, 200, "reject a pending review");
    await expectStats(base, 7, 2, "pending → hidden changes nothing");
    assert.equal((await moderate(B.edge, "publish")).status, 200);
    await expectStats(base, 11, 3, "hidden → published adds it");
    // Concurrent identical moderation: exactly one applies.
    const racers = await Promise.all(Array.from({ length: 4 }, () => moderate(B.omar, "hide")));
    assert.deepEqual(racers.map((r) => r.status).sort(), [200, 409, 409, 409]);
    await expectStats(base, 9, 2, "concurrent hides counted once");
    const review = (await db.doc(`reviews/${B.omar}`).get()).data();
    assert.equal(review.status, "hidden");
    assert.equal(review.moderation.by, S.admin.uid);
    assert.equal(review.rating, 2, "rating never edited by moderation");
    // Customers and photographers can't moderate.
    assert.equal((await call(S.nora, "POST", `/api/admin/reviews/${B.done}`, { action: "hide", reason: "x" })).status, 403);
    assert.equal((await call(S.alice, "POST", `/api/admin/reviews/${B.omar}`, { action: "publish", reason: null })).status, 403);
  });

  test("the repair script (read-only by default) finds no drift", async () => {
    const { spawnSync } = await import("node:child_process");
    const r = spawnSync("node", ["scripts/recompute-ratings.mjs", "--studio", S.studioA], { env: process.env, encoding: "utf8" });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /mode: read-only/);
    assert.match(r.stdout, /0 differing/);
  });

  test("public pages show only safe fields of published reviews", async () => {
    const html = await fetch(`${BASE}/photographers/${S.slugA}`).then((x) => x.text());
    assert.ok(html.includes("Nora G."), "published review display name");
    assert.ok(html.includes("Pia T."), "published review display name");
    assert.ok(html.includes("Warm, patient team"), "published review text shown");
    assert.ok(!html.includes("OMAR-HIDDEN-MARKER"), "hidden review text not shown");
    assert.ok(!html.includes("Omar K."), "hidden review author not shown");
    for (const secret of [S.nora.uid, S.omar.uid, S.pia.uid, B.done, B.omar, B.edge, "9811111155", "moderation", "customerId", "bookingId", "Not appropriate"]) {
      assert.ok(!html.includes(secret), `public page leaks ${secret}`);
    }
    const s = await stats();
    assert.match(html, new RegExp(`"reviewCount":${s.reviewCount}`), "structured data uses the published count");
    assert.match(html, new RegExp(`★ ${s.ratingAverage.toFixed(1)} \\(${s.reviewCount} reviews\\)`), "header shows published rating");
    assert.match(await fetch(`${BASE}/photographers`).then((x) => x.text()), new RegExp(`★ (<!-- -->)?${s.ratingAverage.toFixed(1)}`), "card shows the rating");
  });

  test("customer review UI: prompt, form, then status — never editable", async () => {
    const list = await page("/account/bookings", S.quin);
    assert.match(list.html, /ready for your review/);
    assert.match(list.html, /Leave a review/);
    const before = await page(`/account/bookings/${B.quin}`, S.quin);
    assert.match(before.html, /id="review-comment"/, "form shown");
    assert.equal((await submit(S.quin, B.quin, good(3))).status, 201);
    const after = await page(`/account/bookings/${B.quin}`, S.quin);
    assert.doesNotMatch(after.html, /id="review-comment"/, "form gone");
    assert.match(after.html, /waiting to be checked/);
    assert.match(after.html, /can&#x27;t be edited or deleted|can't be edited or deleted/);
    assert.doesNotMatch((await page("/account/bookings", S.quin)).html, /ready for your review/);
    const closed = await page(`/account/bookings/${B.old}`, S.pia);
    assert.match(closed.html, /review window for this session has closed/);
    assert.equal((await page(`/account/bookings/${B.done}`, S.omar)).status, 404, "another customer's booking");
    assert.equal((await page("/admin/reviews?status=pending_moderation", S.admin)).status, 200);
  });
});

/* ============================================================== 9. logout */

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
