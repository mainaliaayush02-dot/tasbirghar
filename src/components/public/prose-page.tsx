import type { ReactNode } from "react";

/** Editorial layout for static content pages. */
export function ProsePage({ eyebrow, title, intro, children }: { eyebrow: string; title: string; intro: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 pt-12 pb-20 sm:px-6 lg:pt-16">
      <p className="text-sm font-medium tracking-[0.16em] text-brand-600 uppercase">{eyebrow}</p>
      <h1 className="mt-3 font-display text-4xl leading-tight tracking-tight text-ink sm:text-5xl">{title}</h1>
      <div className="mt-5 text-lg text-ink/70">{intro}</div>
      <div className="mt-12 space-y-12">{children}</div>
    </div>
  );
}

export function ProseSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-ink/10 pt-8">
      <h2 className="font-display text-2xl text-ink">{title}</h2>
      <div className="mt-3 space-y-3 text-ink/75 [&_a]:font-medium [&_a]:text-brand-600 [&_a:hover]:underline">{children}</div>
    </section>
  );
}
