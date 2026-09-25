"use client";

import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { api } from "@/lib/client/api";
import type { StudioListingStatus, StudioVerificationStatus } from "@/types/models";

/**
 * Admin action buttons. Every privileged change goes through a server route
 * (live admin claim verified there) behind a confirmation dialog.
 */

function useAction() {
  const router = useRouter();
  return async (path: string, body: unknown): Promise<string | void> => {
    const result = await api(path, { body });
    if (!result.ok) return Object.values(result.fields)[0] ?? result.message;
    router.refresh();
  };
}

export function ApplicationActions({ uid, name }: { uid: string; name: string }) {
  const run = useAction();
  const path = `/api/admin/applications/${uid}`;
  return (
    <div className="flex flex-wrap gap-2">
      <ConfirmDialog
        title="Reject application?"
        description={
          <>
            <strong>{name}</strong> will stay a customer. The application is kept on record and
            they can apply again.
          </>
        }
        reason={{ label: "Reason (shown to the applicant)", maxLength: 500 }}
        confirmLabel="Reject application"
        tone="danger"
        onConfirm={(reason) => run(path, { action: "reject", reason: reason || null })}
        trigger={(open) => (
          <Button variant="secondary" size="sm" onClick={open}>
            Reject
          </Button>
        )}
      />
      <ConfirmDialog
        title="Approve photographer?"
        description={
          <>
            <strong>{name}</strong> gets the photographer role and access to the studio
            dashboard. Their studio stays a private draft until you publish it.
          </>
        }
        confirmLabel="Approve"
        onConfirm={() => run(path, { action: "approve" })}
        trigger={(open) => (
          <Button size="sm" onClick={open}>
            Approve
          </Button>
        )}
      />
    </div>
  );
}

const STUDIO_ACTIONS = {
  publish: {
    label: "Publish",
    title: "Publish this studio?",
    body: "The studio becomes visible to customers when public marketplace pages launch.",
    danger: false,
  },
  unpublish: {
    label: "Unpublish",
    title: "Unpublish this studio?",
    body: "The studio returns to draft and is hidden from customers.",
    danger: true,
  },
  suspend: {
    label: "Suspend",
    title: "Suspend this studio?",
    body: "The studio is hidden from customers until reinstated. The owner keeps dashboard access.",
    danger: true,
  },
  reinstate: {
    label: "Reinstate",
    title: "Reinstate this studio?",
    body: "The studio returns to draft. Publish it again when ready.",
    danger: false,
  },
  verify: {
    label: "Mark verified",
    title: "Mark studio as verified?",
    body: "Confirms TasbirGhar has checked this studio's identity and work.",
    danger: false,
  },
  unverify: {
    label: "Remove verification",
    title: "Remove verification?",
    body: "The verified badge will no longer apply to this studio.",
    danger: true,
  },
} as const;

type StudioAction = keyof typeof STUDIO_ACTIONS;

export function StudioModerationActions({
  studioId,
  listingStatus,
  verificationStatus,
}: {
  studioId: string;
  listingStatus: StudioListingStatus;
  verificationStatus: StudioVerificationStatus;
}) {
  const run = useAction();
  const actions: StudioAction[] = [];
  if (listingStatus === "draft" || listingStatus === "pending_review") actions.push("publish");
  if (listingStatus === "published") actions.push("unpublish");
  if (listingStatus === "suspended") actions.push("reinstate");
  else actions.push("suspend");
  actions.push(verificationStatus === "verified" ? "unverify" : "verify");

  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((action) => {
        const a = STUDIO_ACTIONS[action];
        return (
          <ConfirmDialog
            key={action}
            title={a.title}
            description={a.body}
            confirmLabel={a.label}
            tone={a.danger ? "danger" : "primary"}
            reason={
              action === "suspend"
                ? { label: "Reason for suspension", required: true }
                : a.danger
                  ? { label: "Note (optional)" }
                  : undefined
            }
            onConfirm={(reason) => run(`/api/admin/studios/${studioId}`, { action, reason: reason || null })}
            trigger={(open) => (
              <Button
                size="sm"
                variant={action === "publish" ? "primary" : a.danger ? "danger" : "secondary"}
                onClick={open}
              >
                {a.label}
              </Button>
            )}
          />
        );
      })}
    </div>
  );
}

export function ReviewModerationActions({ reviewId, status }: { reviewId: string; status: string }) {
  const run = useAction();
  const path = `/api/admin/reviews/${reviewId}`;
  const hide = (
    <ConfirmDialog
      title={status === "published" ? "Hide this review?" : "Don't publish this review?"}
      description={
        status === "published"
          ? "The review stays on record but is no longer shown publicly, and it stops counting toward the studio's rating."
          : "The review stays on record but is never shown publicly and doesn't count toward the studio's rating."
      }
      reason={{ label: "Reason", required: true }}
      confirmLabel={status === "published" ? "Hide review" : "Don't publish"}
      tone="danger"
      onConfirm={(reason) => run(path, { action: "hide", reason })}
      trigger={(open) => (
        <Button size="sm" variant="danger" onClick={open}>
          {status === "published" ? "Hide" : "Don't publish"}
        </Button>
      )}
    />
  );
  const publish = (
    <ConfirmDialog
      title="Publish this review?"
      description="The review becomes visible on the studio's public page and counts toward its rating."
      confirmLabel="Publish review"
      onConfirm={() => run(path, { action: "publish", reason: null })}
      trigger={(open) => (
        <Button size="sm" variant="secondary" onClick={open}>
          Publish
        </Button>
      )}
    />
  );
  // pending → publish or reject; published → hide; hidden → publish again.
  return (
    <div className="flex flex-wrap justify-end gap-2">
      {status !== "published" && publish}
      {status !== "hidden" && hide}
    </div>
  );
}
