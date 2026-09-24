import Link from "next/link";

import { ButtonLink } from "@/components/ui/button";
import { Badge, Card, PageHeader } from "@/components/ui/feedback";
import { requireUser } from "@/lib/auth/current-user";
import { getApplication } from "@/lib/data/applications";
import { getAccount } from "@/lib/data/users";

import { AccountForm } from "./account-form";

export const metadata = { title: "My account" };

const ROLE_LABEL = { customer: "Customer", photographer: "Photographer", admin: "Admin" } as const;

export default async function AccountPage() {
  const user = await requireUser("account", "/account");
  const [account, application] = await Promise.all([
    getAccount(user),
    user.role === "customer" ? getApplication(user.uid) : Promise.resolve(null),
  ]);

  return (
    <main className="space-y-6">
      <PageHeader title="My account" description="Your TasbirGhar profile." />

      <Card title="Profile" description="Your name and phone are visible to photographers you book.">
        <dl className="mb-6 grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-neutral-500">Email</dt>
            <dd className="mt-0.5 font-medium break-all text-neutral-900">{account.email ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-neutral-500">Account type</dt>
            <dd className="mt-1">
              <Badge tone={account.role === "customer" ? "neutral" : "success"}>
                {ROLE_LABEL[account.role]}
              </Badge>
            </dd>
          </div>
        </dl>
        <AccountForm displayName={account.displayName} phone={account.phone} />
      </Card>

      {account.role === "customer" && (
        <Card title="My bookings">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="text-sm text-neutral-600">See your booking requests and confirmed sessions.</p>
            <ButtonLink href="/account/bookings" variant="secondary">
              View bookings
            </ButtonLink>
          </div>
        </Card>
      )}

      {account.role === "customer" && (
        <Card title="Are you a photographer?">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="text-sm text-neutral-600">
              {application?.status === "pending"
                ? "Your photographer application is under review."
                : application?.status === "rejected"
                  ? "Your previous application was not approved. You can apply again."
                  : "List your studio on TasbirGhar and receive bookings from families across Kathmandu Valley."}
            </p>
            <ButtonLink href="/become-a-photographer" variant="secondary">
              {application?.status === "pending" ? "View application" : "Apply now"}
            </ButtonLink>
          </div>
        </Card>
      )}

      {account.role === "photographer" && (
        <p className="text-sm text-neutral-600">
          Manage your studio in the{" "}
          <Link href="/dashboard" className="font-medium text-brand-700 hover:underline">
            photographer dashboard
          </Link>
          .
        </p>
      )}
    </main>
  );
}
