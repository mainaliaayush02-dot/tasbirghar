import { redirect } from "next/navigation";

import { Alert, Badge, Card, PageHeader } from "@/components/ui/feedback";
import { getCategory } from "@/config/categories";
import { requireUser } from "@/lib/auth/current-user";
import { getApplication } from "@/lib/data/applications";
import { getAccount } from "@/lib/data/users";

import { ApplicationForm } from "./application-form";

export const metadata = { title: "Become a photographer" };

export default async function BecomePhotographerPage() {
  const user = await requireUser("account", "/become-a-photographer");
  if (user.role === "photographer") redirect("/dashboard");
  if (user.role === "admin") redirect("/admin");

  const [application, account] = await Promise.all([getApplication(user.uid), getAccount(user)]);

  return (
    <main className="space-y-6">
      <PageHeader
        title="List your studio on TasbirGhar"
        description="Tell us about your work. Our team reviews every application before a studio can go live."
      />

      {application?.status === "pending" ? (
        <Card
          title="Application under review"
          actions={<Badge tone="warning">Pending review</Badge>}
        >
          <p className="text-sm text-neutral-600">
            Thanks, {application.fullName}. We received your application for{" "}
            <strong>{application.businessName}</strong>
            {application.submittedAt &&
              ` on ${new Date(application.submittedAt).toLocaleDateString("en-GB", { dateStyle: "medium" })}`}
            . We&apos;ll review it and update your account — you&apos;ll get access to the studio
            dashboard once approved.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {application.categories.map((slug) => (
              <Badge key={slug}>{getCategory(slug).name}</Badge>
            ))}
          </div>
        </Card>
      ) : (
        <>
          {application?.status === "rejected" && (
            <Alert tone="warning" title="Your previous application was not approved">
              {application.rejectionReason ?? "You can update your details and apply again."}
            </Alert>
          )}
          <Card>
            <ApplicationForm
              defaults={{
                fullName: application?.fullName ?? account.displayName,
                phone: application?.phone ?? account.phone ?? "",
                businessName: application?.businessName ?? "",
                city: application?.city ?? "kathmandu",
                area: application?.area ?? "",
                categories: application?.categories ?? [],
                description: application?.description ?? "",
                yearsOfExperience: application?.yearsOfExperience ?? null,
                instagram: application?.instagram ?? "",
                website: application?.website ?? "",
                portfolioIntro: application?.portfolioIntro ?? "",
              }}
            />
          </Card>
        </>
      )}
    </main>
  );
}
