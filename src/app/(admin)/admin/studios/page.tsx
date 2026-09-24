import Link from "next/link";

import { LISTING_STATUS, VERIFICATION_STATUS, pageParam, param, withParams } from "@/components/admin/status";
import {
  AdminPageHeader,
  Chip,
  DataTable,
  EmptyState,
  FilterBar,
  Pagination,
  Panel,
  StatusPill,
} from "@/components/admin/ui";
import { PHOTOGRAPHY_CATEGORIES, getCategory } from "@/config/categories";
import { LOCATIONS } from "@/config/locations";
import { requireUser } from "@/lib/auth/current-user";
import { listStudiosAdmin, type AdminStudioRow } from "@/lib/data/admin";
import { formatDate } from "@/lib/format";
import type { StudioListingStatus } from "@/types/models";

export const metadata = { title: "Studios" };

const STATUSES: StudioListingStatus[] = ["draft", "pending_review", "published", "suspended"];
const cityName = (slug: string) => LOCATIONS.find((l) => l.slug === slug)?.name ?? slug;

export default async function StudiosPage({ searchParams }: PageProps<"/admin/studios">) {
  await requireUser("admin", "/admin/studios");
  const sp = await searchParams;
  const status = STATUSES.find((s) => s === param(sp, "status")) ?? "";
  const q = param(sp, "q");
  const city = LOCATIONS.find((l) => l.slug === param(sp, "city"))?.slug ?? "";
  const category = PHOTOGRAPHY_CATEGORIES.find((c) => c.slug === param(sp, "category"))?.slug ?? "";
  const current = { status, q, city, category };
  const result = await listStudiosAdmin({ status, q, city, category, page: pageParam(sp) });
  const filtered = Boolean(q || city || category);

  return (
    <>
      <AdminPageHeader
        title="Studios"
        description="Every studio on TasbirGhar. Review profiles, then publish, suspend or verify."
      />
      <Panel bodyClassName="p-0">
        <FilterBar
          action="/admin/studios"
          tabs={{
            name: "status",
            value: status,
            keep: Object.fromEntries(Object.entries({ q, city, category }).filter(([, v]) => v)),
            options: [
              { value: "", label: "All" },
              { value: "draft", label: "Draft" },
              { value: "published", label: "Published" },
              { value: "suspended", label: "Suspended" },
            ],
          }}
          search={{ name: "q", value: q, placeholder: "Search studio, owner email, area…" }}
          selects={[
            { name: "city", label: "All locations", value: city, options: LOCATIONS.map((l) => ({ value: l.slug, label: l.name })) },
            {
              name: "category",
              label: "All categories",
              value: category,
              options: PHOTOGRAPHY_CATEGORIES.map((c) => ({ value: c.slug, label: c.name.replace(" Photography", "") })),
            },
          ]}
        />
        {result.total === 0 ? (
          <EmptyState title={filtered || status ? "No studios match these filters" : "No studios yet"} icon="studios">
            {filtered || status
              ? "Try clearing a filter."
              : "Studios appear here once approved photographers create them from their dashboard."}
          </EmptyState>
        ) : (
          <>
            <DataTable<AdminStudioRow>
              caption="Studios"
              rows={result.items}
              rowKey={(s) => s.id}
              columns={[
                {
                  header: "Studio",
                  cell: (s) => (
                    <Link href={`/admin/studios/${s.id}`} className="group block min-w-0">
                      <span className="block font-medium text-ink group-hover:text-brand-700">{s.businessName}</span>
                      <span className="block truncate text-sm text-neutral-500">/{s.slug}</span>
                    </Link>
                  ),
                },
                {
                  header: "Owner",
                  cell: (s) => (
                    <span className="block min-w-0 text-sm">
                      <span className="block text-neutral-700">{s.ownerName ?? "—"}</span>
                      <span className="block break-all text-neutral-500">{s.ownerEmail ?? "—"}</span>
                    </span>
                  ),
                },
                { header: "Location", cell: (s) => `${s.area}, ${cityName(s.city)}` },
                {
                  header: "Categories",
                  mobileHidden: true,
                  cell: (s) => (
                    <span className="flex flex-wrap gap-1">
                      {s.categories.slice(0, 3).map((c) => (
                        <Chip key={c}>{getCategory(c).name.replace(" Photography", "")}</Chip>
                      ))}
                      {s.categories.length > 3 && <Chip>+{s.categories.length - 3}</Chip>}
                    </span>
                  ),
                },
                {
                  header: "Content",
                  cell: (s) => (
                    <span className="text-sm whitespace-nowrap text-neutral-600">
                      {s.portfolioCount} photos · {s.packageCount} packages
                    </span>
                  ),
                },
                {
                  header: "Status",
                  cell: (s) => (
                    <span className="flex flex-wrap gap-1">
                      <StatusPill tone={LISTING_STATUS[s.listingStatus].tone}>{LISTING_STATUS[s.listingStatus].label}</StatusPill>
                      {s.verificationStatus === "verified" && (
                        <StatusPill tone={VERIFICATION_STATUS.verified.tone}>Verified</StatusPill>
                      )}
                    </span>
                  ),
                },
                { header: "Created", cell: (s) => formatDate(s.createdAt), className: "whitespace-nowrap" },
                {
                  header: "",
                  className: "text-right",
                  mobileHidden: true,
                  cell: (s) => (
                    <Link href={`/admin/studios/${s.id}`} className="text-sm font-medium text-brand-700 hover:underline">
                      View
                    </Link>
                  ),
                },
              ]}
            />
            <Pagination
              page={result.page}
              pageCount={result.pageCount}
              total={result.total}
              hrefFor={(page) => withParams("/admin/studios", current, { page })}
            />
          </>
        )}
      </Panel>
    </>
  );
}
