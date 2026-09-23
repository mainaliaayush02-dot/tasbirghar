import { CloudinaryImage } from "@/components/media/cloudinary-image";
import { ImageUploader } from "@/components/media/image-uploader";
import { Badge, Card, PageHeader } from "@/components/ui/feedback";
import { requireUser } from "@/lib/auth/current-user";
import { LISTING_LABEL } from "@/lib/data/dashboard";
import { getOwnedStudio } from "@/lib/data/studios";

import { StudioForm } from "./studio-form";

export const metadata = { title: "Studio profile" };

export default async function StudioProfilePage() {
  const user = await requireUser("dashboard", "/dashboard/studio");
  const studio = await getOwnedStudio(user.uid);

  if (!studio) {
    return (
      <>
        <PageHeader
          title="Create your studio"
          description="This becomes your public studio page once approved. You can edit everything later except the URL."
        />
        <Card>
          <StudioForm mode="create" />
        </Card>
      </>
    );
  }

  const listing = LISTING_LABEL[studio.listingStatus];

  return (
    <>
      <PageHeader
        title="Studio profile"
        description={`tasbirghar.com/photographers/${studio.slug}`}
        actions={<Badge tone={listing.tone}>{listing.label}</Badge>}
      />

      <Card title="Brand images" description="Your profile photo (logo) and cover image." className="mb-6">
        <div className="grid gap-6 md:grid-cols-[180px_1fr]">
          <div className="space-y-3">
            <p className="text-sm font-medium text-neutral-800">Profile photo</p>
            <div className="relative aspect-square w-36 overflow-hidden rounded-full border border-neutral-200 bg-neutral-100">
              {studio.profileImage ? (
                <CloudinaryImage asset={studio.profileImage} preset="thumbnail" fill sizes="144px" className="object-cover" alt={`${studio.businessName} profile photo`} />
              ) : (
                <span className="grid h-full place-items-center text-xs text-neutral-400">No photo</span>
              )}
            </div>
            <ImageUploader studioId={studio.id} target="profile" label={studio.profileImage ? "Replace" : "Upload"} variant="secondary" />
          </div>
          <div className="space-y-3">
            <p className="text-sm font-medium text-neutral-800">Cover image</p>
            <div className="relative aspect-[3/1] w-full overflow-hidden rounded-lg border border-neutral-200 bg-neutral-100">
              {studio.coverImage ? (
                <CloudinaryImage
                  asset={studio.coverImage}
                  preset={{ width: 1600, aspectRatio: 3, crop: "fill", gravity: "auto" }}
                  fill
                  sizes="(min-width: 1024px) 700px, 100vw"
                  className="object-cover"
                  alt={`${studio.businessName} cover`}
                />
              ) : (
                <span className="grid h-full place-items-center text-xs text-neutral-400">No cover image</span>
              )}
            </div>
            <ImageUploader studioId={studio.id} target="cover" label={studio.coverImage ? "Replace cover" : "Upload cover"} variant="secondary" />
          </div>
        </div>
      </Card>

      <Card title="Studio details">
        <StudioForm mode="edit" studio={studio} />
      </Card>
    </>
  );
}
