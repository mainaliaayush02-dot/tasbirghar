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
    const day = await call(null, "GET", `/api/studios/${S.studioA}/availability?date=${plusDays(14)}`);
    assert.equal(day.status, 200);
    assert.equal(day.json.busy.length, 2);
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
