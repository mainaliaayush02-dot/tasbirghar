/**
 * Minimal, dependency-free input validation shared by API routes (the
 * authority) and forms (for matching limits / instant feedback).
 *
 * Every schema rejects unknown fields, so a client can never smuggle extra
 * properties (ownerId, commissionRateBps, role, ...) into a write.
 */

export type FieldErrors = Record<string, string>;

export type ValidationResult<T> =
  | { ok: true; data: T }
  | { ok: false; errors: FieldErrors };

type Rule<T> = (value: unknown, field: string) => { ok: true; value: T } | { ok: false; error: string };

export type Schema<T> = { [K in keyof T]-?: Rule<T[K]> };

export function validate<T>(schema: Schema<T>, input: unknown): ValidationResult<T> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { ok: false, errors: { _form: "Invalid request body." } };
  }
  const errors: FieldErrors = {};
  const data = {} as T;
  const body = input as Record<string, unknown>;

  for (const key of Object.keys(body)) {
    if (!(key in schema)) errors[key] = "Unexpected field.";
  }
  for (const key of Object.keys(schema) as (keyof T & string)[]) {
    const result = schema[key](body[key], key);
    if (result.ok) data[key] = result.value;
    else errors[key] = result.error;
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, data };
}

/* ------------------------------------------------------------------ rules */

const ok = <T>(value: T) => ({ ok: true as const, value });
const fail = (error: string) => ({ ok: false as const, error });

// Strip control characters (keep newlines/tabs for multi-line text).
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

interface TextOptions {
  min?: number;
  max: number;
  multiline?: boolean;
  pattern?: RegExp;
  patternMessage?: string;
}

function cleanText(value: string, multiline?: boolean) {
  const cleaned = value.replace(CONTROL_CHARS, "");
  return multiline
    ? cleaned.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim()
    : cleaned.replace(/\s+/g, " ").trim();
}

export function text(opts: TextOptions): Rule<string> {
  return (value) => {
    if (typeof value !== "string") return fail("Required.");
    const v = cleanText(value, opts.multiline);
    const min = opts.min ?? 1;
    if (v.length < min) return fail(min === 1 ? "Required." : `Must be at least ${min} characters.`);
    if (v.length > opts.max) return fail(`Must be at most ${opts.max} characters.`);
    if (opts.pattern && !opts.pattern.test(v)) return fail(opts.patternMessage ?? "Invalid format.");
    return ok(v);
  };
}

/** Optional text: missing/empty → null. */
export function optionalText(opts: TextOptions): Rule<string | null> {
  const rule = text({ ...opts, min: opts.min ?? 1 });
  return (value, field) => {
    if (value === undefined || value === null || (typeof value === "string" && !value.trim())) {
      return ok(null);
    }
    return rule(value, field);
  };
}

export function oneOf<T extends string>(values: readonly T[], message = "Invalid choice."): Rule<T> {
  return (value) =>
    typeof value === "string" && (values as readonly string[]).includes(value)
      ? ok(value as T)
      : fail(message);
}

export function listOf<T extends string>(
  values: readonly T[],
  { min = 0, max }: { min?: number; max: number },
): Rule<T[]> {
  return (value) => {
    if (!Array.isArray(value)) return fail("Must be a list.");
    const unique = [...new Set(value)];
    if (!unique.every((v) => typeof v === "string" && (values as readonly string[]).includes(v))) {
      return fail("Contains an invalid choice.");
    }
    if (unique.length < min) return fail(min === 1 ? "Choose at least one." : `Choose at least ${min}.`);
    if (unique.length > max) return fail(`Choose at most ${max}.`);
    return ok(unique as T[]);
  };
}

/** Free-text list (e.g. facilities): trimmed, de-duplicated, bounded. */
export function textList({ maxItems, maxLength }: { maxItems: number; maxLength: number }): Rule<string[]> {
  return (value) => {
    if (value === undefined || value === null) return ok([]);
    if (!Array.isArray(value) || !value.every((v) => typeof v === "string")) {
      return fail("Must be a list of text.");
    }
    const items = [...new Set(value.map((v: string) => cleanText(v)).filter(Boolean))];
    if (items.length > maxItems) return fail(`At most ${maxItems} items.`);
    if (items.some((v) => v.length > maxLength)) return fail(`Each item must be at most ${maxLength} characters.`);
    return ok(items);
  };
}

export function int({ min, max }: { min: number; max: number }): Rule<number> {
  return (value) => {
    const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
    if (typeof n !== "number" || !Number.isInteger(n)) return fail("Must be a whole number.");
    if (n < min || n > max) return fail(`Must be between ${min} and ${max}.`);
    return ok(n);
  };
}

export function optionalInt(opts: { min: number; max: number }): Rule<number | null> {
  const rule = int(opts);
  return (value, field) =>
    value === undefined || value === null || value === "" ? ok(null) : rule(value, field);
}

export function bool(): Rule<boolean> {
  return (value) => (typeof value === "boolean" ? ok(value) : fail("Must be true or false."));
}

/** http(s) URL, normalized; optional. */
export function optionalUrl(max = 200): Rule<string | null> {
  return (value) => {
    if (value === undefined || value === null || (typeof value === "string" && !value.trim())) {
      return ok(null);
    }
    if (typeof value !== "string" || value.length > max) return fail("Enter a valid URL.");
    const raw = value.trim();
    try {
      const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
      if (!["http:", "https:"].includes(url.protocol) || !url.hostname.includes(".")) {
        return fail("Enter a valid website URL.");
      }
      return ok(url.toString());
    } catch {
      return fail("Enter a valid website URL.");
    }
  };
}

/** Instagram handle or profile URL → normalized handle (without @). */
export function optionalInstagram(): Rule<string | null> {
  return (value) => {
    if (value === undefined || value === null || (typeof value === "string" && !value.trim())) {
      return ok(null);
    }
    if (typeof value !== "string") return fail("Enter an Instagram handle.");
    const handle = value
      .trim()
      .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
      .replace(/^@/, "")
      .replace(/[/?#].*$/, "");
    return /^[A-Za-z0-9._]{1,30}$/.test(handle) ? ok(handle) : fail("Enter a valid Instagram handle.");
  };
}

/**
 * Nepal phone numbers: mobiles (97/98 + 8 digits) and landlines
 * (0 + area code + number, 9–10 digits), with optional +977 / 977.
 * Normalized to digits with a "+977" prefix, e.g. "+9779812345678".
 */
export function normalizeNepalPhone(value: string): string | null {
  let digits = value.replace(/[\s\-().]/g, "");
  if (digits.startsWith("+977")) digits = digits.slice(4);
  else if (digits.startsWith("00977")) digits = digits.slice(5);
  else if (digits.startsWith("977") && digits.length > 10) digits = digits.slice(3);
  if (!/^\d+$/.test(digits)) return null;
  if (/^9[78]\d{8}$/.test(digits)) return `+977${digits}`;
  if (/^0?[1-9]\d{6,8}$/.test(digits)) return `+977${digits.replace(/^0/, "")}`;
  return null;
}

export function phone(): Rule<string> {
  return (value) => {
    if (typeof value !== "string" || !value.trim()) return fail("Required.");
    const normalized = normalizeNepalPhone(value);
    return normalized ? ok(normalized) : fail("Enter a valid Nepal phone number, e.g. 98XXXXXXXX.");
  };
}

export function optionalPhone(): Rule<string | null> {
  const rule = phone();
  return (value, field) =>
    value === undefined || value === null || (typeof value === "string" && !value.trim())
      ? ok(null)
      : rule(value, field);
}

export function email(): Rule<string | null> {
  return (value) => {
    if (value === undefined || value === null || (typeof value === "string" && !value.trim())) {
      return ok(null);
    }
    if (typeof value !== "string" || value.length > 254) return fail("Enter a valid email.");
    const v = value.trim().toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? ok(v) : fail("Enter a valid email.");
  };
}

/* ------------------------------------------------------------------ slugs */

const RESERVED_SLUGS = new Set([
  "admin", "api", "account", "dashboard", "login", "signup", "logout", "new", "edit",
  "search", "photographers", "categories", "locations", "tasbirghar", "studio", "studios",
  "settings", "help", "support", "about", "contact", "terms", "privacy",
]);

/** "Moon Baby Studio!" → "moon-baby-studio". */
export function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}

export function slug(): Rule<string> {
  return (value) => {
    if (typeof value !== "string") return fail("Required.");
    const s = slugify(value);
    if (s.length < 3) return fail("Use at least 3 letters or numbers.");
    if (RESERVED_SLUGS.has(s)) return fail("This URL is reserved. Choose another.");
    return ok(s);
  };
}
