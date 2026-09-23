import "server-only";

import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth/current-user";

import { getOwnedStudio } from "./studios";

/** Photographer + their studio, or redirect to studio creation. */
export async function requireStudio(path: string) {
  const user = await requireUser("dashboard", path);
  const studio = await getOwnedStudio(user.uid);
  if (!studio) redirect("/dashboard/studio");
  return { user, studio };
}

export const LISTING_LABEL = {
  draft: { label: "Draft", tone: "neutral" },
  pending_review: { label: "In review", tone: "warning" },
  published: { label: "Live", tone: "success" },
  suspended: { label: "Suspended", tone: "danger" },
} as const;

export const VERIFICATION_LABEL = {
  unverified: { label: "Not verified", tone: "neutral" },
  pending: { label: "Verification pending", tone: "warning" },
  verified: { label: "Verified", tone: "success" },
  rejected: { label: "Verification declined", tone: "danger" },
} as const;
