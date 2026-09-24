import Link from "next/link";

import { ProsePage, ProseSection } from "@/components/public/prose-page";
import { siteConfig } from "@/config/site";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "Contact TasbirGhar",
  description: "Get help with a booking, your account or listing your studio on TasbirGhar.",
  path: "/contact",
});

export default function ContactPage() {
  return (
    <ProsePage eyebrow="Contact" title="How can we help?" intro="Most answers are one click away. For anything else, reach the TasbirGhar team directly.">
      <ProseSection title="About a booking">
        <p>
          Open <Link href="/account/bookings">My bookings</Link> to see the status of every request, the studio and your
          session details.
        </p>
      </ProseSection>
      <ProseSection title="Listing your studio">
        <p>
          Photographers can <Link href="/become-a-photographer">apply to join TasbirGhar</Link>. Applications are reviewed by
          our team.
        </p>
      </ProseSection>
      <ProseSection title="Talk to the team">
        {siteConfig.contactEmail ? (
          <p>
            Email us at <a href={`mailto:${siteConfig.contactEmail}`}>{siteConfig.contactEmail}</a>.
          </p>
        ) : (
          <p>A public support address is coming soon. In the meantime, use the options above.</p>
        )}
      </ProseSection>
    </ProsePage>
  );
}
