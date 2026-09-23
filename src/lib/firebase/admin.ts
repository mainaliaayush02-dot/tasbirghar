import "server-only";

import { cert, getApp, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

import { getFirebaseAdminEnv, usesFirebaseEmulators } from "@/lib/env/server";

const APP_NAME = "tasbirghar-admin";

/**
 * Firebase Admin app singleton (server only). Bypasses Firestore security
 * rules, so every caller must authorize the request first (see
 * `@/lib/auth/current-user`).
 *
 * With FIREBASE_AUTH_EMULATOR_HOST / FIRESTORE_EMULATOR_HOST set, the SDK
 * talks to local emulators and needs no credentials.
 */
function getAdminApp(): App {
  if (getApps().some((app) => app.name === APP_NAME)) return getApp(APP_NAME);

  if (usesFirebaseEmulators()) {
    if (process.env.VERCEL_ENV === "production") {
      throw new Error("Firebase emulator env vars must not be set in production.");
    }
    return initializeApp(
      {
        projectId:
          process.env.FIREBASE_ADMIN_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      },
      APP_NAME,
    );
  }

  const { projectId, clientEmail, privateKey } = getFirebaseAdminEnv();
  return initializeApp(
    { credential: cert({ projectId, clientEmail, privateKey }), projectId },
    APP_NAME,
  );
}

export function adminAuth(): Auth {
  return getAuth(getAdminApp());
}

export function adminDb(): Firestore {
  return getFirestore(getAdminApp());
}
