import { PhotoGrid } from "@/components/dashboard/photo-grid";
import { Card, PageHeader } from "@/components/ui/feedback";
import { requireStudio } from "@/lib/data/dashboard";
import { listGallery } from "@/lib/data/studios";
import { LIMITS } from "@/lib/validation/schemas";

import { GalleryUpload } from "./gallery-upload";

export const metadata = { title: "Studio photos" };

export default async function GalleryPage() {
  const { studio } = await requireStudio("/dashboard/gallery");
  const images = await listGallery(studio.id);

  return (
    <>
      <PageHeader
        title="Studio photos"
        description={`Show families your space, setups and props. ${images.length} of ${LIMITS.maxGalleryPhotos} photos.`}
      />
      <Card title="Upload studio photos" className="mb-6">
        {images.length >= LIMITS.maxGalleryPhotos ? (
          <p className="text-sm text-neutral-600">You&apos;ve reached the limit. Delete a photo to add another.</p>
        ) : (
          <GalleryUpload studioId={studio.id} />
        )}
      </Card>
      <PhotoGrid
        items={images}
        studioId={studio.id}
        collection="gallery"
        emptyText="No studio photos yet. Add your shooting area, setups and props."
      />
    </>
  );
}
