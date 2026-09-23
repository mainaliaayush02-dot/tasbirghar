import { connectAuthEmulator, getAuth, inMemoryPersistence, setPersistence, type Auth } from "firebase/auth";

import { getFirebaseApp } from "./client";

let configured = false;
let persistenceReady: Promise<void> = Promise.resolve();

/**
 * Browser Firebase Auth, used only to sign in and obtain a fresh ID token,
 * which `/api/auth/session` exchanges for an httpOnly session cookie. Auth
 * state is kept in memory — the server session cookie is the only persistent
 * session, so there is no second, script-readable login to steal or sync.
 */
export function getFirebaseAuth(): Auth {
  const auth = getAuth(getFirebaseApp());
  if (!configured && typeof window !== "undefined") {
    configured = true;
    const emulatorHost = process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST;
    if (emulatorHost) {
      connectAuthEmulator(auth, `http://${emulatorHost}`, { disableWarnings: true });
    }
    persistenceReady = setPersistence(auth, inMemoryPersistence);
  }
  return auth;
}

/** Auth instance with in-memory persistence applied — use before signing in. */
export async function getSignInAuth(): Promise<Auth> {
  const auth = getFirebaseAuth();
  await persistenceReady;
  return auth;
}
