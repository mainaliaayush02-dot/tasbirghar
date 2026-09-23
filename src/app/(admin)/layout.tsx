import Link from "next/link";

import { LogoutButton } from "@/components/auth/logout-button";
import { siteConfig } from "@/config/site";
import { requireUser } from "@/lib/auth/current-user";
import { noIndexMetadata } from "@/lib/seo";

/**
 * Admin area. Non-admins get a 404. Every admin page and API route re-checks
 * the live `admin` custom claim; admin writes only happen in server routes.
 */
export const metadata = noIndexMetadata;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser("admin", "/admin");
  return (
    <div className="flex flex-1 flex-col bg-neutral-50">
      <header className="border-b border-neutral-200 bg-neutral-900 text-white">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-6">
            <Link href="/admin" className="font-semibold">
              {siteConfig.name} <span className="text-xs font-medium tracking-wide text-brand-200 uppercase">Admin</span>
            </Link>
            <nav className="flex gap-4 text-sm text-neutral-300">
              <Link href="/admin/applications" className="hover:text-white">
                Applications
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-neutral-400 sm:inline">{user.email}</span>
            <div className="[&_button]:text-neutral-200 [&_button:hover]:bg-neutral-800">
              <LogoutButton />
            </div>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
