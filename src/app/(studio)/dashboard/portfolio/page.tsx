import { PhotoGrid } from "@/components/dashboard/photo-grid";
import { ImageUploader } from "@/components/media/image-uploader";
import { Card, PageHeader } from "@/components/ui/feedback";
import { requireStudio } from "@/lib/data/dashboard";
import { listPortfolio } from "@/lib/data/studios";
import { LIMITS } from "@/lib/validation/schemas";

export const metadata = { title: "Portfolio" };

export default async function PortfolioPage() {
  const { studio } = await requireStudio("/dashboard/portfolio");
  const photos = await listPortfolio(studio.id);
  const full = photos.length >= LIMITS.maxPortfolioPhotos;

  return (
    <>
      <PageHeader
        title="Portfolio"
        description={`Your best work. ${photos.length} of ${LIMITS.maxPortfolioPhotos} photos.`}
      />
      <Card title="Upload photos" description="Select several photos at once. Tag each with a category so families can find it." className="mb-6">
        {full ? (
          <p className="text-sm text-neutral-600">You&apos;ve reached the portfolio limit. Delete a photo to add another.</p>
        ) : (
          <ImageUploader studioId={studio.id} target="portfolio" multiple label="Choose photos" />
        )}
      </Card>
      <PhotoGrid
        items={photos}
        studioId={studio.id}
        collection="portfolio"
        emptyText="No portfolio photos yet. Upload at least 6 of your best shots."
      />
    </>
  );
}
