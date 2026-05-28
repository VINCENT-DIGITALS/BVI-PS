import { Decimal, clampNonNegative, min, money, round2 } from "../money";
import type { PayrollTaxClass, PayrollTaxResult, ResolvedPayrollTaxRule } from "../types";

export interface PayrollTaxInput {
  /** Payroll-taxable remuneration earned in THIS period. */
  taxableRemuneration: Decimal;
  /** Payroll-taxable remuneration earned earlier this year (for the exemption). */
  ytdRemuneration: Decimal;
  employerClass: PayrollTaxClass;
  rule: ResolvedPayrollTaxRule;
}

/**
 * BVI Payroll Tax.
 *
 *   • The employee always pays `employeeRate` (8% by default).
 *   • The employer pays a class-dependent rate (Class 1 vs Class 2).
 *   • The first `annualExemption` of each employee's annual remuneration is
 *     exempt; the exemption is consumed across the year, so we subtract the
 *     portion of this period that still falls under the threshold.
 *
 * No rates are hardcoded — they arrive via `rule` from the effective-dated
 * tax_rules table.
 */
export function computePayrollTax(input: PayrollTaxInput): PayrollTaxResult {
  const employeeRate = money(input.rule.employeeRate);
  const employerRate = money(
    input.employerClass === "class_1"
      ? input.rule.employerClass1Rate
      : input.rule.employerClass2Rate,
  );
  const annualExemption = money(input.rule.annualExemption);

  const remainingExemption = clampNonNegative(annualExemption.minus(input.ytdRemuneration));
  const exemptApplied = min(remainingExemption, input.taxableRemuneration);
  const base = clampNonNegative(input.taxableRemuneration.minus(exemptApplied));

  return {
    base,
    exemptApplied,
    employeeRate,
    employerRate,
    employee: round2(base.times(employeeRate)),
    employer: round2(base.times(employerRate)),
  };
}
