"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import { Button } from "./button";
import { Textarea } from "./field";

/**
 * Accessible confirmation dialog built on the native <dialog> element
 * (focus trap, Esc to close, inert background). Dangerous actions must go
 * through this — never a single accidental click.
 */
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel,
  tone = "primary",
  reason,
  onConfirm,
}: {
  trigger: (open: () => void) => ReactNode;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  tone?: "primary" | "danger";
  /** Optional free-text reason (e.g. shown to the applicant). */
  reason?: { label: string; required?: boolean; maxLength?: number };
  /** Return an error message to keep the dialog open, or nothing on success. */
  onConfirm: (reasonText: string) => Promise<string | void>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();
  const reasonId = useId();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  // State drives the native modal; the dialog's own "close" (Esc) syncs back.
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) dialog.showModal();
    if (!isOpen && dialog.open) dialog.close();
  }, [isOpen]);

  const open = () => {
    setText("");
    setError(null);
    setPending(false);
    setIsOpen(true);
  };
  const close = () => setIsOpen(false);

  async function confirm() {
    if (reason?.required && !text.trim()) {
      setError(`${reason.label} is required.`);
      return;
    }
    setPending(true);
    setError(null);
    const result = await onConfirm(text.trim());
    if (typeof result === "string") {
      setError(result);
      setPending(false);
      return;
    }
    close();
  }

  return (
    <>
      {trigger(open)}
      <dialog
        ref={ref}
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-neutral-200 bg-white p-0 text-neutral-900 shadow-xl backdrop:bg-ink/40 backdrop:backdrop-blur-[2px]"
        // Esc fires "cancel" synchronously; "close" arrives later (queued task).
        // Sync state on cancel, and ignore a late "close" if the dialog has
        // already been reopened — otherwise a quick re-open could be undone.
        onCancel={(e) => {
          if (pending) e.preventDefault();
          else setIsOpen(false);
        }}
        onClose={(e) => {
          if (!e.currentTarget.open) setIsOpen(false);
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget && !pending) close();
        }}
      >
        <div className="p-6">
          <h2 id={titleId} className="text-lg font-semibold">
            {title}
          </h2>
          <div id={descId} className="mt-2 text-sm text-neutral-600">
            {description}
          </div>
          {reason && (
            <div className="mt-4 space-y-1.5">
              <label htmlFor={reasonId} className="block text-sm font-medium text-neutral-800">
                {reason.label}
                {reason.required && <span className="text-brand-600"> *</span>}
              </label>
              <Textarea
                id={reasonId}
                rows={3}
                maxLength={reason.maxLength ?? 500}
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            </div>
          )}
          {error && (
            <p role="alert" className="mt-3 text-sm text-red-600">
              {error}
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-neutral-100 bg-neutral-50/60 px-6 py-4">
          <Button variant="ghost" onClick={close} disabled={pending} autoFocus>
            Cancel
          </Button>
          <Button variant={tone === "danger" ? "dangerSolid" : "primary"} loading={pending} onClick={confirm}>
            {confirmLabel}
          </Button>
        </div>
      </dialog>
    </>
  );
}
