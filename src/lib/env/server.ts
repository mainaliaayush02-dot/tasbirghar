import "server-only";

import { requireEnv } from "./public";

/**
 * Server-only secrets. The `server-only` import makes the build fail if this
 * module is ever pulled into a Client Component bundle.
 */
export function getCloudinaryServerEnv() {
  return {
    cloudName: requireEnv(
      process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
      "NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME",
    ),
    apiKey: requireEnv(process.env.CLOUDINARY_API_KEY, "CLOUDINARY_API_KEY"),
    apiSecret: requireEnv(
      process.env.CLOUDINARY_API_SECRET,
      "CLOUDINARY_API_SECRET",
    ),
  };
}

export function isCloudinaryConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET,
  );
}

/**
 * Firebase Admin service-account credentials (server only). The private key
 * is stored with literal "\n" sequences in env files / Vercel; restore them.
 */
export function getFirebaseAdminEnv() {
  return {
    projectId: requireEnv(process.env.FIREBASE_ADMIN_PROJECT_ID, "FIREBASE_ADMIN_PROJECT_ID"),
    clientEmail: requireEnv(
      process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      "FIREBASE_ADMIN_CLIENT_EMAIL",
    ),
    privateKey: requireEnv(
      process.env.FIREBASE_ADMIN_PRIVATE_KEY,
      "FIREBASE_ADMIN_PRIVATE_KEY",
    ).replace(/\\n/g, "\n"),
  };
}

/** True when the Admin SDK should talk to local Firebase emulators. */
export function usesFirebaseEmulators(): boolean {
  return Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST || process.env.FIRESTORE_EMULATOR_HOST);
}
