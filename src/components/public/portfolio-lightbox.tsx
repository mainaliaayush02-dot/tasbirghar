"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { CloudinaryImage } from "@/components/media/cloudinary-image";
import type { MediaAsset } from "@/types/media";

export interface LightboxItem {
  id: string;
  image: MediaAsset;
  alt: string;
  caption: string | null;
}

/**
 * Responsive image grid with an accessible lightbox (<dialog>: focus trap,
 * Esc, arrow keys). The grid loads card-size renditions; the full-size
 * rendition is only requested when a photo is opened.
 */
export function PortfolioLightbox({ items, variant = "grid" }: { items: LightboxItem[]; variant?: "grid" | "masonry" }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const step = useCallback((delta: number) => setIndex((i) => (i + delta + items.length) % items.length), [items.length]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") step(1);
      if (e.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, step]);

  const current = items[index];

  return (
    <>
      <ul className={variant === "masonry" ? "columns-2 gap-3 sm:columns-3 lg:gap-4 [&>li]:mb-3 lg:[&>li]:mb-4" : "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:gap-4"}>
        {items.map((item, i) => (
          <li key={item.id} className="break-inside-avoid">
            <button
              type="button"
              onClick={() => {
                setIndex(i);
                setOpen(true);
              }}
              className="group relative block w-full overflow-hidden rounded-2xl bg-ink/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
              style={
                variant === "masonry" && item.image.width && item.image.height
                  ? { aspectRatio: `${item.image.width} / ${item.image.height}` }
                  : { aspectRatio: "1 / 1" }
              }
            >
              <CloudinaryImage
                asset={item.image}
                preset={variant === "masonry" ? { width: 800, crop: "limit" } : "card"}
                fill
                sizes="(min-width: 1024px) 30vw, 50vw"
                className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                alt={item.alt}
              />
              <span className="sr-only">Open photo {i + 1} of {items.length}</span>
            </button>
          </li>
        ))}
      </ul>

      <dialog
        ref={ref}
        aria-label="Photo viewer"
        onClose={() => setOpen(false)}
        className="m-0 h-dvh max-h-none w-screen max-w-none bg-ink/95 p-0 text-cream backdrop:bg-ink/80"
      >
        {open && current && (
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between px-4 py-3 text-sm">
              <span>
                {index + 1} / {items.length}
              </span>
              <button type="button" onClick={() => setOpen(false)} className="grid size-11 place-items-center rounded-full hover:bg-white/10" aria-label="Close">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" aria-hidden className="size-6">
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </div>
            <div className="relative min-h-0 flex-1">
              <CloudinaryImage asset={current.image} preset="full" fill sizes="100vw" className="object-contain" alt={current.alt} />
            </div>
            <div className="flex items-center justify-between gap-4 px-4 py-4">
              <button type="button" onClick={() => step(-1)} className="grid size-12 place-items-center rounded-full bg-white/10 hover:bg-white/20" aria-label="Previous photo">
                ←
              </button>
              <p className="min-w-0 truncate text-center text-sm text-cream/80">{current.caption ?? ""}</p>
              <button type="button" onClick={() => step(1)} className="grid size-12 place-items-center rounded-full bg-white/10 hover:bg-white/20" aria-label="Next photo">
                →
              </button>
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}
