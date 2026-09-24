"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef } from "react";

import { BrandLogo } from "./brand-logo";
import { MobileAuthLinks } from "./auth-nav";
import { PUBLIC_NAV } from "./nav";

/** Full-height mobile navigation sheet on the native <dialog> (focus trap, Esc). */
export function MobileMenu() {
  const ref = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();
  const close = () => ref.current?.close();

  return (
    <>
      <button
        type="button"
        aria-label="Open menu"
        onClick={() => ref.current?.showModal()}
        className="grid size-11 place-items-center rounded-full text-ink hover:bg-ink/5 md:hidden"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" aria-hidden className="size-6">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>
      <dialog
        ref={ref}
        aria-label="Menu"
        className="m-0 ml-auto h-dvh max-h-dvh w-full max-w-sm bg-cream p-0 text-ink backdrop:bg-ink/40"
        onClick={(e) => e.target === ref.current && close()}
      >
        <div className="flex h-full flex-col px-5 pt-4 pb-8">
          <div className="flex items-center justify-between">
            <Link href="/" onClick={close} aria-label="TasbirGhar home">
              <BrandLogo />
            </Link>
            <button type="button" aria-label="Close menu" onClick={close} className="grid size-11 place-items-center rounded-full hover:bg-ink/5">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" aria-hidden className="size-6">
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </div>
          <nav aria-label="Main" className="mt-10 flex-1">
            <ul className="space-y-1">
              {PUBLIC_NAV.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={close}
                    aria-current={pathname === item.href ? "page" : undefined}
                    className="block rounded-xl px-3 py-3 font-display text-2xl text-ink hover:bg-ink/5 aria-[current=page]:text-brand-600"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <MobileAuthLinks onNavigate={close} />
        </div>
      </dialog>
    </>
  );
}
