import Link from "next/link";

import { EmptyState, Panel } from "@/components/admin/ui";

/** Shown when an admin opens a studio/application that doesn't exist. */
export default function AdminNotFound() {
  return (
    <Panel bodyClassName="p-0">
      <EmptyState
        title="We couldn't find that record"
        icon="search"
        action={
          <Link href="/admin" className="text-sm font-medium text-brand-700 hover:underline">
            Back to dashboard
          </Link>
        }
      >
        It may have been removed, or the link is incorrect.
      </EmptyState>
    </Panel>
  );
}
