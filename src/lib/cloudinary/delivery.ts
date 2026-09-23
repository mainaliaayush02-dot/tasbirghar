/**
 * Cloudinary delivery URL builder — safe for both server and browser (uses
 * only the public cloud name, no SDK, no secrets).
 *
 * Originals stay untouched in Cloudinary; every URL we render is a derived,
 * resized `f_auto,q_auto` version. Do not hand-build Cloudinary URLs elsewhere.
 */

import { publicEnv, requireEnv } from "@/lib/env/public";

export type ImageCrop = "limit" | "fill" | "fit" | "thumb";

export interface ImageTransform {
  width?: number;
  height?: number;
  crop?: ImageCrop;
  /** Width / height, e.g. 4 / 5. Used with `fill` when no height is given. */
  aspectRatio?: number;
  /** "auto" (default) lets Cloudinary pick; a number forces q_{n}. */
  quality?: "auto" | number;
  /** Gravity for crops. `auto` = content-aware (faces/subjects). */
  gravity?: "auto" | "face" | "center";
}

/** Standard sizes. Pick by where the image is shown, not by guessing widths. */
export const IMAGE_PRESETS = {
  /** Avatars, admin tables, small grid tiles. Square. */
  thumbnail: { width: 400, height: 400, crop: "fill", gravity: "auto" },
  /** Studio cards on listing/search pages. */
  card: { width: 800, aspectRatio: 4 / 3, crop: "fill", gravity: "auto" },
  /** Portfolio grid / studio gallery. Preserves original aspect ratio. */
  gallery: { width: 1600, crop: "limit" },
  /** Lightbox / full-screen view. */
  full: { width: 2400, crop: "limit" },
} as const satisfies Record<string, ImageTransform>;

export type ImagePreset = keyof typeof IMAGE_PRESETS;

function buildTransformation(t: ImageTransform): string {
  const parts = ["f_auto", t.quality && t.quality !== "auto" ? `q_${t.quality}` : "q_auto"];

  if (t.width) parts.push(`w_${Math.round(t.width)}`);
  if (t.height) {
    parts.push(`h_${Math.round(t.height)}`);
  } else if (t.aspectRatio && t.crop && t.crop !== "limit") {
    parts.push(`ar_${t.aspectRatio.toFixed(4).replace(/\.?0+$/, "")}`);
  }
  if (t.crop) parts.push(`c_${t.crop}`);
  if (t.gravity && t.crop && t.crop !== "limit" && t.crop !== "fit") {
    parts.push(`g_${t.gravity}`);
  }
  return parts.join(",");
}

export function cloudinaryUrl(
  publicId: string,
  transform: ImagePreset | ImageTransform = "gallery",
): string {
  const cloudName = requireEnv(
    publicEnv.cloudinaryCloudName,
    "NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME",
  );
  const t = typeof transform === "string" ? IMAGE_PRESETS[transform] : transform;
  const path = publicId.split("/").map(encodeURIComponent).join("/");
  return `https://res.cloudinary.com/${cloudName}/image/upload/${buildTransformation(t)}/${path}`;
}

/**
 * Adapter for next/image's `loader` prop: the preset fixes crop/aspect, and
 * next/image supplies the width for each srcset candidate, so every device
 * downloads only the size it needs.
 */
export function cloudinaryLoaderFor(preset: ImagePreset | ImageTransform = "gallery") {
  const base = typeof preset === "string" ? IMAGE_PRESETS[preset] : preset;
  return ({ src, width }: { src: string; width: number }) => {
    const maxWidth = base.width ?? width;
    const w = Math.min(width, maxWidth);
    // Keep the preset's aspect ratio when scaling a fixed-height crop.
    const height =
      "height" in base && base.height && base.width
        ? (base.height / base.width) * w
        : undefined;
    return cloudinaryUrl(src, { ...base, width: w, height });
  };
}
