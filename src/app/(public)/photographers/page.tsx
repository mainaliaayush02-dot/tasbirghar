import { Discovery, readDiscoveryParams } from "@/components/public/discovery";
import { getCategory, isCategorySlug } from "@/config/categories";
import { isLocationSlug, LOCATIONS } from "@/config/locations";
import { buildMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

export async function generateMetadata({ searchParams }: PageProps<"/photographers">) {
  const p = readDiscoveryParams(await searchParams);
  const filtered = Boolean(p.q || p.category || p.city || p.sort !== "recommended");
  return buildMetadata({
    title: "Photographers in Kathmandu Valley",
    description:
      "Browse verified photography studios in Kathmandu, Lalitpur and Bhaktapur. Compare portfolios and packages for newborn, maternity, baby, family, couple and studio photography.",
    // Filtered/sorted views canonicalise to the clean listing (or the
    // dedicated category/location landing page) and are not indexed.
    path: "/photographers",
    index: !filtered,
  });
}

export default async function PhotographersPage({ searchParams }: PageProps<"/photographers">) {
  const params = readDiscoveryParams(await searchParams);
  const category = isCategorySlug(params.category) ? getCategory(params.category).name : null;
  const city = isLocationSlug(params.city) ? LOCATIONS.find((l) => l.slug === params.city)!.name : null;
  return (
    <Discovery
      eyebrow="Discover"
      title={category && city ? `${category} in ${city}` : category ? `${category} studios` : city ? `Photographers in ${city}` : "Photographers & studios"}
      intro="Verified studios across Kathmandu Valley. Compare real portfolios and clear packages, then request a booking."
      params={params}
    />
  );
}
