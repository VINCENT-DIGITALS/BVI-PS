import { describe, expect, it } from "vitest";
import {
  computeContribution,
  computePayroll,
  computePayrollTax,
} from "@/lib/payroll";
import type {
  EmployeePayrollContext,
  PayrollComputationInput,
  ResolvedContributionRule,
  ResolvedPayrollTaxRule,
  ResolvedRules,
} from "@/lib/payroll";
import { money } from "@/lib/payroll";

// Effective-dated BVI rule values used across the engine tests. These mirror
// the resolved shape produced by resolveRules from the rule tables.
const payrollTaxRule: ResolvedPayrollTaxRule = {
  employeeRate: 0.08,
  employerClass1Rate: 0.02,
  employerClass2Rate: 0.06,
  annualExemption: 10000,
};

const socialSecurityRule: ResolvedContributionRule = {
  employeeRate: 0.04,
  employerRate: 0.045,
  annualInsurableCeiling: 43680,
};

const nhiRule: ResolvedContributionRule = {
  employeeRate: 0.0375,
  employerRate: 0.0375,
  annualInsurableCeiling: 43680,
};

const rules: ResolvedRules = {
  payrollTax: payrollTaxRule,
  socialSecurity: socialSecurityRule,
  nhi: nhiRule,
};

function makeEmployee(overrides: Partial<EmployeePayrollContext> = {}): EmployeePayrollContext {
  return {
    employeeId: "emp-1",
    payrollTaxClass: "class_1",
    subjectToPayrollTax: true,
    subjectToSocialSecurity: true,
    subjectToNHI: true,
    ytd: {
      payrollTaxableRemuneration: 10000,
      socialSecurityInsurable: 10000,
      nhiInsurable: 10000,
    },
    ...overrides,
  };
}

describe("computePayrollTax", () => {
  describe("Class 1 vs Class 2 employer rates", () => {
    it("applies the employee rate and the Class 1 employer rate when the exemption is used up", () => {
      const result = computePayrollTax({
        taxableRemuneration: money(5000),
        ytdRemuneration: money(10000),
        employerClass: "class_1",
        rule: payrollTaxRule,
      });

      expect(result.exemptApplied.toNumber()).toBe(0);
      expect(result.base.toNumber()).toBe(5000);
      expect(result.employee.toNumber()).toBe(400);
      expect(result.employer.toNumber()).toBe(100);
    });

    it("uses the higher Class 2 employer rate on the same base", () => {
      const result = computePayrollTax({
        taxableRemuneration: money(5000),
        ytdRemuneration: money(10000),
        employerClass: "class_2",
        rule: payrollTaxRule,
      });

      expect(result.base.toNumber()).toBe(5000);
      expect(result.employee.toNumber()).toBe(400);
      expect(result.employer.toNumber()).toBe(300);
    });
  });

  describe("annual exemption", () => {
    it("fully exempts the period when none of the annual exemption is consumed yet", () => {
      const result = computePayrollTax({
        taxableRemuneration: money(5000),
        ytdRemuneration: money(0),
        employerClass: "class_1",
        rule: payrollTaxRule,
      });

      expect(result.exemptApplied.toNumber()).toBe(5000);
      expect(result.base.toNumber()).toBe(0);
      expect(result.employee.toNumber()).toBe(0);
      expect(result.employer.toNumber()).toBe(0);
    });

    it("applies only the remaining exemption when it is partially consumed", () => {
      const result = computePayrollTax({
        taxableRemuneration: money(5000),
        ytdRemuneration: money(8000),
        employerClass: "class_1",
        rule: payrollTaxRule,
      });

      expect(result.exemptApplied.toNumber()).toBe(2000);
      expect(result.base.toNumber()).toBe(3000);
      expect(result.employee.toNumber()).toBe(240);
      expect(result.employer.toNumber()).toBe(60);
    });

    it("exempts nothing once the annual exemption is exhausted", () => {
      const result = computePayrollTax({
        taxableRemuneration: money(5000),
        ytdRemuneration: money(12000),
        employerClass: "class_1",
        rule: payrollTaxRule,
      });

      expect(result.exemptApplied.toNumber()).toBe(0);
      expect(result.base.toNumber()).toBe(5000);
      expect(result.employee.toNumber()).toBe(400);
    });
  });
});

describe("computeContribution", () => {
  it("uses the full insurable amount when below the annual ceiling", () => {
    const result = computeContribution({
      insurableThisPeriod: money(5000),
      ytdInsurable: money(0),
      rule: socialSecurityRule,
    });

    expect(result.base.toNumber()).toBe(5000);
    expect(result.cappedAmount.toNumber()).toBe(5000);
    expect(result.employee.toNumber()).toBe(200);
    expect(result.employer.toNumber()).toBe(225);
  });

  it("caps the base to the remaining room when crossing the ceiling mid-year", () => {
    const result = computeContribution({
      insurableThisPeriod: money(5000),
      ytdInsurable: money(43000),
      rule: socialSecurityRule,
    });

    // base reports the raw insurable; cappedAmount is the actually-charged base.
    expect(result.base.toNumber()).toBe(5000);
    expect(result.cappedAmount.toNumber()).toBe(680);
    expect(result.employee.toNumber()).toBe(27.2);
    expect(result.employer.toNumber()).toBe(30.6);
  });

  it("treats a null ceiling as uncapped", () => {
    const uncappedRule: ResolvedContributionRule = {
      employeeRate: 0.04,
      employerRate: 0.045,
      annualInsurableCeiling: null,
    };

    const result = computeContribution({
      insurableThisPeriod: money(5000),
      ytdInsurable: money(43000),
      rule: uncappedRule,
    });

    expect(result.cappedAmount.toNumber()).toBe(5000);
    expect(result.employee.toNumber()).toBe(200);
    expect(result.employer.toNumber()).toBe(225);
  });
});

describe("computePayroll (end-to-end)", () => {
  it("computes a monthly Class 1 run with all statutory levies applied", () => {
    const input: PayrollComputationInput = {
      employee: makeEmployee(),
      earnings: [{ code: "BASIC", category: "basic", amount: 5000 }],
      rules,
    };

    const result = computePayroll(input);

    expect(result.grossPay.toNumber()).toBe(5000);

    expect(result.payrollTax.employee.toNumber()).toBe(400);
    expect(result.payrollTax.employer.toNumber()).toBe(100);

    expect(result.socialSecurity.employee.toNumber()).toBe(200);
    expect(result.socialSecurity.employer.toNumber()).toBe(225);

    expect(result.nhi.employee.toNumber()).toBe(187.5);
    expect(result.nhi.employer.toNumber()).toBe(187.5);

    expect(result.totalStatutoryEmployee.toNumber()).toBe(787.5);
    expect(result.otherDeductions.toNumber()).toBe(0);
    expect(result.totalEmployeeDeductions.toNumber()).toBe(787.5);
    expect(result.netPay.toNumber()).toBe(4212.5);

    expect(result.totalEmployerContributions.toNumber()).toBe(512.5);
    expect(result.employerCost.toNumber()).toBe(5512.5);
  });

  it("adds other (non-statutory) deductions into the employee total and net pay", () => {
    const input: PayrollComputationInput = {
      employee: makeEmployee(),
      earnings: [{ code: "BASIC", category: "basic", amount: 5000 }],
      deductions: [{ code: "LOAN", category: "loan", amount: 250 }],
      rules,
    };

    const result = computePayroll(input);

    expect(result.otherDeductions.toNumber()).toBe(250);
    expect(result.totalStatutoryEmployee.toNumber()).toBe(787.5);
    expect(result.totalEmployeeDeductions.toNumber()).toBe(1037.5);
    expect(result.netPay.toNumber()).toBe(3962.5);
    // Employer cost is unaffected by employee-side deductions.
    expect(result.employerCost.toNumber()).toBe(5512.5);
  });
});

describe("taxability flags", () => {
  it("excludes an earning marked subjectToSocialSecurity:false from the SS base", () => {
    const input: PayrollComputationInput = {
      employee: makeEmployee(),
      earnings: [
        { code: "BASIC", category: "basic", amount: 5000 },
        {
          code: "BONUS",
          category: "bonus",
          amount: 1000,
          subjectToSocialSecurity: false,
        },
      ],
      rules,
    };

    const result = computePayroll(input);

    expect(result.grossPay.toNumber()).toBe(6000);
    // Social Security base ignores the excluded bonus: 5000 × .04 / .045.
    expect(result.socialSecurity.base.toNumber()).toBe(5000);
    expect(result.socialSecurity.cappedAmount.toNumber()).toBe(5000);
    expect(result.socialSecurity.employee.toNumber()).toBe(200);
    expect(result.socialSecurity.employer.toNumber()).toBe(225);
    // Payroll tax and NHI still see the full 6000.
    expect(result.payrollTax.base.toNumber()).toBe(6000);
    expect(result.nhi.base.toNumber()).toBe(6000);
  });

  it("zeroes payroll tax when the employee is not subject to it", () => {
    const input: PayrollComputationInput = {
      employee: makeEmployee({ subjectToPayrollTax: false }),
      earnings: [{ code: "BASIC", category: "basic", amount: 5000 }],
      rules,
    };

    const result = computePayroll(input);

    expect(result.payrollTax.base.toNumber()).toBe(0);
    expect(result.payrollTax.employee.toNumber()).toBe(0);
    expect(result.payrollTax.employer.toNumber()).toBe(0);
    // Other levies are unaffected.
    expect(result.socialSecurity.employee.toNumber()).toBe(200);
    expect(result.nhi.employee.toNumber()).toBe(187.5);
  });
});

describe("rounding", () => {
  it("rounds every monetary amount to two decimal places (HALF_UP)", () => {
    // 5125.55 × .0375 = 192.208125 -> 192.21 ; × .04 = 205.022 -> 205.02
    const input: PayrollComputationInput = {
      employee: makeEmployee(),
      earnings: [{ code: "BASIC", category: "basic", amount: 5125.55 }],
      rules,
    };

    const result = computePayroll(input);

    expect(result.grossPay.toNumber()).toBe(5125.55);
    expect(result.socialSecurity.employee.toNumber()).toBe(205.02);
    expect(result.nhi.employee.toNumber()).toBe(192.21);

    // Each reported value carries at most 2 decimal places.
    const twoDp = (n: number) => Number.isInteger(Math.round(n * 100));
    expect(twoDp(result.grossPay.toNumber())).toBe(true);
    expect(twoDp(result.netPay.toNumber())).toBe(true);
    expect(twoDp(result.payrollTax.employee.toNumber())).toBe(true);
    expect(twoDp(result.socialSecurity.employee.toNumber())).toBe(true);
    expect(twoDp(result.nhi.employee.toNumber())).toBe(true);
    expect(result.netPay.toDecimalPlaces(2).toNumber()).toBe(result.netPay.toNumber());
  });
});
