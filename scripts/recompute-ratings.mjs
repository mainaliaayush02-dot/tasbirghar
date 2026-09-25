#!/usr/bin/env node
/**
 * Recompute each studio's public rating totals from its PUBLISHED reviews and
 * compare them with the stored stats (ratingSum, reviewCount, ratingAverage).
 *
 * READ-ONLY by default: prints every studio whose totals differ and exits
 * non-zero if any do. Nothing is written unless you pass --apply.
 *
 *   npm run ratings:recompute                 # report only
 *   npm run ratings:recompute -- --apply      # fix differing studios (writes)
 *   npm run ratings:recompute -- --studio <id> [--apply]
 *
 * Emulators: set FIRESTORE_EMULATOR_HOST (and FIREBASE_ADMIN_PROJECT_ID).
 * Normal operation never needs this — totals change transactionally with
 * moderation — it exists to repair drift from manual data edits.
 */

import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const has = (name) => process.argv.includes(`--${name}`);
const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
};
const apply = has("apply");
const onlyStudio = arg("studio");

const emulated = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const app = emulated
  ? initializeApp({ projectId })
  : initializeApp({
      projectId,
      credential: cert({
        projectId,
        clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      }),
    });
const db = getFirestore(app);

const average = (sum, count) => (count > 0 ? Math.round((sum / count) * 100) / 100 : 0);

console.log(`Project: ${projectId}${emulated ? " (emulator)" : ""} · mode: ${apply ? "APPLY (writes)" : "read-only"}`);

// Published reviews only (single-field query; no composite index needed).
const published = await db.collection("reviews").where("status", "==", "published").get();
const expected = new Map();
for (const r of published.docs) {
  const studioId = r.get("studioId");
  const rating = r.get("rating");
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    console.warn(`  ! review ${r.id}: invalid rating ${rating} — skipped`);
    continue;
  }
  const e = expected.get(studioId) ?? { ratingSum: 0, reviewCount: 0 };
  e.ratingSum += rating;
  e.reviewCount += 1;
  expected.set(studioId, e);
}

const studios = onlyStudio ? [await db.collection("studios").doc(onlyStudio).get()] : (await db.collection("studios").get()).docs;
let differing = 0;
for (const s of studios) {
  if (!s.exists) {
    console.warn(`  ! studio ${onlyStudio} not found`);
    continue;
  }
  const e = expected.get(s.id) ?? { ratingSum: 0, reviewCount: 0 };
  const want = { ratingSum: e.ratingSum, reviewCount: e.reviewCount, ratingAverage: average(e.ratingSum, e.reviewCount) };
  const stats = s.get("stats") ?? {};
  // Studios created before Phase 4B-2 have no ratingSum; the server treats it as
  // average × count (same as here), so a missing field alone is not drift.
  const count = stats.reviewCount ?? 0;
  const avg = stats.ratingAverage ?? 0;
  const have = { ratingSum: stats.ratingSum ?? Math.round(avg * count), reviewCount: count, ratingAverage: avg };
  if (have.ratingSum === want.ratingSum && have.reviewCount === want.reviewCount && have.ratingAverage === want.ratingAverage) continue;
  differing++;
  console.log(`  ${s.id}: stored ${JSON.stringify(have)} → expected ${JSON.stringify(want)}`);
  if (apply) {
    await s.ref.update({ "stats.ratingSum": want.ratingSum, "stats.reviewCount": want.reviewCount, "stats.ratingAverage": want.ratingAverage });
    console.log("    updated");
  }
}

console.log(`${studios.length} studio(s) checked, ${published.size} published review(s), ${differing} differing${apply ? " (fixed)" : ""}.`);
process.exit(differing && !apply ? 2 : 0);
