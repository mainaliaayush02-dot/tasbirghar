/**
 * Serializable shapes passed from Server Components to Client Components.
 * Timestamps are ISO strings; money stays in integer paisa.
 */

import type { CategorySlug } from "@/config/categories";
import type { LocationSlug } from "@/config/locations";
import type { MinorUnits } from "@/lib/money";

import type { MediaAsset } from "./media";
import type {
  ApplicationStatus,
  GalleryImageKind,
  StudioListingStatus,
  StudioVerificationStatus,
  UserRole,
} from "./models";

export interface AccountDTO {
  uid: string;
  email: string | null;
  displayName: string;
  phone: string | null;
  role: UserRole;
  studioId: string | null;
  createdAt: string | null;
}

export interface ApplicationDTO {
  applicantUid: string;
  applicantEmail: string | null;
  fullName: string;
  phone: string;
  businessName: string;
  city: LocationSlug;
  area: string;
  categories: CategorySlug[];
  description: string;
  yearsOfExperience: number;
  instagram: string | null;
  website: string | null;
  portfolioIntro: string;
  status: ApplicationStatus;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  rejectionReason: string | null;
}

/** Owner-dashboard view: public studio fields merged with private contact. */
export interface StudioDTO {
  id: string;
  slug: string;
  businessName: string;
  description: string;
  city: LocationSlug;
  area: string;
  address: string | null;
  phone: string;
  email: string | null;
  website: string | null;
  instagram: string | null;
  categories: CategorySlug[];
  yearsOfExperience: number | null;
  facilities: string[];
  props: string[];
  team: string | null;
  highlights: string | null;
  profileImage: MediaAsset | null;
  coverImage: MediaAsset | null;
  verificationStatus: StudioVerificationStatus;
  listingStatus: StudioListingStatus;
  startingPrice: MinorUnits | null;
  portfolioCount: number;
  updatedAt: string | null;
}

export interface PortfolioPhotoDTO {
  id: string;
  image: MediaAsset;
  category: CategorySlug | null;
  caption: string | null;
  sortOrder: number;
  isFeatured: boolean;
}

export interface GalleryImageDTO {
  id: string;
  kind: GalleryImageKind;
  image: MediaAsset;
  caption: string | null;
  sortOrder: number;
}

export interface PackageDTO {
  id: string;
  name: string;
  description: string;
  category: CategorySlug;
  /** Integer paisa. */
  price: MinorUnits;
  currency: "NPR";
  durationMinutes: number;
  editedPhotos: number;
  includes: string[];
  isActive: boolean;
  sortOrder: number;
}
