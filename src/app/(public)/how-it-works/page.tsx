import Link from "next/link";

import { JsonLd } from "@/components/public/json-ld";
import { ProsePage, ProseSection } from "@/components/public/prose-page";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "How TasbirGhar works",
  description: "How booking a photographer on TasbirGhar works — discover verified studios, compare packages in NPR, request a date and get confirmation from the studio.",
  path: "/how-it-works",
});

const FAQ = [
  ["Do I pay online when I request a booking?", "No. Online payment isn't available yet. You send a request, the studio confirms it, and payment is arranged with the studio."],
  ["How do I know a studio is genuine?", "Photographers apply to join, and every studio is reviewed by the TasbirGhar team before it is published. Studios marked Verified have been checked further."],
  ["Can the price change after I request?", "The price on your booking is the studio's package price at the moment you requested it, recorded on the booking."],
  ["Can I cancel a request?", "Yes — you can cancel a request from My bookings while it is still waiting for the studio's confirmation."],
  ["Who can leave a review?", "Only customers whose booking was completed, so every review comes from a real session."],
] as const;

export default function HowItWorksPage() {
  return (
    <ProsePage
      eyebrow="How it works"
      title="From “we need a photographer” to a confirmed booking."
      intro="TasbirGhar brings verified photographers and studios in Kathmandu Valley into one place, so you can compare them fairly and book with confidence."
    >
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: FAQ.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
        }}
      />
      <ProseSection title="1. Discover">
        <p>
          Browse <Link href="/photographers">photographers and studios</Link> by the kind of session you need — newborn,
          maternity, baby, cake smash, family, couple or studio portraits — and by location.
        </p>
      </ProseSection>
      <ProseSection title="2. Compare">
        <p>
          Each studio page shows real portfolio work, the studio space and clear <Link href="/packages">packages</Link>:
          what&apos;s included, how long the session takes and the price in Nepali rupees.
        </p>
      </ProseSection>
      <ProseSection title="3. Request a date">
        <p>
          Choose a package, date and start time, and send your request. Times already requested by others are not
          offered, and the studio&apos;s published hours are respected.
        </p>
      </ProseSection>
      <ProseSection title="4. The studio confirms">
        <p>The studio confirms or declines your request. You can follow every booking in your account.</p>
      </ProseSection>
      <ProseSection title="Questions">
        <dl className="space-y-6">
          {FAQ.map(([q, a]) => (
            <div key={q}>
              <dt className="font-medium text-ink">{q}</dt>
              <dd className="mt-1">{a}</dd>
            </div>
          ))}
        </dl>
      </ProseSection>
    </ProsePage>
  );
}
