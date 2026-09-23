import { redirect } from "next/navigation";

import { getCurrentUser, homeForRole } from "@/lib/auth/current-user";
import { safeNextPath } from "@/lib/client/api";

import { SignupForm } from "./signup-form";

export const metadata = { title: "Sign up" };

export default async function SignupPage({ searchParams }: PageProps<"/signup">) {
  const { next } = await searchParams;
  const nextPath = safeNextPath(typeof next === "string" ? next : null);
  const user = await getCurrentUser();
  if (user) redirect(nextPath ?? homeForRole(user.role));
  return <SignupForm next={nextPath} />;
}
