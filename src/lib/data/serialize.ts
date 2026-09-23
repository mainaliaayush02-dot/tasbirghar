import "server-only";

/** Firestore Timestamp (admin or client) → ISO string, for passing to Client Components. */
export function toIso(value: unknown): string | null {
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    return (value.toDate() as Date).toISOString();
  }
  return typeof value === "string" ? value : null;
}
