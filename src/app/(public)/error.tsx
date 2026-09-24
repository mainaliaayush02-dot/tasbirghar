"use client";

import Link from "next/link";

/** Public error boundary — friendly, and never shows internal details. */
export default function PublicError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div role="alert" className="mx-auto max-w-xl px-4 py-24 text-center">
      <h1 className="font-display text-3xl text-ink">Something went wrong.</h1>
      <p className="mt-3 text-ink/65">Please try again in a moment.</p>
      <div className="mt-6 flex justify-center gap-3">
        <button type="button" onClick={reset} className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-cream hover:bg-black">
          Try again
        </button>
        <Link href="/" className="rounded-full border border-ink/15 px-5 py-2.5 text-sm font-medium text-ink hover:bg-ink/5">
          Home
        </Link>
      </div>
    </div>
  );
}
