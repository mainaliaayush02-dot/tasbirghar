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
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` locally, or the production domain on Vercel |

Never commit `.env.local`. In production, set the same variables in Vercel → Project → Settings → Environment Variables.

### Test the Cloudinary upload (development only)

With the Cloudinary variables set, run `npm run dev` and open <http://localhost:3000/dev/cloudinary-test>. Pick an image, upload it, and check the returned `publicId`, `url`, `width`, `height`, `format` and `bytes`, along with the optimized preset URLs. You can then delete the test asset. The page and its API route return 404 in production builds.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server (Turbopack) |
| `npm run build` | Production build and type check |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint |

## Firestore rules

The draft rules are in `firestore.rules`, and the project is set to `tasbirghar-f285b` in `.firebaserc`. After reviewing and testing them in the emulator, deploy with:

```bash
npx firebase-tools deploy --only firestore:rules
```

## Project layout

```
src/app/            routes: (public), (customer)/account, (studio)/dashboard, (admin)/admin, api/
src/lib/firebase/   Firebase app, auth, firestore, optional analytics
src/lib/cloudinary/ server-only upload/delete + shared validation, folders, delivery URLs
src/lib/money.ts    integer (paisa) money and commission math
src/types/          Firestore data model and media types
src/config/         site, categories, locations, routes
docs/               architecture documentation
```
