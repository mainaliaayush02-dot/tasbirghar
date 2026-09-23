"use client";

import { createUserWithEmailAndPassword, signOut, updateProfile } from "firebase/auth";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Field, Input } from "@/components/ui/field";
import { api, safeNextPath } from "@/lib/client/api";
import { authErrorMessage } from "@/lib/client/auth-errors";
import { getSignInAuth } from "@/lib/firebase/auth";
import { validate } from "@/lib/validation/core";
import { LIMITS, signupProfileSchema } from "@/lib/validation/schemas";

const MIN_PASSWORD = 8;

export function SignupForm({ next }: { next: string | null }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const profileInput = {
      displayName: String(form.get("displayName") ?? ""),
      phone: String(form.get("phone") ?? ""),
    };

    // Instant feedback with the same rules the server enforces.
    const errors: Record<string, string> = {};
    const profile = validate(signupProfileSchema, profileInput);
    if (!profile.ok) Object.assign(errors, profile.errors);
    if (!profileInput.displayName.trim()) errors.displayName = "Required.";
    if (password.length < MIN_PASSWORD) errors.password = `Use at least ${MIN_PASSWORD} characters.`;
    if (password !== form.get("confirmPassword")) errors.confirmPassword = "Passwords do not match.";
    setFields(errors);
    setError(null);
    if (Object.keys(errors).length || !profile.ok) return;

    setPending(true);
    try {
      const auth = await getSignInAuth();
      const { user } = await createUserWithEmailAndPassword(auth, email, password);
      if (profile.data.displayName) {
        await updateProfile(user, { displayName: profile.data.displayName });
      }
      const session = await api<{ redirectTo: string }>("/api/auth/session", {
        body: { idToken: await user.getIdToken(), profile: profile.data },
      });
      await signOut(auth);
      if (!session.ok) {
        setError(session.message);
        setFields(session.fields);
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
        <h1 className="text-xl font-semibold">Create your account</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Book photographers — or apply to list your studio.
        </p>
      </div>
      {error && <Alert tone="danger">{error}</Alert>}
      <Field label="Full name" htmlFor="displayName" error={fields.displayName} required>
        <Input
          id="displayName"
          name="displayName"
          autoComplete="name"
          maxLength={LIMITS.displayName}
          error={fields.displayName}
          required
        />
      </Field>
      <Field label="Email" htmlFor="email" required>
        <Input id="email" name="email" type="email" autoComplete="email" maxLength={254} required />
      </Field>
      <Field
        label="Phone"
        htmlFor="phone"
        error={fields.phone}
        hint="Optional. Nepal mobile, e.g. 98XXXXXXXX."
      >
        <Input id="phone" name="phone" type="tel" autoComplete="tel" maxLength={20} error={fields.phone} />
      </Field>
      <Field
        label="Password"
        htmlFor="password"
        error={fields.password}
        hint={`At least ${MIN_PASSWORD} characters.`}
        required
      >
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={MIN_PASSWORD}
          maxLength={128}
          error={fields.password}
          required
        />
      </Field>
      <Field label="Confirm password" htmlFor="confirmPassword" error={fields.confirmPassword} required>
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          maxLength={128}
          error={fields.confirmPassword}
          required
        />
      </Field>
      <Button type="submit" loading={pending} className="w-full">
        {pending ? "Creating account…" : "Create account"}
      </Button>
      <p className="text-center text-sm text-neutral-500">
        Already have an account?{" "}
        <Link
          href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"}
          className="font-medium text-brand-700 hover:underline"
        >
          Log in
        </Link>
      </p>
    </form>
  );
}
