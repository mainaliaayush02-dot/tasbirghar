import { PageHeader } from "@/components/ui/feedback";
import { requireStudio } from "@/lib/data/dashboard";
import { listPackages } from "@/lib/data/studios";

import { PackageList } from "./package-list";

export const metadata = { title: "Packages" };

export default async function PackagesPage() {
  const { studio } = await requireStudio("/dashboard/packages");
  const packages = await listPackages(studio.id);
  return (
    <>
      <PageHeader
        title="Packages"
        description="Prices are in Nepali rupees. TasbirGhar's commission is applied at booking; you don't need to include it here."
      />
      <PackageList studioId={studio.id} packages={packages} />
    </>
  );
}
