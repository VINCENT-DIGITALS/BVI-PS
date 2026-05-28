import { Decimal, money, round2 } from "./money";
import type { PayFrequency } from "./types";

export const PERIODS_PER_YEAR: Record<PayFrequency, number> = {
  weekly: 52,
  biweekly: 26,
  semimonthly: 24,
  monthly: 12,
};

export function periodsPerYear(frequency: PayFrequency): number {
  return PERIODS_PER_YEAR[frequency];
}

/** Per-period base pay for a salaried employee from their annual salary. */
export function salaryPerPeriod(annualSalary: Decimal | number | string, frequency: PayFrequency): Decimal {
  return round2(money(annualSalary).dividedBy(periodsPerYear(frequency)));
}

/** Gross pay for hours worked at an hourly rate. */
export function hourlyPay(
  hours: Decimal | number | string,
  hourlyRate: Decimal | number | string,
): Decimal {
  return round2(money(hours).times(money(hourlyRate)));
}

/** Overtime pay = hours × rate × multiplier (multiplier from government_rules). */
export function overtimePay(
  overtimeHours: Decimal | number | string,
  hourlyRate: Decimal | number | string,
  multiplier: Decimal | number | string,
): Decimal {
  return round2(money(overtimeHours).times(money(hourlyRate)).times(money(multiplier)));
}
