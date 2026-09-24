import "server-only";

import type { DocumentSnapshot } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebase/admin";
import { collections } from "@/lib/firestore/paths";
import type { ApplicationDTO } from "@/types/dto";
import type { ApplicationStatus, PhotographerApplicationDoc } from "@/types/models";

import { toIso } from "./serialize";

export const applicationRef = (uid: string) =>
  adminDb().collection(collections.photographerApplications).doc(uid);

export function toApplicationDTO(snap: DocumentSnapshot): ApplicationDTO {
  const d = snap.data() as PhotographerApplicationDoc;
  return {
    applicantUid: d.applicantUid,
    applicantEmail: d.applicantEmail,
    fullName: d.fullName,
    phone: d.phone,
    businessName: d.businessName,
    city: d.city,
    area: d.area,
    categories: d.categories,
    description: d.description,
    yearsOfExperience: d.yearsOfExperience,
    instagram: d.instagram,
    website: d.website,
    portfolioIntro: d.portfolioIntro,
    status: d.status,
    submittedAt: toIso(d.submittedAt),
    reviewedAt: toIso(d.reviewedAt),
    reviewedBy: d.reviewedBy ?? null,
    approvedAt: toIso(d.approvedAt),
    approvedBy: d.approvedBy ?? null,
    rejectionReason: d.rejectionReason,
  };
}

export async function getApplication(uid: string): Promise<ApplicationDTO | null> {
  const snap = await applicationRef(uid).get();
  return snap.exists ? toApplicationDTO(snap) : null;
}

/** Admin only — callers must have verified the admin claim. */
export async function listApplications(status: ApplicationStatus, limit = 50) {
  const snap = await adminDb()
    .collection(collections.photographerApplications)
    .where("status", "==", status)
    .limit(limit)
    .get();
  return snap.docs
    .map(toApplicationDTO)
    .sort((a, b) => (a.submittedAt ?? "").localeCompare(b.submittedAt ?? ""));
}

export async function countApplications(status: ApplicationStatus): Promise<number> {
  const snap = await adminDb()
    .collection(collections.photographerApplications)
    .where("status", "==", status)
    .count()
    .get();
  return snap.data().count;
}
