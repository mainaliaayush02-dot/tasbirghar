import { STUDIO_MEDIA_KINDS, type StudioMediaKind } from "@/types/media";

import { MediaError } from "./types";

/** Every TasbirGhar asset lives under this root folder. */
export const MEDIA_ROOT = "tasbirghar";

/** Firestore auto-IDs are 20 alphanumerics; allow a little slack, nothing path-like. */
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export function assertSafeId(id: string, label = "id"): string {
  if (!ID_PATTERN.test(id)) {
    throw new MediaError("INVALID_TARGET", `Invalid ${label}.`);
  }
  return id;
}

export function isStudioMediaKind(value: string): value is StudioMediaKind {
  return (STUDIO_MEDIA_KINDS as readonly string[]).includes(value);
}

/** `tasbirghar/studios/{studioId}/{kind}` */
export function studioMediaFolder(studioId: string, kind: StudioMediaKind): string {
  return `${MEDIA_ROOT}/studios/${assertSafeId(studioId, "studioId")}/${kind}`;
}

/** `tasbirghar/users/{userId}/avatar` — customer profile photos. */
export function userAvatarFolder(userId: string): string {
  return `${MEDIA_ROOT}/users/${assertSafeId(userId, "userId")}/avatar`;
}

/** Scratch folder for the development-only upload test. */
export const DEV_TEST_FOLDER = `${MEDIA_ROOT}/dev-tests`;

/** Guards destructive operations to assets TasbirGhar owns. */
export function isTasbirGharPublicId(publicId: string): boolean {
  return (
    publicId.startsWith(`${MEDIA_ROOT}/`) &&
    !publicId.includes("..") &&
    /^[A-Za-z0-9_\-/]+$/.test(publicId)
  );
}
