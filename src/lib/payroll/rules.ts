import type { ResolvedContributionRule, ResolvedPayrollTaxRule, ResolvedRules } from "./types";

export interface EffectiveDated {
  effective_from: string;
  effective_to?: string | null;
}

function toIsoDate(asOf: string | Date): string {
  return typeof asOf === "string" ? asOf.slice(0, 10) : asOf.toISOString().slice(0, 10);
}

/**
 * Picks the rule in effect on `asOf` — the latest one whose window contains the
 * date. ISO `YYYY-MM-DD` strings compare correctly lexicographically.
 */
export function pickEffective<T extends EffectiveDated>(rows: T[], asOf: string | Date): T | null {
  const date = toIsoDate(asOf);
  const inWindow = rows.filter(
    (r) => r.effective_from <= date && (!r.effective_to || r.effective_to >= date),
  );
  inWindow.sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1));
  return inWindow[0] ?? null;
}

// Shapes of the raw DB rows (subset of columns the engine needs).
export interface TaxRuleRow extends EffectiveDated {
  employee_rate: number | string;
  employer_class1_rate: number | string;
  employer_class2_rate: number | string;
  annual_exemption: number | string;
}

export interface ContributionRuleRow extends EffectiveDated {
  contribution_type: "social_security" | "nhi";
  employee_rate: number | string;
  employer_rate: number | string;
  annual_insurable_ceiling: number | string | null;
}

function toPayrollTaxRule(row: TaxRuleRow): ResolvedPayrollTaxRule {
  return {
    employeeRate: row.employee_rate,
    employerClass1Rate: row.employer_class1_rate,
    employerClass2Rate: row.employer_class2_rate,
    annualExemption: row.annual_exemption,
  };
}

function toContributionRule(row: ContributionRuleRow): ResolvedContributionRule {
  return {
    employeeRate: row.employee_rate,
    employerRate: row.employer_rate,
    annualInsurableCeiling: row.annual_insurable_ceiling,
  };
}

/**
 * Assembles the full set of rules in effect on `payDate` from raw DB rows.
 * Throws if any required statutory rule is missing for that date — payroll must
 * never silently run with an absent rate.
 */
export function resolveRules(
  taxRows: TaxRuleRow[],
  contributionRows: ContributionRuleRow[],
  payDate: string | Date,
): ResolvedRules {
  const tax = pickEffective(taxRows, payDate);
  const ss = pickEffective(
    contributionRows.filter((r) => r.contribution_type === "social_security"),
    payDate,
  );
  const nhi = pickEffective(
    contributionRows.filter((r) => r.contribution_type === "nhi"),
    payDate,
  );

  const missing: string[] = [];
  if (!tax) missing.push("payroll tax");
  if (!ss) missing.push("Social Security");
  if (!nhi) missing.push("NHI");
  if (missing.length) {
    throw new Error(
      `No effective ${missing.join(", ")} rule found for ${toIsoDate(payDate)}. ` +
        `Add the rule(s) to the rule tables before running payroll.`,
    );
  }

  return {
    payrollTax: toPayrollTaxRule(tax!),
    socialSecurity: toContributionRule(ss!),
    nhi: toContributionRule(nhi!),
  };
}
