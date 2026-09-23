"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { api } from "@/lib/client/api";

export function ReviewActions({ uid }: { uid: string }) {
  const router = useRouter();
  const [pending, setPending] = useState<"approve" | "reject" | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function review(action: "approve" | "reject") {
    if (action === "approve" && !window.confirm("Approve this photographer? They will get studio dashboard access.")) {
      return;
    }
    setPending(action);
    setError(null);
    const result = await api(`/api/admin/applications/${uid}`, {
      body: { action, reason: action === "reject" ? reason : null },
    });
    setPending(null);
    if (result.ok) router.refresh();
    else setError(result.message);
  }

  return (
    <div className="space-y-3">
      {rejecting && (
        <Textarea
          aria-label="Reason for rejection (shown to the applicant)"
          placeholder="Reason (shown to the applicant)"
          maxLength={500}
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        {rejecting ? (
          <>
            <Button variant="ghost" onClick={() => setRejecting(false)}>
              Cancel
            </Button>
            <Button variant="danger" loading={pending === "reject"} onClick={() => review("reject")}>
              Confirm rejection
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={() => setRejecting(true)} disabled={pending !== null}>
              Reject
            </Button>
            <Button loading={pending === "approve"} onClick={() => review("approve")}>
              Approve photographer
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
