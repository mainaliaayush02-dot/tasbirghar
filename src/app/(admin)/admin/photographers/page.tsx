import Link from "next/link";

import { LISTING_STATUS, pageParam, param, withParams } from "@/components/admin/status";
import { AdminPageHeader, Chip, DataTable, EmptyState, FilterBar, Pagination, Panel, StatusPill } from "@/components/admin/ui";
import { getCategory } from "@/config/categories";
import { LOCATIONS } from "@/config/locations";
import { requireUser } from "@/lib/auth/current-user";
import { listPhotographersAdmin, type AdminPhotographerRow } from "@/lib/data/admin";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Photographers" };

export default async function PhotographersPage({ searchParams }: PageProps<"/admin/photographers">) {
  await requireUser("admin", "/admin/photographers");
  const sp = await searchParams;
  const q = param(sp, "q");
  const result = await listPhotographersAdmin({ q, page: pageParam(sp) });

  return (
    <>
      <AdminPageHeader title="Photographers" description="Approved photographer accounts and their studios." />
      <Panel bodyClassName="p-0">
        <FilterBar action="/admin/photographers" search={{ name: "q", value: q, placeholder: "Search name, email, studio, city…" }} />
        {result.total === 0 ? (
          <EmptyState title={q ? "No matching photographers" : "No photographers yet"} icon="photographers">
            {q ? "Try a different search." : "Photographers appear here after you approve their application."}
          </EmptyState>
        ) : (
          <>
            <DataTable<AdminPhotographerRow>
              caption="Photographers"
              rows={result.items}
              rowKey={(p) => p.uid}
              columns={[
                {
                  header: "Photographer",
                  cell: (p) => (
                    <span className="block min-w-0">
                      <span className="block font-medium text-ink">{p.name}</span>
                      <span className="block text-sm break-all text-neutral-500">{p.email ?? "—"}</span>
                    </span>
                  ),
                },
                {
                  header: "Studio",
                  cell: (p) =>
                    p.studioId ? (
                      <Link href={`/admin/studios/${p.studioId}`} className="font-medium text-brand-700 hover:underline">
                        {p.studioName}
                      </Link>
                    ) : (
                      <span className="text-neutral-500">No studio yet</span>
                    ),
                },
                { header: "Location", cell: (p) => (p.city ? LOCATIONS.find((l) => l.slug === p.city)?.name : "—") },
                {
                  header: "Categories",
                  mobileHidden: true,
                  cell: (p) =>
                    p.categories.length ? (
                      <span className="flex flex-wrap gap-1">
                        {p.categories.slice(0, 3).map((c) => (
                          <Chip key={c}>{getCategory(c).name.replace(" Photography", "")}</Chip>
                        ))}
                      </span>
                    ) : (
                      "—"
                    ),
                },
                {
                  header: "Status",
                  cell: (p) => (
                    <span className="flex flex-wrap gap-1">
                      {p.disabled ? (
                        <StatusPill tone="danger">Account disabled</StatusPill>
                      ) : p.listingStatus ? (
                        <StatusPill tone={LISTING_STATUS[p.listingStatus].tone}>Studio {LISTING_STATUS[p.listingStatus].label.toLowerCase()}</StatusPill>
                      ) : (
                        <StatusPill tone="warning">Setting up</StatusPill>
                      )}
                      {!p.claimMatches && <StatusPill tone="danger">Role claim missing</StatusPill>}
                    </span>
                  ),
                },
                { header: "Joined", cell: (p) => formatDate(p.joinedAt), className: "whitespace-nowrap" },
                {
                  header: "Application",
                  mobileHidden: true,
                  className: "text-right",
                  cell: (p) => (
                    <Link href={`/admin/applications/${p.uid}`} className="text-sm font-medium text-neutral-600 hover:text-ink">
                      View
                    </Link>
                  ),
                },
              ]}
            />
            <Pagination page={result.page} pageCount={result.pageCount} total={result.total} hrefFor={(page) => withParams("/admin/photographers", { q }, { page })} />
          </>
        )}
      </Panel>
    </>
  );
}
