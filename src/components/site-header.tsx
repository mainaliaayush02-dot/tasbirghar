import Link from "next/link";

import { LogoutButton } from "@/components/auth/logout-button";
import { ButtonLink } from "@/components/ui/button";
import { siteConfig } from "@/config/site";
import { getCurrentUser, homeForRole } from "@/lib/auth/current-user";

export async function SiteHeader() {
  const user = await getCurrentUser();

  return (
    <header className="border-b border-neutral-200 bg-white">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-baseline gap-2">
          <span className="text-lg font-semibold tracking-tight text-neutral-900">
            {siteConfig.name}
          </span>
          <span className="hidden text-sm text-neutral-400 sm:inline">{siteConfig.nameNe}</span>
        </Link>
        <nav className="flex items-center gap-1 sm:gap-2">
          {user ? (
            <>
              {user.role === "customer" && (
                <Link
                  href="/become-a-photographer"
                  className="hidden rounded-lg px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100 sm:inline"
                >
                  For photographers
                </Link>
              )}
              <ButtonLink href={homeForRole(user.role)} variant="secondary" size="sm">
                {user.role === "customer" ? "My account" : user.role === "admin" ? "Admin" : "Dashboard"}
              </ButtonLink>
              <LogoutButton />
            </>
          ) : (
            <>
              <ButtonLink href="/login" variant="ghost" size="sm">
                Log in
              </ButtonLink>
              <ButtonLink href="/signup" size="sm">
                Sign up
              </ButtonLink>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
