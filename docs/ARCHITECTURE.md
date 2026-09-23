# TasbirGhar architecture

TasbirGhar (तस्वीरघर) is a Booking.com-style photography marketplace for Nepal, launching in Kathmandu Valley. Customers find, compare and book photographers and studios. Studios manage their profiles, portfolios, packages and availability. TasbirGhar earns a commission on each successful booking.

This document covers the Phase 1 foundation: the stack, data model and security model that later features build on.

---

## 1. Stack

| Concern | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router, Turbopack), React 19, TypeScript (strict) |
| Styling | Tailwind CSS 4 |
| Auth | Firebase Authentication (modular Web SDK) |
| Database | Cloud Firestore (modular Web SDK; Admin SDK later for trusted writes) |
| Media | Cloudinary (upload, storage, transformation, CDN) |
| Hosting | Vercel |

**Not used:** Firebase Storage. The Firebase project is on the Spark plan, and all media goes to Cloudinary.

### Source layout

```
src/
  app/
    (public)/          indexable marketing and marketplace pages (/, /photographers, /categories/[category], ...)
    (customer)/account customer area, noindex
    (studio)/dashboard photographer/studio area, noindex
    (admin)/admin      admin area, noindex
    api/               route handlers (server only)
    dev/               development-only tools (404 in production)
    robots.ts, sitemap.ts
  components/          shared UI (media/CloudinaryImage, ...)
  config/              site, categories, locations, routes (single sources of truth)
  lib/
    env/               public.ts (NEXT_PUBLIC_*), server.ts (secrets, server-only)
    firebase/          client.ts (app), auth.ts, firestore.ts, analytics.ts (optional, browser-only)
    firestore/         collection path constants
    auth/              roles.ts (role claim model, area access)
    cloudinary/        config, signature, confirm, delete (server-only); validation, folders, delivery (shared)
    money.ts           integer money and commission math
    seo.ts             per-page metadata / canonical helper
  types/               models.ts (Firestore schema), media.ts
firestore.rules        draft security rules (deny by default)
```

Route groups (the `(name)` folders) don't show up in URLs. Each area gets its own layout, and later its own auth gate, without changing the public URL structure.

---

## 2. Firebase responsibilities

- **Authentication.** Customer and photographer sign-in. `getFirebaseAuth()` in `lib/firebase/auth.ts`.
- **Firestore.** All marketplace data. `getDb()` in `lib/firebase/firestore.ts`.
- **Analytics** (optional). `getFirebaseAnalytics()` runs only in the browser, is dynamically imported, and returns `null` on the server or in unsupported browsers. It isn't wired up yet.

The Firebase App is initialized lazily and as a singleton (`getApps()` check), so imports never throw at build time and hot reload doesn't create duplicate apps.

**Roles.** Roles are stored as a Firebase Auth **custom claim** `role` (`customer | photographer | admin`), and only server code using the Admin SDK can set it. Having no claim means `customer`. `src/lib/auth/roles.ts` defines the role list, `roleFromClaims()` and which roles may enter each area (`AREA_ROLES`). `users/{uid}.role` is a read-only mirror for the UI: the rules allow clients to create it only as `"customer"` and never to change it. Becoming a photographer happens through a server onboarding endpoint, which sets the claim and the mirror together.

---

## 3. Cloudinary responsibilities

Cloudinary stores every marketplace image: studio profile photos, portfolio, studio gallery, package, setup and prop images, and customer avatars.

| Module | Runs on | Purpose |
| --- | --- | --- |
| `cloudinary/config.ts` | server only | Configures the SDK from env (the secret lives only here) |
| `cloudinary/signature.ts` | server only | `signImageUpload({ folder })` returns signed params for a browser → Cloudinary direct upload |
| `cloudinary/confirm.ts` | server only | `confirmUploadedImage(publicId, { expectedFolder })` checks the stored asset and returns a `MediaAsset` |
| `cloudinary/delete.ts` | server only | `deleteImage(publicId)` (restricted to `tasbirghar/`) and `deleteImageQuietly` for replace flows |
| `cloudinary/validation.ts` | shared | Magic-byte sniffing and the browser pre-flight check (UX only) |
| `cloudinary/folders.ts` | shared | Folder builders and ID sanitization |
| `cloudinary/delivery.ts` | shared | Optimized delivery URLs and the `next/image` loader |
| `components/media/cloudinary-image.tsx` | client | Responsive `<CloudinaryImage asset preset sizes />` |

Server-only modules `import "server-only"`, so the build fails if one of them ever ends up in a client bundle.

### Media folder strategy

```
tasbirghar/
  studios/{studioId}/
    profile/     profile photo / logo
    portfolio/   portfolio photos
    studio/      studio interior / exterior
    packages/    package showcase images
    setups/      themed setups
    props/       props
  users/{userId}/avatar/
  dev-tests/     development upload test only
```

The Cloudinary environment (`db3gc28tp`) uses **Dynamic Folders**. Placement is set with the `asset_folder` upload parameter. The legacy `folder` parameter is never used. The server also chooses the `public_id`, a random UUID prefixed with the same path (`tasbirghar/studios/abc/portfolio/3f2c…`). In Dynamic Folders mode, the public ID and the folder are independent. The prefix lets server code check which area an ID belongs to (for example, delete is refused for anything outside `tasbirghar/`) without an API call. The folder is always built with `studioMediaFolder()` / `userAvatarFolder()`, which reject IDs that look like paths, and never from raw user input.

### What gets stored in Firestore

```ts
interface MediaAsset {
  publicId: string;   // required: used to delete, replace or re-transform
  secureUrl: string;  // original secure_url, for reference only (render via cloudinaryUrl)
  width?: number; height?: number; format?: string; bytes?: number; alt?: string;
}
```

Image binaries are never stored in Firestore, only this metadata.

**Replacing an image:** upload the new one, save the new `MediaAsset` to Firestore, then call `deleteImageQuietly(oldPublicId)`. A failed upload therefore never leaves a record pointing at a missing image. At worst an old asset is left orphaned, and a later cleanup job can remove it.

### Image delivery (optimization)

Originals stay in Cloudinary untouched. Every rendered URL is a transformed derivative with `f_auto,q_auto` (the best format and quality for each browser):

| Preset | Transform | Use |
| --- | --- | --- |
| `thumbnail` | 400×400 `c_fill,g_auto` | avatars, small tiles, admin tables |
| `card` | 800w, 4:3 `c_fill,g_auto` | listing and search cards |
| `gallery` | ≤1600w `c_limit` | portfolio grid, studio gallery |
| `full` | ≤2400w `c_limit` | lightbox |

Verified against the live account: with `f_auto`, browsers that accept WebP get WebP and others get JPEG. Cloudinary did not serve AVIF even when the request advertised AVIF support. It chooses whether to deliver AVIF based on account plan and settings, and no code change is needed if AVIF is enabled later.

`<CloudinaryImage>` passes a Cloudinary loader to `next/image`. Next.js produces the `srcset` and Cloudinary does the resizing, so each device downloads only the width it needs, capped at the preset's maximum. Next's own image optimizer is bypassed, which avoids double processing and Vercel image-optimization costs. Build Cloudinary URLs only through `cloudinaryUrl()` and never by hand.

### Upload flow: signed direct upload

File bytes never pass through a Next.js route. This avoids Vercel's 4.5 MB request-body limit and keeps function time low.

```
Browser                         Next.js server                         Cloudinary
  │ pre-flight check (UX only)
  │ 1. POST …/sign ────────────▶ authorize user → studio folder
  │                              sign {timestamp, public_id, asset_folder,
  │ ◀──────────── signed fields   allowed_formats, overwrite=false, tags}
  │ 2. POST file + fields ──────────────────────────────────────────────▶ verifies signature,
  │ ◀─────────────────────────────────────────────────── public_id, …    decodes & checks format
  │ 3. POST …/confirm {publicId} ▶ Admin API: read asset back, check
  │                              format, bytes ≤ 10 MB, asset_folder
  │                              (invalid → delete) → persist MediaAsset
  │ ◀──────────── MediaAsset
```

- **The secret stays on the server.** The browser receives only `api_key` and a SHA signature. The API key alone can't sign requests.
- **The signature is bound to its parameters.** Changing `asset_folder` or `public_id` gets `401 Invalid Signature` from Cloudinary; both were tested live. Signatures expire after one hour.
- **Types:** JPEG, PNG, WEBP, AVIF. Cloudinary enforces the signed `allowed_formats` against the decoded file, so a renamed PHP file is rejected with `400` (tested). SVG, GIF, video and everything else is refused.
- **Size:** 10 MB per image, which is also Cloudinary's free-plan limit. It's enforced in the confirm step from Cloudinary's own `bytes`, and oversized assets are deleted.
- **The browser pre-flight** (`preflightImageFile`: magic bytes and size) only gives instant feedback. It is not a security boundary.
- **Unconfirmed uploads**, where the browser uploads and never calls confirm, are possible. They're harmless orphans that nothing references. A periodic cleanup job can remove assets under `tasbirghar/` that have no Firestore reference.

In the dev test (`/dev/cloudinary-test`), the `sign`, `confirm` and `DELETE` endpoints live under `/api/dev/cloudinary-test`. Phase 2 production endpoints (`/api/media/sign`, `/api/media/confirm`, `DELETE /api/media`) reuse the same library functions and add Firebase ID-token verification and studio ownership checks.

---

## 4. Firestore collection strategy

Documents stay small and bounded. Anything that grows without limit lives in a subcollection. Data that several parties query (bookings, reviews) is top-level.

```
users/{uid}                                 UserDoc
studios/{studioId}                          StudioDoc      (profile, location, categories, denormalized stats/startingPrice)
studios/{studioId}/portfolio/{photoId}      PortfolioPhotoDoc
studios/{studioId}/gallery/{imageId}        GalleryImageDoc (kind: studio | setup | prop)
studios/{studioId}/packages/{packageId}     PackageDoc
studios/{studioId}/availability/{YYYY-MM-DD} AvailabilityDayDoc (one doc per day, bounded slots)
studioSlugs/{slug}                          { studioId }   (atomic slug uniqueness)
bookings/{bookingId}                        BookingDoc
reviews/{bookingId}                         ReviewDoc      (doc id = bookingId → one verified review per booking)
```

The full types are in `src/types/models.ts`. Collection names are in `src/lib/firestore/paths.ts`.

Design notes:

- **Search and filtering.** `StudioDoc` stores `categories[]`, `location.city` and `startingPrice` (the lowest active package price, maintained server-side). Listing pages can filter by category, location and budget with a single query on `studios`.
- **Package-level search.** `PackageDoc` repeats `studioId` and `category`, so a collection-group query on `packages` can answer "newborn packages under Rs. 20,000" across all studios. Composite indexes go in `firestore.indexes.json` as queries are added.
- **Availability.** One document per studio per day, with the date as the document ID. A day check is a single `get`, and a month view is a range query on the document ID.
- **Bookings snapshot** the package and studio details at booking time, so editing a package later never changes past bookings.
- **Timestamps** use Firestore `Timestamp`. Shoot dates and times are stored as `"YYYY-MM-DD"` and `"HH:mm"` strings in `Asia/Kathmandu`, which avoids timezone drift for calendar dates.

---

## 5. User roles and route areas

| Role | Area | Routes (planned) |
| --- | --- | --- |
| customer | `(customer)` | `/account`, `/account/bookings` |
| photographer | `(studio)` | `/dashboard`, `/dashboard/profile`, `/portfolio`, `/packages`, `/availability`, `/bookings` |
| admin | `(admin)` | `/admin`, `/admin/studios`, `/users`, `/bookings`, `/reviews` |
| public | `(public)` | `/`, `/photographers`, `/photographers/[slug]`, `/categories/[category]`, `/locations/[location]`, `/search` |

All paths come from `src/config/routes.ts`. The private areas are `noindex` and disallowed in `robots.txt`. They currently hold only placeholder pages. **Auth gating arrives in Phase 2**, planned as a Firebase session cookie (created server-side with the Admin SDK) checked in the group layouts and in route handlers.

---

## 6. Booking flow (future)

1. The customer picks a studio, package, date and slot. The slot must be `open` in `availability/{date}`.
2. The client calls `POST /api/bookings`. The server verifies the ID token, **loads the package price from Firestore** (the client never supplies a price), computes the commission, marks the slot `held`, and writes the booking with `bookingStatus: "pending"` in one transaction.
3. The studio confirms or declines. The slot becomes `booked` or is released back to `open`.
4. Payment (eSewa or Khalti, in a later phase) moves `paymentStatus` to `paid`.
5. After the shoot, the booking becomes `completed`, `payoutStatus` becomes `pending`, and the photographer is paid `photographerNetAmount`.
6. The customer can then leave one review (`reviews/{bookingId}`), which is verified by construction.

Statuses: `bookingStatus`, `paymentStatus` and `payoutStatus` are independent fields (see `models.ts`).

---

## 7. Money and commission model

**Decision: all amounts are integers in minor units (paisa, where 1 NPR = 100 paisa). Rates are integers in basis points.**

- `Rs. 15,000` is stored as `1500000`.
- An 8% commission is stored as `commissionRateBps: 800`.
- Commission is `round_half_up(gross × bps / 10000)`, computed with integer (BigInt) arithmetic.
- Net is `gross − commission`, obtained by subtraction, so `grossAmount === commissionAmount + photographerNetAmount` always holds. The platform and the photographer never disagree by a paisa.

Why paisa instead of whole rupees? Commission percentages such as 8% or 12.5% often produce fractional rupees. Nepali payment gateways (Khalti, for example) also take amounts in paisa. Floats are never used, because `0.1 + 0.2 !== 0.3`.

Example (the spec case), from `calculateCommission(1500000, 800)` in `src/lib/money.ts`:

| Field | Stored | Display |
| --- | --- | --- |
| grossAmount | 1500000 | Rs. 15,000 |
| commissionRateBps | 800 | 8% |
| commissionAmount | 120000 | Rs. 1,200 |
| photographerNetAmount | 1380000 | Rs. 13,800 |

The platform default is `DEFAULT_COMMISSION_RATE_BPS = 800`. A negotiated per-studio rate can be set in `StudioDoc.commissionRateBps` (admin or server only). The rate in effect is **copied onto every booking**, so a later rate change never alters past bookings. Currency is `NPR` only for now (`SUPPORTED_CURRENCIES`).

---

## 8. Environment variables

| Variable | Exposure | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_FIREBASE_*` (7) | public | Firebase web config. It's designed to be public, and access is enforced by rules. |
| `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` | public | Appears in every delivery URL |
| `CLOUDINARY_API_KEY` | **server only** | Signed Cloudinary API calls |
| `CLOUDINARY_API_SECRET` | **server only** | Signed Cloudinary API calls. Never prefix it with `NEXT_PUBLIC_`. |
| `NEXT_PUBLIC_APP_URL` | public | Canonical URLs, `metadataBase`, sitemap and robots |

Phase 2 will add Firebase Admin credentials (`FIREBASE_ADMIN_*`, server only). Local values go in `.env.local`, which is gitignored. Production and preview values go in Vercel project settings. Only `.env.example` is committed.

---

## 9. SEO foundation

- Public pages are Server Components and are statically rendered or server-rendered. The marketplace is not a client-only single-page app.
- The root layout sets `metadataBase` (from `NEXT_PUBLIC_APP_URL`), the title template `%s | TasbirGhar`, the default description, keywords, and Open Graph and Twitter defaults.
- `buildMetadata({ title, description, path })` in `lib/seo.ts` sets a canonical URL for each page.
- `robots.ts` disallows private prefixes and **disallows everything on Vercel preview deployments** (`VERCEL_ENV !== "production"`).
- `sitemap.ts` currently lists only the home page. Add category, location and published studio URLs as those pages ship, and use `generateSitemaps` once there are more than about 50k URLs. Thin placeholder pages are deliberately left out of the sitemap.
- Category and location slugs (`config/categories.ts`, `config/locations.ts`) are the permanent URL keys for pages such as `/categories/newborn` and `/locations/kathmandu`.

---

## 10. Security assumptions

1. **Secrets never reach the browser.** Only `NEXT_PUBLIC_*` values are inlined into client bundles. Cloudinary credentials are read only in `lib/env/server.ts` and `lib/cloudinary/config.ts`, both of which import `server-only`. The build output was scanned to confirm no Cloudinary secret or key strings appear in `.next/static`.
2. **Firebase web config is public by design.** Protection comes from Firestore rules, and later from App Check and restrictions on the API key.
3. **Deny by default.** `firestore.rules` closes every path except those explicitly opened. Clients can never write bookings or reviews. Those writes go through server code using the Admin SDK, so prices, commission and review eligibility can't be tampered with. Studios are **created only server-side**, because a client create could set its own `commissionRateBps` and the slug must be reserved atomically. Owners can't change moderation fields (`listingStatus`, `verificationStatus`), `stats`, `commissionRateBps`, `startingPrice` or `ownerId`. Roles come from custom claims, and clients can only ever write `role: "customer"`. **Media fields are server-written only.** These are `users.photo`, studio `profileImage`/`coverImage`, portfolio and gallery `image`, and package `images`. They're set by the media confirm step after the asset has been verified with Cloudinary. Portfolio and gallery docs are created server-side, and owners can edit only captions, order and category. A client therefore can't point a document at another studio's `publicId`.
4. **No anonymous uploads.** The only signing endpoint today, `/api/dev/cloudinary-test/sign`, returns 404 unless `NODE_ENV === "development"` (verified on a production build), and signs only for `tasbirghar/dev-tests/`. Production signing endpoints must verify the Firebase ID token and studio ownership before signing.
5. **Destructive media operations** are restricted to public IDs under `tasbirghar/` and are always authorized by the caller.
6. **Uploads are validated without trusting the browser.** Cloudinary enforces the signed `allowed_formats` on the decoded file, and the confirm step re-checks format, size and `asset_folder` from the Cloudinary Admin API.
7. **Private areas** are `noindex` and disallowed in robots. Auth gating comes in Phase 2.

### Firestore rules: what clients may do

`firestore.rules` is deny-by-default and is covered by `tests/firestore-rules.test.mjs` (86 emulator tests). Client updates use **field allowlists**, so any field not listed is immutable from the client SDK.

| Actor | Allowed | Everything else |
| --- | --- | --- |
| Anyone (signed out) | Read published studios and their portfolio, gallery, packages and availability. `get` a single `studioSlugs/{slug}`. Read published reviews. | Denied, including draft studios and listing slugs |
| Signed-in user (customer) | Create own `users/{uid}` with `role: "customer"`, `studioId: null`, `photo: null`. Read own user doc. Update own `displayName`, `phone`, `updatedAt`. Read own bookings and own reviews. | Denied |
| Photographer (claim, owner of the studio) | Update own studio: `businessName`, `description`, `phone`, `email`, `location`, `categories`, `facilities`, `props`, `updatedAt`. Portfolio: update `caption`, `category`, `sortOrder`, `isFeatured`, or delete. Gallery: update `caption`, `sortOrder`, or delete. Packages: create with `images: []`, NPR and an integer price; update details and price; delete. Availability: create, update `isClosed`/`slots`, delete. Read bookings where `studioOwnerId` is the photographer's uid. | Denied, including every other studio |
| Admin (claim) | **Read** users, studios (including drafts) and their subcollections, bookings and reviews. | **All client writes denied.** Admin mutations (moderation, commission, role grants) go through server routes using the Admin SDK. |
| Server (Admin SDK) | Everything, since it bypasses rules: studio creation and slug reservation, statuses, commission, stats, `startingPrice`, all `MediaAsset` fields, portfolio and gallery creation, package images, role claims and mirror, bookings, reviews. | n/a |

Run the tests with a Firestore emulator running (`npx firebase-tools emulators:start --only firestore --project tasbirghar-f285b`), then `npm run test:rules`. Deploy with `npx firebase-tools deploy --only firestore:rules --project tasbirghar-f285b`, and only after the tests pass.

Notes for later phases:
- Owners control availability `slots`. Booking code must re-check slot conflicts against `bookings` server-side and never trust a slot's `status`.
- `bookings.studioOwnerId` is denormalized for rules. Any future studio ownership transfer must update it.
- The `users/{uid}.email` mirror is client-set at sign-up. Server code must use the email from the verified ID token.
- Field **types and sizes** for profile text (for example `categories` values) aren't validated in rules yet. Validate them in the Phase 2 forms and server routes.
