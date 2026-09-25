/**
 * Display formatting shared by server and client. Dates render in Nepal time
 * (Asia/Kathmandu) regardless of server location.
 */
const TZ = "Asia/Kathmandu";

export function formatDate(iso: string | null | undefined, withTime = false): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    timeZone: TZ,
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31_536_000],
  ["month", 2_592_000],
  ["week", 604_800],
  ["day", 86_400],
  ["hour", 3_600],
  ["minute", 60],
];

export function timeAgo(iso: string, now: number = Date.now()): string {
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return "just now";
}

/** "Wednesday 24 September" in Nepal time. */
export function todayLabel(now: Date = new Date()): string {
  return now.toLocaleDateString("en-GB", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" });
}

/** "Good morning" etc. in Nepal time. */
export function greeting(now: Date = new Date()): string {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "numeric", hourCycle: "h23" }).format(now));
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/** "+9779812345678" → "+977 98•••••678" — enough to recognise, not to harvest. */
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return "—";
  const digits = phone.replace(/^\+977/, "");
  if (digits.length < 6) return "•••";
  return `+977 ${digits.slice(0, 2)}${"•".repeat(digits.length - 5)}${digits.slice(-3)}`;
}

/** "13:30" → "1:30 PM" (Nepal wall-clock times are stored as HH:mm). */
export function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/** "10:00", "11:00" → "10:00 AM – 11:00 AM". */
export function formatTimeRange(start: string, end: string): string {
  return `${formatTime(start)} – ${formatTime(end)}`;
}

/**
 * A calendar date ("YYYY-MM-DD", already Nepal-local) for display:
 * "Sat, 28 Sep 2026" (short) or "Saturday, 28 September 2026" (long).
 * Formatted in UTC so the stored date never shifts.
 */
export function formatDay(date: string, style: "short" | "long" = "short"): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", {
    timeZone: "UTC",
    weekday: style,
    day: "numeric",
    month: style,
    year: "numeric",
  });
}
