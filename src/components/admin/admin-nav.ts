import type { IconName } from "./icons";

export const ADMIN_NAV: { href: string; label: string; icon: IconName }[] = [
  { href: "/admin", label: "Dashboard", icon: "dashboard" },
  { href: "/admin/applications", label: "Applications", icon: "applications" },
  { href: "/admin/studios", label: "Studios", icon: "studios" },
  { href: "/admin/photographers", label: "Photographers", icon: "photographers" },
  { href: "/admin/customers", label: "Customers", icon: "customers" },
  { href: "/admin/bookings", label: "Bookings", icon: "bookings" },
  { href: "/admin/reviews", label: "Reviews", icon: "reviews" },
  { href: "/admin/commission", label: "Commission", icon: "commission" },
  { href: "/admin/settings", label: "Settings", icon: "settings" },
];

export function isActive(pathname: string, href: string) {
  return href === "/admin" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}
