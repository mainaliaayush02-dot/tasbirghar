"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Alert, SaveState } from "@/components/ui/feedback";
import { CheckboxChips, Field, Input, Select, Textarea } from "@/components/ui/field";
import { PHOTOGRAPHY_CATEGORIES, type CategorySlug } from "@/config/categories";
import { LOCATIONS } from "@/config/locations";
import { api } from "@/lib/client/api";
import { slugify } from "@/lib/validation/core";
import { LIMITS } from "@/lib/validation/schemas";
import type { StudioDTO } from "@/types/dto";

const categoryOptions = PHOTOGRAPHY_CATEGORIES.map((c) => ({ value: c.slug, label: c.name }));
const lines = (value: FormDataEntryValue | null) =>
  String(value ?? "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

type Props = { mode: "create"; studio?: undefined } | { mode: "edit"; studio: StudioDTO };

export function StudioForm({ mode, studio }: Props) {
  const router = useRouter();
  const [categories, setCategories] = useState<CategorySlug[]>(studio?.categories ?? []);
  const [slug, setSlug] = useState(studio?.slug ?? "");
  const [slugEdited, setSlugEdited] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    const body = {
      businessName: f.get("businessName"),
      description: f.get("description"),
      city: f.get("city"),
      area: f.get("area"),
      address: f.get("address"),
      phone: f.get("phone"),
      email: f.get("email"),
      website: f.get("website"),
      instagram: f.get("instagram"),
      categories,
      yearsOfExperience: f.get("yearsOfExperience"),
      facilities: lines(f.get("facilities")),
      props: lines(f.get("props")),
      team: f.get("team"),
      highlights: f.get("highlights"),
      ...(mode === "create" ? { slug } : {}),
    };
    setState("saving");
    setError(null);
    const result =
      mode === "create"
        ? await api("/api/studios", { body })
        : await api(`/api/studios/${studio.id}`, { method: "PUT", body });

    if (result.ok) {
      setFields({});
      setState("saved");
      router.refresh();
      return;
    }
    setFields(result.fields);
    setError(result.message);
    setState("error");
  }

  return (
    <form onSubmit={onSubmit} className="space-y-8" noValidate>
      {error && <Alert tone="danger">{error}</Alert>}

      <fieldset className="space-y-4">
        <legend className="mb-2 font-semibold text-neutral-900">Basics</legend>
        <Field label="Studio name" htmlFor="businessName" error={fields.businessName} required>
          <Input
            id="businessName"
            name="businessName"
            defaultValue={studio?.businessName}
            maxLength={LIMITS.businessName}
            error={fields.businessName}
            onChange={(e) => mode === "create" && !slugEdited && setSlug(slugify(e.target.value))}
          />
        </Field>
        {mode === "create" && (
          <Field
            label="Studio URL"
            htmlFor="slug"
            error={fields.slug}
            hint={`tasbirghar.com/photographers/${slug || "your-studio"} · cannot be changed later`}
            required
          >
            <Input
              id="slug"
              name="slug"
              value={slug}
              maxLength={60}
              error={fields.slug}
              onChange={(e) => {
                setSlugEdited(true);
                setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"));
              }}
              onBlur={() => setSlug(slugify(slug))}
            />
          </Field>
        )}
        <Field label="Categories" htmlFor="categories" error={fields.categories} required>
          <CheckboxChips name="categories" options={categoryOptions} value={categories} onChange={setCategories} />
        </Field>
        <Field
          label="About the studio"
          htmlFor="description"
          error={fields.description}
          hint="Your style, the sessions you offer and who you work with. (30+ characters)"
          required
        >
          <Textarea id="description" name="description" rows={5} defaultValue={studio?.description} maxLength={LIMITS.description} error={fields.description} />
        </Field>
        <Field label="Years of experience" htmlFor="yearsOfExperience" error={fields.yearsOfExperience} className="max-w-48">
          <Input id="yearsOfExperience" name="yearsOfExperience" type="number" min={0} max={60} inputMode="numeric" defaultValue={studio?.yearsOfExperience ?? ""} error={fields.yearsOfExperience} />
        </Field>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="mb-2 font-semibold text-neutral-900">Location & contact</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="City" htmlFor="city" error={fields.city} required>
            <Select id="city" name="city" defaultValue={studio?.city ?? "kathmandu"} error={fields.city}>
              {LOCATIONS.map((l) => (
                <option key={l.slug} value={l.slug}>
                  {l.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Area" htmlFor="area" error={fields.area} hint="e.g. Baneshwor" required>
            <Input id="area" name="area" defaultValue={studio?.area} maxLength={LIMITS.area} error={fields.area} />
          </Field>
        </div>
        <Field label="Address" htmlFor="address" error={fields.address}>
          <Input id="address" name="address" defaultValue={studio?.address ?? ""} maxLength={LIMITS.address} error={fields.address} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Phone" htmlFor="phone" error={fields.phone} hint="e.g. 98XXXXXXXX" required>
            <Input id="phone" name="phone" type="tel" defaultValue={studio?.phone} maxLength={20} error={fields.phone} />
          </Field>
          <Field label="Email" htmlFor="email" error={fields.email}>
            <Input id="email" name="email" type="email" defaultValue={studio?.email ?? ""} maxLength={254} error={fields.email} />
          </Field>
          <Field label="Website" htmlFor="website" error={fields.website}>
            <Input id="website" name="website" type="url" defaultValue={studio?.website ?? ""} maxLength={200} placeholder="https://" error={fields.website} />
          </Field>
          <Field label="Instagram" htmlFor="instagram" error={fields.instagram}>
            <Input id="instagram" name="instagram" defaultValue={studio?.instagram ?? ""} maxLength={100} placeholder="@yourstudio" error={fields.instagram} />
          </Field>
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="mb-2 font-semibold text-neutral-900">Studio & team</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Facilities" htmlFor="facilities" error={fields.facilities} hint={`One per line, up to ${LIMITS.listItems}. e.g. Parking, AC, Changing room`}>
            <Textarea id="facilities" name="facilities" rows={4} defaultValue={studio?.facilities.join("\n")} error={fields.facilities} />
          </Field>
          <Field label="Props & setups" htmlFor="props" error={fields.props} hint={`One per line, up to ${LIMITS.listItems}. e.g. Moon prop, Floral backdrop`}>
            <Textarea id="props" name="props" rows={4} defaultValue={studio?.props.join("\n")} error={fields.props} />
          </Field>
        </div>
        <Field label="Team" htmlFor="team" error={fields.team} hint="Who works with you — photographers, assistants, stylists.">
          <Textarea id="team" name="team" rows={3} defaultValue={studio?.team ?? ""} maxLength={LIMITS.longText} error={fields.team} />
        </Field>
        <Field label="What makes your studio different?" htmlFor="highlights" error={fields.highlights}>
          <Textarea id="highlights" name="highlights" rows={3} defaultValue={studio?.highlights ?? ""} maxLength={LIMITS.longText} error={fields.highlights} />
        </Field>
      </fieldset>

      <div className="flex items-center justify-end gap-3 border-t border-neutral-100 pt-6">
        <SaveState state={state} />
        <Button type="submit" loading={state === "saving"}>
          {mode === "create" ? "Create studio" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
