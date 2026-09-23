import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";

import { publicEnv, requireEnv } from "@/lib/env/public";

/**
 * Firebase App singleton, shared by Auth and Firestore.
 *
 * Initialization is lazy so that importing this module never throws during a
 * build that lacks env vars, and HMR / repeated imports reuse the same app.
 *
 * Firebase Storage is intentionally NOT used — all media lives in Cloudinary.
 */
export function getFirebaseApp(): FirebaseApp {
  if (getApps().length) return getApp();

  const { firebase } = publicEnv;
  return initializeApp({
    apiKey: requireEnv(firebase.apiKey, "NEXT_PUBLIC_FIREBASE_API_KEY"),
    authDomain: requireEnv(firebase.authDomain, "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN"),
    projectId: requireEnv(firebase.projectId, "NEXT_PUBLIC_FIREBASE_PROJECT_ID"),
    appId: requireEnv(firebase.appId, "NEXT_PUBLIC_FIREBASE_APP_ID"),
    messagingSenderId: firebase.messagingSenderId,
    measurementId: firebase.measurementId,
    // storageBucket is part of the standard web config but unused (no Firebase Storage).
    storageBucket: firebase.storageBucket,
  });
}
