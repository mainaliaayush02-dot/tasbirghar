import { redirect } from "next/navigation";

/** /search → the discovery page, preserving supported filters. */
export default async function SearchAlias({ searchParams }: PageProps<"/search">) {
  const sp = await searchParams;
  const params = new URLSearchParams();
  for (const key of ["q", "category", "city", "sort"]) {
    const v = sp[key];
    const value = (Array.isArray(v) ? v[0] : v)?.slice(0, 80);
    if (value) params.set(key, value);
  }
  redirect(params.size ? `/photographers?${params}` : "/photographers");
}
