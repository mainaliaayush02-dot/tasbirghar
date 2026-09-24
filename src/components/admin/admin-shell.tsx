"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { api } from "@/lib/client/api";
import { getFirebaseAuth } from "@/lib/firebase/auth";

import { ADMIN_NAV, isActive } from "./admin-nav";
import { icons } from "./icons";

function Brand() {
  return (
    <Link href="/admin" className="flex items-center gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-brand-500">
      <Image
        src="/brand/tasbirghar-mark.png"
        alt=""
        width={36}
        height={36}
        className="rounded-lg ring-1 ring-black/5"
        priority
      />
      <span className="leading-tight">
        <span className="block text-[15px] font-semibold tracking-tight text-ink">
          Tasbir<span className="text-brand-600">Ghar</span>
        </span>
        <span className="block text-[11px] font-medium tracking-wide text-neutral-500 uppercase">
          Owner console
        </span>
      </span>
    </Link>
  );
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <ul className="space-y-0.5">
      {ADMIN_NAV.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-brand-500 ${
                active
                  ? "bg-white font-medium text-ink shadow-xs ring-1 ring-black/5"
                  : "text-neutral-600 hover:bg-white/70 hover:text-ink"
              }`}
            >
              <span className={active ? "text-brand-600" : "text-neutral-400"}>{icons[item.icon]}</span>
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function AccountMenu({ email, name }: { email: string | null; name: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function logout() {
    setPending(true);
    await api("/api/auth/session", { method: "DELETE" });
    await signOut(getFirebaseAuth()).catch(() => undefined);
    router.replace("/login");
    router.refresh();
  }

  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full py-1 pr-2 pl-1 text-sm hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-brand-500"
      >
        <span className="grid size-8 place-items-center rounded-full bg-ink text-xs font-semibold text-cream">
          {initials || "A"}
        </span>
        <span className="hidden max-w-40 truncate font-medium text-ink sm:inline">{name}</span>
        <span className="text-neutral-400">{icons.chevronDown}</span>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-2 w-64 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-lg"
        >
          <div className="border-b border-neutral-100 px-4 py-3">
            <p className="text-sm font-semibold text-ink">TasbirGhar Owner</p>
            <p className="truncate text-sm text-neutral-500">{email}</p>
            <span className="mt-2 inline-flex rounded-full bg-ink px-2 py-0.5 text-[11px] font-medium tracking-wide text-cream uppercase">
              Admin
            </span>
          </div>
          <div className="p-1">
            <Link
              role="menuitem"
              href="/account"
              onClick={() => setOpen(false)}
              className="block rounded-lg px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-100"
            >
              Account
            </Link>
            <button
              role="menuitem"
              type="button"
              onClick={logout}
              disabled={pending}
              className="block w-full rounded-lg px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50 disabled:opacity-60"
            >
              {pending ? "Logging out…" : "Log out"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function AdminShell({
  email,
  name,
  children,
}: {
  email: string | null;
  name: string;
  children: ReactNode;
}) {
  const drawer = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();
  const current = ADMIN_NAV.find((i) => isActive(pathname, i.href));

  return (
    <div className="flex min-h-full flex-1 bg-cream/60">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-neutral-200/80 bg-cream px-4 py-5 lg:flex">
        <Brand />
        <nav aria-label="Admin" className="mt-8 flex-1 overflow-y-auto">
          <NavList />
        </nav>
        <p className="px-3 text-xs text-neutral-400">Discover. Book. Capture.</p>
      </aside>

      <dialog
        ref={drawer}
        aria-label="Admin navigation"
        className="m-0 h-dvh max-h-dvh w-72 max-w-[85vw] border-r border-neutral-200 bg-cream p-0 backdrop:bg-ink/40"
        onClick={(e) => e.target === drawer.current && drawer.current?.close()}
      >
        <div className="flex h-full flex-col px-4 py-5">
          <div className="flex items-center justify-between">
            <Brand />
            <button
              type="button"
              aria-label="Close navigation"
              onClick={() => drawer.current?.close()}
              className="rounded-lg p-2 text-neutral-500 hover:bg-white"
            >
              {icons.close}
            </button>
          </div>
          <nav aria-label="Admin" className="mt-8">
            <NavList onNavigate={() => drawer.current?.close()} />
          </nav>
        </div>
      </dialog>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-neutral-200/80 bg-white/85 px-4 backdrop-blur sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              aria-label="Open navigation"
              onClick={() => drawer.current?.showModal()}
              className="rounded-lg p-2 text-neutral-600 hover:bg-neutral-100 lg:hidden"
            >
              {icons.menu}
            </button>
            <span className="truncate text-sm font-medium text-neutral-500">
              {current?.label ?? "Admin"}
            </span>
          </div>
          <AccountMenu email={email} name={name} />
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
