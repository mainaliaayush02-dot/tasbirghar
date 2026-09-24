import Link from "next/link";

import { ApplicationActions } from "@/components/admin/actions";
import { APPLICATION_STATUS, param } from "@/components/admin/status";
import { AdminPageHeader, Chip, DataTable, EmptyState, FilterBar, Panel, StatusPill } from "@/components/admin/ui";
import { getCategory } from "@/config/categories";
import { LOCATIONS } from "@/config/locations";
import { requireUser } from "@/lib/auth/current-user";
import { listApplicationsAdmin } from "@/lib/data/admin";
import { countApplications } from "@/lib/data/applications";
import { formatDate } from "@/lib/format";
import type { ApplicationDTO } from "@/types/dto";
import type { ApplicationStatus } from "@/types/models";

export const metadata = { title: "Applications" };

const STATUSES = ["pending", "approved", "rejected"] as const;
const cityName = (slug: string) => LOCATIONS.find((l) => l.slug === slug)?.name ?? slug;

export default async function ApplicationsPage({ searchParams }: PageProps<"/admin/applications">) {
  await requireUser("admin", "/admin/applications");
  const sp = await searchParams;
  const raw = param(sp, "status");
  const status: ApplicationStatus | "" = raw === "all" ? "" : (STATUSES.find((s) => s === raw) ?? (raw ? "" : "pending"));
  const q = param(sp, "q");
  const [applications, pending, approved, rejected] = await Promise.all([
    listApplicationsAdmin({ status, q }),
    countApplications("pending"),
    countApplications("approved"),
    countApplications("rejected"),
  ]);

  return (
    <>
      <AdminPageHeader
        title="Photographer applications"
        description="Review who joins TasbirGhar. Approval grants the photographer role; studios stay private until you publish them."
      />
      <Panel bodyClassName="p-0">
        <FilterBar
          action="/admin/applications"
          tabs={{
            name: "status",
            value: status || "all",
            keep: q ? { q } : {},
            options: [
              { value: "pending", label: "Pending", count: pending },
              { value: "approved", label: "Approved", count: approved },
              { value: "rejected", label: "Rejected", count: rejected },
              { value: "all", label: "All" },
            ],
          }}
          search={{ name: "q", value: q, placeholder: "Search name, studio, email, phone…" }}
        />
        {applications.length === 0 ? (
          <EmptyState title={q ? "No matching applications" : status === "pending" ? "No applications waiting" : "No photographer applications yet"} icon="applications">
            {q
              ? "Try a different search."
              : "When photographers apply to join TasbirGhar, their applications will appear here."}
          </EmptyState>
        ) : (
          <DataTable<ApplicationDTO>
            caption="Photographer applications"
            rows={applications}
            rowKey={(a) => a.applicantUid}
            columns={[
              {
                header: "Applicant",
                cell: (a) => (
                  <Link href={`/admin/applications/${a.applicantUid}`} className="group block min-w-0">
                    <span className="block font-medium text-ink group-hover:text-brand-700">{a.businessName}</span>
                    <span className="block text-sm text-neutral-500">{a.fullName}</span>
                  </Link>
                ),
              },
              {
                header: "Contact",
                cell: (a) => (
                  <span className="block min-w-0 text-sm">
                    <span className="block break-all text-neutral-700">{a.applicantEmail ?? "—"}</span>
                    <span className="block text-neutral-500">{a.phone}</span>
                  </span>
                ),
              },
              { header: "Location", cell: (a) => `${a.area}, ${cityName(a.city)}` },
              {
                header: "Categories",
                cell: (a) => (
                  <span className="flex flex-wrap gap-1">
                    {a.categories.map((c) => (
                      <Chip key={c}>{getCategory(c).name.replace(" Photography", "")}</Chip>
                    ))}
                  </span>
                ),
              },
              { header: "Submitted", cell: (a) => formatDate(a.submittedAt), className: "whitespace-nowrap" },
              {
                header: "Status",
                cell: (a) => <StatusPill tone={APPLICATION_STATUS[a.status].tone}>{APPLICATION_STATUS[a.status].label}</StatusPill>,
              },
              {
                header: "Actions",
                className: "text-right",
                cell: (a) =>
                  a.status === "pending" ? (
                    <div className="flex flex-wrap items-center justify-end gap-2 md:justify-end">
                      <Link href={`/admin/applications/${a.applicantUid}`} className="text-sm font-medium text-neutral-600 hover:text-ink">
                        View
                      </Link>
                      <ApplicationActions uid={a.applicantUid} name={a.businessName} />
                    </div>
                  ) : (
                    <Link href={`/admin/applications/${a.applicantUid}`} className="text-sm font-medium text-brand-700 hover:underline">
                      View
                    </Link>
                  ),
              },
            ]}
          />
        )}
      </Panel>
    </>
  );
}
