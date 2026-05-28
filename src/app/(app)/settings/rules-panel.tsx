import { ShieldCheck, HeartPulse, Receipt } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/payroll";
import type { ResolvedRules, PayrollTaxClass, Numeric } from "@/lib/payroll";

export type RulesPanelProps = {
  rules: ResolvedRules;
  /** The company's employer payroll-tax class, used to pick the employer rate. */
  payrollTaxClass: PayrollTaxClass;
  /** ISO date the rates were resolved as of. */
  asOf: string;
  currency?: string;
};

function formatPercent(rate: Numeric): string {
  if (rate === null || rate === undefined) return "—";
  const value = Number(rate) * 100;
  if (!Number.isFinite(value)) return "—";
  const rounded = Math.round(value * 1000) / 1000;
  return `${rounded}%`;
}

function formatAmount(value: Numeric, currency: string): string {
  if (value === null || value === undefined) return "Uncapped";
  return formatMoney(value, currency);
}

function RuleRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}

function formatAsOf(iso: string): string {
  const parts = iso.slice(0, 10).split("-").map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return iso;
  const [year, month, day] = parts;
  return new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function RulesPanel({ rules, payrollTaxClass, asOf, currency = "USD" }: RulesPanelProps) {
  const employerPayrollTaxRate =
    payrollTaxClass === "class_2"
      ? rules.payrollTax.employerClass2Rate
      : rules.payrollTax.employerClass1Rate;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Rates effective as of <span className="font-medium text-foreground">{formatAsOf(asOf)}</span>.
        </p>
        <Badge variant="outline">
          {payrollTaxClass === "class_2" ? "Employer Class 2" : "Employer Class 1"}
        </Badge>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-lg border border-border p-4">
          <div className="mb-3 flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Receipt className="size-4" />
            </span>
            <h3 className="text-sm font-semibold">Payroll Tax</h3>
          </div>
          <div className="divide-y divide-border">
            <RuleRow label="Employee rate" value={formatPercent(rules.payrollTax.employeeRate)} />
            <RuleRow
              label={`Employer rate (${payrollTaxClass === "class_2" ? "Class 2" : "Class 1"})`}
              value={formatPercent(employerPayrollTaxRate)}
            />
            <RuleRow
              label="Annual exemption"
              value={formatAmount(rules.payrollTax.annualExemption, currency)}
            />
          </div>
        </div>

        <div className="rounded-lg border border-border p-4">
          <div className="mb-3 flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-md bg-primary/10 text-primary">
              <ShieldCheck className="size-4" />
            </span>
            <h3 className="text-sm font-semibold">Social Security</h3>
          </div>
          <div className="divide-y divide-border">
            <RuleRow
              label="Employee rate"
              value={formatPercent(rules.socialSecurity.employeeRate)}
            />
            <RuleRow
              label="Employer rate"
              value={formatPercent(rules.socialSecurity.employerRate)}
            />
            <RuleRow
              label="Annual insurable ceiling"
              value={formatAmount(rules.socialSecurity.annualInsurableCeiling, currency)}
            />
          </div>
        </div>

        <div className="rounded-lg border border-border p-4">
          <div className="mb-3 flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-md bg-primary/10 text-primary">
              <HeartPulse className="size-4" />
            </span>
            <h3 className="text-sm font-semibold">National Health Insurance</h3>
          </div>
          <div className="divide-y divide-border">
            <RuleRow label="Employee rate" value={formatPercent(rules.nhi.employeeRate)} />
            <RuleRow label="Employer rate" value={formatPercent(rules.nhi.employerRate)} />
            <RuleRow
              label="Annual insurable ceiling"
              value={formatAmount(rules.nhi.annualInsurableCeiling, currency)}
            />
          </div>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Statutory rates are effective-dated and editable by a super admin via the rule tables —
        never hardcoded.
      </p>
    </div>
  );
}
