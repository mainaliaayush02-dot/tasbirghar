import Link from "next/link";

export default function PublicNotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <p className="text-sm font-medium tracking-[0.16em] text-brand-600 uppercase">404</p>
      <h1 className="mt-3 font-display text-3xl text-ink">We couldn&apos;t find that page</h1>
      <p className="mt-3 text-ink/65">The studio may no longer be listed, or the link may be wrong.</p>
      <Link href="/photographers" className="mt-6 inline-flex rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-cream hover:bg-black">
        Browse photographers
      </Link>
    </div>
  );
}
