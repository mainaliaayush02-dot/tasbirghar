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
    cloudinary/        config, upload, delete (server-only), validation, folders, delivery (client-safe)
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

**Roles.** Roles are stored as a Firebase Auth **custom claim** `role` (`customer | photographer | admin`), and only server code using the Admin SDK can set it. `users/{uid}.role` mirrors the claim for the UI, but security rules and server code never trust that field.

---

## 3. Cloudinary responsibilities

Cloudinary stores every marketplace image: studio profile photos, portfolio, studio gallery, package, setup and prop images, and customer avatars.

| Module | Runs on | Purpose |
| --- | --- | --- |
| `cloudinary/config.ts` | server only | Configures the SDK from env (the secret lives only here) |
| `cloudinary/upload.ts` | server only | `uploadImage(validatedImage, { folder })` returns a `MediaAsset` |
| `cloudinary/delete.ts` | server only | `deleteImage(publicId)` (restricted to `tasbirghar/`) and `deleteImageQuietly` for replace flows |
| `cloudinary/validation.ts` | server | Size limit and magic-byte type sniffing |
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

Every upload gets a random UUID public ID inside its folder (`tasbirghar/studios/abc/portfolio/3f2c…`). The folder is always built with `studioMediaFolder()`, which rejects IDs that look like paths, and never from raw user input.

### What gets stored in Firestore

```ts
interface MediaAsset {
  publicId: string;   // required: used to delete, replace or re-transform
  url: string;        // original secure_url, for reference
  width?: number; height?: number; format?: string; bytes?: number; alt?: string;
}
```

**Replacing an image:** upload the new one, save the new `MediaAsset` to Firestore, then call `deleteImageQuietly(oldPublicId)`. A failed upload therefore never leaves a record pointing at a missing image. At worst an old asset is left orphaned, and a later cleanup job can remove it.

### Image delivery (optimization)

Originals stay in Cloudinary untouched. Every rendered URL is a transformed derivative with `f_auto,q_auto` (the best format and quality for each browser):

| Preset | Transform | Use |
| --- | --- | --- |
| `thumbnail` | 400×400 `c_fill,g_auto` | avatars, small tiles, admin tables |
| `card` | 800w, 4:3 `c_fill,g_auto` | listing and search cards |
| `gallery` | ≤1600w `c_limit` | portfolio grid, studio gallery |
| `full` | ≤2400w `c_limit` | lightbox |

`<CloudinaryImage>` passes a Cloudinary loader to `next/image`. Next.js produces the `srcset` and Cloudinary does the resizing, so each device downloads only the width it needs, capped at the preset's maximum. Next's own image optimizer is bypassed, which avoids double processing and Vercel image-optimization costs. Build Cloudinary URLs only through `cloudinaryUrl()` and never by hand.

### Upload validation

- Allowed types: JPEG, PNG, WEBP, AVIF. The type is detected from **magic bytes**. The file extension and browser MIME type are ignored because the client controls them.
- Maximum size: **10 MB** per image, which is also Cloudinary's free-plan per-image limit.
- Cloudinary re-checks the decoded format (`allowed_formats`) as a second layer of defense.
- Video, SVG (which can carry scripts), GIF and any other type is rejected with a clean `UNSUPPORTED_TYPE` (415) error.

### ⚠️ Upload size on Vercel

Vercel Functions reject request bodies larger than **4.5 MB**. Proxying uploads through a route handler, as the dev test does, therefore works locally for files up to 10 MB but fails on Vercel for files over 4.5 MB. Photographers' originals are often larger than that.

**Planned production flow (Phase 2): signed direct upload.**

1. The dashboard asks `POST /api/media/sign` for signed parameters. The server verifies the Firebase ID token and studio ownership, then signs `{ folder, public_id, allowed_formats, timestamp }` with the API secret.
2. The browser uploads directly to Cloudinary using those parameters. The secret is never sent to the browser, and a signature only covers the folder it was issued for.
3. The browser posts the resulting `public_id` to `POST /api/media/confirm`. The server fetches the asset's metadata from the Cloudinary Admin API, enforces the size and format limits (and deletes the asset if they're violated), then writes the `MediaAsset` to Firestore.

The validation, folder and delete modules are reused unchanged. Only the transport changes.

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
3. **Deny by default.** `firestore.rules` closes every path except those explicitly opened. Clients can never write bookings or reviews. Those writes go through server code using the Admin SDK, so prices, commission and review eligibility can't be tampered with. Owners can't change moderation fields (`listingStatus`, `verificationStatus`), `stats`, `commissionRateBps` or `ownerId`. Roles come from custom claims.
4. **No anonymous uploads.** The only upload endpoint today, `/api/dev/cloudinary-test`, returns 404 unless `NODE_ENV === "development"`, and writes only to `tasbirghar/dev-tests/`. Production upload endpoints must verify the Firebase ID token and studio ownership before signing or accepting an upload.
5. **Destructive media operations** are restricted to public IDs under `tasbirghar/` and are always authorized by the caller.
6. **Uploads are validated server-side** by magic bytes and size, with Cloudinary's `allowed_formats` as a second check.
7. **Private areas** are `noindex` and disallowed in robots. Auth gating comes in Phase 2.

The rules in `firestore.rules` are a **draft** and have not been deployed. Deploy them with `firebase deploy --only firestore:rules` after testing them in the Firebase emulator.
