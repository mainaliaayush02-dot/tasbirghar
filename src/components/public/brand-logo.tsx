import Image from "next/image";
import Link from "next/link";

/**
 * Official TasbirGhar logo (public/brand/logo.png). All renditions are exact
 * crops of that file — never redrawn or recoloured:
 *  - "inline": the original mark + original wordmark, side by side, on the
 *    logo's own cream (#fcf7f1) so the crops blend seamlessly. Used where the
 *    square lockup would be illegibly small (header, mobile menu).
 *  - "lockup": the complete original lockup (mark, wordmark, tagline).
 */
export function BrandLogo({
  variant = "inline",
  className = "",
  priority = false,
}: {
  variant?: "inline" | "lockup";
  className?: string;
  priority?: boolean;
}) {
  if (variant === "lockup") {
    return (
      <Image
        src="/brand/tasbirghar-logo-lockup.png"
        alt="TasbirGhar — Discover. Book. Capture."
        width={640}
        height={526}
        className={`h-auto ${className}`}
        sizes="(min-width: 768px) 220px, 180px"
        preload={priority}
      />
    );
  }
  return (
    <span className={`flex items-center gap-1.5 ${className}`}>
      <Image
        src="/brand/tasbirghar-mark.png"
        alt=""
        width={256}
        height={256}
        className="size-10 sm:size-11"
        sizes="44px"
        preload={priority}
      />
      <Image
        src="/brand/tasbirghar-wordmark.png"
        alt="TasbirGhar"
        width={900}
        height={165}
        className="h-[22px] w-auto sm:h-[26px]"
        sizes="150px"
        preload={priority}
      />
    </span>
  );
}

export function BrandHomeLink({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/"
      aria-label="TasbirGhar home"
      className={`rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-500 ${className}`}
    >
      <BrandLogo priority />
    </Link>
  );
}
