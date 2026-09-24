import Link from "next/link";
import { notFound } from "next/navigation";

import { ApplicationActions } from "@/components/admin/actions";
import { APPLICATION_STATUS } from "@/components/admin/status";
import { AdminPageHeader, Chip, Panel, StatusPill } from "@/components/admin/ui";
import { getCategory } from "@/config/categories";
import { LOCATIONS } from "@/config/locations";
import { requireUser } from "@/lib/auth/current-user";
import { authUsers, getApplicationAdmin } from "@/lib/data/admin";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Application" };

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 py-3 sm:grid-cols-[180px_1fr] sm:gap-4">
      <dt className="text-sm text-neutral-500">{label}</dt>
      <dd className="min-w-0 text-sm break-words text-ink">{children}</dd>
    </div>
  );
}

export default async function ApplicationDetailPage({ params }: PageProps<"/admin/applications/[uid]">) {
  const { uid } = await params;
  await requireUser("admin", `/admin/applications/${uid}`);
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid)) notFound();
  const app = await getApplicationAdmin(uid);
  if (!app) notFound();
  const reviewers = await authUsers([app.reviewedBy ?? ""]);
  const status = APPLICATION_STATUS[app.status];

  return (
    <>
      <AdminPageHeader
        back={{ href: "/admin/applications", label: "Applications" }}
        title={app.businessName}
        description={`Applied by ${app.fullName} · ${formatDate(app.submittedAt, true)}`}
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <StatusPill tone={status.tone}>{status.label}</StatusPill>
            {app.status === "pending" && <ApplicationActions uid={app.applicantUid} name={app.businessName} />}
            {app.studioId && (
              <Link href={`/admin/studios/${app.studioId}`} className="text-sm font-medium text-brand-700 hover:underline">
                View studio
              </Link>
            )}
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Panel title="Application" className="lg:col-span-2">
          <dl className="divide-y divide-neutral-100">
            <Row label="Business / studio">{app.businessName}</Row>
            <Row label="Applicant">{app.fullName}</Row>
            <Row label="Location">
              {app.area}, {LOCATIONS.find((l) => l.slug === app.city)?.name ?? app.city}
            </Row>
            <Row label="Experience">{app.yearsOfExperience} years</Row>
            <Row label="Categories">
              <span className="flex flex-wrap gap-1">
                {app.categories.map((c) => (
                  <Chip key={c}>{getCategory(c).name}</Chip>
                ))}
              </span>
            </Row>
            <Row label="Description">
              <p className="whitespace-pre-line">{app.description}</p>
            </Row>
            <Row label="Portfolio introduction">
              <p className="whitespace-pre-line">{app.portfolioIntro}</p>
            </Row>
          </dl>
        </Panel>

        <div className="space-y-6">
          <Panel title="Contact">
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-neutral-500">Email (verified sign-in)</dt>
                <dd className="break-all text-ink">{app.applicantEmail ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-neutral-500">Phone</dt>
                <dd className="text-ink">{app.phone}</dd>
              </div>
              {app.instagram && (
                <div>
                  <dt className="text-neutral-500">Instagram</dt>
                  <dd>
                    <a href={`https://instagram.com/${app.instagram}`} target="_blank" rel="noreferrer noopener" className="text-brand-700 hover:underline">
                      @{app.instagram}
                    </a>
                  </dd>
                </div>
              )}
              {app.website && (
                <div>
                  <dt className="text-neutral-500">Website</dt>
                  <dd>
                    <a href={app.website} target="_blank" rel="noreferrer noopener nofollow" className="break-all text-brand-700 hover:underline">
                      {app.website}
                    </a>
                  </dd>
                </div>
              )}
            </dl>
          </Panel>

          <Panel title="Review">
            {app.status === "pending" ? (
              <p className="text-sm text-neutral-600">
                Check the portfolio links before approving. Approval grants dashboard access; the studio
                remains a private draft until you publish it.
              </p>
            ) : (
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="text-neutral-500">Decision</dt>
                  <dd className="text-ink">
                    {status.label} on {formatDate(app.reviewedAt, true)}
                  </dd>
                </div>
                <div>
                  <dt className="text-neutral-500">Reviewed by</dt>
                  <dd className="break-all text-ink">{reviewers.get(app.reviewedBy ?? "")?.email ?? "—"}</dd>
                </div>
                {app.rejectionReason && (
                  <div>
                    <dt className="text-neutral-500">Reason given</dt>
                    <dd className="whitespace-pre-line text-ink">{app.rejectionReason}</dd>
                  </div>
                )}
              </dl>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
