import Link from "next/link";

/** Bell link with an unread badge (count comes from the server). */
export function NotificationBell({ href, unread, className = "" }: { href: string; unread: number; className?: string }) {
  const label = unread > 0 ? `Notifications, ${unread} unread` : "Notifications";
  return (
    <Link
      href={href}
      aria-label={label}
      data-notification-bell
      className={`relative inline-flex size-9 items-center justify-center rounded-lg text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-ink focus-visible:outline-2 focus-visible:outline-brand-500 ${className}`}
    >
      <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="size-5">
        <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
      {unread > 0 && (
        <span data-unread-count={unread} className="absolute -top-0.5 -right-0.5 grid min-w-[18px] place-items-center rounded-full bg-brand-600 px-1 text-[10px] leading-[18px] font-semibold text-white">
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </Link>
  );
}
