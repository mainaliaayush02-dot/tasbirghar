import Link from "next/link";

import { BrandLogo } from "@/components/public/brand-logo";
import { noIndexMetadata } from "@/lib/seo";

export const metadata = noIndexMetadata;

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col bg-cream">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12">
        <Link href="/" aria-label="TasbirGhar home" className="mx-auto mb-6">
          <BrandLogo variant="lockup" className="w-40 sm:w-44" priority />
        </Link>
        <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm sm:p-8">
          {children}
        </div>
      </div>
    </div>
  );
}
