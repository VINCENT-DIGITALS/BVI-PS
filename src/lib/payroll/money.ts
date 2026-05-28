import Decimal from "decimal.js";

/**
 * Decimal-safe money. Payroll must never use binary floating point, so every
 * monetary value flows through decimal.js. Amounts are USD (the BVI's currency)
 * with 2 decimal places; rates carry more precision until the final rounding.
 */
Decimal.set({ precision: 34, rounding: Decimal.ROUND_HALF_UP });

export type Numeric = number | string | Decimal | null | undefined;
export type Money = Decimal;

export function money(value: Numeric): Decimal {
  if (value === null || value === undefined || value === "") return new Decimal(0);
  return new Decimal(value);
}

/** Round to cents using banker-free HALF_UP, the convention used by payroll. */
export function round2(value: Numeric): Decimal {
  return money(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

export function sum(values: Numeric[]): Decimal {
  return values.reduce<Decimal>((acc, v) => acc.plus(money(v)), new Decimal(0));
}

/** max(0, value) — used when a remaining exemption/ceiling cannot go negative. */
export function clampNonNegative(value: Numeric): Decimal {
  const d = money(value);
  return d.isNegative() ? new Decimal(0) : d;
}

export function min(a: Numeric, b: Numeric): Decimal {
  const da = money(a);
  const db = money(b);
  return da.lessThan(db) ? da : db;
}

/** A 2dp number suitable for persisting to a NUMERIC(14,2) column. */
export function toAmount(value: Numeric): number {
  return round2(value).toNumber();
}

export function formatMoney(value: Numeric, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(round2(value).toNumber());
}

export { Decimal };
