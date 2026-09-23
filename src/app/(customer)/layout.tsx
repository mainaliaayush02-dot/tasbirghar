import { SiteHeader } from "@/components/site-header";
import { noIndexMetadata } from "@/lib/seo";

/**
 * Signed-in customer area. Never indexed. Each page authorizes itself with
 * `requireUser` (layouts are not re-run on every navigation).
 */
export const metadata = noIndexMetadata;

export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col bg-neutral-50">
      <SiteHeader />
      <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6">{children}</div>
    </div>
  );
}
