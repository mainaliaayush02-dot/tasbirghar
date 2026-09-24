import Link from "next/link";

import { AuthNav } from "@/components/public/auth-nav";
import { BrandHomeLink } from "@/components/public/brand-logo";
import { MobileMenu } from "@/components/public/mobile-menu";
import { PUBLIC_NAV } from "@/components/public/nav";

/**
 * Public header. Rendered without reading cookies so public pages can use the
 * marketplace data cache; the account area hydrates client-side. The cream
 * background is the official logo's own background colour.
 */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-ink/10 bg-cream/95 backdrop-blur supports-[backdrop-filter]:bg-cream/85">
      <div className="mx-auto flex h-[72px] w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <BrandHomeLink />
        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {PUBLIC_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-full px-3.5 py-2 text-sm text-ink/75 transition-colors hover:bg-ink/5 hover:text-ink lg:px-4"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-1">
          <div className="hidden md:block">
            <AuthNav />
          </div>
          <MobileMenu />
        </div>
      </div>
    </header>
  );
}
