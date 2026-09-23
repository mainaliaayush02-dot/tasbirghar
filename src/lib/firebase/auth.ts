import { getAuth, type Auth } from "firebase/auth";

import { getFirebaseApp } from "./client";

/**
 * Firebase Auth instance. Intended for Client Components (sign-in, current
 * user). Server-side token verification will use the Admin SDK in a later
 * phase — never trust a client-supplied uid on the server.
 */
export function getFirebaseAuth(): Auth {
  return getAuth(getFirebaseApp());
}
