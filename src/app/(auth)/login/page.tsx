import { redirect } from "next/navigation";

import { getCurrentUser, homeForRole } from "@/lib/auth/current-user";
import { safeNextPath } from "@/lib/client/api";

import { LoginForm } from "./login-form";

export const metadata = { title: "Log in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  const nextPath = safeNextPath(typeof next === "string" ? next : null);
  const user = await getCurrentUser();
  if (user) redirect(nextPath ?? homeForRole(user.role));
  return <LoginForm next={nextPath} />;
}
