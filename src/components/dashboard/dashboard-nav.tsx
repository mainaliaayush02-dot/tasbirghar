"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const NAV = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/studio", label: "Studio profile" },
  { href: "/dashboard/portfolio", label: "Portfolio" },
  { href: "/dashboard/gallery", label: "Studio photos" },
  { href: "/dashboard/packages", label: "Packages" },
  { href: "/dashboard/availability", label: "Availability", soon: true },
  { href: "/dashboard/verification", label: "Verification" },
  { href: "/account", label: "Account" },
] as const;

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <ul className="space-y-0.5">
      {NAV.map((item) => {
        const active =
          item.href === "/dashboard" ? pathname === item.href : pathname.startsWith(item.href);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors ${
                active
                  ? "bg-brand-50 font-medium text-brand-700"
                  : "text-neutral-700 hover:bg-neutral-100"
              }`}
            >
              {item.label}
              {"soon" in item && (
                <span className="text-[10px] tracking-wide text-neutral-400 uppercase">Soon</span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function DashboardSidebar() {
  return (
    <nav aria-label="Dashboard" className="hidden w-56 shrink-0 lg:block">
      <div className="sticky top-6">
        <NavLinks />
      </div>
    </nav>
  );
}

export function DashboardMobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const current = NAV.find((i) =>
    i.href === "/dashboard" ? pathname === i.href : pathname.startsWith(i.href),
  );
  return (
    <nav aria-label="Dashboard" className="lg:hidden">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded-lg border border-neutral-200 bg-white px-4 py-2.5 text-sm font-medium"
      >
        {current?.label ?? "Menu"}
        <span aria-hidden className={`transition-transform ${open ? "rotate-180" : ""}`}>
          ▾
        </span>
      </button>
      {open && (
        <div className="mt-2 rounded-lg border border-neutral-200 bg-white p-2 shadow-sm">
          <NavLinks onNavigate={() => setOpen(false)} />
        </div>
      )}
    </nav>
  );
}
