/**
 * Money handling. See docs/ARCHITECTURE.md → "Money & commission".
 *
 * - Amounts are integers in MINOR units (paisa; 1 NPR = 100 paisa). Never
 *   store or compute money as floating-point rupees.
 * - Rates are integers in BASIS POINTS (1 bp = 0.01%; 800 bp = 8%).
 * - Commission is rounded half-up to the nearest paisa, and the photographer
 *   net is derived by subtraction so gross === commission + net always holds.
 */

export const SUPPORTED_CURRENCIES = ["NPR"] as const;
export type Currency = (typeof SUPPORTED_CURRENCIES)[number];

/** Integer amount in minor units (paisa for NPR). */
export type MinorUnits = number;
/** Integer rate in basis points (800 = 8%). */
export type BasisPoints = number;

export const MINOR_UNITS_PER_MAJOR: Record<Currency, number> = { NPR: 100 };

export const DEFAULT_COMMISSION_RATE_BPS: BasisPoints = 800;

function assertSafeInteger(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative safe integer, got ${value}`);
  }
}

/** Convert a whole-rupee amount (e.g. from a price form) to paisa. */
export function toMinorUnits(major: number, currency: Currency = "NPR"): MinorUnits {
  const minor = Math.round(major * MINOR_UNITS_PER_MAJOR[currency]);
  assertSafeInteger(minor, "amount");
  return minor;
}

export interface CommissionBreakdown {
  grossAmount: MinorUnits;
  commissionRateBps: BasisPoints;
  commissionAmount: MinorUnits;
  photographerNetAmount: MinorUnits;
}

export function calculateCommission(
  grossAmount: MinorUnits,
  commissionRateBps: BasisPoints = DEFAULT_COMMISSION_RATE_BPS,
): CommissionBreakdown {
  assertSafeInteger(grossAmount, "grossAmount");
  assertSafeInteger(commissionRateBps, "commissionRateBps");
  if (commissionRateBps > 10_000) {
    throw new RangeError("commissionRateBps cannot exceed 10000 (100%)");
  }

  // Integer math with half-up rounding: floor((a * r + 5000) / 10000).
  // BigInt avoids overflow for very large amounts.
  const commissionAmount = Number(
    (BigInt(grossAmount) * BigInt(commissionRateBps) + BigInt(5_000)) / BigInt(10_000),
  );

  return {
    grossAmount,
    commissionRateBps,
    commissionAmount,
    photographerNetAmount: grossAmount - commissionAmount,
  };
}

/** Display formatting only — never parse this back into an amount. */
export function formatMoney(amount: MinorUnits, currency: Currency = "NPR"): string {
  const major = amount / MINOR_UNITS_PER_MAJOR[currency];
  const hasPaisa = amount % MINOR_UNITS_PER_MAJOR[currency] !== 0;
  return `Rs. ${major.toLocaleString("en-IN", {
    minimumFractionDigits: hasPaisa ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}
