import "server-only";

import { getCurrentUser, type CurrentUser } from "@/lib/auth/current-user";
import { MediaError } from "@/lib/cloudinary/types";
import type { FieldErrors, ValidationResult } from "@/lib/validation/core";
import type { UserRole } from "@/types/models";

/**
 * Shared plumbing for JSON route handlers. Error shape:
 *   { error: { code, message, fields? } }
 * Internal error details are logged, never returned.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields?: FieldErrors,
  ) {
    super(message);
  }
}

export const unauthorized = () => new ApiError(401, "UNAUTHENTICATED", "Please sign in.");
export const forbidden = () =>
  new ApiError(403, "FORBIDDEN", "You do not have permission to do that.");
export const notFound = (what = "Resource") => new ApiError(404, "NOT_FOUND", `${what} not found.`);

const MAX_BODY_BYTES = 64 * 1024;

/**
 * Document ids from URLs must be a single safe path segment — a decoded "/"
 * would otherwise address a nested Firestore path.
 */
export function docId(value: string, what = "Resource"): string {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(value)) throw notFound(what);
  return value;
}

/**
 * CSRF defense in depth: the session cookie is SameSite=Lax, and mutating
 * requests must additionally come from our own origin.
 */
function assertSameOrigin(request: Request) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return;
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host || new URL(origin).host !== host) {
    throw new ApiError(403, "BAD_ORIGIN", "Cross-origin request rejected.");
  }
}

export async function readJson(request: Request): Promise<unknown> {
  if (!request.headers.get("content-type")?.includes("application/json")) {
    throw new ApiError(415, "UNSUPPORTED_MEDIA_TYPE", "Expected application/json.");
  }
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) throw new ApiError(413, "TOO_LARGE", "Request body too large.");
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    throw new ApiError(400, "INVALID_JSON", "Malformed JSON.");
  }
}

export function validated<T>(result: ValidationResult<T>): T {
  if (!result.ok) {
    throw new ApiError(422, "VALIDATION_FAILED", "Please fix the highlighted fields.", result.errors);
  }
  return result.data;
}

/** Authenticated user with one of the given roles (live custom claims). */
export async function requireApiUser(...roles: UserRole[]): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw unauthorized();
  if (roles.length && !roles.includes(user.role)) throw forbidden();
  return user;
}

type Handler<C> = (request: Request, context: C) => Promise<Response>;

/** Wraps a route handler: origin check + uniform error responses. */
export function apiRoute<C>(handler: Handler<C>): Handler<C> {
  return async (request, context) => {
    try {
      assertSameOrigin(request);
      return await handler(request, context);
    } catch (error) {
      if (error instanceof ApiError) {
        return Response.json(
          { error: { code: error.code, message: error.message, fields: error.fields } },
          { status: error.status },
        );
      }
      if (error instanceof MediaError) {
        return Response.json(
          { error: { code: error.code, message: error.message } },
          { status: error.status },
        );
      }
      console.error(`[api] ${request.method} ${new URL(request.url).pathname}`, error);
      return Response.json(
        { error: { code: "INTERNAL", message: "Something went wrong. Please try again." } },
        { status: 500 },
      );
    }
  };
}
