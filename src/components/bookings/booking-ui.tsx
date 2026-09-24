"use client";

import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { api } from "@/lib/client/api";
import type { BookingAction } from "@/lib/validation/schemas";

const COPY: Record<BookingAction, { label: string; title: string; body: string; danger: boolean }> = {
  cancel: { label: "Cancel request", title: "Cancel this booking request?", body: "The studio will see that you cancelled. You can request again later.", danger: true },
  confirm: { label: "Confirm", title: "Confirm this booking?", body: "The customer will see the booking as confirmed. The time is reserved for them.", danger: false },
  decline: { label: "Decline", title: "Decline this request?", body: "The customer will see the request as declined and the time becomes free again.", danger: true },
  complete: { label: "Mark completed", title: "Mark this shoot as completed?", body: "Use this after the session has taken place.", danger: false },
};

/** Booking status actions — every change is authorized and validated server-side. */
export function BookingActions({ bookingId, actions }: { bookingId: string; actions: BookingAction[] }) {
  const router = useRouter();
  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((action) => {
        const c = COPY[action];
        return (
          <ConfirmDialog
            key={action}
            title={c.title}
            description={c.body}
            confirmLabel={c.label}
            tone={c.danger ? "danger" : "primary"}
            onConfirm={async () => {
              const result = await api(`/api/bookings/${bookingId}`, { body: { action } });
              if (!result.ok) return result.message;
              router.refresh();
            }}
            trigger={(open) => (
              <Button size="sm" variant={c.danger ? "danger" : action === "confirm" ? "primary" : "secondary"} onClick={open}>
                {c.label}
              </Button>
            )}
          />
        );
      })}
    </div>
  );
}
