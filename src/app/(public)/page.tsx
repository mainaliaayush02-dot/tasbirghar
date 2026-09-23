import { PHOTOGRAPHY_CATEGORIES } from "@/config/categories";
import { siteConfig } from "@/config/site";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({ path: "/" });

export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-4 py-16 sm:px-6">
      <p className="text-sm font-medium tracking-wide text-neutral-500 uppercase">
        {siteConfig.market}
      </p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
        {siteConfig.name} <span className="text-neutral-400">{siteConfig.nameNe}</span>
      </h1>
      <p className="mt-4 max-w-2xl text-lg text-neutral-600">{siteConfig.description}</p>
      <ul className="mt-8 flex flex-wrap gap-2">
        {PHOTOGRAPHY_CATEGORIES.map((category) => (
          <li
            key={category.slug}
            className="rounded-full border border-neutral-200 px-3 py-1 text-sm text-neutral-700"
          >
            {category.name}
          </li>
        ))}
      </ul>
      <p className="mt-10 text-sm text-neutral-500">Launching soon.</p>
    </main>
  );
}
