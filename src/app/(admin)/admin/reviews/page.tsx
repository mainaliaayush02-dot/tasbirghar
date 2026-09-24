import Link from "next/link";

import { ReviewModerationActions } from "@/components/admin/actions";
import { REVIEW_STATUS, pageParam, param, withParams } from "@/components/admin/status";
import { AdminPageHeader, DataTable, EmptyState, FilterBar, Pagination, Panel, StatusPill } from "@/components/admin/ui";
import { requireUser } from "@/lib/auth/current-user";
import { listReviewsAdmin, type AdminReviewRow } from "@/lib/data/admin";
import { formatDate } from "@/lib/format";
import type { ReviewStatus } from "@/types/models";

export const metadata = { title: "Reviews" };

function Stars({ rating }: { rating: number }) {
  return (
    <span className="whitespace-nowrap text-brand-500" aria-label={`${rating} out of 5 stars`}>
      {"★".repeat(rating)}
      <span className="text-neutral-200">{"★".repeat(5 - rating)}</span>
    </span>
  );
}

export default async function ReviewsPage({ searchParams }: PageProps<"/admin/reviews">) {
  await requireUser("admin", "/admin/reviews");
  const sp = await searchParams;
  const status = (Object.keys(REVIEW_STATUS) as ReviewStatus[]).find((s) => s === param(sp, "status")) ?? "";
  const result = await listReviewsAdmin({ status, page: pageParam(sp) });

  return (
    <>
      <AdminPageHeader
        title="Reviews"
        description="Verified reviews from completed bookings. You can hide or restore a review; its text and rating are never editable."
      />
      <Panel bodyClassName="p-0">
        <FilterBar
          action="/admin/reviews"
          tabs={{
            name: "status",
            value: status,
            options: [
              { value: "", label: "All" },
              { value: "pending_moderation", label: "Awaiting moderation" },
              { value: "published", label: "Published" },
              { value: "hidden", label: "Hidden" },
            ],
          }}
        />
        {result.total === 0 ? (
          <EmptyState title="No reviews yet" icon="reviews">
            Reviews can only be left for completed bookings, so they will appear once bookings go live.
          </EmptyState>
        ) : (
          <>
            <DataTable<AdminReviewRow>
              caption="Reviews"
              rows={result.items}
              rowKey={(r) => r.id}
              columns={[
                {
                  header: "Review",
                  cell: (r) => (
                    <span className="block min-w-0">
                      <Stars rating={r.rating} />
                      <span className="mt-1 block text-sm text-ink">{r.comment}</span>
                      <span className="block text-xs text-neutral-500">{r.customerName}</span>
                    </span>
                  ),
                },
                {
                  header: "Studio",
                  cell: (r) => (
                    <Link href={`/admin/studios/${r.studioId}`} className="font-medium text-brand-700 hover:underline">
                      {r.studioName}
                    </Link>
                  ),
                },
                { header: "Date", cell: (r) => formatDate(r.createdAt), className: "whitespace-nowrap" },
                {
                  header: "Status",
                  cell: (r) => <StatusPill tone={REVIEW_STATUS[r.status].tone}>{REVIEW_STATUS[r.status].label}</StatusPill>,
                },
                {
                  header: "Actions",
                  className: "text-right",
                  cell: (r) => <ReviewModerationActions reviewId={r.id} status={r.status} />,
                },
              ]}
            />
            <Pagination page={result.page} pageCount={result.pageCount} total={result.total} hrefFor={(page) => withParams("/admin/reviews", { status }, { page })} />
          </>
        )}
      </Panel>
    </>
  );
}
