"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { LogoutButton } from "@/components/auth/logout-button";
import { NotificationBell } from "@/components/notifications/notification-bell";

const LINKS = [
  { href: "/account", label: "Account" },
  { href: "/account/bookings", label: "My bookings" },
] as const;

/**
 * Signed-in customer sub-navigation (the public header is cookie-free).
 * `unread` is null for admins, who have no stored notifications.
 */
export function AccountNav({ unread }: { unread: number | null }) {
  const pathname = usePathname();
  return (
    <div className="border-b border-neutral-200 bg-white">
      <nav aria-label="Account" className="mx-auto flex w-full max-w-3xl items-center justify-between gap-2 px-4 sm:px-6">
        <ul className="flex gap-1">
          {LINKS.map((l) => {
            const active = l.href === "/account" ? pathname === l.href : pathname.startsWith(l.href);
            return (
              <li key={l.href}>
                <Link
                  href={l.href}
                  aria-current={active ? "page" : undefined}
                  className={`block border-b-2 px-3 py-3 text-sm transition-colors ${
                    active ? "border-brand-600 font-medium text-ink" : "border-transparent text-neutral-600 hover:text-ink"
                  }`}
                >
                  {l.label}
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="flex items-center gap-1">
          {unread !== null && <NotificationBell href="/account/notifications" unread={unread} />}
          <LogoutButton />
        </div>
      </nav>
    </div>
  );
}
