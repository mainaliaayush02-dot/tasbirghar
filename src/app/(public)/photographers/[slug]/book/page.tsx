import Link from "next/link";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth/current-user";
import { bookableRange } from "@/lib/booking/rules";
import { getPublishedStudioBySlug } from "@/lib/data/public";
import { getAccount } from "@/lib/data/users";

import { BookingForm } from "./booking-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Request a booking", robots: { index: false, follow: false } };

export default async function BookPage({ params, searchParams }: PageProps<"/photographers/[slug]/book">) {
  const { slug } = await params;
  const sp = await searchParams;
  const packageParam = typeof sp.package === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(sp.package) ? sp.package : null;
  const here = `/photographers/${slug}/book${packageParam ? `?package=${packageParam}` : ""}`;

  // Sign-in required; returns here (with the chosen package) after login.
  const user = await requireUser("account", here);
  const studio = await getPublishedStudioBySlug(slug);
  if (!studio || studio.packages.length === 0) notFound();

  if (user.role !== "customer") {
    return (
      <div className="mx-auto max-w-xl px-4 py-20 text-center">
        <h1 className="font-display text-3xl text-ink">Bookings are made from a customer account</h1>
        <p className="mt-3 text-ink/65">
          You&apos;re signed in as {user.role === "admin" ? "an admin" : "a photographer"}. Use a separate customer account to
          request a booking.
        </p>
        <Link href={`/photographers/${slug}`} className="mt-6 inline-flex rounded-full border border-ink/15 px-5 py-2.5 text-sm font-medium">
          Back to {studio.businessName}
        </Link>
      </div>
    );
  }

  const account = await getAccount(user);
  const { min, max } = bookableRange();

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pt-10 pb-20 sm:px-6 lg:px-8">
      <Link href={`/photographers/${slug}`} className="text-sm text-ink/60 hover:text-ink">
        ← {studio.businessName}
      </Link>
      <h1 className="mt-3 font-display text-4xl tracking-tight text-ink">Request a booking</h1>
      <p className="mt-2 max-w-2xl text-ink/65">
        Choose a package, date and time. {studio.businessName} will confirm your request — nothing is charged online.
      </p>
      <BookingForm
        studio={{ id: studio.id, slug: studio.slug, businessName: studio.businessName }}
        packages={studio.packages.map((p) => ({
          id: p.id,
          name: p.name,
          price: p.price,
          durationMinutes: p.durationMinutes,
          editedPhotos: p.editedPhotos,
          category: p.category,
        }))}
        initialPackageId={packageParam && studio.packages.some((p) => p.id === packageParam) ? packageParam : studio.packages[0].id}
        minDate={min}
        maxDate={max}
        defaults={{ name: account.displayName, phone: account.phone ?? "" }}
      />
    </div>
  );
}
