import { notFound } from "next/navigation";

import { Discovery, readDiscoveryParams } from "@/components/public/discovery";
import { JsonLd } from "@/components/public/json-ld";
import { LOCATIONS } from "@/config/locations";
import { absoluteUrl } from "@/config/site";
import { buildMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

const find = (slug: string) => LOCATIONS.find((l) => l.slug === slug);

export async function generateMetadata({ params }: PageProps<"/locations/[location]">) {
  const loc = find((await params).location);
  if (!loc) return {};
  return buildMetadata({
    title: `Photographers in ${loc.name}`,
    description: `Browse verified photography studios in ${loc.name} — newborn, maternity, baby, cake smash, family, couple and studio photography with clear packages in NPR.`,
    path: `/locations/${loc.slug}`,
  });
}

export default async function LocationPage({ params, searchParams }: PageProps<"/locations/[location]">) {
  const loc = find((await params).location);
  if (!loc) notFound();
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Photographers", item: absoluteUrl("/photographers") },
            { "@type": "ListItem", position: 2, name: loc.name, item: absoluteUrl(`/locations/${loc.slug}`) },
          ],
        }}
      />
      <Discovery
        eyebrow="Location"
        title={`Photographers in ${loc.name}`}
        intro={`Studios based in ${loc.name}, reviewed by TasbirGhar. Filter by the kind of session you need.`}
        params={readDiscoveryParams(await searchParams)}
        fixed={{ city: loc.slug }}
        action={`/locations/${loc.slug}`}
        breadcrumbs={[
          { href: "/photographers", label: "Photographers" },
          { href: `/locations/${loc.slug}`, label: loc.name },
        ]}
      />
    </>
  );
}
