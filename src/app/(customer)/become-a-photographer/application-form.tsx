"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { CheckboxChips, Field, Input, Select, Textarea } from "@/components/ui/field";
import { PHOTOGRAPHY_CATEGORIES, type CategorySlug } from "@/config/categories";
import { LOCATIONS, type LocationSlug } from "@/config/locations";
import { api } from "@/lib/client/api";
import { LIMITS } from "@/lib/validation/schemas";

interface Defaults {
  fullName: string;
  phone: string;
  businessName: string;
  city: LocationSlug;
  area: string;
  categories: CategorySlug[];
  description: string;
  yearsOfExperience: number | null;
  instagram: string;
  website: string;
  portfolioIntro: string;
}

const categoryOptions = PHOTOGRAPHY_CATEGORIES.map((c) => ({ value: c.slug, label: c.name }));

export function ApplicationForm({ defaults }: { defaults: Defaults }) {
  const router = useRouter();
  const [categories, setCategories] = useState<CategorySlug[]>(defaults.categories);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    const result = await api("/api/photographer-applications", {
      body: {
        fullName: f.get("fullName"),
        phone: f.get("phone"),
        businessName: f.get("businessName"),
        city: f.get("city"),
        area: f.get("area"),
        categories,
        description: f.get("description"),
        yearsOfExperience: f.get("yearsOfExperience"),
        instagram: f.get("instagram"),
        website: f.get("website"),
        portfolioIntro: f.get("portfolioIntro"),
      },
    });
    setPending(false);
    if (result.ok) {
      router.refresh();
      return;
    }
    setFields(result.fields);
    setError(result.message);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-8" noValidate>
      {error && <Alert tone="danger">{error}</Alert>}

      <fieldset className="space-y-4">
        <legend className="mb-2 font-semibold text-neutral-900">About you</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" htmlFor="fullName" error={fields.fullName} required>
            <Input id="fullName" name="fullName" defaultValue={defaults.fullName} maxLength={LIMITS.displayName} error={fields.fullName} />
          </Field>
          <Field label="Phone" htmlFor="phone" error={fields.phone} hint="e.g. 98XXXXXXXX" required>
            <Input id="phone" name="phone" type="tel" defaultValue={defaults.phone} maxLength={20} error={fields.phone} />
          </Field>
          <Field label="Years of experience" htmlFor="yearsOfExperience" error={fields.yearsOfExperience} required>
            <Input
              id="yearsOfExperience"
              name="yearsOfExperience"
              type="number"
              min={0}
              max={60}
              inputMode="numeric"
              defaultValue={defaults.yearsOfExperience ?? ""}
              error={fields.yearsOfExperience}
            />
          </Field>
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="mb-2 font-semibold text-neutral-900">Your studio</legend>
        <Field label="Business / studio name" htmlFor="businessName" error={fields.businessName} required>
          <Input id="businessName" name="businessName" defaultValue={defaults.businessName} maxLength={LIMITS.businessName} error={fields.businessName} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="City" htmlFor="city" error={fields.city} required>
            <Select id="city" name="city" defaultValue={defaults.city} error={fields.city}>
              {LOCATIONS.map((l) => (
                <option key={l.slug} value={l.slug}>
                  {l.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Area" htmlFor="area" error={fields.area} hint="e.g. Baneshwor, Jhamsikhel" required>
            <Input id="area" name="area" defaultValue={defaults.area} maxLength={LIMITS.area} error={fields.area} />
          </Field>
        </div>
        <Field label="Photography categories" htmlFor="categories" error={fields.categories} required>
          <CheckboxChips name="categories" options={categoryOptions} value={categories} onChange={setCategories} />
        </Field>
        <Field
          label="Short description"
          htmlFor="description"
          error={fields.description}
          hint="What do you shoot, and for whom? (30+ characters)"
          required
        >
          <Textarea id="description" name="description" rows={4} defaultValue={defaults.description} maxLength={LIMITS.longText} error={fields.description} />
        </Field>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="mb-2 font-semibold text-neutral-900">Your work</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Instagram" htmlFor="instagram" error={fields.instagram} hint="Handle or profile URL">
            <Input id="instagram" name="instagram" defaultValue={defaults.instagram} maxLength={100} placeholder="@yourstudio" error={fields.instagram} />
          </Field>
          <Field label="Website" htmlFor="website" error={fields.website}>
            <Input id="website" name="website" type="url" defaultValue={defaults.website} maxLength={200} placeholder="https://" error={fields.website} />
          </Field>
        </div>
        <Field
          label="Portfolio introduction"
          htmlFor="portfolioIntro"
          error={fields.portfolioIntro}
          hint="Describe your style and link to past work we can review."
          required
        >
          <Textarea id="portfolioIntro" name="portfolioIntro" rows={4} defaultValue={defaults.portfolioIntro} maxLength={LIMITS.longText} error={fields.portfolioIntro} />
        </Field>
      </fieldset>

      <div className="flex items-center justify-end border-t border-neutral-100 pt-6">
        <Button type="submit" loading={pending}>
          Submit application
        </Button>
      </div>
    </form>
  );
}
