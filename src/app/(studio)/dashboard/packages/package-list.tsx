"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/feedback";
import { getCategory } from "@/config/categories";
import { api } from "@/lib/client/api";
import { formatMoney } from "@/lib/money";
import { LIMITS } from "@/lib/validation/schemas";
import type { PackageDTO } from "@/types/dto";

import { PackageForm } from "./package-form";

function formatDuration(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return [h && `${h} hr`, m && `${m} min`].filter(Boolean).join(" ");
}

export function PackageList({ studioId, packages }: { studioId: string; packages: PackageDTO[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function remove(pkg: PackageDTO) {
    if (!window.confirm(`Delete "${pkg.name}"?`)) return;
    setDeleting(pkg.id);
    const result = await api(`/api/studios/${studioId}/packages/${pkg.id}`, { method: "DELETE" });
    setDeleting(null);
    if (result.ok) router.refresh();
    else setError(result.message);
  }

  const canAdd = packages.length < LIMITS.maxPackages;

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-red-600">{error}</p>}

      {editing === "new" ? (
        <Card title="New package">
          <PackageForm studioId={studioId} nextSortOrder={packages.length} onDone={() => setEditing(null)} />
        </Card>
      ) : (
        canAdd && <Button onClick={() => setEditing("new")}>New package</Button>
      )}

      {packages.length === 0 && editing !== "new" && (
        <p className="rounded-xl border border-dashed border-neutral-300 bg-white px-4 py-12 text-center text-sm text-neutral-500">
          No packages yet. Families compare packages before booking — add at least one.
        </p>
      )}

      {packages.map((pkg) =>
        editing === pkg.id ? (
          <Card key={pkg.id} title={`Edit ${pkg.name}`}>
            <PackageForm studioId={studioId} pkg={pkg} onDone={() => setEditing(null)} />
          </Card>
        ) : (
          <Card key={pkg.id}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold text-neutral-900">{pkg.name}</h3>
                  <Badge tone={pkg.isActive ? "success" : "neutral"}>{pkg.isActive ? "Active" : "Hidden"}</Badge>
                  <Badge>{getCategory(pkg.category).name.replace(" Photography", "")}</Badge>
                </div>
                <p className="mt-1 text-sm text-neutral-600">{pkg.description}</p>
                <p className="mt-2 text-sm text-neutral-500">
                  {formatDuration(pkg.durationMinutes)} · {pkg.editedPhotos} edited photos
                </p>
                {pkg.includes.length > 0 && (
                  <ul className="mt-2 list-inside list-disc text-sm text-neutral-600">
                    {pkg.includes.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="text-right">
                <p className="text-xl font-semibold text-neutral-900">{formatMoney(pkg.price)}</p>
                <div className="mt-3 flex justify-end gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setEditing(pkg.id)}>
                    Edit
                  </Button>
                  <Button size="sm" variant="danger" loading={deleting === pkg.id} onClick={() => remove(pkg)}>
                    Delete
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        ),
      )}
    </div>
  );
}
