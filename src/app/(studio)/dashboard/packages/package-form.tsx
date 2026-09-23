"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { PHOTOGRAPHY_CATEGORIES } from "@/config/categories";
import { api } from "@/lib/client/api";
import { MINOR_UNITS_PER_MAJOR } from "@/lib/money";
import { LIMITS } from "@/lib/validation/schemas";
import type { PackageDTO } from "@/types/dto";

export function PackageForm({
  studioId,
  pkg,
  nextSortOrder = 0,
  onDone,
}: {
  studioId: string;
  pkg?: PackageDTO;
  nextSortOrder?: number;
  onDone: () => void;
}) {
  const router = useRouter();
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const id = pkg?.id ?? "new";

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    const body = {
      name: f.get("name"),
      description: f.get("description"),
      category: f.get("category"),
      priceNpr: f.get("priceNpr"),
      durationMinutes: f.get("durationMinutes"),
      editedPhotos: f.get("editedPhotos"),
      includes: String(f.get("includes") ?? "")
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
      isActive: f.get("isActive") === "on",
      sortOrder: f.get("sortOrder"),
    };
    setPending(true);
    const result = pkg
      ? await api(`/api/studios/${studioId}/packages/${pkg.id}`, { method: "PUT", body })
      : await api(`/api/studios/${studioId}/packages`, { body });
    setPending(false);
    if (result.ok) {
      router.refresh();
      onDone();
      return;
    }
    setFields(result.fields);
    setError(result.message);
  }

  const f = (name: string) => `${name}-${id}`;

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {error && <Alert tone="danger">{error}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Package name" htmlFor={f("name")} error={fields.name} required>
          <Input id={f("name")} name="name" defaultValue={pkg?.name} maxLength={LIMITS.packageName} error={fields.name} placeholder="Newborn Classic" />
        </Field>
        <Field label="Category" htmlFor={f("category")} error={fields.category} required>
          <Select id={f("category")} name="category" defaultValue={pkg?.category ?? ""} error={fields.category}>
            <option value="" disabled>
              Choose…
            </option>
            {PHOTOGRAPHY_CATEGORIES.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Description" htmlFor={f("description")} error={fields.description} required>
        <Textarea id={f("description")} name="description" rows={3} defaultValue={pkg?.description} maxLength={LIMITS.packageDescription} error={fields.description} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Price (Rs.)" htmlFor={f("priceNpr")} error={fields.priceNpr} hint="Whole rupees" required>
          <Input
            id={f("priceNpr")}
            name="priceNpr"
            type="number"
            inputMode="numeric"
            min={LIMITS.minPriceNpr}
            max={LIMITS.maxPriceNpr}
            step={1}
            defaultValue={pkg ? pkg.price / MINOR_UNITS_PER_MAJOR.NPR : ""}
            error={fields.priceNpr}
          />
        </Field>
        <Field label="Duration (minutes)" htmlFor={f("durationMinutes")} error={fields.durationMinutes} required>
          <Input id={f("durationMinutes")} name="durationMinutes" type="number" inputMode="numeric" min={15} max={1440} defaultValue={pkg?.durationMinutes ?? 120} error={fields.durationMinutes} />
        </Field>
        <Field label="Edited photos" htmlFor={f("editedPhotos")} error={fields.editedPhotos} required>
          <Input id={f("editedPhotos")} name="editedPhotos" type="number" inputMode="numeric" min={0} max={2000} defaultValue={pkg?.editedPhotos ?? 15} error={fields.editedPhotos} />
        </Field>
      </div>
      <Field label="What's included" htmlFor={f("includes")} error={fields.includes} hint={`One per line, up to ${LIMITS.includes}. e.g. 2 setups, 1 framed print`}>
        <Textarea id={f("includes")} name="includes" rows={4} defaultValue={pkg?.includes.join("\n")} error={fields.includes} />
      </Field>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-neutral-700">
            <input type="checkbox" name="isActive" defaultChecked={pkg?.isActive ?? true} className="size-4 accent-brand-600" />
            Active (bookable)
          </label>
          <label className="flex items-center gap-2 text-sm text-neutral-700">
            Order
            <Input name="sortOrder" type="number" min={0} max={10000} defaultValue={pkg?.sortOrder ?? nextSortOrder} className="w-20" aria-label="Order" />
          </label>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" loading={pending}>
            {pkg ? "Save package" : "Create package"}
          </Button>
        </div>
      </div>
    </form>
  );
}
