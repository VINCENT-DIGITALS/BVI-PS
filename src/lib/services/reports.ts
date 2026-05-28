import { createClient } from "@/lib/supabase/server";

/**
 * Reports & analytics data layer.
 *
 * Every function is a server-only helper that returns plain, serializable
 * values (no Decimal, no Supabase row wrappers) so the data can be handed
 * straight to the client charts. Numbers are JS `number`s rounded to cents.
 * Queries are always scoped by `company_id` (RLS is also enforced server-side).
 */

/** A single payroll run's headline totals for the cost-over-time chart. */
export type PayrollCostPoint = {
  name: string;
  gross: number;
  net: number;
  employerCost: number;
};

/** Active headcount for a single department. */
export type HeadcountPoint = {
  department: string;
  count: number;
};

/** Aggregated statutory amounts (employee deductions + employer contributions). */
export type StatutoryTotals = {
  payrollTax: number;
  socialSecurity: number;
  nhi: number;
};

const STATUSES_NON_DRAFT = [
  "processing",
  "pending_approval",
  "approved",
  "locked",
  "paid",
  "cancelled",
] as const;

function toNumber(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Headline totals for every non-draft payroll run, oldest period first, ready
 * for a per-run gross / net / employer-cost comparison chart.
 */
export async function payrollCostByRun(companyId: string): Promise<PayrollCostPoint[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("payroll_runs")
    .select("name, period_start, total_gross, total_net, total_employer_cost, status")
    .eq("company_id", companyId)
    .neq("status", "draft")
    .order("period_start", { ascending: true });

  if (error || !data) return [];

  return (data as Record<string, unknown>[]).map((row) => ({
    name: (row.name as string | null) ?? "Run",
    gross: round2(toNumber(row.total_gross)),
    net: round2(toNumber(row.total_net)),
    employerCost: round2(toNumber(row.total_employer_cost)),
  }));
}

/**
 * Active employee headcount grouped by department name. Employees with no
 * department are bucketed under "Unassigned".
 */
export async function headcountByDepartment(companyId: string): Promise<HeadcountPoint[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("employees")
    .select("department_id, departments(name)")
    .eq("company_id", companyId)
    .eq("status", "active");

  if (error || !data) return [];

  const counts = new Map<string, number>();

  for (const row of data as Record<string, unknown>[]) {
    const dept = row.departments as { name?: string | null } | null;
    const name = dept?.name?.trim() ? dept.name : "Unassigned";
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([department, count]) => ({ department, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Sum of statutory amounts across all non-draft runs, combining employee-side
 * deductions and employer-side contributions, grouped by statutory category.
 */
export async function statutoryTotals(companyId: string): Promise<StatutoryTotals> {
  const supabase = await createClient();

  const totals: StatutoryTotals = { payrollTax: 0, socialSecurity: 0, nhi: 0 };

  // Resolve the run_employee_ids that belong to non-draft runs for this company.
  const { data: runEmployees, error: reError } = await supabase
    .from("payroll_run_employees")
    .select("id, payroll_runs!inner(status)")
    .eq("company_id", companyId)
    .in("payroll_runs.status", STATUSES_NON_DRAFT as unknown as string[]);

  if (reError || !runEmployees || runEmployees.length === 0) return totals;

  const runEmployeeIds = (runEmployees as Record<string, unknown>[])
    .map((row) => row.id as string)
    .filter(Boolean);

  if (runEmployeeIds.length === 0) return totals;

  const [{ data: deductions }, { data: contributions }] = await Promise.all([
    supabase
      .from("payroll_deductions")
      .select("category, amount")
      .eq("company_id", companyId)
      .in("category", ["payroll_tax", "social_security", "nhi"])
      .in("run_employee_id", runEmployeeIds),
    supabase
      .from("payroll_employer_contributions")
      .select("category, amount")
      .eq("company_id", companyId)
      .in("category", ["payroll_tax", "social_security", "nhi"])
      .in("run_employee_id", runEmployeeIds),
  ]);

  const accumulate = (rows: Record<string, unknown>[] | null | undefined) => {
    for (const row of rows ?? []) {
      const amount = toNumber(row.amount);
      switch (row.category as string) {
        case "payroll_tax":
          totals.payrollTax += amount;
          break;
        case "social_security":
          totals.socialSecurity += amount;
          break;
        case "nhi":
          totals.nhi += amount;
          break;
        default:
          break;
      }
    }
  };

  accumulate(deductions as Record<string, unknown>[] | null);
  accumulate(contributions as Record<string, unknown>[] | null);

  return {
    payrollTax: round2(totals.payrollTax),
    socialSecurity: round2(totals.socialSecurity),
    nhi: round2(totals.nhi),
  };
}
