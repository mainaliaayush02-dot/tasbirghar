import { Card, PageHeader } from "@/components/ui/feedback";
import { requireStudio } from "@/lib/data/dashboard";

export const metadata = { title: "Availability" };

export default async function AvailabilityPage() {
  await requireStudio("/dashboard/availability");
  return (
    <>
      <PageHeader title="Availability" description="Set the days and time slots families can book." />
      <Card>
        <p className="text-sm text-neutral-600">
          Availability and booking management arrive with the booking system. Your studio profile,
          portfolio and packages are what families will see first — complete those now.
        </p>
      </Card>
    </>
  );
}
