"use client";

import { useState } from "react";

import { ImageUploader } from "@/components/media/image-uploader";
import { Field, Select } from "@/components/ui/field";
import type { GalleryImageKind } from "@/types/models";

export function GalleryUpload({ studioId }: { studioId: string }) {
  const [kind, setKind] = useState<GalleryImageKind>("studio");
  return (
    <div className="space-y-4">
      <Field label="Photo type" htmlFor="galleryKind" className="max-w-xs">
        <Select id="galleryKind" value={kind} onChange={(e) => setKind(e.target.value as GalleryImageKind)}>
          <option value="studio">Studio space / facilities</option>
          <option value="setup">Themed setup</option>
          <option value="prop">Props</option>
        </Select>
      </Field>
      <ImageUploader studioId={studioId} target="gallery" galleryKind={kind} multiple label="Choose photos" />
    </div>
  );
}
