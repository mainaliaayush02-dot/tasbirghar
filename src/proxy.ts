import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic redirect for obviously signed-out visitors to private areas.
 * This is NOT the security boundary — it only checks that a session cookie
 * exists. Pages and API routes verify the session and role server-side
 * (`requireUser`, `requireApiUser`).
 */
const SESSION_COOKIE = "__session";

export function proxy(request: NextRequest) {
  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next();
  const login = new URL("/login", request.url);
  login.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: [
    "/account/:path*",
    "/dashboard/:path*",
    "/admin/:path*",
    "/become-a-photographer",
  ],
};
