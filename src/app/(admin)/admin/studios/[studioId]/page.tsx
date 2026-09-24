import Link from "next/link";
import { notFound } from "next/navigation";

import { StudioModerationActions } from "@/components/admin/actions";
import { LISTING_STATUS, VERIFICATION_STATUS } from "@/components/admin/status";
import { AdminPageHeader, Chip, EmptyState, Panel, StatusPill } from "@/components/admin/ui";
import { CloudinaryImage } from "@/components/media/cloudinary-image";
import { getCategory } from "@/config/categories";
import { LOCATIONS } from "@/config/locations";
import { requireUser } from "@/lib/auth/current-user";
import { getStudioAdmin } from "@/lib/data/admin";
import { formatDate } from "@/lib/format";
import { calculateCommission, DEFAULT_COMMISSION_RATE_BPS, formatMoney } from "@/lib/money";

export const metadata = { title: "Studio" };

const KIND_LABEL = { studio: "Studio space", setup: "Setup", prop: "Prop" } as const;

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-sm text-neutral-500">{label}</dt>
      <dd className="mt-0.5 min-w-0 text-sm break-words text-ink">{children}</dd>
    </div>
  );
}

export default async function AdminStudioPage({ params }: PageProps<"/admin/studios/[studioId]">) {
  const { studioId } = await params;
  await requireUser("admin", `/admin/studios/${studioId}`);
  const data = await getStudioAdmin(studioId);
  if (!data) notFound();
  const { studio, owner, application, portfolio, gallery, packages, availability } = data;
  const listing = LISTING_STATUS[studio.listingStatus];
  const verification = VERIFICATION_STATUS[studio.verificationStatus];
  const rateBps = studio.commissionRateBps ?? DEFAULT_COMMISSION_RATE_BPS;
  const activePackages = packages.filter((p) => p.isActive);

  const readiness = [
    { ok: Boolean(studio.profileImage), label: "Profile photo" },
    { ok: portfolio.length > 0, label: `Portfolio (${portfolio.length})` },
    { ok: activePackages.length > 0, label: `Active package (${activePackages.length})` },
    { ok: Boolean(studio.coverImage), label: "Cover image", optional: true },
    { ok: gallery.length > 0, label: `Studio photos (${gallery.length})`, optional: true },
  ];

  return (
    <>
      <AdminPageHeader
        back={{ href: "/admin/studios", label: "Studios" }}
        title={studio.businessName}
        description={`tasbirghar.com/photographers/${studio.slug}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <StatusPill tone={listing.tone}>{listing.label}</StatusPill>
            <StatusPill tone={verification.tone}>{verification.label}</StatusPill>
          </div>
        }
      />

      {studio.coverImage && (
        <div className="relative mb-6 aspect-[3/1] overflow-hidden rounded-2xl bg-neutral-100">
          <CloudinaryImage
            asset={studio.coverImage}
            preset={{ width: 1600, aspectRatio: 3, crop: "fill", gravity: "auto" }}
            fill
            sizes="(min-width: 1280px) 1200px, 100vw"
            className="object-cover"
            alt={`${studio.businessName} cover image`}
          />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Panel title="Basic information">
            <div className="flex gap-4">
              <div className="relative size-16 shrink-0 overflow-hidden rounded-full bg-neutral-100 ring-1 ring-black/5">
                {studio.profileImage ? (
                  <CloudinaryImage asset={studio.profileImage} preset="thumbnail" fill sizes="64px" className="object-cover" alt={`${studio.businessName} profile photo`} />
                ) : (
                  <span className="grid h-full place-items-center text-xs text-neutral-400">No photo</span>
                )}
              </div>
              <p className="min-w-0 text-sm whitespace-pre-line text-neutral-700">{studio.description}</p>
            </div>
            <dl className="mt-6 grid gap-4 sm:grid-cols-2">
              <Detail label="Location">
                {studio.location.area}, {LOCATIONS.find((l) => l.slug === studio.location.city)?.name}
                {studio.location.address && <span className="block text-neutral-500">{studio.location.address}</span>}
              </Detail>
              <Detail label="Contact">
                {studio.phone}
                {studio.email && <span className="block break-all text-neutral-500">{studio.email}</span>}
              </Detail>
              <Detail label="Online">
                {studio.website ? (
                  <a href={studio.website} target="_blank" rel="noreferrer noopener nofollow" className="block break-all text-brand-700 hover:underline">
                    {studio.website}
                  </a>
                ) : null}
                {studio.instagram ? (
                  <a href={`https://instagram.com/${studio.instagram}`} target="_blank" rel="noreferrer noopener" className="block text-brand-700 hover:underline">
                    @{studio.instagram}
                  </a>
                ) : null}
                {!studio.website && !studio.instagram && "—"}
              </Detail>
              <Detail label="Experience">{studio.yearsOfExperience !== null && studio.yearsOfExperience !== undefined ? `${studio.yearsOfExperience} years` : "—"}</Detail>
              <Detail label="Categories">
                <span className="flex flex-wrap gap-1">
                  {studio.categories.map((c) => (
                    <Chip key={c}>{getCategory(c).name}</Chip>
                  ))}
                </span>
              </Detail>
              <Detail label="Facilities & props">
                {[...studio.facilities, ...studio.props].join(", ") || "—"}
              </Detail>
              {studio.team && <Detail label="Team"><span className="whitespace-pre-line">{studio.team}</span></Detail>}
              {studio.highlights && <Detail label="What makes it different"><span className="whitespace-pre-line">{studio.highlights}</span></Detail>}
            </dl>
          </Panel>

          <Panel title="Portfolio" description={`${portfolio.length} photos`} bodyClassName={portfolio.length ? "p-5" : "p-0"}>
            {portfolio.length === 0 ? (
              <EmptyState title="No portfolio photos yet" icon="studios">
                The photographer uploads portfolio work from their dashboard.
              </EmptyState>
            ) : (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                {portfolio.map((p) => (
                  <li key={p.id} className="group relative aspect-square overflow-hidden rounded-xl bg-neutral-100">
                    <CloudinaryImage
                      asset={p.image}
                      preset="thumbnail"
                      fill
                      sizes="(min-width: 1280px) 200px, (min-width: 640px) 30vw, 45vw"
                      className="object-cover"
                      alt={p.caption ?? `${studio.businessName} portfolio photo`}
                    />
                    <div className="absolute inset-x-0 bottom-0 flex flex-wrap gap-1 bg-gradient-to-t from-black/60 to-transparent p-2">
                      {p.isFeatured && <span className="rounded bg-white/90 px-1.5 text-[11px] font-medium text-ink">Featured</span>}
                      {p.category && <span className="rounded bg-white/90 px-1.5 text-[11px] text-ink">{getCategory(p.category).name.replace(" Photography", "")}</span>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Studio photos" description="Space, setups and props" bodyClassName={gallery.length ? "p-5" : "p-0"}>
            {gallery.length === 0 ? (
              <EmptyState title="No studio photos yet" icon="studios" />
            ) : (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                {gallery.map((g) => (
                  <li key={g.id} className="relative aspect-square overflow-hidden rounded-xl bg-neutral-100">
                    <CloudinaryImage asset={g.image} preset="thumbnail" fill sizes="(min-width: 1280px) 200px, 45vw" className="object-cover" alt={g.caption ?? `${studio.businessName} ${KIND_LABEL[g.kind].toLowerCase()}`} />
                    <span className="absolute bottom-2 left-2 rounded bg-white/90 px-1.5 text-[11px] text-ink">{KIND_LABEL[g.kind]}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Packages" description={`${packages.length} total · ${activePackages.length} active`} bodyClassName={packages.length ? "p-0" : "p-0"}>
            {packages.length === 0 ? (
              <EmptyState title="No packages yet" icon="commission">
                Packages set what customers pay. A studio needs at least one active package to be published.
              </EmptyState>
            ) : (
              <ul className="divide-y divide-neutral-100">
                {packages.map((p) => {
                  const split = calculateCommission(p.price, rateBps);
                  return (
                    <li key={p.id} className="flex flex-wrap items-start justify-between gap-4 px-5 py-4">
                      <div className="min-w-0">
                        <p className="font-medium text-ink">
                          {p.name}{" "}
                          {!p.isActive && <span className="ml-1 text-xs font-normal text-neutral-400">(hidden)</span>}
                        </p>
                        <p className="mt-0.5 text-sm text-neutral-500">{p.description}</p>
                        <p className="mt-1 text-xs text-neutral-500">
                          {getCategory(p.category).name} · {p.durationMinutes} min · {p.editedPhotos} edited photos
                        </p>
                      </div>
                      <div className="text-right text-sm">
                        <p className="text-base font-semibold text-ink">{formatMoney(p.price)}</p>
                        <p className="text-neutral-500">
                          Commission {formatMoney(split.commissionAmount)} · Payout {formatMoney(split.photographerNetAmount)}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          <Panel title="Availability" description="Next 14 days with published slots">
            {availability.length === 0 ? (
              <p className="text-sm text-neutral-500">No availability published yet. Availability management arrives with the booking system.</p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {availability.map((d) => (
                  <li key={d.date} className="rounded-lg border border-neutral-200 px-3 py-2 text-sm">
                    <span className="font-medium text-ink">{formatDate(d.date)}</span>{" "}
                    {d.isClosed ? <span className="text-neutral-500">Closed</span> : <span className="text-neutral-500">{d.slots.filter((s) => s.status === "open").length} open slots</span>}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title="Marketplace status">
            <dl className="space-y-3">
              <Detail label="Listing"><StatusPill tone={listing.tone}>{listing.label}</StatusPill></Detail>
              <Detail label="Verification"><StatusPill tone={verification.tone}>{verification.label}</StatusPill></Detail>
              <Detail label="Commission rate">
                {rateBps / 100}% ({rateBps} bps){studio.commissionRateBps === null ? " · platform default" : ""}
              </Detail>
              <Detail label="Bookings">{data.bookingCount}</Detail>
              {data.lastModeration && (
                <Detail label="Last moderation">
                  {data.lastModeration.action} · {formatDate(data.lastModeration.at, true)}
                  <span className="block break-all text-neutral-500">by {data.lastModeration.byEmail ?? "admin"}</span>
                  {data.lastModeration.reason && <span className="block text-neutral-500">“{data.lastModeration.reason}”</span>}
                </Detail>
              )}
            </dl>
            <div className="mt-5 border-t border-neutral-100 pt-4">
              <StudioModerationActions studioId={studio.id} listingStatus={studio.listingStatus} verificationStatus={studio.verificationStatus} />
            </div>
          </Panel>

          <Panel title="Publishing readiness">
            <ul className="space-y-2 text-sm">
              {readiness.map((r) => (
                <li key={r.label} className="flex items-center gap-2">
                  <span aria-hidden className={`grid size-5 place-items-center rounded-full text-[11px] ${r.ok ? "bg-emerald-500 text-white" : "border border-neutral-300 text-transparent"}`}>✓</span>
                  <span className={r.ok ? "text-ink" : "text-neutral-500"}>
                    {r.label}
                    {"optional" in r && r.optional ? " (recommended)" : ""}
                  </span>
                  <span className="sr-only">{r.ok ? "complete" : "missing"}</span>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="Owner">
            {owner ? (
              <dl className="space-y-3">
                <Detail label="Name">{owner.displayName ?? "—"}</Detail>
                <Detail label="Email"><span className="break-all">{owner.email ?? "—"}</span></Detail>
                <Detail label="Account">
                  {owner.disabled ? "Disabled" : "Active"} · role {owner.role}
                </Detail>
                <Detail label="Joined">{formatDate(owner.createdAt)}</Detail>
                <Detail label="Last sign-in">{formatDate(owner.lastSignInAt, true)}</Detail>
              </dl>
            ) : (
              <p className="text-sm text-neutral-500">Owner account not found.</p>
            )}
            {application && (
              <Link href={`/admin/applications/${application.applicantUid}`} className="mt-4 inline-block text-sm font-medium text-brand-700 hover:underline">
                View photographer application
              </Link>
            )}
          </Panel>

          <p className="px-1 text-xs text-neutral-400">
            Created {formatDate(data.createdAt, true)} · Updated {formatDate(data.updatedAt, true)}
          </p>
        </div>
      </div>
    </>
  );
}
