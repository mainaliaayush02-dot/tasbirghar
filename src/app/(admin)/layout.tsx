import { noIndexMetadata } from "@/lib/seo";

/**
 * Private area. Never indexed. Auth + role gating (role "admin") will be
 * enforced here and in server code in Phase 2.
 */
export const metadata = noIndexMetadata;

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-8 sm:px-6">{children}</div>;
}
