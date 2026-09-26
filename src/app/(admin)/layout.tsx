import { AdminShell } from "@/components/admin/admin-shell";
import { requireUser } from "@/lib/auth/current-user";
import { adminAttention } from "@/lib/data/admin";
import { noIndexMetadata } from "@/lib/seo";

/**
 * Owner console. Non-admins get a 404. Every admin page and API route
 * re-checks the live `admin` custom claim server-side; privileged writes only
 * happen in server routes (Admin SDK), never from the browser Firestore SDK.
 */
export const metadata = { ...noIndexMetadata, title: { default: "Admin", template: "%s · Admin · TasbirGhar" } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser("admin", "/admin");
  // Derived from the live queues — admins get no stored notification documents.
  const attention = await adminAttention();
  return (
    <AdminShell email={user.email} name={user.displayName ?? "TasbirGhar Owner"} attention={attention}>
      {children}
    </AdminShell>
  );
}
