import Link from "next/link";

import { PageHeader } from "@/components/ui/feedback";
import { requireUser } from "@/lib/auth/current-user";
import { countApplications } from "@/lib/data/applications";

export const metadata = { title: "Admin" };

export default async function AdminPage() {
  await requireUser("admin", "/admin");
  const pending = await countApplications("pending");
  return (
    <>
      <PageHeader title="Admin" description="TasbirGhar operations." />
      <Link
        href="/admin/applications"
        className="block max-w-sm rounded-xl border border-neutral-200 bg-white p-5 transition-shadow hover:shadow-sm"
      >
        <p className="text-sm text-neutral-500">Photographer applications awaiting review</p>
        <p className="mt-1 text-3xl font-semibold">{pending}</p>
      </Link>
    </>
  );
}
