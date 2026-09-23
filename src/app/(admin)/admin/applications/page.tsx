import { Badge, Card, PageHeader } from "@/components/ui/feedback";
import { getCategory } from "@/config/categories";
import { LOCATIONS } from "@/config/locations";
import { requireUser } from "@/lib/auth/current-user";
import { listApplications } from "@/lib/data/applications";

import { ReviewActions } from "./review-actions";

export const metadata = { title: "Photographer applications" };

export default async function ApplicationsPage() {
  await requireUser("admin", "/admin/applications");
  const applications = await listApplications("pending");

  return (
    <>
      <PageHeader
        title="Photographer applications"
        description={`${applications.length} pending review, oldest first.`}
      />
      {applications.length === 0 ? (
        <p className="rounded-xl border border-dashed border-neutral-300 bg-white px-4 py-12 text-center text-sm text-neutral-500">
          No applications waiting for review.
        </p>
      ) : (
        <div className="space-y-4">
          {applications.map((app) => (
            <Card
              key={app.applicantUid}
              title={app.businessName}
              description={`${app.fullName} · ${app.applicantEmail ?? "no email"} · ${app.phone}`}
              actions={<Badge tone="warning">Pending</Badge>}
            >
              <dl className="grid gap-4 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-neutral-500">Location</dt>
                  <dd className="mt-0.5">
                    {app.area}, {LOCATIONS.find((l) => l.slug === app.city)?.name}
                  </dd>
                </div>
                <div>
                  <dt className="text-neutral-500">Experience</dt>
                  <dd className="mt-0.5">{app.yearsOfExperience} years</dd>
                </div>
                <div>
                  <dt className="text-neutral-500">Submitted</dt>
                  <dd className="mt-0.5">
                    {app.submittedAt ? new Date(app.submittedAt).toLocaleString("en-GB") : "—"}
                  </dd>
                </div>
                <div className="sm:col-span-3">
                  <dt className="text-neutral-500">Categories</dt>
                  <dd className="mt-1 flex flex-wrap gap-2">
                    {app.categories.map((c) => (
                      <Badge key={c}>{getCategory(c).name}</Badge>
                    ))}
                  </dd>
                </div>
                <div className="sm:col-span-3">
                  <dt className="text-neutral-500">Description</dt>
                  <dd className="mt-0.5 whitespace-pre-line">{app.description}</dd>
                </div>
                <div className="sm:col-span-3">
                  <dt className="text-neutral-500">Portfolio introduction</dt>
                  <dd className="mt-0.5 whitespace-pre-line">{app.portfolioIntro}</dd>
                </div>
                <div className="flex flex-wrap gap-4 sm:col-span-3">
                  {app.instagram && (
                    <a className="text-brand-700 hover:underline" href={`https://instagram.com/${app.instagram}`} target="_blank" rel="noreferrer noopener">
                      Instagram @{app.instagram}
                    </a>
                  )}
                  {app.website && (
                    <a className="break-all text-brand-700 hover:underline" href={app.website} target="_blank" rel="noreferrer noopener nofollow">
                      {app.website}
                    </a>
                  )}
                </div>
              </dl>
              <div className="mt-5 border-t border-neutral-100 pt-4">
                <ReviewActions uid={app.applicantUid} />
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
