"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/feedback";
import { api } from "@/lib/client/api";
import { formatDate } from "@/lib/format";
import type { NotificationDTO } from "@/lib/notifications/service";

/**
 * The signed-in user's notifications. Opening one marks it read (server API)
 * and goes to the related page; "Mark all as read" clears the badge.
 */
export function NotificationList({ items, unread, emptyHint }: { items: NotificationDTO[]; unread: number; emptyHint: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function markRead(body: { ids: string[] } | { all: true }, key: string) {
    setBusy(key);
    setError(null);
    const result = await api("/api/notifications/read", { body });
    setBusy(null);
    if (!result.ok) {
      setError(result.message);
      return false;
    }
    router.refresh();
    return true;
  }

  async function open(n: NotificationDTO) {
    if (!n.read) await markRead({ ids: [n.id] }, n.id);
    router.push(n.href);
  }

  if (items.length === 0) {
    return (
      <Card>
        <div className="py-8 text-center">
          <p className="font-medium text-neutral-900">You&apos;re all caught up</p>
          <p className="mt-1 text-sm text-neutral-500">{emptyHint}</p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-neutral-600" aria-live="polite">
          {unread > 0 ? `${unread} unread` : "No unread notifications"}
        </p>
        {unread > 0 && (
          <Button size="sm" variant="secondary" loading={busy === "all"} onClick={() => markRead({ all: true }, "all")}>
            Mark all as read
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}
      <ul className="divide-y divide-neutral-100 overflow-hidden rounded-xl border border-neutral-200 bg-white">
        {items.map((n) => (
          <li key={n.id} data-notification={n.id} data-read={n.read} className={`flex items-start gap-3 px-4 py-4 sm:px-5 ${n.read ? "" : "bg-brand-50/40"}`}>
            <span aria-hidden className={`mt-1.5 size-2 shrink-0 rounded-full ${n.read ? "bg-transparent" : "bg-brand-600"}`} />
            <button type="button" onClick={() => open(n)} disabled={busy !== null} className="min-w-0 flex-1 text-left focus-visible:outline-2 focus-visible:outline-brand-500">
              <span className={`block text-sm ${n.read ? "text-neutral-800" : "font-semibold text-neutral-900"}`}>
                {n.title}
                {!n.read && <span className="sr-only"> (unread)</span>}
              </span>
              <span className="mt-0.5 block text-sm text-neutral-600">{n.body}</span>
              <span className="mt-1 block text-xs text-neutral-400">{formatDate(n.createdAt, true)}</span>
            </button>
            {!n.read && (
              <Button size="sm" variant="ghost" loading={busy === n.id} disabled={busy !== null && busy !== n.id} onClick={() => markRead({ ids: [n.id] }, n.id)} aria-label={`Mark "${n.title}" as read`}>
                Mark read
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
