import { Badge, Card, PageHeader } from "@/components/ui/feedback";
import { getCategory } from "@/config/categories";
import { requireUser } from "@/lib/auth/current-user";
import { getApplication } from "@/lib/data/applications";
import { LISTING_LABEL, VERIFICATION_LABEL } from "@/lib/data/dashboard";
import { getOwnedStudio } from "@/lib/data/studios";

export const metadata = { title: "Verification" };

const date = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { dateStyle: "medium" }) : "—";

export default async function VerificationPage() {
  const user = await requireUser("dashboard", "/dashboard/verification");
  const [application, studio] = await Promise.all([
    getApplication(user.uid),
    getOwnedStudio(user.uid),
  ]);

  return (
    <>
      <PageHeader
        title="Application & verification"
        description="Your photographer approval and studio review status."
      />
      <div className="space-y-6">
        <Card title="Photographer application" actions={<Badge tone="success">Approved</Badge>}>
          {application ? (
            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-neutral-500">Submitted</dt>
                <dd className="mt-0.5 font-medium">{date(application.submittedAt)}</dd>
              </div>
              <div>
                <dt className="text-neutral-500">Approved</dt>
                <dd className="mt-0.5 font-medium">{date(application.reviewedAt)}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-neutral-500">Categories applied for</dt>
                <dd className="mt-1 flex flex-wrap gap-2">
                  {application.categories.map((slug) => (
                    <Badge key={slug}>{getCategory(slug).name}</Badge>
                  ))}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="text-sm text-neutral-600">Your photographer role was granted by TasbirGhar.</p>
          )}
        </Card>

        <Card title="Studio review">
          {studio ? (
            <div className="space-y-3 text-sm text-neutral-600">
              <div className="flex flex-wrap gap-2">
                <Badge tone={LISTING_LABEL[studio.listingStatus].tone}>{LISTING_LABEL[studio.listingStatus].label}</Badge>
                <Badge tone={VERIFICATION_LABEL[studio.verificationStatus].tone}>
                  {VERIFICATION_LABEL[studio.verificationStatus].label}
                </Badge>
              </div>
              <p>
                New studios start as private drafts. When your profile, portfolio and packages are
                complete, the TasbirGhar team reviews and verifies your studio before it goes live.
              </p>
            </div>
          ) : (
            <p className="text-sm text-neutral-600">Create your studio to start the review process.</p>
          )}
        </Card>
      </div>
    </>
  );
}
