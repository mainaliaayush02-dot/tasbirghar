"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { CloudinaryImage } from "@/components/media/cloudinary-image";
import { Button } from "@/components/ui/button";
import { Badge, SaveState } from "@/components/ui/feedback";
import { Input, Select } from "@/components/ui/field";
import { PHOTOGRAPHY_CATEGORIES } from "@/config/categories";
import { api } from "@/lib/client/api";
import { LIMITS } from "@/lib/validation/schemas";
import type { GalleryImageDTO, PortfolioPhotoDTO } from "@/types/dto";

type Item = (PortfolioPhotoDTO & { kind?: undefined }) | (GalleryImageDTO & { category?: undefined; isFeatured?: undefined });

const KIND_LABEL = { studio: "Studio space", setup: "Setup", prop: "Prop" } as const;

function PhotoCard({
  item,
  studioId,
  collection,
}: {
  item: Item;
  studioId: string;
  collection: "portfolio" | "gallery";
}) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const endpoint = `/api/studios/${studioId}/${collection}/${item.id}`;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    const body =
      collection === "portfolio"
        ? {
            caption: f.get("caption"),
            category: f.get("category") || null,
            sortOrder: f.get("sortOrder"),
            isFeatured: f.get("isFeatured") === "on",
          }
        : { caption: f.get("caption"), sortOrder: f.get("sortOrder") };
    setState("saving");
    const result = await api(endpoint, { method: "PATCH", body });
    if (result.ok) {
      setError(null);
      setState("saved");
      router.refresh();
    } else {
      setError(Object.values(result.fields)[0] ?? result.message);
      setState("error");
    }
  }

  async function remove() {
    if (!window.confirm("Delete this photo permanently?")) return;
    setDeleting(true);
    const result = await api(endpoint, { method: "DELETE" });
    if (result.ok) router.refresh();
    else {
      setError(result.message);
      setDeleting(false);
    }
  }

  return (
    <li className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
      <div className="relative aspect-[4/3] bg-neutral-100">
        <CloudinaryImage
          asset={item.image}
          preset="card"
          fill
          sizes="(min-width: 1280px) 300px, (min-width: 640px) 45vw, 100vw"
          className="object-cover"
          alt={item.caption ?? ""}
        />
        <div className="absolute top-2 left-2 flex gap-1">
          {item.isFeatured && <Badge tone="success">Featured</Badge>}
          {item.kind && <Badge>{KIND_LABEL[item.kind]}</Badge>}
        </div>
      </div>
      <form onSubmit={save} className="space-y-3 p-3" noValidate>
        <Input
          name="caption"
          aria-label="Caption"
          placeholder="Caption"
          defaultValue={item.caption ?? ""}
          maxLength={LIMITS.caption}
        />
        <div className="flex gap-2">
          {collection === "portfolio" && (
            <Select name="category" aria-label="Category" defaultValue={item.category ?? ""} className="min-w-0 flex-1">
              <option value="">No category</option>
              {PHOTOGRAPHY_CATEGORIES.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name.replace(" Photography", "")}
                </option>
              ))}
            </Select>
          )}
          <Input
            name="sortOrder"
            aria-label="Order"
            title="Order (lower shows first)"
            type="number"
            min={0}
            max={10000}
            defaultValue={item.sortOrder}
            className="w-20 shrink-0"
          />
        </div>
        {collection === "portfolio" && (
          <label className="flex items-center gap-2 text-sm text-neutral-700">
            <input type="checkbox" name="isFeatured" defaultChecked={item.isFeatured} className="size-4 accent-brand-600" />
            Featured photo
          </label>
        )}
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Button type="submit" size="sm" variant="secondary" loading={state === "saving"}>
              Save
            </Button>
            <SaveState state={state === "saving" ? "idle" : state} />
          </div>
          <Button size="sm" variant="danger" onClick={remove} loading={deleting}>
            Delete
          </Button>
        </div>
      </form>
    </li>
  );
}

export function PhotoGrid({
  items,
  studioId,
  collection,
  emptyText,
}: {
  items: Item[];
  studioId: string;
  collection: "portfolio" | "gallery";
  emptyText: string;
}) {
  if (!items.length) {
    return (
      <p className="rounded-xl border border-dashed border-neutral-300 bg-white px-4 py-12 text-center text-sm text-neutral-500">
        {emptyText}
      </p>
    );
  }
  return (
    <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => (
        <PhotoCard key={item.id} item={item} studioId={studioId} collection={collection} />
      ))}
    </ul>
  );
}
