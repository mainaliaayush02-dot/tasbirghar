"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type SessionUser = { role: "customer" | "photographer" | "admin"; displayName: string | null; home: string } | null;

let cached: Promise<SessionUser> | null = null;

/** Session display state, fetched once per page load (never cached by the CDN). */
export function useSessionUser(): SessionUser | undefined {
  const [user, setUser] = useState<SessionUser | undefined>(undefined);
  useEffect(() => {
    cached ??= fetch("/api/auth/session", { credentials: "same-origin", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { user: null }))
      .then((j) => j.user as SessionUser)
      .catch(() => null);
    let alive = true;
    cached.then((u) => alive && setUser(u));
    return () => {
      alive = false;
    };
  }, []);
  return user;
}

const accountLabel = (role: NonNullable<SessionUser>["role"]) =>
  role === "admin" ? "Admin" : role === "photographer" ? "Dashboard" : "My account";

/**
 * Header account area. Purely presentational: every protected page and API
 * authorizes on the server regardless of what this shows.
 */
export function AuthNav() {
  const user = useSessionUser();
  if (user === undefined) {
    return <span aria-hidden className="h-10 w-40" />;
  }
  if (!user) {
    return (
      <div className="flex items-center gap-1">
        <Link href="/login" className="rounded-full px-4 py-2 text-sm font-medium text-ink hover:bg-ink/5">
          Log in
        </Link>
        <Link href="/signup" className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-cream hover:bg-black">
          Sign up
        </Link>
      </div>
    );
  }
  return (
    <Link
      href={user.home}
      className="flex items-center gap-2 rounded-full border border-ink/15 py-1 pr-4 pl-1 text-sm font-medium text-ink hover:bg-ink/5"
    >
      <span className="grid size-8 place-items-center rounded-full bg-ink text-xs font-semibold text-cream">
        {(user.displayName ?? "A").trim().charAt(0).toUpperCase()}
      </span>
      {accountLabel(user.role)}
    </Link>
  );
}

export function MobileAuthLinks({ onNavigate }: { onNavigate: () => void }) {
  const user = useSessionUser();
  if (user === undefined) return null;
  return user ? (
    <Link href={user.home} onClick={onNavigate} className="block rounded-xl bg-ink px-4 py-3 text-center font-medium text-cream">
      {accountLabel(user.role)}
    </Link>
  ) : (
    <div className="grid grid-cols-2 gap-3">
      <Link href="/login" onClick={onNavigate} className="rounded-xl border border-ink/15 px-4 py-3 text-center font-medium text-ink">
        Log in
      </Link>
      <Link href="/signup" onClick={onNavigate} className="rounded-xl bg-ink px-4 py-3 text-center font-medium text-cream">
        Sign up
      </Link>
    </div>
  );
}
