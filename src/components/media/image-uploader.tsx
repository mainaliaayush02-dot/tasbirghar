"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";

import { buttonClass } from "@/components/ui/button";
import { api } from "@/lib/client/api";
import { MAX_IMAGE_BYTES } from "@/lib/cloudinary/types";
import { preflightImageFile } from "@/lib/cloudinary/validation";
import type { MediaTarget } from "@/lib/validation/schemas";
import type { GalleryImageKind } from "@/types/models";

interface SignedUpload {
  uploadUrl: string;
  fields: Record<string, string>;
}

interface UploadItem {
  key: string;
  name: string;
  progress: number;
  status: "queued" | "uploading" | "saving" | "done" | "error";
  error?: string;
}

/** Browser → Cloudinary with progress events (fetch has no upload progress). */
function uploadWithProgress(
  signed: SignedUpload,
  file: File,
  onProgress: (fraction: number) => void,
): Promise<{ public_id: string }> {
  return new Promise((resolve, reject) => {
    const body = new FormData();
    Object.entries(signed.fields).forEach(([k, v]) => body.append(k, v));
    body.append("file", file);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", signed.uploadUrl);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      const json = JSON.parse(xhr.responseText || "{}");
      if (xhr.status >= 200 && xhr.status < 300) resolve(json);
      else reject(new Error(json?.error?.message ?? "Upload failed."));
    };
    xhr.onerror = () => reject(new Error("Network error during upload."));
    xhr.send(body);
  });
}

/**
 * Signed direct upload: preflight → /api/media/sign → Cloudinary →
 * /api/media/confirm (server verifies and writes the Firestore record).
 * Image bytes never pass through our servers.
 */
export function ImageUploader({
  studioId,
  target,
  galleryKind = null,
  multiple = false,
  label = "Upload photos",
  variant = "primary",
}: {
  studioId: string;
  target: MediaTarget;
  galleryKind?: GalleryImageKind | null;
  multiple?: boolean;
  label?: string;
  variant?: "primary" | "secondary";
}) {
  const router = useRouter();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<UploadItem[]>([]);
  const busy = items.some((i) => i.status === "queued" || i.status === "uploading" || i.status === "saving");

  const update = (key: string, patch: Partial<UploadItem>) =>
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...patch } : i)));

  async function uploadOne(file: File, key: string) {
    try {
      await preflightImageFile(file);
      update(key, { status: "uploading" });
      const signed = await api<SignedUpload>("/api/media/sign", {
        body: { studioId, target, galleryKind },
      });
      if (!signed.ok) throw new Error(signed.message);

      const uploaded = await uploadWithProgress(signed.data, file, (p) =>
        update(key, { progress: p }),
      );
      update(key, { status: "saving", progress: 1 });

      const confirmed = await api("/api/media/confirm", {
        body: { studioId, target, galleryKind, publicId: uploaded.public_id, alt: null },
      });
      if (!confirmed.ok) throw new Error(confirmed.message);
      update(key, { status: "done" });
    } catch (error) {
      update(key, {
        status: "error",
        error: error instanceof Error ? error.message : "Upload failed.",
      });
    }
  }

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    const batch = Array.from(files).map((file, i) => ({
      file,
      item: { key: `${Date.now()}-${i}`, name: file.name, progress: 0, status: "queued" as const },
    }));
    setItems((prev) => [...prev.filter((p) => p.status !== "done"), ...batch.map((b) => b.item)]);
    for (const { file, item } of batch) await uploadOne(file, item.key);
    if (inputRef.current) inputRef.current.value = "";
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <label htmlFor={inputId} className={buttonClass(variant, "md", busy ? "pointer-events-none opacity-60" : "cursor-pointer")}>
        {busy ? "Uploading…" : label}
      </label>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        multiple={multiple}
        disabled={busy}
        className="sr-only"
        onChange={(e) => onFiles(e.target.files)}
      />
      <p className="text-xs text-neutral-500">
        JPEG, PNG, WEBP or AVIF · up to {MAX_IMAGE_BYTES / (1024 * 1024)} MB each
      </p>
      {items.length > 0 && (
        <ul className="space-y-2" aria-live="polite">
          {items.map((item) => (
            <li key={item.key} className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate text-neutral-700">{item.name}</span>
                <span
                  className={`shrink-0 text-xs ${
                    item.status === "error"
                      ? "text-red-600"
                      : item.status === "done"
                        ? "text-emerald-600"
                        : "text-neutral-500"
                  }`}
                >
                  {{ queued: "Waiting", uploading: `${Math.round(item.progress * 100)}%`, saving: "Saving…", done: "Uploaded", error: "Failed" }[item.status]}
                </span>
              </div>
              {(item.status === "uploading" || item.status === "saving") && (
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-100">
                  <div className="h-full bg-brand-500 transition-all" style={{ width: `${item.progress * 100}%` }} />
                </div>
              )}
              {item.error && <p className="mt-1 text-xs text-red-600">{item.error}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
