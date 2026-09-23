import {
  MAX_IMAGE_BYTES,
  MediaError,
  type AllowedImageMimeType,
} from "./types";

/**
 * Identify an image by its magic bytes. The browser-supplied MIME type and
 * file extension are attacker-controlled, so they are ignored entirely.
 */
export function sniffImageType(bytes: Uint8Array): AllowedImageMimeType | null {
  const ascii = (start: number, end: number) =>
    String.fromCharCode(...bytes.subarray(start, end));

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes.length >= 8 &&
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b)
  ) {
    return "image/png";
  }
  // WEBP: "RIFF" <size> "WEBP"
  if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") {
    return "image/webp";
  }
  // AVIF: ISO-BMFF "ftyp" box whose major or compatible brands include avif/avis.
  if (bytes.length >= 16 && ascii(4, 8) === "ftyp") {
    const boxSize = Math.min(
      ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0,
      bytes.length,
      64,
    );
    for (let offset = 8; offset + 4 <= boxSize; offset += 4) {
      if (offset === 12) continue; // minor_version, not a brand
      const brand = ascii(offset, offset + 4);
      if (brand === "avif" || brand === "avis") return "image/avif";
    }
  }
  return null;
}

export interface ValidatedImage {
  buffer: Buffer;
  mimeType: AllowedImageMimeType;
  bytes: number;
  originalName: string;
}

/**
 * Validate an uploaded File (from `request.formData()`): present, non-empty,
 * within the size limit, and actually one of the allowed image formats.
 */
export async function validateImageFile(
  file: FormDataEntryValue | null,
): Promise<ValidatedImage> {
  if (!file || typeof file === "string") {
    throw new MediaError("NO_FILE", "No image file was provided.");
  }
  if (file.size === 0) {
    throw new MediaError("EMPTY_FILE", "The selected file is empty.");
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new MediaError(
      "FILE_TOO_LARGE",
      `Images must be ${MAX_IMAGE_BYTES / (1024 * 1024)} MB or smaller.`,
      413,
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const mimeType = sniffImageType(buffer);
  if (!mimeType) {
    throw new MediaError(
      "UNSUPPORTED_TYPE",
      "Unsupported file. Please upload a JPEG, PNG, WEBP or AVIF image.",
      415,
    );
  }

  return { buffer, mimeType, bytes: buffer.byteLength, originalName: file.name };
}
