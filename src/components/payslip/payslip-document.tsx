import * as React from "react";
import { formatMoney } from "@/lib/payroll";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface PayslipCompany {
  legal_name: string;
  trading_name: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  territory: string | null;
  postal_code: string | null;
  currency: string | null;
}

export interface PayslipEmployee {
  first_name: string;
  middle_name: string | null;
  last_name: string;
  preferred_name: string | null;
  employee_number: string;
  department_name: string | null;
  position_title: string | null;
}

export interface PayslipRun {
  name: string;
  period_start: string;
  period_end: string;
  pay_date: string;
  pay_frequency: string;
}

export interface PayslipEarningLine {
  id: string;
  category: string;
  code: string | null;
  description: string | null;
  quantity: number | string | null;
  rate: number | string | null;
  amount: number | string;
}

export interface PayslipDeductionLine {
  id: string;
  category: string;
  code: string | null;
  description: string | null;
  amount: number | string;
}

export interface PayslipContributionLine {
  id: string;
  category: string;
  code: string | null;
  description: string | null;
  amount: number | string;
}

export interface PayslipTotals {
  grossPay: number | string;
  totalEarnings: number | string;
  totalDeductions: number | string;
  totalEmployerContributions: number | string;
  netPay: number | string;
  employerCost: number | string;
  workedHours: number | string;
  overtimeHours: number | string;
}

export interface PayslipDocumentProps {
  company: PayslipCompany;
  employee: PayslipEmployee;
  run: PayslipRun;
  earnings: PayslipEarningLine[];
  employeeDeductions: PayslipDeductionLine[];
  employerContributions: PayslipContributionLine[];
  totals: PayslipTotals;
}

const CATEGORY_LABELS: Record<string, string> = {
  basic: "Basic pay",
  overtime: "Overtime",
  allowance: "Allowance",
  bonus: "Bonus",
  commission: "Commission",
  holiday: "Holiday pay",
  leave: "Leave pay",
  other: "Other",
  payroll_tax: "Payroll tax",
  social_security: "Social security",
  nhi: "National Health Insurance",
  loan: "Loan",
  advance: "Advance",
};

const FREQUENCY_LABELS: Record<string, string> = {
  weekly: "Weekly",
  biweekly: "Bi-weekly",
  semimonthly: "Semi-monthly",
  monthly: "Monthly",
};

function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category;
}

function lineLabel(
  line: { description: string | null; code: string | null; category: string },
): string {
  return line.description || line.code || categoryLabel(line.category);
}

function employeeFullName(e: PayslipEmployee): string {
  return [e.first_name, e.middle_name, e.last_name].filter(Boolean).join(" ");
}

function companyAddress(c: PayslipCompany): string {
  return [c.address_line1, c.address_line2, c.city, c.territory, c.postal_code]
    .filter((part): part is string => Boolean(part && part.trim()))
    .join(", ");
}

function formatQuantity(value: number | string | null): string {
  if (value === null || value === undefined || value === "") return "—";
  const num = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(num)) return "—";
  return num.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

export function PayslipDocument({
  company,
  employee,
  run,
  earnings,
  employeeDeductions,
  employerContributions,
  totals,
}: PayslipDocumentProps) {
  const currency = company.currency || "USD";
  const companyName = company.trading_name || company.legal_name;
  const address = companyAddress(company);
  const frequencyLabel = FREQUENCY_LABELS[run.pay_frequency] ?? run.pay_frequency;

  return (
    <div
      className={cn(
        "mx-auto w-full max-w-3xl rounded-lg border border-border bg-white text-black shadow-sm",
        "print:max-w-none print:rounded-none print:border-0 print:shadow-none",
      )}
    >
      <div className="p-6 sm:p-10 print:p-0">
        {/* Company header + title */}
        <header className="flex flex-col gap-4 border-b border-black/20 pb-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <h2 className="text-xl font-bold tracking-tight">{companyName}</h2>
            {company.trading_name && company.trading_name !== company.legal_name ? (
              <p className="text-xs text-black/60">{company.legal_name}</p>
            ) : null}
            {address ? <p className="text-sm text-black/70">{address}</p> : null}
          </div>
          <div className="sm:text-right">
            <p className="text-2xl font-bold uppercase tracking-widest text-black/80">Payslip</p>
            <p className="text-sm text-black/60">{run.name}</p>
          </div>
        </header>

        {/* Employee + pay period block */}
        <section className="grid grid-cols-1 gap-6 border-b border-black/10 py-6 sm:grid-cols-2">
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-black/60">Employee</dt>
              <dd className="text-right font-medium">{employeeFullName(employee)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-black/60">Employee #</dt>
              <dd className="text-right font-medium">{employee.employee_number}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-black/60">Department</dt>
              <dd className="text-right font-medium">{employee.department_name || "—"}</dd>
            </div>
            {employee.position_title ? (
              <div className="flex justify-between gap-4">
                <dt className="text-black/60">Position</dt>
                <dd className="text-right font-medium">{employee.position_title}</dd>
              </div>
            ) : null}
          </dl>
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-black/60">Pay period</dt>
              <dd className="text-right font-medium">
                {formatDate(run.period_start)} – {formatDate(run.period_end)}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-black/60">Pay date</dt>
              <dd className="text-right font-medium">{formatDate(run.pay_date)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-black/60">Frequency</dt>
              <dd className="text-right font-medium">{frequencyLabel}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-black/60">Hours worked</dt>
              <dd className="text-right font-medium">
                {formatQuantity(totals.workedHours)}
                {Number(totals.overtimeHours) > 0
                  ? ` (OT ${formatQuantity(totals.overtimeHours)})`
                  : ""}
              </dd>
            </div>
          </dl>
        </section>

        {/* Earnings */}
        <section className="py-6">
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-black/70">
            Earnings
          </h3>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-black/30 text-left text-xs uppercase text-black/60">
                <th className="py-2 pr-2 font-medium">Description</th>
                <th className="py-2 px-2 text-right font-medium">Qty</th>
                <th className="py-2 px-2 text-right font-medium">Rate</th>
                <th className="py-2 pl-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {earnings.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-3 text-center text-black/50">
                    No earnings recorded.
                  </td>
                </tr>
              ) : (
                earnings.map((line) => (
                  <tr key={line.id} className="border-b border-black/10">
                    <td className="py-2 pr-2">{lineLabel(line)}</td>
                    <td className="py-2 px-2 text-right tabular-nums">
                      {formatQuantity(line.quantity)}
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums">
                      {line.rate === null || line.rate === undefined || line.rate === ""
                        ? "—"
                        : formatMoney(line.rate, currency)}
                    </td>
                    <td className="py-2 pl-2 text-right font-medium tabular-nums">
                      {formatMoney(line.amount, currency)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr className="border-t border-black/30">
                <td className="py-2 pr-2 font-semibold" colSpan={3}>
                  Gross pay
                </td>
                <td className="py-2 pl-2 text-right font-semibold tabular-nums">
                  {formatMoney(totals.grossPay, currency)}
                </td>
              </tr>
            </tfoot>
          </table>
        </section>

        {/* Deductions */}
        <section className="py-6">
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-black/70">
            Deductions
          </h3>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-black/30 text-left text-xs uppercase text-black/60">
                <th className="py-2 pr-2 font-medium">Description</th>
                <th className="py-2 pl-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {employeeDeductions.length === 0 ? (
                <tr>
                  <td colSpan={2} className="py-3 text-center text-black/50">
                    No deductions.
                  </td>
                </tr>
              ) : (
                employeeDeductions.map((line) => (
                  <tr key={line.id} className="border-b border-black/10">
                    <td className="py-2 pr-2">{lineLabel(line)}</td>
                    <td className="py-2 pl-2 text-right font-medium tabular-nums">
                      {formatMoney(line.amount, currency)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr className="border-t border-black/30">
                <td className="py-2 pr-2 font-semibold">Total deductions</td>
                <td className="py-2 pl-2 text-right font-semibold tabular-nums">
                  {formatMoney(totals.totalDeductions, currency)}
                </td>
              </tr>
            </tfoot>
          </table>
        </section>

        {/* Employer contributions */}
        <section className="py-6">
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-black/70">
            Employer contributions
          </h3>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-black/30 text-left text-xs uppercase text-black/60">
                <th className="py-2 pr-2 font-medium">Description</th>
                <th className="py-2 pl-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {employerContributions.length === 0 ? (
                <tr>
                  <td colSpan={2} className="py-3 text-center text-black/50">
                    No employer contributions.
                  </td>
                </tr>
              ) : (
                employerContributions.map((line) => (
                  <tr key={line.id} className="border-b border-black/10">
                    <td className="py-2 pr-2">{lineLabel(line)}</td>
                    <td className="py-2 pl-2 text-right font-medium tabular-nums">
                      {formatMoney(line.amount, currency)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr className="border-t border-black/30">
                <td className="py-2 pr-2 font-semibold">Total employer contributions</td>
                <td className="py-2 pl-2 text-right font-semibold tabular-nums">
                  {formatMoney(totals.totalEmployerContributions, currency)}
                </td>
              </tr>
            </tfoot>
          </table>
        </section>

        {/* Summary */}
        <section className="mt-2 border-t-2 border-black/40 pt-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-1">
              <p className="text-xs uppercase text-black/60">Gross pay</p>
              <p className="text-lg font-semibold tabular-nums">
                {formatMoney(totals.grossPay, currency)}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs uppercase text-black/60">Total deductions</p>
              <p className="text-lg font-semibold tabular-nums">
                {formatMoney(totals.totalDeductions, currency)}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs uppercase text-black/60">Employer cost</p>
              <p className="text-lg font-semibold tabular-nums">
                {formatMoney(totals.employerCost, currency)}
              </p>
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-1 rounded-md bg-black/5 p-4 sm:flex-row sm:items-center sm:justify-between print:bg-transparent print:p-0">
            <p className="text-sm font-semibold uppercase tracking-wide text-black/70">Net pay</p>
            <p className="text-3xl font-bold tabular-nums">{formatMoney(totals.netPay, currency)}</p>
          </div>
        </section>

        <footer className="mt-8 border-t border-black/10 pt-4 text-center text-xs text-black/50">
          This payslip was generated by the BVI Payroll Management System. Amounts are shown in{" "}
          {currency}.
        </footer>
      </div>
    </div>
  );
}
