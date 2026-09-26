import { NotificationList } from "@/components/notifications/notification-list";
import { PageHeader } from "@/components/ui/feedback";
import { requireUser } from "@/lib/auth/current-user";
import { listNotifications } from "@/lib/notifications/service";

export const metadata = { title: "Notifications" };

export default async function AccountNotificationsPage() {
  const user = await requireUser("account", "/account/notifications");
  const { items, unread } = await listNotifications(user.uid);
  return (
    <main className="space-y-6">
      <PageHeader title="Notifications" description="Updates about your booking requests and sessions." />
      <NotificationList items={items} unread={unread} emptyHint="When a studio confirms, declines or completes a booking, you'll see it here." />
    </main>
  );
}
