#!/usr/bin/env node
/**
 * One-off admin bootstrap. Grants the `admin` custom claim to an EXISTING
 * Firebase Auth user and updates the users/{uid}.role mirror.
 *
 * This is deliberately NOT an HTTP endpoint: it runs locally with the Firebase
 * Admin service-account credentials, which ordinary users never have.
 *
 *   1. Sign up normally at /signup with the admin's email.
 *   2. npm run admin:grant -- --email you@example.com --yes
 *   3. Sign out and back in.
 *
 * Revoke:  npm run admin:grant -- --email you@example.com --revoke --yes
 * Emulators: set FIREBASE_AUTH_EMULATOR_HOST / FIRESTORE_EMULATOR_HOST.
 */

import { cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}
const has = (name) => process.argv.includes(`--${name}`);

const email = arg("email")?.trim().toLowerCase();
const revoke = has("revoke");
if (!email || !has("yes")) {
  console.error("Usage: npm run admin:grant -- --email <email> [--revoke] --yes");
  process.exit(1);
}

const emulated = Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST);
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

const auth = getAuth(app);
const db = getFirestore(app);

const user = await auth.getUserByEmail(email).catch(() => null);
if (!user) {
  console.error(`No Firebase Auth user with email ${email}. Sign up first.`);
  process.exit(1);
}

const claims = { ...(user.customClaims ?? {}) };
if (revoke) delete claims.role;
else claims.role = "admin";

await auth.setCustomUserClaims(user.uid, claims);
await db
  .collection("users")
  .doc(user.uid)
  .set({ role: revoke ? "customer" : "admin", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
// Force existing sessions to re-authenticate so the change is picked up everywhere.
await auth.revokeRefreshTokens(user.uid);

console.log(
  `${revoke ? "Revoked admin from" : "Granted admin to"} ${email} (uid ${user.uid}) on project ${projectId}${emulated ? " [emulator]" : ""}.`,
);
process.exit(0);
