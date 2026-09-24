"use client";

import { Button } from "@/components/ui/button";

/** Generic admin error boundary — never shows internal error details. */
export default function AdminError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div role="alert" className="rounded-2xl border border-neutral-200/80 bg-white px-6 py-14 text-center">
      <h1 className="text-lg font-semibold text-ink">Something went wrong.</h1>
      <p className="mt-1 text-sm text-neutral-500">Please try again. If it keeps happening, check the server logs.</p>
      <Button className="mt-5" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
