import { AccountNav } from "@/components/account/account-nav";
import { SiteHeader } from "@/components/site-header";
import { getCurrentUser } from "@/lib/auth/current-user";
import { unreadCount } from "@/lib/notifications/service";
import { noIndexMetadata } from "@/lib/seo";

/**
 * Signed-in customer area. Never indexed. Each page authorizes itself with
 * `requireUser` (layouts are not re-run on every navigation).
 */
export const metadata = noIndexMetadata;

export default async function CustomerLayout({ children }: { children: React.ReactNode }) {
  // Admins have no stored notifications (their queues are derived counts).
  const user = await getCurrentUser();
  const unread = user && user.role !== "admin" ? await unreadCount(user.uid) : null;
  return (
    <div className="flex flex-1 flex-col bg-neutral-50">
      <SiteHeader />
      <AccountNav unread={unread} />
      <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6">{children}</div>
    </div>
  );
}
