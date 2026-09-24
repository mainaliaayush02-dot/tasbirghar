import Link from "next/link";

import { pageParam, param, withParams } from "@/components/admin/status";
import { AdminPageHeader, DataTable, EmptyState, FilterBar, Pagination, Panel, StatusPill } from "@/components/admin/ui";
import { requireUser } from "@/lib/auth/current-user";
import { listCustomersAdmin, type AdminCustomerRow } from "@/lib/data/admin";
import { formatDate, maskPhone } from "@/lib/format";

export const metadata = { title: "Customers" };

export default async function CustomersPage({ searchParams }: PageProps<"/admin/customers">) {
  await requireUser("admin", "/admin/customers");
  const sp = await searchParams;
  const q = param(sp, "q");
  const result = await listCustomersAdmin({ q, page: pageParam(sp) });

  return (
    <>
      <AdminPageHeader
        title="Customers"
        description="Registered customer accounts. Phone numbers are masked; account changes go through Firebase Admin on the server."
      />
      <Panel bodyClassName="p-0">
        <FilterBar action="/admin/customers" search={{ name: "q", value: q, placeholder: "Search name or email…" }} />
        {result.total === 0 ? (
          <EmptyState title={q ? "No matching customers" : "No customers yet"} icon="customers">
            {q ? "Try a different search." : "Customers appear here when they create a TasbirGhar account."}
          </EmptyState>
        ) : (
          <>
            <DataTable<AdminCustomerRow>
              caption="Customers"
              rows={result.items}
              rowKey={(c) => c.uid}
              columns={[
                {
                  header: "Customer",
                  cell: (c) => (
                    <span className="block min-w-0">
                      <span className="block font-medium text-ink">{c.name}</span>
                      <span className="block text-sm break-all text-neutral-500">{c.email ?? "—"}</span>
                    </span>
                  ),
                },
                { header: "Phone", cell: (c) => <span className="whitespace-nowrap">{maskPhone(c.phone)}</span> },
                { header: "Joined", cell: (c) => formatDate(c.joinedAt), className: "whitespace-nowrap" },
                { header: "Bookings", cell: (c) => c.bookingCount },
                {
                  header: "Notes",
                  cell: (c) =>
                    c.applied ? (
                      <Link href={`/admin/applications/${c.uid}`}>
                        <StatusPill tone="brand">Applied as photographer</StatusPill>
                      </Link>
                    ) : (
                      <span className="text-neutral-400">—</span>
                    ),
                },
              ]}
            />
            <Pagination page={result.page} pageCount={result.pageCount} total={result.total} hrefFor={(page) => withParams("/admin/customers", { q }, { page })} />
          </>
        )}
      </Panel>
    </>
  );
}
