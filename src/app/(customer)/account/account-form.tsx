"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Alert, SaveState } from "@/components/ui/feedback";
import { Field, Input } from "@/components/ui/field";
import { api } from "@/lib/client/api";
import { LIMITS } from "@/lib/validation/schemas";

export function AccountForm({ displayName, phone }: { displayName: string; phone: string | null }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setState("saving");
    setError(null);
    const result = await api("/api/account", {
      method: "PATCH",
      body: { displayName: form.get("displayName"), phone: form.get("phone") },
    });
    if (result.ok) {
      setFields({});
      setState("saved");
      router.refresh();
    } else {
      setFields(result.fields);
      setError(result.message);
      setState("error");
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {error && <Alert tone="danger">{error}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" htmlFor="displayName" error={fields.displayName} required>
          <Input
            id="displayName"
            name="displayName"
            defaultValue={displayName}
            maxLength={LIMITS.displayName}
            error={fields.displayName}
            required
          />
        </Field>
        <Field label="Phone" htmlFor="phone" error={fields.phone} hint="e.g. 98XXXXXXXX">
          <Input
            id="phone"
            name="phone"
            type="tel"
            defaultValue={phone ?? ""}
            maxLength={20}
            error={fields.phone}
          />
        </Field>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" loading={state === "saving"}>
          Save changes
        </Button>
        <SaveState state={state} />
      </div>
    </form>
  );
}
