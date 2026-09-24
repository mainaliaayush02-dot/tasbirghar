import { notFound, permanentRedirect } from "next/navigation";

/** /studios/{slug} is an alias; the canonical studio URL is /photographers/{slug}. */
export default async function StudioAlias({ params }: PageProps<"/studios/[slug]">) {
  const { slug } = await params;
  if (!/^[a-z0-9-]{3,60}$/.test(slug)) notFound();
  permanentRedirect(`/photographers/${slug}`);
}
