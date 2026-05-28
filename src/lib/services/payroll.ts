import type { createClient } from "@/lib/supabase/server";
import {
  computePayroll,
  money,
  resolveRules,
  round2,
  salaryPerPeriod,
  type EarningInput,
  type PayFrequency,
  type ResolvedRules,
} from "@/lib/payroll";
import type { ContributionRuleRow, TaxRuleRow } from "@/lib/payroll";

/**
 * Server-side payroll service. Every function accepts the SupabaseClient created
 * by the caller (a Server Component, Route Handler or Server Action) so that RLS
 * runs under the authenticated session.
 *
 * All monetary arithmetic happens in the pure `@/lib/payroll` engine (decimal.js);
 * only the final, rounded `.toNumber()` results are persisted to the NUMERIC
 * columns. payroll_run_employees stores a JSONB snapshot of the inputs so a
 * finalized run can be reproduced even after employees or rules change.
 */

type DB = Awaited<ReturnType<typeof createClient>>;

/** Generate the current timestamp as an ISO-8601 string at runtime. */
function nowIso(): string {
  return new Date().toISOString();
}

/** Calendar year (UTC) of an ISO date string. */
function calendarYear(isoDate: string): number {
  return new Date(`${isoDate.slice(0, 10)}T00:00:00.000Z`).getUTCFullYear();
}

/**
 * Fetch the effective-dated statutory rules in force on `payDate` and resolve
 * them via the pure engine. Throws (and lets the error propagate) when a
 * required rule is missing for that date.
 */
export async function getEffectiveRules(supabase: DB, payDate: string): Promise<ResolvedRules> {
  const { data: taxRows, error: taxError } = await supabase
    .from("tax_rules")
    .select(
      "employee_rate, employer_class1_rate, employer_class2_rate, annual_exemption, effective_from, effective_to",
    )
    .eq("jurisdiction", "BVI");
  if (taxError) throw new Error(taxError.message);

  const { data: contribRows, error: contribError } = await supabase
    .from("contribution_rules")
    .select(
      "contribution_type, employee_rate, employer_rate, annual_insurable_ceiling, effective_from, effective_to",
    )
    .eq("jurisdiction", "BVI");
  if (contribError) throw new Error(contribError.message);

  return resolveRules(
    (taxRows ?? []) as unknown as TaxRuleRow[],
    (contribRows ?? []) as unknown as ContributionRuleRow[],
    payDate,
  );
}

export interface GeneratePayrollRunArgs {
  companyId: string;
  name: string;
  pay_frequency: PayFrequency;
  period_start: string;
  period_end: string;
  pay_date: string;
  createdBy: string;
}

interface EmployeeRow {
  id: string;
  employee_number: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  pay_type: "salaried" | "hourly";
  pay_frequency: PayFrequency;
  annual_salary: number | string | null;
  hourly_rate: number | string | null;
  standard_hours_per_period: number | string | null;
  subject_to_payroll_tax: boolean;
  subject_to_social_security: boolean;
  subject_to_nhi: boolean;
}

/**
 * Build a complete draft payroll run for every active employee on the run's pay
 * frequency: computes pay, persists the run + line items, and caches run totals.
 * Returns the new payroll_runs id.
 */
export async function generatePayrollRun(
  supabase: DB,
  args: GeneratePayrollRunArgs,
): Promise<string> {
  const { companyId, name, pay_frequency, period_start, period_end, pay_date, createdBy } = args;

  // 1) company payroll-tax class.
  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("payroll_tax_class")
    .eq("id", companyId)
    .single();
  if (companyError) throw new Error(companyError.message);
  if (!company) throw new Error("Company not found.");
  const payrollTaxClass = (company as { payroll_tax_class: "class_1" | "class_2" })
    .payroll_tax_class;

  // 2) effective statutory rules.
  const rules = await getEffectiveRules(supabase, pay_date);

  // 3) create the draft run.
  const { data: runRow, error: runError } = await supabase
    .from("payroll_runs")
    .insert({
      company_id: companyId,
      name,
      pay_frequency,
      period_start,
      period_end,
      pay_date,
      status: "draft",
      employee_count: 0,
      total_gross: 0,
      total_employee_deductions: 0,
      total_employer_contributions: 0,
      total_net: 0,
      total_employer_cost: 0,
      created_by: createdBy,
    })
    .select("id")
    .single();
  if (runError) throw new Error(runError.message);
  const runId = (runRow as { id: string }).id;

  // 4) active employees on this run's frequency.
  const { data: employeeRows, error: employeesError } = await supabase
    .from("employees")
    .select(
      "id, employee_number, first_name, middle_name, last_name, pay_type, pay_frequency, annual_salary, hourly_rate, standard_hours_per_period, subject_to_payroll_tax, subject_to_social_security, subject_to_nhi",
    )
    .eq("company_id", companyId)
    .eq("status", "active")
    .eq("pay_frequency", pay_frequency);
  if (employeesError) throw new Error(employeesError.message);
  const employees = (employeeRows ?? []) as unknown as EmployeeRow[];

  const runYear = calendarYear(pay_date);

  let totalGross = round2(0);
  let totalEmployeeDeductions = round2(0);
  let totalEmployerContributions = round2(0);
  let totalNet = round2(0);
  let totalEmployerCost = round2(0);
  let employeeCount = 0;

  for (const emp of employees) {
    // 5) YTD gross from prior finalized runs in the same calendar year.
    const { data: priorRows, error: priorError } = await supabase
      .from("payroll_run_employees")
      .select("gross_pay, payroll_runs!inner(status, pay_date, company_id)")
      .eq("company_id", companyId)
      .eq("employee_id", emp.id)
      .in("payroll_runs.status", ["approved", "locked", "paid"]);
    if (priorError) throw new Error(priorError.message);

    let ytdGross = round2(0);
    for (const row of (priorRows ?? []) as unknown as {
      gross_pay: number | string;
      payroll_runs: { pay_date: string } | null;
    }[]) {
      const priorPayDate = row.payroll_runs?.pay_date;
      if (priorPayDate && calendarYear(priorPayDate) === runYear) {
        ytdGross = round2(ytdGross.plus(money(row.gross_pay)));
      }
    }
    const ytdGrossNumber = ytdGross.toNumber();

    // 6) base earning.
    const baseAmount =
      emp.pay_type === "salaried"
        ? salaryPerPeriod(money(emp.annual_salary), pay_frequency)
        : round2(money(emp.hourly_rate).times(money(emp.standard_hours_per_period)));

    const earnings: EarningInput[] = [
      {
        code: "BASIC",
        description: "Basic pay",
        category: "basic",
        amount: baseAmount.toNumber(),
        subjectToPayrollTax: true,
        subjectToSocialSecurity: true,
        subjectToNHI: true,
      },
    ];

    // 7) compute.
    const result = computePayroll({
      employee: {
        employeeId: emp.id,
        payrollTaxClass,
        subjectToPayrollTax: emp.subject_to_payroll_tax,
        subjectToSocialSecurity: emp.subject_to_social_security,
        subjectToNHI: emp.subject_to_nhi,
        ytd: {
          // Documented approximation: prior gross is assumed to have been fully
          // taxable and fully insurable for both contribution schemes.
          payrollTaxableRemuneration: ytdGrossNumber,
          socialSecurityInsurable: ytdGrossNumber,
          nhiInsurable: ytdGrossNumber,
        },
      },
      earnings,
      rules,
    });

    // 8) persist the run-employee line.
    const snapshot = {
      earnings,
      ytdGross: ytdGrossNumber,
      payrollTax: {
        base: result.payrollTax.base.toNumber(),
        exemptApplied: result.payrollTax.exemptApplied.toNumber(),
        employee: result.payrollTax.employee.toNumber(),
        employer: result.payrollTax.employer.toNumber(),
      },
      socialSecurity: {
        base: result.socialSecurity.base.toNumber(),
        employee: result.socialSecurity.employee.toNumber(),
        employer: result.socialSecurity.employer.toNumber(),
      },
      nhi: {
        base: result.nhi.base.toNumber(),
        employee: result.nhi.employee.toNumber(),
        employer: result.nhi.employer.toNumber(),
      },
    };

    const { data: reRow, error: reError } = await supabase
      .from("payroll_run_employees")
      .insert({
        company_id: companyId,
        payroll_run_id: runId,
        employee_id: emp.id,
        gross_pay: result.grossPay.toNumber(),
        total_earnings: result.grossPay.toNumber(),
        total_deductions: result.totalEmployeeDeductions.toNumber(),
        total_employer_contributions: result.totalEmployerContributions.toNumber(),
        net_pay: result.netPay.toNumber(),
        employer_cost: result.employerCost.toNumber(),
        worked_hours: 0,
        overtime_hours: 0,
        snapshot,
      })
      .select("id")
      .single();
    if (reError) throw new Error(reError.message);
    const reId = (reRow as { id: string }).id;

    // 9) earnings rows.
    const { error: earningsError } = await supabase.from("payroll_earnings").insert({
      company_id: companyId,
      run_employee_id: reId,
      category: "basic",
      code: "BASIC",
      description: "Basic pay",
      amount: baseAmount.toNumber(),
      is_taxable: true,
      subject_to_social_security: true,
      subject_to_nhi: true,
    });
    if (earningsError) throw new Error(earningsError.message);

    // 10) statutory employee deductions (only positive amounts).
    const deductionInserts = [
      {
        category: "payroll_tax" as const,
        code: "PAYROLL_TAX",
        description: "Payroll Tax (employee)",
        amount: result.payrollTax.employee.toNumber(),
      },
      {
        category: "social_security" as const,
        code: "SOCIAL_SECURITY",
        description: "Social Security (employee)",
        amount: result.socialSecurity.employee.toNumber(),
      },
      {
        category: "nhi" as const,
        code: "NHI",
        description: "National Health Insurance (employee)",
        amount: result.nhi.employee.toNumber(),
      },
    ]
      .filter((d) => d.amount > 0)
      .map((d) => ({
        company_id: companyId,
        run_employee_id: reId,
        category: d.category,
        code: d.code,
        description: d.description,
        amount: d.amount,
        is_statutory: true,
      }));
    if (deductionInserts.length) {
      const { error: deductionsError } = await supabase
        .from("payroll_deductions")
        .insert(deductionInserts);
      if (deductionsError) throw new Error(deductionsError.message);
    }

    // 11) employer contributions (only positive amounts).
    const contributionInserts = [
      {
        category: "payroll_tax" as const,
        code: "PAYROLL_TAX",
        description: "Payroll Tax (employer)",
        amount: result.payrollTax.employer.toNumber(),
      },
      {
        category: "social_security" as const,
        code: "SOCIAL_SECURITY",
        description: "Social Security (employer)",
        amount: result.socialSecurity.employer.toNumber(),
      },
      {
        category: "nhi" as const,
        code: "NHI",
        description: "National Health Insurance (employer)",
        amount: result.nhi.employer.toNumber(),
      },
    ]
      .filter((c) => c.amount > 0)
      .map((c) => ({
        company_id: companyId,
        run_employee_id: reId,
        category: c.category,
        code: c.code,
        description: c.description,
        amount: c.amount,
      }));
    if (contributionInserts.length) {
      const { error: contributionsError } = await supabase
        .from("payroll_employer_contributions")
        .insert(contributionInserts);
      if (contributionsError) throw new Error(contributionsError.message);
    }

    // accumulate run totals.
    totalGross = round2(totalGross.plus(result.grossPay));
    totalEmployeeDeductions = round2(
      totalEmployeeDeductions.plus(result.totalEmployeeDeductions),
    );
    totalEmployerContributions = round2(
      totalEmployerContributions.plus(result.totalEmployerContributions),
    );
    totalNet = round2(totalNet.plus(result.netPay));
    totalEmployerCost = round2(totalEmployerCost.plus(result.employerCost));
    employeeCount += 1;
  }

  // finalize cached totals on the run.
  const { error: updateError } = await supabase
    .from("payroll_runs")
    .update({
      employee_count: employeeCount,
      total_gross: totalGross.toNumber(),
      total_employee_deductions: totalEmployeeDeductions.toNumber(),
      total_employer_contributions: totalEmployerContributions.toNumber(),
      total_net: totalNet.toNumber(),
      total_employer_cost: totalEmployerCost.toNumber(),
    })
    .eq("id", runId);
  if (updateError) throw new Error(updateError.message);

  return runId;
}

/** Approve a draft run. DB triggers enforce the legal transition. */
export async function approveRun(supabase: DB, runId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from("payroll_runs")
    .update({ status: "approved", approved_by: userId, approved_at: nowIso() })
    .eq("id", runId);
  if (error) throw new Error(error.message);
}

/** Lock an approved run, freezing its financial fields and line items. */
export async function lockRun(supabase: DB, runId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from("payroll_runs")
    .update({ status: "locked", locked_by: userId, locked_at: nowIso() })
    .eq("id", runId);
  if (error) throw new Error(error.message);
}

/** Mark a locked run as paid (fully immutable thereafter). */
export async function markRunPaid(supabase: DB, runId: string): Promise<void> {
  const { error } = await supabase
    .from("payroll_runs")
    .update({ status: "paid", paid_at: nowIso() })
    .eq("id", runId);
  if (error) throw new Error(error.message);
}

interface PayslipSourceRow {
  id: string;
  employee_id: string;
  gross_pay: number | string;
  total_deductions: number | string;
  net_pay: number | string;
  snapshot: unknown;
  employees: {
    employee_number: string;
    first_name: string;
    middle_name: string | null;
    last_name: string;
  } | null;
  payroll_earnings: {
    category: string;
    code: string | null;
    description: string | null;
    amount: number | string;
  }[];
  payroll_deductions: {
    category: string;
    code: string | null;
    description: string | null;
    amount: number | string;
    is_statutory: boolean;
  }[];
  payroll_employer_contributions: {
    category: string;
    code: string | null;
    description: string | null;
    amount: number | string;
  }[];
}

/**
 * Build and persist (upsert) a payslip for every employee line in the run. The
 * `data` JSONB is a self-contained, immutable snapshot of the rendered payslip.
 */
export async function generatePayslips(
  supabase: DB,
  runId: string,
  companyId: string,
): Promise<void> {
  const { data: run, error: runError } = await supabase
    .from("payroll_runs")
    .select("id, name, period_start, period_end, pay_date, pay_frequency")
    .eq("id", runId)
    .single();
  if (runError) throw new Error(runError.message);
  const runMeta = run as unknown as {
    name: string;
    period_start: string;
    period_end: string;
    pay_date: string;
    pay_frequency: string;
  };

  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("legal_name, trading_name, currency")
    .eq("id", companyId)
    .single();
  if (companyError) throw new Error(companyError.message);
  const companyMeta = company as unknown as {
    legal_name: string;
    trading_name: string | null;
    currency: string | null;
  };

  const { data: lines, error: linesError } = await supabase
    .from("payroll_run_employees")
    .select(
      "id, employee_id, gross_pay, total_deductions, net_pay, snapshot, employees(employee_number, first_name, middle_name, last_name), payroll_earnings(category, code, description, amount), payroll_deductions(category, code, description, amount, is_statutory), payroll_employer_contributions(category, code, description, amount)",
    )
    .eq("payroll_run_id", runId)
    .eq("company_id", companyId);
  if (linesError) throw new Error(linesError.message);

  const issuedAt = nowIso();
  const currency = companyMeta.currency ?? "USD";

  for (const line of (lines ?? []) as unknown as PayslipSourceRow[]) {
    const emp = line.employees;
    const fullName = emp
      ? [emp.first_name, emp.middle_name, emp.last_name].filter(Boolean).join(" ")
      : "";
    const employeeNumber = emp?.employee_number ?? line.employee_id;

    const data = {
      company: {
        legalName: companyMeta.legal_name,
        tradingName: companyMeta.trading_name,
      },
      employee: {
        employeeNumber,
        fullName,
      },
      period: {
        name: runMeta.name,
        periodStart: runMeta.period_start,
        periodEnd: runMeta.period_end,
        payDate: runMeta.pay_date,
        payFrequency: runMeta.pay_frequency,
      },
      earnings: line.payroll_earnings ?? [],
      deductions: line.payroll_deductions ?? [],
      employerContributions: line.payroll_employer_contributions ?? [],
      snapshot: line.snapshot,
      totals: {
        grossPay: line.gross_pay,
        totalDeductions: line.total_deductions,
        netPay: line.net_pay,
      },
    };

    const { error: upsertError } = await supabase.from("payslips").upsert(
      {
        company_id: companyId,
        payroll_run_id: runId,
        run_employee_id: line.id,
        employee_id: line.employee_id,
        payslip_number: `${runMeta.name}-${employeeNumber}`,
        gross_pay: line.gross_pay,
        total_deductions: line.total_deductions,
        net_pay: line.net_pay,
        currency,
        data,
        issued_at: issuedAt,
      },
      { onConflict: "run_employee_id" },
    );
    if (upsertError) throw new Error(upsertError.message);
  }
}
