/**
 * Map Firebase Auth error codes to user-facing messages. Unknown codes get a
 * generic message so internal details are never shown.
 */
export function authErrorMessage(error: unknown): string {
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
  switch (code) {
    // Firebase returns invalid-credential for both wrong password and unknown
    // email (email-enumeration protection), so the message covers both.
    case "auth/invalid-credential":
    case "auth/invalid-login-credentials":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Incorrect email or password. If you don't have an account yet, sign up first.";
    case "auth/invalid-email":
      return "Enter a valid email address.";
    case "auth/email-already-in-use":
      return "An account with this email already exists. Try logging in.";
    case "auth/weak-password":
    case "auth/password-does-not-meet-requirements":
      return "Choose a stronger password (at least 8 characters).";
    case "auth/user-disabled":
      return "This account has been disabled. Contact TasbirGhar support.";
    case "auth/too-many-requests":
      return "Too many attempts. Please wait a few minutes and try again.";
    case "auth/network-request-failed":
      return "Network error. Check your connection and try again.";
    case "auth/operation-not-allowed":
      return "This sign-in method is not enabled.";
    default:
      return "Something went wrong. Please try again.";
  }
}
