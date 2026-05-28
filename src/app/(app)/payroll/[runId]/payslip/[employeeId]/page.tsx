import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireSession, can } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import {
  PayslipDocument,
  type PayslipCompany,
  type PayslipEmployee,
  type PayslipRun,
  type PayslipEarningLine,
  type PayslipDeductionLine,
  type PayslipContributionLine,
  type PayslipTotals,
} from "@/components/payslip/payslip-document";
import { PrintButton } from "./print-button";

interface PayslipPageProps {
  params: Promise<{ runId: string; employeeId: string }>;
}

/**
 * The Supabase Database type is a loose placeholder in this project, so query
 * rows come back untyped. These row shapes mirror the SQL schema and let us
 * cast results once (the established pattern in src/lib/services/*).
 */
type EmployeeRow = {
  id: string;
  company_id: string;
  user_id: string | null;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  preferred_name: string | null;
  employee_number: string;
  departments: { name: string | null } | null;
  positions: { title: string | null } | null;
};

type RunRow = {
  id: string;
  name: string;
  pay_frequency: string;
  period_start: string;
  period_end: string;
  pay_date: string;
};

type RunEmployeeRow = {
  id: string;
  gross_pay: number | string;
  total_earnings: number | string;
  total_deductions: number | string;
  total_employer_contributions: number | string;
  net_pay: number | string;
  employer_cost: number | string;
  worked_hours: number | string;
  overtime_hours: number | string;
};

type CompanyRow = {
  legal_name: string;
  trading_name: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  territory: string | null;
  postal_code: string | null;
  currency: string | null;
};

type EarningRow = {
  id: string;
  category: string;
  code: string | null;
  description: string | null;
  quantity: number | string | null;
  rate: number | string | null;
  amount: number | string;
};

type DeductionRow = {
  id: string;
  category: string;
  code: string | null;
  description: string | null;
  amount: number | string;
};

type ContributionRow = {
  id: string;
  category: string;
  code: string | null;
  description: string | null;
  amount: number | string;
};

export default async function PayslipPage({ params }: PayslipPageProps) {
  const { runId, employeeId } = await params;
  const session = await requireSession();
  const companyId = session.activeCompanyId;

  if (!companyId) {
    notFound();
  }

  const supabase = await createClient();

  // Load the employee (scoped to the active company) so we can run the
  // self-service authorization check before exposing any payroll figures.
  const { data: employeeData } = await supabase
    .from("employees")
    .select(
      "id, company_id, user_id, first_name, middle_name, last_name, preferred_name, employee_number, departments(name), positions(title)",
    )
    .eq("id", employeeId)
    .eq("company_id", companyId)
    .maybeSingle();

  const employeeRow = employeeData as unknown as EmployeeRow | null;
  if (!employeeRow) {
    notFound();
  }

  const isSelf = employeeRow.user_id === session.userId;
  const canRead = can(session, companyId, "payroll.read");
  if (!canRead && !isSelf) {
    notFound();
  }

  // Load the payroll run, the run-employee join row, and the company in parallel.
  const [runResult, runEmployeeResult, companyResult] = await Promise.all([
    supabase
      .from("payroll_runs")
      .select("id, name, pay_frequency, period_start, period_end, pay_date")
      .eq("id", runId)
      .eq("company_id", companyId)
      .maybeSingle(),
    supabase
      .from("payroll_run_employees")
      .select(
        "id, gross_pay, total_earnings, total_deductions, total_employer_contributions, net_pay, employer_cost, worked_hours, overtime_hours",
      )
      .eq("payroll_run_id", runId)
      .eq("employee_id", employeeId)
      .eq("company_id", companyId)
      .maybeSingle(),
    supabase
      .from("companies")
      .select(
        "legal_name, trading_name, address_line1, address_line2, city, territory, postal_code, currency",
      )
      .eq("id", companyId)
      .maybeSingle(),
  ]);

  const run = runResult.data as unknown as RunRow | null;
  const runEmployee = runEmployeeResult.data as unknown as RunEmployeeRow | null;
  const company = companyResult.data as unknown as CompanyRow | null;

  if (!run || !runEmployee || !company) {
    notFound();
  }

  // Load the line items for this run-employee.
  const [earningsResult, deductionsResult, contributionsResult] = await Promise.all([
    supabase
      .from("payroll_earnings")
      .select("id, category, code, description, quantity, rate, amount")
      .eq("run_employee_id", runEmployee.id)
      .eq("company_id", companyId)
      .order("created_at", { ascending: true }),
    supabase
      .from("payroll_deductions")
      .select("id, category, code, description, amount")
      .eq("run_employee_id", runEmployee.id)
      .eq("company_id", companyId)
      .order("created_at", { ascending: true }),
    supabase
      .from("payroll_employer_contributions")
      .select("id, category, code, description, amount")
      .eq("run_employee_id", runEmployee.id)
      .eq("company_id", companyId)
      .order("created_at", { ascending: true }),
  ]);

  const earningRows = (earningsResult.data ?? []) as unknown as EarningRow[];
  const deductionRows = (deductionsResult.data ?? []) as unknown as DeductionRow[];
  const contributionRows = (contributionsResult.data ?? []) as unknown as ContributionRow[];

  const department = employeeRow.departments;
  const position = employeeRow.positions;

  const companyData: PayslipCompany = {
    legal_name: company.legal_name,
    trading_name: company.trading_name,
    address_line1: company.address_line1,
    address_line2: company.address_line2,
    city: company.city,
    territory: company.territory,
    postal_code: company.postal_code,
    currency: company.currency,
  };

  const employeePresentation: PayslipEmployee = {
    first_name: employeeRow.first_name,
    middle_name: employeeRow.middle_name,
    last_name: employeeRow.last_name,
    preferred_name: employeeRow.preferred_name,
    employee_number: employeeRow.employee_number,
    department_name: department?.name ?? null,
    position_title: position?.title ?? null,
  };

  const runData: PayslipRun = {
    name: run.name,
    period_start: run.period_start,
    period_end: run.period_end,
    pay_date: run.pay_date,
    pay_frequency: run.pay_frequency,
  };

  const earnings: PayslipEarningLine[] = earningRows.map((e) => ({
    id: e.id,
    category: e.category,
    code: e.code,
    description: e.description,
    quantity: e.quantity,
    rate: e.rate,
    amount: e.amount,
  }));

  const employeeDeductions: PayslipDeductionLine[] = deductionRows.map((d) => ({
    id: d.id,
    category: d.category,
    code: d.code,
    description: d.description,
    amount: d.amount,
  }));

  const employerContributions: PayslipContributionLine[] = contributionRows.map((c) => ({
    id: c.id,
    category: c.category,
    code: c.code,
    description: c.description,
    amount: c.amount,
  }));

  const totals: PayslipTotals = {
    grossPay: runEmployee.gross_pay,
    totalEarnings: runEmployee.total_earnings,
    totalDeductions: runEmployee.total_deductions,
    totalEmployerContributions: runEmployee.total_employer_contributions,
    netPay: runEmployee.net_pay,
    employerCost: runEmployee.employer_cost,
    workedHours: runEmployee.worked_hours,
    overtimeHours: runEmployee.overtime_hours,
  };

  return (
    <div className="space-y-6">
      <div className="print:hidden">
        <PageHeader
          title="Payslip"
          description={`${run.name} — ${employeePresentation.first_name} ${employeePresentation.last_name}`}
        >
          <Button asChild variant="outline">
            <Link href={`/payroll/${runId}`}>
              <ArrowLeft className="h-4 w-4" />
              Back to run
            </Link>
          </Button>
          <PrintButton />
        </PageHeader>
      </div>

      <PayslipDocument
        company={companyData}
        employee={employeePresentation}
        run={runData}
        earnings={earnings}
        employeeDeductions={employeeDeductions}
        employerContributions={employerContributions}
        totals={totals}
      />
    </div>
  );
}
