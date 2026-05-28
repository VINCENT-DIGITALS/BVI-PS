import { Decimal, money, round2, sum } from "./money";
import { computePayrollTax } from "./bvi/payroll-tax";
import { computeContribution } from "./bvi/contribution";
import type { EarningInput, PayrollComputationInput, PayrollComputationResult } from "./types";

/** Sum the earnings that are subject to a given statutory levy. */
function statutoryBase(
  earnings: EarningInput[],
  flag: "subjectToPayrollTax" | "subjectToSocialSecurity" | "subjectToNHI",
  employeeOptedIn: boolean,
): Decimal {
  if (!employeeOptedIn) return new Decimal(0);
  return sum(earnings.filter((e) => e[flag] !== false).map((e) => e.amount));
}

/**
 * Computes one employee's pay for one period.
 *
 * Pipeline: gross → statutory bases → BVI payroll tax / Social Security / NHI →
 * other deductions → net pay and total employer cost. Every statutory figure
 * comes from the effective-dated `rules`; nothing is hardcoded.
 */
export function computePayroll(input: PayrollComputationInput): PayrollComputationResult {
  const { employee, earnings, deductions = [], rules } = input;

  const grossPay = round2(sum(earnings.map((e) => e.amount)));

  const payrollTax = computePayrollTax({
    taxableRemuneration: statutoryBase(earnings, "subjectToPayrollTax", employee.subjectToPayrollTax),
    ytdRemuneration: money(employee.ytd.payrollTaxableRemuneration),
    employerClass: employee.payrollTaxClass,
    rule: rules.payrollTax,
  });

  const socialSecurity = computeContribution({
    insurableThisPeriod: statutoryBase(
      earnings,
      "subjectToSocialSecurity",
      employee.subjectToSocialSecurity,
    ),
    ytdInsurable: money(employee.ytd.socialSecurityInsurable),
    rule: rules.socialSecurity,
  });

  const nhi = computeContribution({
    insurableThisPeriod: statutoryBase(earnings, "subjectToNHI", employee.subjectToNHI),
    ytdInsurable: money(employee.ytd.nhiInsurable),
    rule: rules.nhi,
  });

  const otherDeductions = round2(sum(deductions.map((d) => d.amount)));

  const totalStatutoryEmployee = round2(
    payrollTax.employee.plus(socialSecurity.employee).plus(nhi.employee),
  );
  const totalEmployeeDeductions = round2(totalStatutoryEmployee.plus(otherDeductions));
  const totalEmployerContributions = round2(
    payrollTax.employer.plus(socialSecurity.employer).plus(nhi.employer),
  );
  const netPay = round2(grossPay.minus(totalEmployeeDeductions));
  const employerCost = round2(grossPay.plus(totalEmployerContributions));

  return {
    grossPay,
    payrollTax,
    socialSecurity,
    nhi,
    otherDeductions,
    totalStatutoryEmployee,
    totalEmployeeDeductions,
    totalEmployerContributions,
    netPay,
    employerCost,
  };
}
