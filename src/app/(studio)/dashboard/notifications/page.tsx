import { NotificationList } from "@/components/notifications/notification-list";
import { PageHeader } from "@/components/ui/feedback";
import { requireUser } from "@/lib/auth/current-user";
import { listNotifications } from "@/lib/notifications/service";

export const metadata = { title: "Notifications" };

export default async function StudioNotificationsPage() {
  const user = await requireUser("dashboard", "/dashboard/notifications");
  const { items, unread } = await listNotifications(user.uid);
  return (
    <>
      <PageHeader title="Notifications" description="New booking requests, cancellations and reviews for your studio." />
      <NotificationList items={items} unread={unread} emptyHint="New booking requests and reviews will appear here." />
    </>
  );
}
