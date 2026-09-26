import Link from "next/link";

import { WeeklyHoursEditor } from "@/components/availability/weekly-hours-editor";
import { PageHeader } from "@/components/ui/feedback";
import { getWeeklyHours } from "@/lib/booking/service";
import { requireStudio } from "@/lib/data/dashboard";

export const metadata = { title: "Weekly hours" };

export default async function WeeklyHoursPage() {
  const { studio } = await requireStudio("/dashboard/availability/weekly");
  const weekly = await getWeeklyHours(studio.id);
  return (
    <>
      <Link href="/dashboard/availability" className="text-sm text-neutral-500 hover:text-neutral-900">
        ← Availability
      </Link>
      <PageHeader
        title="Weekly hours"
        description="Your standard opening hours for each weekday. Families can book any time inside them unless you change a specific date on the calendar."
      />
      <WeeklyHoursEditor studioId={studio.id} initial={weekly} />
    </>
  );
}
