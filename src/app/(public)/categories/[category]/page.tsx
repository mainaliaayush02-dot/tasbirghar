import { notFound } from "next/navigation";

import { Discovery, readDiscoveryParams } from "@/components/public/discovery";
import { JsonLd } from "@/components/public/json-ld";
import { getCategory, isCategorySlug } from "@/config/categories";
import { absoluteUrl } from "@/config/site";
import { buildMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

const INTRO: Record<string, string> = {
  newborn: "Newborn sessions are best in the first two weeks. Look for studios that describe their safety practices, warmth and props — and book early.",
  maternity: "Maternity portraits are usually taken between 28 and 36 weeks. Compare studio setups, outfits provided and outdoor options.",
  baby: "From sitting-up milestones to first steps — studios that photograph babies patiently, at their pace.",
  "cake-smash": "First-birthday cake smash sessions, with setups and cleanup handled by the studio.",
  family: "Family portraits for every generation, in studio or on location.",
  couple: "Pre-wedding shoots, anniversaries and couple portraits.",
  studio: "Portraits, headshots and personal branding in a controlled studio setting.",
};

export async function generateMetadata({ params }: PageProps<"/categories/[category]">) {
  const { category } = await params;
  if (!isCategorySlug(category)) return {};
  const name = getCategory(category).name;
  return buildMetadata({
    title: `${name} in Kathmandu`,
    description: `Find ${name.toLowerCase()} studios in Kathmandu, Lalitpur and Bhaktapur. ${INTRO[category]}`,
    path: `/categories/${category}`,
  });
}

export default async function CategoryPage({ params, searchParams }: PageProps<"/categories/[category]">) {
  const { category } = await params;
  if (!isCategorySlug(category)) notFound();
  const name = getCategory(category).name;
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Photographers", item: absoluteUrl("/photographers") },
            { "@type": "ListItem", position: 2, name, item: absoluteUrl(`/categories/${category}`) },
          ],
        }}
      />
      <Discovery
        eyebrow="Category"
        title={`${name} in Kathmandu`}
        intro={INTRO[category]}
        params={readDiscoveryParams(await searchParams)}
        fixed={{ category }}
        action={`/categories/${category}`}
        breadcrumbs={[
          { href: "/photographers", label: "Photographers" },
          { href: `/categories/${category}`, label: name },
        ]}
      />
    </>
  );
}
