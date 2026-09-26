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
    (auth)             /login, /signup (noindex)
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

Production endpoints are `/api/media/sign` and `/api/media/confirm`, plus `DELETE` on the portfolio or gallery item. They reuse the same library functions and add session verification, the photographer claim and a studio ownership check. The server derives the folder from the verified studio and target (`portfolio`, `gallery` + kind, `profile`, `cover`), never from client input. Confirm stores the record under the asset's UUID, so the same upload can't be recorded twice. A duplicate confirm is rejected without deleting the asset. The development-only test endpoints remain under `/api/dev/cloudinary-test`.

---

## 4. Firestore collection strategy

Documents stay small and bounded. Anything that grows without limit lives in a subcollection. Data that several parties query (bookings, reviews) is top-level.

```
users/{uid}                                 UserDoc
studios/{studioId}                          StudioDoc      (PUBLIC: profile, city/area, categories, denormalized stats/startingPrice)
studios/{studioId}/private/contact          StudioContactDoc  (phone, email, street address, website, instagram; owner + admin read)
studios/{studioId}/private/internal         StudioInternalDoc (ownerId, commissionRateBps, lastModeration; admin read)
studios/{studioId}/portfolio/{photoId}      PortfolioPhotoDoc
studios/{studioId}/gallery/{imageId}        GalleryImageDoc (kind: studio | setup | prop)
studios/{studioId}/packages/{packageId}     PackageDoc
studios/{studioId}/availability/{YYYY-MM-DD} AvailabilityDayDoc (one doc per day, bounded slots)
studioSlugs/{slug}                          { studioId }   (atomic slug uniqueness)
bookings/{bookingId}                        BookingDoc
reviews/{bookingId}                         ReviewDoc      (doc id = bookingId → one verified review per booking)
bookingLocks/{studioId}_{YYYY-MM-DD}        server-only lock serializing a studio-day's booking/availability writes
customerLocks/{uid}                         server-only lock serializing one customer's new requests (4B-1)
users/{uid}/notifications/{type}_{bookingId} in-app notification (4B-3): server-written, owner read-only
```

The full types are in `src/types/models.ts`. Collection names are in `src/lib/firestore/paths.ts`.

Design notes:

- **Public vs private studio data.** Once a studio is published, anyone can read `studios/{id}`, so it holds marketplace fields only: no owner uid, contact details, street address, commission or moderation state. Those live in two server-written sub-documents under `private/`. `contact` can be read by the owner (for the dashboard form) and by admins; `internal` is admin-only. Neither can be listed or written from the client. Server code treats `private/internal.ownerId` as the owner of record; the rules check ownership through `users/{uid}.studioId`, which only the server writes.

- **Search and filtering.** `StudioDoc` stores `categories[]`, `location.city` and `startingPrice` (the lowest active package price, maintained server-side). Listing pages can filter by category, location and budget with a single query on `studios`.
- **Package-level search.** `PackageDoc` repeats `studioId` and `category`, so a collection-group query on `packages` can answer "newborn packages under Rs. 20,000" across all studios. Composite indexes go in `firestore.indexes.json` as queries are added.
- **Availability.** One document per studio per day, with the date as the document ID. A day check is a single `get`, and a month view is one batched `getAll` of that month's day documents (see section 6a).
- **Bookings snapshot** the package and studio details at booking time, so editing a package later never changes past bookings.
- **Timestamps** use Firestore `Timestamp`. Shoot dates and times are stored as `"YYYY-MM-DD"` and `"HH:mm"` strings in `Asia/Kathmandu`, which avoids timezone drift for calendar dates.

---

### Composite indexes

Firestore builds single-field indexes automatically. Composite indexes are declared in `firestore.indexes.json` and deployed with `npx firebase-tools deploy --only firestore:indexes --project tasbirghar-f285b`. The emulator does **not** enforce indexes, so a query that passes locally can still fail in production with `FAILED_PRECONDITION`. Probe new query shapes against the live project, read-only, before release.

| Collection | Fields | Used by |
| --- | --- | --- |
| `bookings` | `bookingStatus` ↑, `commissionAmount` ↑, `grossAmount` ↑, `photographerNetAmount` ↑ | `getMarketplaceStats` (`/admin` money KPIs) and `getCommissionOverview` (`/admin/commission`) |

Every booking money aggregation goes through `MONEY_SUMS` in `src/lib/data/admin.ts`, which always sums the same three fields filtered on `bookingStatus` (`==` or `in`). That is why one index serves them all. Summing a different set of fields would require another index.

Every other admin query (a single equality filter, a single-field `orderBy`, `!=`, `in`, or `count()` with one filter) uses the automatic single-field indexes. All 47 query shapes were verified against the live project.

## 5. Authentication, roles and onboarding (Phase 2)

### Sessions

```
Browser (Firebase Auth, in-memory only)        Next.js server (Admin SDK)
  sign up / log in with email + password
  getIdToken() ───── POST /api/auth/session ──▶ verifyIdToken(checkRevoked) + auth_time ≤ 5 min
                                                createSessionCookie (5 days)
  ◀──────────── Set-Cookie: __session (httpOnly, SameSite=Lax, Secure in prod)
                                                first sign-in: create users/{uid} (uid + email from token)
  signOut() locally — the cookie is now the only session
  DELETE /api/auth/session ───────────────────▶ clear cookie (logout)
```

- **`getCurrentUser()`** (`src/lib/auth/current-user.ts`, memoized per request) verifies the session cookie, checking revocation, then loads the Firebase user so **custom claims are always current**. A role granted or revoked takes effect on the next request, with no need to sign in again.
- **`requireUser(area, path)`** is the authorization gate for pages. Signed-out users are sent to `/login?next=…`, a customer opening `/dashboard` is sent to `/become-a-photographer`, and non-admins get a 404 on `/admin`. API routes use **`requireApiUser(...roles)`**.
- **`src/proxy.ts`** only redirects obviously signed-out visitors (no cookie) away from private areas. It is **not** the security boundary.
- **CSRF:** the cookie is SameSite=Lax, and every mutating API request must also carry an `Origin` matching the host.
- The browser never writes Firestore directly. Every Phase 2 mutation goes through a validated API route using the Admin SDK. The deployed rules stay as defense in depth.

### Roles

| Role | How it is granted | Areas |
| --- | --- | --- |
| customer | Default (no claim) | `/account`, `/become-a-photographer` |
| photographer | An admin approves an application (`POST /api/admin/applications/{uid}`) | `/dashboard/*`, `/account` |
| admin | `npm run admin:grant` (local script with service-account credentials) | `/admin/*`, `/account` |

The custom claim `role` is authoritative. `users/{uid}.role` is only a mirror, and every code path that changes the claim updates the mirror at the same time.

### Photographer onboarding

1. **Apply.** A customer submits `/become-a-photographer`, which calls `POST /api/photographer-applications`. The server stores `photographerApplications/{uid}` with status `pending`, taking the applicant uid and email from the session. A customer can apply again only after a rejection.
2. **Review.** An admin opens `/admin/applications` and approves or rejects, which calls `POST /api/admin/applications/{uid}` (live `admin` claim required; admins can't review their own application). Approval:
   - sets the claim `role: "photographer"`
   - in one transaction, sets the application to `approved` with `approvedAt`/`approvedBy`, and sets the `users/{uid}.role` mirror to `photographer`
   - rolls the claim back if that transaction fails
3. **Create the studio.** The photographer submits `/dashboard/studio`, which calls `POST /api/studios`. In one transaction the server:
   - normalizes the slug and reserves `studioSlugs/{slug}`
   - creates the public `studios/{id}` with `listingStatus: "draft"`, `verificationStatus: "unverified"`, zeroed `stats` and no media
   - creates `studios/{id}/private/contact` (phone, email, street address, website, instagram) and `studios/{id}/private/internal` (`ownerId` taken from the session, `commissionRateBps: 800`, `lastModeration: null`)
   - sets `users/{uid}.studioId`

   The schema rejects `ownerId`, commission, status and media fields if the browser sends them. Later profile edits (`PUT /api/studios/{id}`) write the public fields and `private/contact` in one batch. MVP limit: one studio per photographer.
4. **Build the listing** in the dashboard: profile and cover images, portfolio, studio photos, and packages.

### Admin bootstrap (first admin)

There is no HTTP endpoint that grants admin.

1. The person who will be admin signs up normally at `/signup`.
2. On a machine that has the Firebase Admin service-account credentials in `.env.local`, run `npm run admin:grant -- --email you@example.com --yes`.
3. The script sets `role: "admin"`, updates the mirror, and revokes existing sessions. The admin then signs in again and opens `/admin`.

To remove admin, run `npm run admin:grant -- --email you@example.com --revoke --yes`.

### API routes

| Route | Who | Purpose |
| --- | --- | --- |
| `POST/DELETE /api/auth/session` | anyone with a fresh ID token / signed-in user | create the session (first login also creates `users/{uid}`); logout clears the cookie **and revokes the user's refresh tokens**, so a copied cookie also stops working (signs out every device) |
| `PATCH /api/account` | signed-in user | `displayName`, `phone` only |
| `POST /api/photographer-applications` | customer | submit an application |
| `POST /api/admin/applications/{uid}` | admin | approve or reject |
| `POST /api/admin/studios/{id}` | admin | moderation: `publish`, `unpublish`, `suspend` (reason required), `reinstate`, `verify`, `unverify` |
| `POST /api/admin/reviews/{id}` | admin | review visibility: `publish` / `hide` (reason required); text and rating are never editable |
| `POST /api/studios` | photographer | create own studio |
| `PUT /api/studios/{id}` | owner | update studio profile |
| `POST /api/media/sign` / `POST /api/media/confirm` | owner | signed direct upload; confirm writes the media record (portfolio, gallery, profile, cover) |
| `PATCH/DELETE /api/studios/{id}/{portfolio\|gallery}/{itemId}` | owner | caption, category, order, featured, or delete (deletes the asset too) |
| `POST /api/studios/{id}/packages`, `PUT/DELETE …/packages/{packageId}` | owner | packages (rupees in, integer paisa stored); keeps `startingPrice` in sync |
| `PUT/DELETE /api/studios/{id}/availability/{date}` | owner | set a day's custom slots or mark it unavailable / reset it to standard hours (Phase 4A) |
| `PUT/DELETE /api/studios/{id}/weekly-hours` | owner | set the studio's standard weekly hours / clear them back to the default (Phase 4B-4) |
| `PUT /api/studios/{id}/availability/bulk` | owner | apply one day schedule, or a reset, to up to 31 dates (Phase 4B-4) |
| `GET /api/studios/{id}/availability?month=&packageId=` / `?date=` | anyone (published studios) | bookable dates and free start times / one day's published open hours (never booking-derived) |
| `POST /api/bookings`, `POST /api/bookings/{id}` | customer / customer or owner | request a booking; status transitions |

Ownership is checked with `assertStudioOwner(studioId, sessionUid)`. Admins are **not** owners, so moderation will get its own routes.

### Owner console (`/admin`, Phase 2.1)

The owner is an ordinary Firebase Auth account that has been given the `admin` claim with `npm run admin:grant`. The console:

- **Screens:** dashboard KPIs and marketplace overview; applications; studios (filters, search, detail with portfolio, gallery, packages, availability and moderation); photographers; customers (masked phones); bookings; reviews; commission; read-only settings.
- **Authorization:** the `(admin)` layout calls `requireUser("admin")` before anything streams, so non-admins get a real 404. Every page and route re-checks the live claim.
- **Reads:** all through the Admin SDK in Server Components (`src/lib/data/admin.ts`). Counts and money totals use Firestore `count()` and `sum()` aggregations. List pages scan at most 500 recent documents and filter or search in memory, 20 per page. Replace this with a search index once collections grow.
- **Writes:** only the server routes above. Every moderation action writes `private/internal.lastModeration` (and `publishedAt` on the public doc when publishing) plus an append-only `studios/{id}/moderationLog` entry (who, when, why, from → to). Clients can neither read nor write either one, which the rules tests cover.
- **Publishing guard:** a studio needs a profile photo, at least one portfolio photo and one active package before it can be published.
- **Recent activity** is derived from existing timestamps (applications, users, studios, bookings), since there is no event log yet. It is labelled as such, and nothing is invented.
- **Missing records** (for example `/admin/studios/<unknown>`) render a not-found screen with a **200 status** and `noindex`. The pages stream behind `loading.tsx`, and Next.js commits the status before `notFound()` runs; see the Next docs, `loading.md` → Status Codes. The role check is unaffected.
- **Destructive actions** (reject, suspend, unpublish, hide) go through an accessible native `<dialog>` confirmation, and some require a reason.

### Validation

`src/lib/validation` is a small, dependency-free schema layer shared by routes (the authority) and forms (the same limits in the UI):
- **Unknown fields are rejected** (422), which is what stops `ownerId`, `commissionRateBps`, `role`, `status` and `image` from being smuggled in.
- **Text** has length limits and control characters are stripped.
- **Formats:** Nepal phone numbers are normalized to `+977…`; URLs must be http(s) and are normalized; Instagram handles are normalized.
- **Allowed values:** categories and cities come from `src/config`; slugs are normalized, with reserved words blocked.
- **Numbers:** prices are whole rupees from Rs. 500 to Rs. 10,00,000.
- **Other limits:** 64 KB maximum request body; up to 60 portfolio photos, 30 studio photos and 20 packages per studio.

### Route areas

| Area | Routes |
| --- | --- |
| `(public)` | `/` (later `/photographers`, `/categories/[category]`, `/locations/[location]`, `/search`) |
| `(auth)` | `/login`, `/signup` (noindex) |
| `(customer)` | `/account`, `/become-a-photographer` |
| `(studio)` | `/dashboard`, `/dashboard/studio`, `/portfolio`, `/gallery`, `/packages`, `/bookings`, `/availability`, `/availability/weekly`, `/verification` |
| `(admin)` | `/admin`, `/admin/applications[/uid]`, `/admin/studios[/id]`, `/admin/photographers`, `/admin/customers`, `/admin/bookings`, `/admin/reviews`, `/admin/commission`, `/admin/settings` |

---

## 6. Public marketplace & booking (Phase 3)

### Brand assets

The official logo is `public/brand/logo.png`: a 1254×1254 RGB lockup on cream `#fcf7f1`, moved byte-identical from the repository root. Every other rendition is an exact **crop or resize** of it; nothing is redrawn or recolored.

| File | What it is | Used in |
| --- | --- | --- |
| `public/brand/tasbirghar-mark.png` | the mark, padded square with the logo's own cream | header, admin, empty states |
| `public/brand/tasbirghar-wordmark.png` | the "TasbirGhar" wordmark | header (inline next to the mark), admin sidebar |
| `public/brand/tasbirghar-logo-lockup.png` | full lockup, margins trimmed | footer, auth pages, About, default Open Graph image |
| `src/app/favicon.ico` (16/32/48), `icon.png` (512), `apple-icon.png` (180) | the mark | App Router icon conventions |

The square lockup would be unreadably small at header height, so the header shows the original mark and wordmark side by side on the logo's exact cream, where the crops blend in. Design tokens (`--color-ink #302828`, `--color-brand-600 #b06038`, `--color-cream #fcf7f1`) were sampled from the logo. Headlines use Fraunces through `next/font`.

### Public routes

| Route | What |
| --- | --- |
| `/` | hero with search, categories, studios, featured portfolio, how it works, trust, photographer CTA |
| `/photographers` | discovery (search, category, location, sort; GET form, server-rendered) |
| `/photographers/[slug]` | canonical studio profile (portfolio lightbox, packages, studio photos, reviews, booking card) |
| `/photographers/[slug]/book` | booking request (sign-in required; noindex) |
| `/categories/[category]`, `/locations/[location]` | SEO landing pages |
| `/packages` | packages across studios, filter by category, sort by price |
| `/how-it-works`, `/about`, `/contact` | editorial pages (FAQ structured data on How it works) |
| `/studios/[slug]` → 308 to `/photographers/[slug]`; `/search` → `/photographers` | aliases |

The public header is **cookie-free**. The account area loads client-side from `GET /api/auth/session`, which returns display data only; authorization never depends on it. Signed-in customers get an account sub-navigation (Account · My bookings · Log out).

### Visibility and caching

- `src/lib/data/public.ts` is the only public read model. It returns studios with `listingStatus == "published"` **only**, and it reads only the public studio document, which by construction holds no phone, email, street address, owner uid, commission or moderation data (see section 4). It never reads `private/*`.
- Reads are cached with `unstable_cache` under the tag `marketplace`, with a 300-second safety revalidation. Every mutation that can change public data calls `invalidateMarketplace()` = `revalidateTag("marketplace", { expire: 0 })`, so the next request is fresh and never stale: moderation, studio edits, media confirm and delete, portfolio and gallery edits, package CRUD and review moderation. A suspended studio disappears from its page, the listings and the sitemap immediately, and this is covered by an API test.
- Public pages render per request (`force-dynamic`) from that cache, so `next build` never depends on Firestore.
- There is deliberately no `loading.tsx` on public routes. Streaming would commit a 200 before `notFound()`, and unknown or unpublished studio URLs must return a real 404.
- Listings and filters run in memory over at most 500 published studios, which is fine for the launch market. `/packages` reads each published studio's packages when the cache is refreshed. Move both to a search index as the catalogue grows. No new Firestore indexes were needed; a two-equality query such as `reviews` by studio and status is served by merging single-field indexes.

### Booking architecture

- **`POST /api/bookings`** is available to customer accounts only. The body carries intent only (studio, package, date, start time, contact, note); price, commission, payout, owner, end time and status are derived from Firestore, and the schema rejects them if sent.
- **Rules** (`src/lib/booking/rules.ts`, shared by server and form): dates run from tomorrow to 180 days ahead in Asia/Kathmandu; start times fall on 30-minute steps; active (window-holding) statuses are `pending` and `confirmed`; a customer may hold at most 5 open (pending, not expired) requests, counted inside the booking transaction (see section 6a).
- **The transaction** (`src/lib/booking/service.ts`):
  1. Read `bookingLocks/{studioId}_{date}`, `customerLocks/{uid}`, the day's availability doc, all bookings for that studio-day, the studio again, and the customer's pending requests. Refuse with 429 if 5 of those are still open (not expired).
  2. Reject if the studio is no longer published, the day is closed, the window is outside the open hours (published slots, or the default 07:00–20:00), or it overlaps a blocking booking (`pending`, `confirmed` or `completed`).
  3. Create the booking with `calculateCommission(packagePrice, internal.commissionRateBps ?? 800)` (read from `private/internal`, alongside the owner uid copied to `studioOwnerId`), then write both locks back.
  Because every booking write for a studio-day reads and writes the same lock document, Firestore serializes those transactions, so two concurrent requests can't both pass the overlap check. An API test fires 5 simultaneous requests for one slot and exactly one succeeds.
- **Availability narrows, bookings decide.** A studio's availability can close a day or restrict it to custom slots, but existing bookings are always the final authority for conflicts (section 6a).
- **Status changes, `POST /api/bookings/{id}`:** validated against the explicit transition table in `src/lib/booking/transitions.ts` (section 6a). Owners are verified against both `studioOwnerId` and the current `private/internal.ownerId`. Admins have no booking write path.
- **Pages:** `/account/bookings` and `/account/bookings/[id]` for customers (ownership-checked; no commission shown), `/dashboard/bookings` and `/dashboard/availability` for studios (with their payout and TasbirGhar's commission), `/admin/bookings` for the owner (read-only).
- **Not built yet:** online payment (eSewa or Khalti), payout processing, reviews submission and notifications. Bookings are requests confirmed by the studio. **No payment is taken online yet**, and customers are told so.

### SEO

- **Metadata:** `buildMetadata()` sets the title, description, canonical, Open Graph and Twitter data per page. Next.js replaces rather than merges a parent's `openGraph`, so each page sets an image: by default the official lockup, and for studios a Cloudinary 1200×630 crop of the cover image. Filtered or sorted listing views are `noindex` and canonicalize to the clean listing.
- **Structured data (JSON-LD, real data only):**
  - `Organization` and `WebSite` with a `SearchAction` (home)
  - `ProfessionalService` with `makesOffer` from packages, plus `aggregateRating` only when completed-booking reviews exist (studio pages)
  - `BreadcrumbList` (studio, category and location pages)
  - `FAQPage` (How it works)
- **Sitemap:** static pages, categories, locations and **published** studios only, with `lastModified`. `robots.txt` disallows the private areas, booking forms and auth pages, and blocks everything on preview deployments.

---

## 6a. Availability and the booking lifecycle (Phase 4A)

The core loop: the studio sets availability → the customer sees only free dates and times → requests a booking → the studio confirms or declines → the customer tracks the status → the studio marks the session completed.

### Availability model

`studios/{studioId}/availability/{YYYY-MM-DD}` (`AvailabilityDayDoc`), one per day, **written only by the server**:

| Day state | Stored as | Customers can book |
| --- | --- | --- |
| Standard hours | no document | the studio's weekly hours for that weekday (section 6d), or 7:00 AM – 8:00 PM (`DEFAULT_OPEN`–`DEFAULT_CLOSE`) if none are set |
| Custom time slots | `isClosed: false`, `slots: [{ start, end, status: "open", bookingId: null }]` | only inside one of the slots |
| Unavailable | `isClosed: true`, `slots: []` | nothing |

- A session must fit **inside one slot** (a 2-hour package cannot span two adjacent 1-hour slots). Candidate start times are every 30 minutes from the slot start.
- Slots are validated server-side by `slotsError` (`src/lib/booking/rules.ts`, also used by the editor for instant feedback): `HH:mm` on 30-minute steps, end after start (no zero-length), no overlaps or duplicates (adjacent is fine), at most 12 per day. The request schema rejects unknown keys, so a client can't write `status` or `bookingId` into a slot.
- Only dates from tomorrow to 180 days ahead (Nepal time) can be changed, the same window customers can book. Past dates are read-only.
- Slots never store booking information; bookings are read from `bookings` at request time.

### Owner editor (`/dashboard/availability`)

A month calendar (previous / current / next, up to the last bookable month) showing each day's state and colored dots for pending, confirmed and completed bookings, plus a day panel: standard hours / custom time slots (add, edit, delete) / unavailable, and the day's bookings. Selecting a day is a link (`?month=&date=`), so it works without JavaScript and is shareable.

Writes go to `PUT /api/studios/{id}/availability/{date}` `{ isClosed, slots }` or `DELETE` (back to standard hours), after `requireApiUser("photographer")` and `assertStudioOwner`. `setDayAvailability` (`service.ts`) runs **in a transaction on the same `bookingLocks/{studioId}_{date}` document as bookings** and refuses (409 `BOOKED_TIME`) any change that would leave a `pending` or `confirmed` booking outside the new open hours, including closing the day. The photographer must decline or cancel the booking first. So availability can never be used to strand a booking, and a booking can never slip in against a stale schedule.

### Customer booking flow

Studio → package → date → time → details → summary → submit (`/photographers/{slug}/book`, sign-in required, `noindex`, disallowed in robots).

- The calendar and times come from `GET /api/studios/{id}/availability?month=YYYY-MM&packageId=…`: it returns **only** bookable dates and the start times still free for that package's duration (`freeStartTimes`, which is the same test the booking transaction applies). It returns no booking IDs, names, statuses or busy windows. The first month is rendered server-side. The `?date=YYYY-MM-DD` mode returns only that day's published open hours (`isClosed`, `open`, `source`); it isn't derived from bookings at all.
- Dates with no free time are disabled; a date with none shows "No availability on this date".
- If someone else takes the time first, the POST returns 409 and the form shows "This time is no longer available. Please choose another time." and reloads the month.
- The request body is `studioId, packageId, shootDate, startTime, customerName, customerPhone, customerNote`. Price, commission, photographer net, owner, end time and status are derived server-side; any other field is rejected (422).

### Conflict rules and concurrency

- **Blocking statuses** (`BLOCKING_BOOKING_STATUSES`): `pending`, `confirmed`, `completed`. No new request may overlap them. `declined`, `cancelled_by_customer` and `cancelled_by_studio` free the window immediately.
- Every booking create, confirm, cancel, decline and availability edit for a studio-day reads and writes `bookingLocks/{studioId}_{date}` inside its transaction, so Firestore serializes them. Covered by API tests: two customers racing for one slot (exactly one wins), five racers (exactly one wins), and closing a day while a booking is being requested (exactly one of the two succeeds, never both).
- Confirming re-checks overlaps under the lock.
- **Open-request limit (Phase 4B-1).** A customer may hold at most 5 *open* requests (`pending` whose start time is still ahead). The count runs **inside** the booking transaction, which also reads and writes `customerLocks/{uid}` (server-only; rules deny all client access). Concurrent requests from one customer are therefore serialized. API test: 8 simultaneous requests from one customer create exactly 5, and a later burst creates none. Expired requests don't count.

### Status transitions (`src/lib/booking/transitions.ts`)

| From | Action | Who | To |
| --- | --- | --- | --- |
| `pending` | `confirm` (before the start time) | studio | `confirmed` |
| `pending` | `decline` (before the start time) | studio | `declined` |
| `pending` | `cancel` (before the start time) | customer | `cancelled_by_customer` |
| `confirmed` | `complete` (once the start time has passed) | studio | `completed` |
| `confirmed` | `studio_cancel` (any time) | studio | `cancelled_by_studio` |

Times are Nepal wall-clock (`nepalNowKey()` compared with `shootDate` + `startTime`). Everything else is refused: 409 for an invalid transition (`INVALID_TRANSITION`), for acting on an expired request (`EXPIRED`) or for completing too early (`NOT_YET`); 403 for the wrong actor; 404 for users unrelated to the booking.

**Expired requests (derived, Phase 4B-1).** A `pending` request whose start time has passed is *expired*. That comes only from its date and time: there's no `expired` status, no stored change and no background job. It stays stored as `pending` (history is untouched), nobody can confirm, decline or cancel it, it no longer counts toward the open-request limit, and dashboards show it as "Expired". A studio can still `studio_cancel` a confirmed booking at any time, to close a session that never took place (`no_show` remains reserved and unused). `completed`, `declined`, `cancelled_*` and `no_show` are final. The same table drives the buttons shown in the dashboards, and a unit test (`npm run test:unit`) checks every status × action × actor combination.

**Cancellation policy:** customers can cancel online **only while the request is pending**. Cancelling a *confirmed* booking needs a business policy (notice period, deposits or refunds once payments exist) that hasn't been decided, so for now the customer is pointed to TasbirGhar support and the studio can cancel a confirmed booking itself (`studio_cancel`). The studio has no reason field yet.

### Dashboards

Dashboards classify each booking by status **and** time (`bookingPhase` in `transitions.ts`): *upcoming* (pending or confirmed, start ahead), *needs completion* (confirmed, start passed), *expired* (pending, start passed) or *past* (final statuses).

- `/dashboard/bookings`: tabs All / Pending (open requests only) / Confirmed / Completed / Cancelled / Declined / Expired, with cards showing booking ID, customer, package, date, time, amount, status, requested date, and the studio's own payout and commission (existing Phase 3 behavior). Actions come from the transition table: Confirm/Decline (open requests), Mark completed (confirmed, once started) and Cancel booking (confirmed). Sessions needing completion are listed first, under a "to mark completed" prompt.
- `/dashboard`: a "Needs your attention" prompt counts open requests awaiting a reply and sessions to mark completed. These are derived from bookings; no reminder records are stored.
- `/account/bookings`: *Upcoming* (open requests and confirmed sessions still ahead, soonest first) and *History* (everything else, including "Request expired" and "Session time has passed"). Each card has a plain-language status, studio, package, date, time, price, booking ID and requested date. The detail page offers Cancel only for an open request.
- `/admin/bookings`: read-only; adds filter tabs for "Cancelled by studio" and "Declined", and labels expired requests "Expired".

### Permissions summary

| Actor | Availability | Bookings |
| --- | --- | --- |
| Customer | read (published studios) via API | create (API); read own; cancel own pending (API) |
| Studio owner | read own (rules + dashboard); write only via the owner API | read own studio's; confirm / decline / complete / cancel via API |
| Other photographer | no access to a draft studio's data; no writes | none |
| Admin | read; **no client writes** | read-only; no booking write path |
| Client SDK (anyone) | **no writes** (rules) | **no writes** (rules) |

### Known limitations (4A)

- Standard hours are a fixed 7:00 AM – 8:00 PM for days without a custom schedule; there are no weekly templates or bulk edits yet (each date is set individually).
- No notifications (email or SMS): customers and studios see changes when they open their pages.
- There's no customer cancellation of confirmed bookings (see the policy note above) and no reason text on declines or studio cancellations.
- `no_show` exists in the model but has no action yet (reserved).
- Expired requests and sessions awaiting completion are surfaced as dashboard prompts only; there are no scheduled reminders, email or SMS.
- `/dashboard/bookings` loads up to 300 bookings per studio in memory (fine at launch scale; paginate later).

---

## 6b. Reviews and ratings (Phase 4B-2)

**Model.** `reviews/{bookingId}`: the document id *is* the booking id, so a booking can have at most one review. Fields: `bookingId`, `studioId`, `customerId`, `customerDisplayName`, `rating` (1–5), `comment`, `status` (`pending_moderation` | `published` | `hidden`), `studioReply` (reserved; studio replies aren't built), `moderation` (last admin action: action, by, at, reason), timestamps. The booking gets `reviewedAt`, and the studio's `stats` gets `ratingSum` next to `reviewCount` and `ratingAverage`.

**Submitting (`POST /api/bookings/{bookingId}/review { rating, comment }`).** Customer role only. In one transaction the server:
- reads the booking, and refuses (404) if it doesn't exist or isn't the caller's, so no existence leak;
- refuses (403) if the caller owns the studio;
- requires `completed` status, no existing review or `reviewedAt`, and completion within **60 days** (`REVIEW_WINDOW_DAYS`);
- `tx.create`s the review and sets `booking.reviewedAt`.

Concurrent or repeated submissions therefore produce exactly one review; the rest get 409 `ALREADY_REVIEWED`. The body may contain only a JSON integer `rating` from 1–5 and a `comment` of 20–1,000 characters (`src/lib/reviews/rules.ts`). Everything else is derived server-side and any other field is rejected with 422: studio, customer, booking, display name, status and timestamps. The display name is privacy-safe: first name plus last initial from the account ("Anjali S."), with digits and symbols stripped. Pending, confirmed, cancelled, declined and expired bookings get 409 `NOT_COMPLETED`; after 60 days, 409 `REVIEW_WINDOW_CLOSED`.

**Customers can't edit or delete reviews.** There's no PUT, PATCH or DELETE (405); the page directs them to TasbirGhar support for corrections.

**Moderation (`POST /api/admin/reviews/{id}`, admin only).** New reviews start as `pending_moderation` and are never public until an admin publishes them.
- *Publish* works from pending or hidden.
- *Hide* ("Don't publish" for pending) needs a reason.
- Repeating the current state is refused (409 `NO_CHANGE`), so repeated or concurrent actions are idempotent.
- Rating and text are never editable.

**Rating accounting.** Only **published** reviews count. The same moderation transaction reads the studio and applies `applyReviewStatusChange`: crossing into published adds the rating to `ratingSum` and 1 to `reviewCount`, crossing out removes them, and anything else changes nothing. It then sets `ratingAverage` (2 decimals). Hiding and re-publishing therefore restores the totals exactly once. If the stored totals would go negative, the action is refused (409 `STATS_INCONSISTENT`) rather than written. `npm run ratings:recompute` rebuilds the expected totals from published reviews. It's **read-only by default**, and `--apply` is needed to write. A missing `ratingSum` on older studios is treated as average × count.

**Public output.** Studio pages read published reviews server-side and expose only rating, comment, display name and date (`PublicReview`: no ids, customer or moderation data). Firestore rules no longer allow public reads of review documents: only the review's own customer and admins can read them, and nobody can write them from the client.

**UI.**
- **Customer:** the bookings list shows a "ready for your review" prompt and a "Leave a review" link. The booking page shows the review form (stars plus text with a counter), then the review's status (waiting for moderation / published / not shown publicly), or a "window closed" note.
- **Admin:** the review queue (Awaiting moderation / Published / Hidden) offers Publish and Don't publish/Hide.

**Not built:** studio replies, notifications for new reviews (4B-3), review reminders beyond the dashboard prompt, and a moderation history (only the last action is stored, as before).

---

## 6c. In-app notifications (Phase 4B-3)

**Model.** `users/{uid}/notifications/{notificationId}`, one document per event. The id is **deterministic**: `{type}_{bookingId}` (e.g. `booking_confirmed_Ab12…`). Fields:
- `type`: a fixed enum;
- `bookingId`, `studioId`, and `reviewId` (for reviews; otherwise null);
- `data`: a validated display snapshot of `studioName`, `customerName` (privacy-safe, and only for studio recipients), `packageName`, `date` and `time`;
- `readAt` (null until read) and `createdAt`.

No title, message or link is stored: `renderNotification` (`src/lib/notifications/types.ts`) generates them from the type, and they're never accepted from a client.

**Events and recipients** (`NOTIFICATION_AUDIENCE`, `TRANSITION_NOTIFICATION`):

| Event | Type | Recipient | Opens |
| --- | --- | --- | --- |
| customer requests a booking | `booking_requested` | studio owner | `/dashboard/bookings?status=pending` |
| studio confirms | `booking_confirmed` | customer | `/account/bookings/{id}` |
| studio declines | `booking_declined` | customer | `/account/bookings/{id}` |
| customer cancels | `booking_cancelled_by_customer` | studio owner | `/dashboard/bookings?status=cancelled` |
| studio cancels | `booking_cancelled_by_studio` | customer | `/account/bookings/{id}` |
| studio completes | `booking_completed` | customer | `/account/bookings/{id}` |
| customer submits a review | `review_submitted` | studio owner | `/dashboard/bookings?status=completed` |

Expiry is derived (4B-1), so **no** notification is created because time passed. Reminders are dashboard prompts, not stored notifications.

**Transactional, exactly once.** `queueBookingNotification(tx, …)` (`src/lib/notifications/service.ts`) is called inside the same Firestore transaction as the booking create, the status change or the review submission. It uses `tx.create` on the deterministic id, and the recipient uid comes from the booking (`customerId` / `studioOwnerId`), never from a request. So:
- the event and its notification commit together or not at all (a refused or raced operation leaves nothing behind);
- retries and repeated or concurrent actions can't duplicate it: the transition table refuses a repeat, and the id is unique per event.

**Reading and marking read.**
- `GET /api/notifications`: the signed-in user's latest 30 (newest first), rendered, plus the unread count.
- `POST /api/notifications/read`: `{ ids: [...] }` (1–50 unique ids matching `{type}_{bookingId}`) or `{ all: true }` (up to 500 per call). The request is validated strictly, and any other field or both/neither form returns 422.

Both routes are scoped to `users/{sessionUid}/notifications`, so one user's ids never match another user's documents. Unknown ids are ignored and nothing is created. Marking read happens only through this API.

**Rules.** `match /users/{uid}/notifications/{id}`: `allow read: if isSelf(uid)` and `allow write: if false`. Other users, anonymous clients and admins can't read an inbox, and nobody can create, update or delete notifications from the client. All app reads go through the server anyway.

**Indexes.** None added. The list is `orderBy(createdAt)` and the unread count is `where(readAt == null)`, both single-field indexes on the subcollection.

**UI.**
- **Customers:** a bell with an unread badge in the account nav, and `/account/notifications`.
- **Photographers:** a bell in the dashboard header, a "Notifications" nav item, and `/dashboard/notifications`.
- Opening an item marks it read, then navigates. Each item has "Mark read", and there's "Mark all as read" and an empty state ("You're all caught up").
- **Admins have no stored notifications and no bell.** The admin nav shows derived badges instead (`adminAttention()`): pending applications and reviews awaiting moderation, from count queries.

**Limits.** No email, SMS or push. Old notifications aren't pruned (bounded by one per booking event). The page shows the latest 30.

## 6d. Weekly hours and bulk availability (Phase 4B-4)

**Model.** `studios/{id}.weeklyHours`: `{ sun … sat: { closed, slots: [{ start, end }] } }`, or absent/null for the default 7:00 AM – 8:00 PM every day. It lives on the public studio document because opening hours are public marketplace information. It is **server-written only**: the owner's client update allowlist doesn't include it, so rules needed no change (tests cover owner, other photographers, customers, admins and anonymous users).

**Which hours apply** (`effectiveHours(day, weekly, date)` in `rules.ts`, used by the booking transaction, both public availability views and the owner calendar):
1. a date-specific schedule (`availability/{date}`: unavailable, or its own slots);
2. otherwise the weekly hours for that weekday (`weekdayKey`: the date is already Nepal-local);
3. otherwise the default hours.

The public `?date=` view reports this as `source: "studio" | "weekly" | "default"`. It still returns only published hours, never anything derived from bookings.

**Setting weekly hours.** `PUT /api/studios/{id}/weekly-hours { days }` (all seven weekdays, each exactly `{ closed, slots }`, unknown keys rejected) or `DELETE` (back to the default). Both require `requireApiUser("photographer")`, `assertStudioOwner` and a same-origin request. `weeklyHoursError` applies the same slot rules as a single day (30-minute steps, end after start, no overlaps, at most 12), and a closed weekday can't have slots. `setWeeklyHours` then runs one transaction that:
- reads the studio doc and the studio's `pending`/`confirmed` bookings (`studioId ==` + `bookingStatus in`, which needs no composite index; verified read-only on live);
- keeps only upcoming ones (expired requests and past sessions have no hours to protect);
- reads those dates' day docs (`tx.getAll`), because a date with its own schedule doesn't depend on weekly hours;
- refuses with 409 `BOOKED_TIME`, naming up to 5 bookings, if any would fall outside the new hours (`strandedByWeekly`);
- otherwise writes `weeklyHours` with its slots sorted.

**Concurrency.** The booking transaction reads the studio doc, and `setWeeklyHours` writes it, so Firestore serializes a weekly change against booking requests. An API test races closing a weekday against a booking on it, four times: exactly one wins each round, and a booking is never stranded. Resetting one date to standard hours (`setDayAvailability`, `DELETE …/availability/{date}`) also reads the studio doc in its transaction, so the stranding check uses the current weekly hours.

**Bulk editing.** `PUT /api/studios/{id}/availability/bulk` takes `{ dates, hours: { isClosed, slots } }` or `{ dates, reset: true }` (exactly one of the two). There are 1–31 unique dates, and all must be real and editable (tomorrow … +180 days). Invalid hours or any non-editable date refuse the **whole** request with 422. Each date then goes through `setDayAvailability`, in its own transaction under that studio-day's `bookingLocks` document with the usual stranding check, using 4 concurrent workers. A conflict on one date doesn't affect the others. The response is `{ ok, saved, results: [{ date, ok, mode | code, message }] }`, sorted by date.

**UI.**
- `/dashboard/availability/weekly` has one row per weekday with an open/closed toggle and time slots. It includes "Copy {day}'s hours to every day", instant validation (Save is disabled while invalid), and "Use default hours" behind a confirmation dialog. A server refusal (for example `BOOKED_TIME`) is shown as-is.
- `/dashboard/availability` shows a "Weekly hours" summary card. On the calendar, weekly-closed days are dashed and labelled "Closed", and the day panel names the weekly hours with a link to change them.
- "Apply to more days" in the day panel picks dates of the month (or "All {weekday}s this month") and saves them in one bulk request. It reports "Saved N of M days" and names the dates it didn't change, which stay selected.

**Not built:** holiday calendars, recurring exceptions (for example "every other Friday") and per-package hours.

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

The platform default is `DEFAULT_COMMISSION_RATE_BPS = 800`. A negotiated per-studio rate can be set in `studios/{id}/private/internal.commissionRateBps` (server only; admins can read it). The rate in effect is **copied onto every booking**, so a later rate change never alters past bookings. Currency is `NPR` only for now (`SUPPORTED_CURRENCIES`).

---

## 8. Environment variables

| Variable | Exposure | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_FIREBASE_*` (7) | public | Firebase web config. It's designed to be public, and access is enforced by rules. |
| `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` | public | Appears in every delivery URL |
| `CLOUDINARY_API_KEY` | **server only** | Signed Cloudinary API calls |
| `CLOUDINARY_API_SECRET` | **server only** | Signed Cloudinary API calls. Never prefix it with `NEXT_PUBLIC_`. |
| `NEXT_PUBLIC_APP_URL` | public | Canonical URLs, `metadataBase`, sitemap and robots |

| `FIREBASE_ADMIN_PROJECT_ID`, `FIREBASE_ADMIN_CLIENT_EMAIL`, `FIREBASE_ADMIN_PRIVATE_KEY` | **server only** | Admin SDK service account (sessions, claims, trusted writes) |
| `FIREBASE_AUTH_EMULATOR_HOST`, `FIRESTORE_EMULATOR_HOST`, `NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST` | local testing only | Point the app at emulators. Never set these in production. |

Local values go in `.env.local`, which is gitignored. Production and preview values go in Vercel project settings. Only `.env.example` is committed.

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
3. **Deny by default.** `firestore.rules` closes every path except those explicitly opened. Clients can never write bookings or reviews. Those writes go through server code using the Admin SDK, so prices, commission and review eligibility can't be tampered with. Studios are **created only server-side**, because a client create could set its own `commissionRateBps` and the slug must be reserved atomically. Owners can't change moderation fields (`listingStatus`, `verificationStatus`), `stats`, `startingPrice` or `publishedAt`, and can't put contact fields (or a street address inside `location`) on the public doc. Owner id, commission, moderation state and contact details live in `studios/{id}/private/*`, which clients can never write. Roles come from custom claims, and clients can only ever write `role: "customer"`. **Media fields are server-written only.** These are `users.photo`, studio `profileImage`/`coverImage`, portfolio and gallery `image`, and package `images`. They're set by the media confirm step after the asset has been verified with Cloudinary. Portfolio and gallery docs are created server-side, and owners can edit only captions, order and category. A client therefore can't point a document at another studio's `publicId`.
4. **No anonymous uploads.** The only signing endpoint today, `/api/dev/cloudinary-test/sign`, returns 404 unless `NODE_ENV === "development"` (verified on a production build), and signs only for `tasbirghar/dev-tests/`. Production signing endpoints must verify the Firebase ID token and studio ownership before signing.
5. **Destructive media operations** are restricted to public IDs under `tasbirghar/` and are always authorized by the caller.
6. **Uploads are validated without trusting the browser.** Cloudinary enforces the signed `allowed_formats` on the decoded file, and the confirm step re-checks format, size and `asset_folder` from the Cloudinary Admin API.
7. **Private areas** are `noindex`, disallowed in robots, and gated server-side by `requireUser` and `requireApiUser` using live custom claims (see section 5).
8. **Sessions** are httpOnly cookies, not readable from JavaScript (verified in the browser test). Client Firebase Auth uses in-memory persistence only. ID tokens older than 5 minutes can't be exchanged for a session.

### Firestore rules: what clients may do

`firestore.rules` is deny-by-default and is covered by `tests/firestore-rules.test.mjs` (142 emulator tests). Client updates use **field allowlists**, so any field not listed is immutable from the client SDK.

| Actor | Allowed | Everything else |
| --- | --- | --- |
| Anyone (signed out) | Read published studios and their portfolio, gallery, packages and availability. `get` a single `studioSlugs/{slug}`. (Published reviews reach the public only through the server-rendered studio page, not Firestore.) | Denied, including draft studios, listing slugs and every `studios/{id}/private/*` doc |
| Signed-in user (customer) | Create own `users/{uid}` with `role: "customer"`, `studioId: null`, `photo: null`. Read own user doc and own `users/{uid}/notifications` (read-only). Update own `displayName`, `phone`, `updatedAt`. Read own bookings and own review documents. | Denied, including other customers' reviews (published or not) |
| Photographer (owner: `users/{uid}.studioId` equals the studio id) | `get` own `private/contact` (not `private/internal`). Update own studio: `businessName`, `description`, `location` (keys `city`, `area`, `geo` only), `categories`, `facilities`, `props`, `updatedAt`. Portfolio: update `caption`, `category`, `sortOrder`, `isFeatured`, or delete. Gallery: update `caption`, `sortOrder`, or delete. Packages: create with `images: []`, NPR and an integer price; update details and price; delete. Read own availability (writes go through the owner API since Phase 4A). Read bookings where `studioOwnerId` is the photographer's uid. | Denied, including every other studio |
| Admin (claim) | **Read** users, studios (including drafts) and their subcollections, `private/contact` and `private/internal` (single `get`), bookings and reviews. | **All client writes denied.** Admin mutations (moderation, commission, role grants) go through server routes using the Admin SDK. |
| Server (Admin SDK) | Everything, since it bypasses rules: studio creation and slug reservation, `private/contact` and `private/internal`, availability and weekly hours, statuses, commission, stats, `startingPrice`, all `MediaAsset` fields, portfolio and gallery creation, package images, role claims and mirror, bookings, reviews. | n/a |

Run the tests with a Firestore emulator running (`npx firebase-tools emulators:start --only firestore --project tasbirghar-f285b`), then `npm run test:rules`. Deploy with `npx firebase-tools deploy --only firestore:rules --project tasbirghar-f285b`, and only after the tests pass.

Notes for later phases:
- Availability is server-written since Phase 4A. Booking code still re-checks every conflict against `bookings` and never trusts a slot's `status`.
- `bookings.studioOwnerId` is denormalized for rules. Any future studio ownership transfer must update it, together with `private/internal.ownerId` and both users' `studioId`.
- Rules derive studio ownership from `users/{uid}.studioId` (one extra `get` per owner request). It is written only by the studio-creation transaction; clients must create it as `null` and cannot update it.
- The `users/{uid}.email` mirror is client-set at sign-up. Server code must use the email from the verified ID token.
- Field **types and sizes** for profile text aren't validated in rules. Phase 2 UI writes go through validated server routes, but an owner using the client SDK directly could still write oversized or odd values into the allowlisted fields of their **own** studio, such as `description` or `categories`. That affects only their own listing. Closing it means either removing those client-write allowances (the server now handles all writes) or adding type checks to the rules, which is a candidate for Phase 3.
