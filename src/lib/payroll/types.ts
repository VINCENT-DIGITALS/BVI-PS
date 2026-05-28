import type { Decimal, Numeric } from "./money";

export type PayFrequency = "weekly" | "biweekly" | "semimonthly" | "monthly";
export type PayrollTaxClass = "class_1" | "class_2";

export type EarningCategory =
  | "basic"
  | "overtime"
  | "allowance"
  | "bonus"
  | "commission"
  | "holiday"
  | "leave"
  | "other";

export type DeductionCategory = "loan" | "advance" | "other";

export interface EarningInput {
  code: string;
  description?: string;
  category: EarningCategory;
  amount: Numeric;
  /** Defaults to true. Whether this earning counts toward payroll tax. */
  subjectToPayrollTax?: boolean;
  /** Defaults to true. Whether this earning is insurable for Social Security. */
  subjectToSocialSecurity?: boolean;
  /** Defaults to true. Whether this earning is insurable for NHI. */
  subjectToNHI?: boolean;
}

export interface DeductionInput {
  code: string;
  description?: string;
  category: DeductionCategory;
  amount: Numeric;
}

/** Year-to-date figures (BEFORE the current period) needed for exemptions/caps. */
export interface YearToDate {
  payrollTaxableRemuneration: Numeric;
  socialSecurityInsurable: Numeric;
  nhiInsurable: Numeric;
}

export interface EmployeePayrollContext {
  employeeId: string;
  /** Employer payroll-tax class, taken from the company. */
  payrollTaxClass: PayrollTaxClass;
  subjectToPayrollTax: boolean;
  subjectToSocialSecurity: boolean;
  subjectToNHI: boolean;
  ytd: YearToDate;
}

// --- Resolved (effective-dated) rule values, read from the database ----------
export interface ResolvedPayrollTaxRule {
  employeeRate: Numeric;
  employerClass1Rate: Numeric;
  employerClass2Rate: Numeric;
  annualExemption: Numeric;
}

export interface ResolvedContributionRule {
  employeeRate: Numeric;
  employerRate: Numeric;
  /** null = uncapped. */
  annualInsurableCeiling: Numeric;
}

export interface ResolvedRules {
  payrollTax: ResolvedPayrollTaxRule;
  socialSecurity: ResolvedContributionRule;
  nhi: ResolvedContributionRule;
}

// --- Results -----------------------------------------------------------------
export interface PayrollTaxResult {
  base: Decimal;
  exemptApplied: Decimal;
  employeeRate: Decimal;
  employerRate: Decimal;
  employee: Decimal;
  employer: Decimal;
}

export interface ContributionResult {
  base: Decimal;
  cappedAmount: Decimal;
  employee: Decimal;
  employer: Decimal;
}

export interface PayrollComputationInput {
  employee: EmployeePayrollContext;
  earnings: EarningInput[];
  deductions?: DeductionInput[];
  rules: ResolvedRules;
}

export interface PayrollComputationResult {
  grossPay: Decimal;
  payrollTax: PayrollTaxResult;
  socialSecurity: ContributionResult;
  nhi: ContributionResult;
  otherDeductions: Decimal;
  totalStatutoryEmployee: Decimal;
  totalEmployeeDeductions: Decimal;
  totalEmployerContributions: Decimal;
  netPay: Decimal;
  employerCost: Decimal;
}
