import Link from "next/link";

import { siteConfig } from "@/config/site";
import { noIndexMetadata } from "@/lib/seo";

export const metadata = noIndexMetadata;

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col bg-neutral-50">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12">
        <Link href="/" className="mb-8 text-center">
          <span className="text-2xl font-semibold tracking-tight">{siteConfig.name}</span>{" "}
          <span className="text-neutral-400">{siteConfig.nameNe}</span>
        </Link>
        <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm sm:p-8">
          {children}
        </div>
      </div>
    </div>
  );
}
