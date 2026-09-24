import Link from "next/link";

import { BrandLogo } from "@/components/public/brand-logo";
import { ProsePage, ProseSection } from "@/components/public/prose-page";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "About TasbirGhar",
  description: "TasbirGhar (तस्वीरघर) is a photography marketplace for Nepal, helping families discover, compare and book trusted photographers across Kathmandu Valley.",
  path: "/about",
});

export default function AboutPage() {
  return (
    <ProsePage
      eyebrow="About"
      title="TasbirGhar — a home for photographs."
      intro={
        <>
          <span lang="ne">तस्वीरघर</span> means “house of pictures”. We&apos;re building a trustworthy place to find
          and book photographers in Nepal, starting in Kathmandu Valley.
        </>
      }
    >
      <div className="flex justify-center py-4">
        <BrandLogo variant="lockup" className="w-56" />
      </div>
      <ProseSection title="Why TasbirGhar">
        <p>
          Finding the right photographer usually means scrolling social media, messaging several studios and still not
          knowing what a session includes or costs. TasbirGhar puts verified studios, real portfolios and clear packages
          side by side.
        </p>
      </ProseSection>
      <ProseSection title="Our standards">
        <p>
          Photographers apply to join and every studio is reviewed before it is published. Prices are shown in NPR as set
          by each studio, and reviews can only come from completed bookings.
        </p>
      </ProseSection>
      <ProseSection title="For photographers">
        <p>
          TasbirGhar gives studios a professional profile, a portfolio, clear packages and booking requests in one place.{" "}
          <Link href="/become-a-photographer">Apply to list your studio</Link>.
        </p>
      </ProseSection>
    </ProsePage>
  );
}
