"use client";

import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Field, Input } from "@/components/ui/field";
import { api, safeNextPath } from "@/lib/client/api";
import { authErrorMessage } from "@/lib/client/auth-errors";
import { getSignInAuth } from "@/lib/firebase/auth";

export function LoginForm({ next }: { next: string | null }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    setError(null);
    setPending(true);

    try {
      const auth = await getSignInAuth();
      const { user } = await signInWithEmailAndPassword(auth, email, password);
      const session = await api<{ redirectTo: string }>("/api/auth/session", {
        body: { idToken: await user.getIdToken() },
      });
      await signOut(auth); // the httpOnly session cookie is now the session
      if (!session.ok) {
        setError(session.message);
        setPending(false);
        return;
      }
      router.replace(safeNextPath(next) ?? session.data.redirectTo);
      router.refresh();
    } catch (err) {
      setError(authErrorMessage(err));
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <div>
        <h1 className="text-xl font-semibold">Log in</h1>
        <p className="mt-1 text-sm text-neutral-500">Welcome back to TasbirGhar.</p>
      </div>
      {error && <Alert tone="danger">{error}</Alert>}
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required maxLength={254} />
      </Field>
      <Field label="Password" htmlFor="password">
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          maxLength={128}
        />
      </Field>
      <Button type="submit" loading={pending} className="w-full">
        {pending ? "Logging in…" : "Log in"}
      </Button>
      <p className="text-center text-sm text-neutral-500">
        New to TasbirGhar?{" "}
        <Link
          href={next ? `/signup?next=${encodeURIComponent(next)}` : "/signup"}
          className="font-medium text-brand-700 hover:underline"
        >
          Create an account
        </Link>
      </p>
    </form>
  );
}
