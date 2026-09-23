"use client";

import Image, { type ImageProps } from "next/image";
import { useMemo } from "react";

import {
  cloudinaryLoaderFor,
  type ImagePreset,
  type ImageTransform,
} from "@/lib/cloudinary/delivery";
import type { MediaAsset } from "@/types/media";

type CloudinaryImageProps = Omit<ImageProps, "src" | "loader" | "alt"> & {
  asset: Pick<MediaAsset, "publicId" | "alt">;
  preset?: ImagePreset | ImageTransform;
  /** Falls back to `asset.alt`; pass "" for decorative images. */
  alt?: string;
};

/**
 * Responsive Cloudinary image. Cloudinary performs resizing and format/quality
 * negotiation (f_auto, q_auto), so Next's own optimizer is bypassed via the
 * loader. Always pass `sizes` for layouts narrower than the viewport.
 *
 *   <CloudinaryImage asset={studio.profileImage} preset="card" fill sizes="(min-width: 768px) 33vw, 100vw" />
 */
export function CloudinaryImage({
  asset,
  preset = "gallery",
  alt,
  ...props
}: CloudinaryImageProps) {
  const loader = useMemo(() => cloudinaryLoaderFor(preset), [preset]);
  return <Image {...props} src={asset.publicId} loader={loader} alt={alt ?? asset.alt ?? ""} />;
}
