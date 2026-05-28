import { describe, expect, it } from "vitest";
import { pickEffective, resolveRules } from "@/lib/payroll";
import type { ContributionRuleRow, TaxRuleRow } from "@/lib/payroll/rules";

// A representative date used throughout; all windows are reasoned about relative
// to it. ISO YYYY-MM-DD strings compare correctly lexicographically.
const PAY_DATE = "2026-05-29";

const taxRows: TaxRuleRow[] = [
  // Old rule that expired before the pay date.
  {
    employee_rate: 0.05,
    employer_class1_rate: 0.01,
    employer_class2_rate: 0.04,
    annual_exemption: 8000,
    effective_from: "2020-01-01",
    effective_to: "2023-12-31",
  },
  // Current rule (open-ended).
  {
    employee_rate: 0.08,
    employer_class1_rate: 0.02,
    employer_class2_rate: 0.06,
    annual_exemption: 10000,
    effective_from: "2024-01-01",
    effective_to: null,
  },
];

const contributionRows: ContributionRuleRow[] = [
  {
    contribution_type: "social_security",
    employee_rate: 0.04,
    employer_rate: 0.045,
    annual_insurable_ceiling: 43680,
    effective_from: "2024-01-01",
    effective_to: null,
  },
  {
    contribution_type: "nhi",
    employee_rate: 0.0375,
    employer_rate: 0.0375,
    annual_insurable_ceiling: 43680,
    effective_from: "2024-01-01",
    effective_to: null,
  },
];

describe("pickEffective", () => {
  it("returns the rule whose window contains the date", () => {
    const picked = pickEffective(taxRows, PAY_DATE);
    expect(picked).not.toBeNull();
    expect(picked?.effective_from).toBe("2024-01-01");
    expect(picked?.annual_exemption).toBe(10000);
  });

  it("ignores rules whose effective_to is before the date", () => {
    // On a date inside the old window, the expired rule is the one in effect.
    const picked = pickEffective(taxRows, "2022-06-15");
    expect(picked?.effective_from).toBe("2020-01-01");
    expect(picked?.annual_exemption).toBe(8000);
  });

  it("excludes a date that falls after a closed window and before the next one", () => {
    // The old rule ended 2023-12-31; the new one starts 2024-01-01. No row
    // covers a date earlier than both windows.
    const picked = pickEffective(taxRows, "2019-12-31");
    expect(picked).toBeNull();
  });

  it("picks the latest effective_from when several windows overlap the date", () => {
    const overlapping: TaxRuleRow[] = [
      {
        employee_rate: 0.06,
        employer_class1_rate: 0.02,
        employer_class2_rate: 0.05,
        annual_exemption: 9000,
        effective_from: "2025-01-01",
        effective_to: null,
      },
      {
        employee_rate: 0.08,
        employer_class1_rate: 0.02,
        employer_class2_rate: 0.06,
        annual_exemption: 10000,
        effective_from: "2026-01-01",
        effective_to: null,
      },
    ];

    const picked = pickEffective(overlapping, PAY_DATE);
    expect(picked?.effective_from).toBe("2026-01-01");
    expect(picked?.annual_exemption).toBe(10000);
  });

  it("includes the boundary dates of an inclusive window", () => {
    expect(pickEffective(taxRows, "2024-01-01")?.effective_from).toBe("2024-01-01");
    expect(pickEffective(taxRows, "2023-12-31")?.effective_to).toBe("2023-12-31");
  });

  it("accepts a Date instance as the as-of argument", () => {
    const picked = pickEffective(taxRows, new Date("2026-05-29T12:00:00.000Z"));
    expect(picked?.effective_from).toBe("2024-01-01");
  });

  it("returns null for an empty rule set", () => {
    expect(pickEffective([], PAY_DATE)).toBeNull();
  });
});

describe("resolveRules", () => {
  it("maps DB columns to the resolved rule shape", () => {
    const resolved = resolveRules(taxRows, contributionRows, PAY_DATE);

    expect(resolved.payrollTax).toEqual({
      employeeRate: 0.08,
      employerClass1Rate: 0.02,
      employerClass2Rate: 0.06,
      annualExemption: 10000,
    });

    expect(resolved.socialSecurity).toEqual({
      employeeRate: 0.04,
      employerRate: 0.045,
      annualInsurableCeiling: 43680,
    });

    expect(resolved.nhi).toEqual({
      employeeRate: 0.0375,
      employerRate: 0.0375,
      annualInsurableCeiling: 43680,
    });
  });

  it("resolves each contribution by its contribution_type independently", () => {
    // Distinct ceilings prove SS and NHI are not crossed.
    const rows: ContributionRuleRow[] = [
      {
        contribution_type: "social_security",
        employee_rate: 0.04,
        employer_rate: 0.045,
        annual_insurable_ceiling: 43680,
        effective_from: "2024-01-01",
        effective_to: null,
      },
      {
        contribution_type: "nhi",
        employee_rate: 0.0375,
        employer_rate: 0.0375,
        annual_insurable_ceiling: null,
        effective_from: "2024-01-01",
        effective_to: null,
      },
    ];

    const resolved = resolveRules(taxRows, rows, PAY_DATE);
    expect(resolved.socialSecurity.annualInsurableCeiling).toBe(43680);
    expect(resolved.nhi.annualInsurableCeiling).toBeNull();
  });

  it("throws when the payroll tax rule is missing for the date", () => {
    expect(() => resolveRules([], contributionRows, PAY_DATE)).toThrow(/payroll tax/);
  });

  it("throws when the Social Security rule is missing for the date", () => {
    const onlyNhi = contributionRows.filter((r) => r.contribution_type === "nhi");
    expect(() => resolveRules(taxRows, onlyNhi, PAY_DATE)).toThrow(/Social Security/);
  });

  it("throws when the NHI rule is missing for the date", () => {
    const onlySs = contributionRows.filter((r) => r.contribution_type === "social_security");
    expect(() => resolveRules(taxRows, onlySs, PAY_DATE)).toThrow(/NHI/);
  });

  it("lists every missing rule and the offending date in the error", () => {
    expect(() => resolveRules([], [], PAY_DATE)).toThrow(
      /payroll tax, Social Security, NHI[\s\S]*2026-05-29/,
    );
  });

  it("throws when only an expired tax rule exists for the date", () => {
    const expiredOnly: TaxRuleRow[] = [taxRows[0]];
    expect(() => resolveRules(expiredOnly, contributionRows, PAY_DATE)).toThrow(/payroll tax/);
  });
});
