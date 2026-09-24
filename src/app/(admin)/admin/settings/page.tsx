import { AdminPageHeader, Chip, Panel, StatusPill } from "@/components/admin/ui";
import { PHOTOGRAPHY_CATEGORIES } from "@/config/categories";
import { LOCATIONS } from "@/config/locations";
import { requireUser } from "@/lib/auth/current-user";
import { listAdmins } from "@/lib/data/admin";
import { isCloudinaryConfigured } from "@/lib/env/server";
import { formatDate } from "@/lib/format";
import { DEFAULT_COMMISSION_RATE_BPS } from "@/lib/money";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  await requireUser("admin", "/admin/settings");
  const admins = await listAdmins();

  return (
    <>
      <AdminPageHeader
        title="Settings"
        description="Platform configuration. These values live in code and server configuration, so they are read-only here."
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Marketplace">
          <dl className="space-y-4 text-sm">
            <div>
              <dt className="text-neutral-500">Default commission</dt>
              <dd className="text-ink">
                {DEFAULT_COMMISSION_RATE_BPS / 100}% ({DEFAULT_COMMISSION_RATE_BPS} basis points)
              </dd>
            </div>
            <div>
              <dt className="text-neutral-500">Currency</dt>
              <dd className="text-ink">NPR (stored as integer paisa)</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Locations</dt>
              <dd className="mt-1 flex flex-wrap gap-1">
                {LOCATIONS.map((l) => (
                  <Chip key={l.slug}>{l.name}</Chip>
                ))}
              </dd>
            </div>
            <div>
              <dt className="text-neutral-500">Photography categories</dt>
              <dd className="mt-1 flex flex-wrap gap-1">
                {PHOTOGRAPHY_CATEGORIES.map((c) => (
                  <Chip key={c.slug}>{c.name}</Chip>
                ))}
              </dd>
            </div>
          </dl>
        </Panel>

        <Panel title="Administrators" description="Accounts with the admin role">
          <ul className="divide-y divide-neutral-100">
            {admins.map((a) => (
              <li key={a.uid} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                <span className="min-w-0">
                  <span className="block font-medium text-ink">{a.name || "—"}</span>
                  <span className="block break-all text-neutral-500">{a.email}</span>
                </span>
                <span className="text-right">
                  <StatusPill tone={a.claimActive ? "success" : "danger"}>{a.claimActive ? "Admin" : "Claim missing"}</StatusPill>
                  <span className="mt-1 block text-xs text-neutral-400">Last sign-in {formatDate(a.lastSignInAt, true)}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-neutral-500">
            Admin access is granted only with the server-side bootstrap command (
            <code className="rounded bg-neutral-100 px-1 text-xs">npm run admin:grant -- --email … --yes</code>
            ). There is no web endpoint for it.
          </p>
        </Panel>

        <Panel title="Integrations">
          <dl className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-neutral-700">Firebase Authentication & Firestore</dt>
              <dd><StatusPill tone="success">Connected</StatusPill></dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-neutral-700">Cloudinary media</dt>
              <dd>
                <StatusPill tone={isCloudinaryConfigured() ? "success" : "danger"}>
                  {isCloudinaryConfigured() ? "Configured" : "Not configured"}
                </StatusPill>
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-neutral-700">Payments</dt>
              <dd><StatusPill tone="neutral">Not yet enabled</StatusPill></dd>
            </div>
          </dl>
        </Panel>
      </div>
    </>
  );
}
