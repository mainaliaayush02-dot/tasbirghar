# TasbirGhar (तस्वीरघर)

A photography marketplace for Nepal: discover, compare and book newborn, maternity, baby, cake smash, family, couple and studio photographers across Kathmandu Valley.

**Stack:** Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · Firebase Auth + Firestore · Cloudinary · Vercel

Architecture, data model, money and commission model, and security notes are in **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**.

## Local setup

Requirements: Node.js 20.9 or later (22 LTS recommended) and npm.

```bash
git clone git@github.com:mainaliaayush02-dot/tasbirghar.git
cd tasbirghar
npm install
cp .env.example .env.local   # then fill in the values (see below)
npm run dev                  # http://localhost:3000
```

### Environment variables

| Variable | Where to find it |
| --- | --- |
| `NEXT_PUBLIC_FIREBASE_*` | Firebase console → Project settings → Your apps → Web app config |
| `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` | Cloudinary console → Dashboard |
| `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Cloudinary console → Settings → API Keys (**server only, never `NEXT_PUBLIC_`**) |
| `FIREBASE_ADMIN_PROJECT_ID`, `FIREBASE_ADMIN_CLIENT_EMAIL`, `FIREBASE_ADMIN_PRIVATE_KEY` | Firebase console → Project settings → Service accounts → Generate new private key (**server only**). Paste the key on one line with `\n` escapes, in double quotes. |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` locally, or the production domain on Vercel |
| `NEXT_PUBLIC_CONTACT_EMAIL` | Optional public support email shown on `/contact` |

Never commit `.env.local`. In production, set the same variables in Vercel → Project → Settings → Environment Variables.

### Test the Cloudinary upload (development only)

With the Cloudinary variables set, run `npm run dev` and open <http://localhost:3000/dev/cloudinary-test>. Pick an image and upload it. The server signs the upload, the browser sends the file directly to Cloudinary (`asset_folder: tasbirghar/dev-tests`), and the server confirms it. Check the returned `publicId`, `secureUrl`, `width`, `height`, `format` and `bytes`, along with the optimized preset URLs, then delete the test asset. The page and its API routes return 404 in production builds.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server (Turbopack) |
| `npm run build` | Production build and type check |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm run test:rules` | Firestore security rules tests (needs the Firestore emulator on 127.0.0.1:8080) |
| `npm run test:api` | API acceptance and security tests: auth, studios, media, marketplace, bookings and availability (needs the emulators and an emulator-wired app; see below) |
| `npm run test:unit` | Pure booking logic: status transition table and availability slot validation (no emulator needed) |
| `npm run admin:grant -- --email <email> --yes` | Grant the admin role to an existing user (add `--revoke` to remove it) |

## First admin

1. Sign up at `/signup` with the admin's email.
2. With the Firebase Admin credentials in `.env.local`, run `npm run admin:grant -- --email you@example.com --yes`.
3. Sign in again and open `/admin`.

There is intentionally no web endpoint that grants admin.

## Testing against emulators

The API tests never touch production Firebase. They use a `demo-` project on the emulators. Uploads go to Cloudinary and are deleted when the tests finish.

```bash
# terminal 1: emulators (Firestore 8080, Auth 9099)
npx firebase-tools emulators:start --only firestore,auth --project demo-tasbirghar

# terminal 2: app wired to the emulators
export NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo-tasbirghar FIREBASE_ADMIN_PROJECT_ID=demo-tasbirghar \
  NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
  FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 NEXT_PUBLIC_APP_URL=http://localhost:3124
npm run build && npx next start -p 3124

# terminal 3: same exports, then
npm run test:api
```

Rebuild without those variables before deploying, because `NEXT_PUBLIC_*` values are baked in at build time.

## Firestore rules

The rules are in `firestore.rules` and the tests in `tests/firestore-rules.test.mjs`. The Firebase CLI needs Java 21 or newer to run the emulator.

```bash
npx firebase-tools emulators:start --only firestore --project tasbirghar-f285b   # terminal 1
npm run test:rules                                                                 # terminal 2
npx firebase-tools deploy --only firestore:rules --project tasbirghar-f285b       # only after tests pass
```

## Project layout

```
src/app/            routes: (public), (customer)/account, (studio)/dashboard, (admin)/admin, api/
src/lib/firebase/   Firebase app, auth, firestore, optional analytics
src/lib/cloudinary/ server-only sign/confirm/delete + shared validation, folders, delivery URLs
src/lib/auth/       role (custom claim) model
src/lib/money.ts    integer (paisa) money and commission math
src/types/          Firestore data model and media types
src/config/         site, categories, locations, routes
docs/               architecture documentation
```
