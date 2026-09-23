import { getFirestore, type Firestore } from "firebase/firestore";

import { getFirebaseApp } from "./client";

/**
 * Cloud Firestore instance (modular SDK). Works in Server Components for
 * public reads (subject to security rules, unauthenticated) and in Client
 * Components for signed-in reads/writes.
 */
export function getDb(): Firestore {
  return getFirestore(getFirebaseApp());
}
