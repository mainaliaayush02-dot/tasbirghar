import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { UploadTester } from "./upload-tester";

export const metadata: Metadata = {
  title: "Cloudinary upload test (dev)",
  robots: { index: false, follow: false },
};

export default function CloudinaryTestPage() {
  if (process.env.NODE_ENV !== "development") notFound();

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-semibold">Cloudinary upload test</h1>
      <p className="mt-2 text-sm text-neutral-600">
        Development only. Uploads go to <code>tasbirghar/dev-tests/</code> through the
        server route; the API secret never reaches the browser.
      </p>
      <UploadTester />
    </main>
  );
}
