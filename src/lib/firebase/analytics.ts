import type { Analytics } from "firebase/analytics";

import { publicEnv } from "@/lib/env/public";

import { getFirebaseApp } from "./client";

let analyticsPromise: Promise<Analytics | null> | undefined;

/**
 * Optional, browser-only Firebase Analytics. Returns null on the server, in
 * unsupported browsers, or when no measurement ID is configured. The SDK is
 * dynamically imported so it never enters the server bundle. Not wired up
 * anywhere yet — call from a Client Component effect when needed.
 */
export function getFirebaseAnalytics(): Promise<Analytics | null> {
  if (typeof window === "undefined" || !publicEnv.firebase.measurementId) {
    return Promise.resolve(null);
  }

  analyticsPromise ??= import("firebase/analytics").then(
    async ({ getAnalytics, isSupported }) =>
      (await isSupported()) ? getAnalytics(getFirebaseApp()) : null,
  );
  return analyticsPromise;
}
