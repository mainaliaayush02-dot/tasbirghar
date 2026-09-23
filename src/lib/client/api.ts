/**
 * Browser helper for our JSON API routes. Never throws for HTTP errors —
 * returns the server's `{ error: { message, fields } }` for display.
 */
export type ApiFailure = { ok: false; status: number; message: string; fields: Record<string, string> };
export type ApiResult<T> = { ok: true; data: T } | ApiFailure;

export async function api<T = unknown>(
  path: string,
  { method = "POST", body }: { method?: "POST" | "PUT" | "PATCH" | "DELETE"; body?: unknown } = {},
): Promise<ApiResult<T>> {
  try {
    const res = await fetch(path, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "same-origin",
    });
    const json = await res.json().catch(() => null);
    if (res.ok) return { ok: true, data: json as T };
    return {
      ok: false,
      status: res.status,
      message: json?.error?.message ?? "Something went wrong. Please try again.",
      fields: json?.error?.fields ?? {},
    };
  } catch {
    return {
      ok: false,
      status: 0,
      message: "Network error. Check your connection and try again.",
      fields: {},
    };
  }
}

/** Only allow same-site relative redirects (prevents open redirects via ?next=). */
export function safeNextPath(next: string | null | undefined): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return null;
  return next;
}
