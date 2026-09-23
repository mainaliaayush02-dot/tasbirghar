import type { ComponentProps, ReactNode } from "react";

const control =
  "block rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 shadow-xs placeholder:text-neutral-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 disabled:bg-neutral-50 aria-invalid:border-red-400";

interface FieldProps {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: ReactNode;
  required?: boolean;
  children: ReactNode;
  className?: string;
}

export function Field({ label, htmlFor, error, hint, required, children, className = "" }: FieldProps) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-neutral-800">
        {label}
        {required && <span className="text-brand-600"> *</span>}
      </label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} className="text-sm text-red-600">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-neutral-500">{hint}</p>
      ) : null}
    </div>
  );
}

type WithError = { error?: string };

/** Full width unless the caller sets an explicit width (w-*, flex-1). */
const width = (className: string) => (/(^|\s)(w-|flex-1)/.test(className) ? "" : "w-full");

export function Input({ error, className = "", ...props }: ComponentProps<"input"> & WithError) {
  return (
    <input
      aria-invalid={error ? true : undefined}
      aria-describedby={error && props.id ? `${props.id}-error` : undefined}
      className={`${control} ${width(className)} h-10 ${className}`}
      {...props}
    />
  );
}

export function Textarea({ error, className = "", ...props }: ComponentProps<"textarea"> & WithError) {
  return (
    <textarea
      aria-invalid={error ? true : undefined}
      aria-describedby={error && props.id ? `${props.id}-error` : undefined}
      className={`${control} ${width(className)} min-h-24 ${className}`}
      {...props}
    />
  );
}

export function Select({ error, className = "", ...props }: ComponentProps<"select"> & WithError) {
  return (
    <select
      aria-invalid={error ? true : undefined}
      className={`${control} ${width(className)} h-10 ${className}`}
      {...props}
    />
  );
}

/** Multi-select as a chip grid of checkboxes. */
export function CheckboxChips<T extends string>({
  name,
  options,
  value,
  onChange,
}: {
  name: string;
  options: readonly { value: T; label: string }[];
  value: T[];
  onChange: (next: T[]) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="group">
      {options.map((opt) => {
        const checked = value.includes(opt.value);
        return (
          <label
            key={opt.value}
            className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm transition-colors has-focus-visible:outline-2 has-focus-visible:outline-brand-500 ${
              checked
                ? "border-brand-500 bg-brand-50 text-brand-700"
                : "border-neutral-300 text-neutral-700 hover:bg-neutral-50"
            }`}
          >
            <input
              type="checkbox"
              name={name}
              value={opt.value}
              checked={checked}
              onChange={() =>
                onChange(checked ? value.filter((v) => v !== opt.value) : [...value, opt.value])
              }
              className="sr-only"
            />
            {opt.label}
          </label>
        );
      })}
    </div>
  );
}
