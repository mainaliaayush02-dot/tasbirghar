import Link from "next/link";

import { LogoutButton } from "@/components/auth/logout-button";
import { DashboardMobileNav, DashboardSidebar } from "@/components/dashboard/dashboard-nav";
import { siteConfig } from "@/config/site";
import { requireUser } from "@/lib/auth/current-user";
import { noIndexMetadata } from "@/lib/seo";

/**
 * Photographer dashboard shell. Never indexed. Authorization is enforced in
 * every page and API route (`requireUser` / `requireApiUser`); the check here
 * only avoids rendering the shell for visitors who are not photographers.
 */
export const metadata = noIndexMetadata;

export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser("dashboard", "/dashboard");

  return (
    <div className="flex flex-1 flex-col bg-neutral-50">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/dashboard" className="flex items-baseline gap-2">
            <span className="font-semibold tracking-tight">{siteConfig.name}</span>
            <span className="text-xs font-medium tracking-wide text-brand-600 uppercase">Studio</span>
          </Link>
          <div className="flex min-w-0 items-center gap-3">
            <span className="hidden truncate text-sm text-neutral-500 sm:inline">{user.email}</span>
            <LogoutButton />
          </div>
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:flex-row lg:py-8">
        <DashboardSidebar />
        <DashboardMobileNav />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
