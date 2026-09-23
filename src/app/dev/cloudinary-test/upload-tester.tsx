"use client";

import { useState } from "react";

import { CloudinaryImage } from "@/components/media/cloudinary-image";
import { cloudinaryUrl, IMAGE_PRESETS, type ImagePreset } from "@/lib/cloudinary/delivery";
import { preflightImageFile } from "@/lib/cloudinary/validation";
import type { MediaAsset } from "@/types/media";

interface SignedUpload {
  uploadUrl: string;
  fields: Record<string, string>;
}

async function postJson<T>(url: string, payload?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
  return body as T;
}

type State =
  | { status: "idle" }
  | { status: "uploading" }
  | { status: "done"; asset: MediaAsset; detectedType: string }
  | { status: "deleted" }
  | { status: "error"; message: string };

export function UploadTester() {
  const [state, setState] = useState<State>({ status: "idle" });

  async function upload(formData: FormData) {
    setState({ status: "uploading" });
    try {
      const file = formData.get("file");
      if (!(file instanceof File) || file.size === 0) throw new Error("Choose an image first.");
      // 0. Instant client-side check (UX only; the server re-verifies).
      const detectedType = await preflightImageFile(file);

      // 1. Server signs the upload params (secret never leaves the server).
      const signed = await postJson<SignedUpload>("/api/dev/cloudinary-test/sign");

      // 2. Browser uploads directly to Cloudinary — no Next.js route in the file path.
      const body = new FormData();
      Object.entries(signed.fields).forEach(([key, value]) => body.append(key, value));
      body.append("file", file);
      const res = await fetch(signed.uploadUrl, { method: "POST", body });
      const uploaded = await res.json();
      if (!res.ok) throw new Error(uploaded?.error?.message ?? `Cloudinary HTTP ${res.status}`);

      // 3. Server confirms against Cloudinary's own record and returns metadata to persist.
      const { asset } = await postJson<{ asset: MediaAsset }>("/api/dev/cloudinary-test/confirm", {
        publicId: uploaded.public_id,
        alt: formData.get("alt"),
      });
      setState({ status: "done", asset, detectedType });
    } catch (error) {
      setState({ status: "error", message: error instanceof Error ? error.message : String(error) });
    }
  }

  async function remove(publicId: string) {
    const res = await fetch(
      `/api/dev/cloudinary-test?publicId=${encodeURIComponent(publicId)}`,
      { method: "DELETE" },
    );
    const body = await res.json().catch(() => null);
    setState(
      res.ok
        ? { status: "deleted" }
        : { status: "error", message: body?.error?.message ?? `HTTP ${res.status}` },
    );
  }

  return (
    <div className="mt-8 space-y-6">
      <form action={upload} className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          type="file"
          name="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          required
          className="text-sm"
        />
        <input
          type="text"
          name="alt"
          placeholder="Alt text (optional)"
          className="rounded border border-neutral-300 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={state.status === "uploading"}
          className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {state.status === "uploading" ? "Uploading…" : "Upload"}
        </button>
      </form>

      {state.status === "error" && (
        <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-700">
          {state.message}
        </p>
      )}
      {state.status === "deleted" && (
        <p className="rounded bg-green-50 p-3 text-sm text-green-700">Asset deleted from Cloudinary.</p>
      )}

      {state.status === "done" && (
        <section className="space-y-4">
          <h2 className="font-medium">
            Media metadata to persist in Firestore (browser-sniffed type: {state.detectedType})
          </h2>
          <pre className="overflow-x-auto rounded bg-neutral-100 p-3 text-xs">
            {JSON.stringify(state.asset, null, 2)}
          </pre>

          <div className="relative aspect-[4/3] w-full max-w-md overflow-hidden rounded">
            <CloudinaryImage
              asset={state.asset}
              preset="card"
              fill
              sizes="(min-width: 640px) 448px, 100vw"
              className="object-cover"
            />
          </div>

          <ul className="space-y-1 text-xs break-all">
            {(Object.keys(IMAGE_PRESETS) as ImagePreset[]).map((preset) => (
              <li key={preset}>
                <span className="font-medium">{preset}:</span>{" "}
                <a href={cloudinaryUrl(state.asset.publicId, preset)} target="_blank" rel="noreferrer" className="underline">
                  {cloudinaryUrl(state.asset.publicId, preset)}
                </a>
              </li>
            ))}
          </ul>

          <button
            type="button"
            onClick={() => remove(state.asset.publicId)}
            className="rounded border border-red-300 px-4 py-2 text-sm text-red-700"
          >
            Delete from Cloudinary
          </button>
        </section>
      )}
    </div>
  );
}
