"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { api } from "@/lib/client/api";
import { COMMENT_MAX, COMMENT_MIN, RATING_MAX } from "@/lib/reviews/rules";

const LABELS = ["", "Poor", "Fair", "Good", "Very good", "Excellent"];

/**
 * Review form for a completed booking. Sends only { rating, comment } — the
 * server derives everything else, re-validates, and enforces one review per
 * booking and the 60-day window.
 */
export function ReviewForm({ bookingId, studioName }: { bookingId: string; studioName: string }) {
  const router = useRouter();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const length = comment.trim().length;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const errors: Record<string, string> = {};
    if (!rating) errors.rating = "Choose a rating.";
    if (length < COMMENT_MIN) errors.comment = `Write at least ${COMMENT_MIN} characters.`;
    setFields(errors);
    if (Object.keys(errors).length) return;
    setPending(true);
    setError(null);
    const result = await api(`/api/bookings/${bookingId}/review`, { body: { rating, comment } });
    if (result.ok) {
      router.refresh();
      return;
    }
    setPending(false);
    setFields(result.fields);
    setError(result.message);
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4" aria-label={`Review ${studioName}`}>
      <fieldset>
        <legend className="text-sm font-medium text-neutral-900">Your rating</legend>
        <div className="mt-2 flex items-center gap-1" role="radiogroup" aria-label="Rating">
          {Array.from({ length: RATING_MAX }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={rating === n}
              aria-label={`${n} star${n === 1 ? "" : "s"} — ${LABELS[n]}`}
              data-rating={n}
              onClick={() => setRating(n)}
              className={`grid size-11 place-items-center rounded-full text-2xl transition-colors focus-visible:outline-2 focus-visible:outline-brand-500 ${
                n <= rating ? "text-brand-600" : "text-neutral-300 hover:text-brand-400"
              }`}
            >
              ★
            </button>
          ))}
          <span className="ml-2 text-sm text-neutral-600" aria-live="polite">
            {rating ? LABELS[rating] : ""}
          </span>
        </div>
        {fields.rating && <p className="mt-1 text-sm text-red-600">{fields.rating}</p>}
      </fieldset>
      <div>
        <label htmlFor="review-comment" className="text-sm font-medium text-neutral-900">
          Your review
        </label>
        <textarea
          id="review-comment"
          rows={5}
          maxLength={COMMENT_MAX}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          aria-invalid={fields.comment ? true : undefined}
          placeholder="How was the session? What would you tell another family?"
          className="mt-1.5 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none aria-invalid:border-red-400"
        />
        <div className="mt-1 flex justify-between text-xs text-neutral-500">
          <span className="text-red-600">{fields.comment}</span>
          <span>
            {length}/{COMMENT_MAX} {length < COMMENT_MIN && `(at least ${COMMENT_MIN})`}
          </span>
        </div>
      </div>
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={pending}>
          Submit review
        </Button>
        <p className="text-xs text-neutral-500">Reviews are checked by TasbirGhar before they appear, and can&apos;t be edited later.</p>
      </div>
    </form>
  );
}
