import Link from "next/link";
import { ScrollText, Lock, Building2, CalendarDays, Landmark } from "lucide-react";
import { requireSession, can } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { resolveRules } from "@/lib/payroll";
import type { ResolvedRules } from "@/lib/payroll";
import type { TaxRuleRow, ContributionRuleRow } from "@/lib/payroll/rules";
import { CompanyForm, type CompanyRecord } from "./company-form";
import { HolidaysPanel, type HolidayRecord } from "./holidays-panel";
import { RulesPanel } from "./rules-panel";

export const dynamic = "force-dynamic";

type CompanyRow = CompanyRecord & {
  id: string;
  payroll_tax_class: "class_1" | "class_2";
  currency: string | null;
};

export default async function SettingsPage() {
  const session = await requireSession();
  const companyId = session.activeCompanyId;

  if (!companyId || !can(session, companyId, "settings.manage")) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground">
            Company profile, public holidays, and statutory rates.
          </p>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 py-16 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Lock className="size-6" />
            </span>
            <h2 className="text-base font-semibold">No access to settings</h2>
            <p className="max-w-sm text-sm text-muted-foreground">
              You need the <code className="rounded bg-muted px-1">settings.manage</code> permission
              to view or edit company settings. Contact a company owner or administrator.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const supabase = await createClient();
  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);
  const currentYear = today.getUTCFullYear();
  const rangeStart = `${currentYear}-01-01`;
  const rangeEnd = `${currentYear + 1}-12-31`;

  const [companyResult, holidaysResult, taxResult, contributionResult] = await Promise.all([
    supabase
      .from("companies")
      .select(
        "id, legal_name, trading_name, payroll_tax_class, default_pay_frequency, standard_weekly_hours, currency, timezone, email, phone, address_line1, address_line2, city, territory, postal_code",
      )
      .eq("id", companyId)
      .single(),
    supabase
      .from("holidays")
      .select("id, name, holiday_date, is_paid, is_recurring")
      .eq("company_id", companyId)
      .gte("holiday_date", rangeStart)
      .lte("holiday_date", rangeEnd)
      .order("holiday_date", { ascending: true }),
    supabase
      .from("tax_rules")
      .select(
        "employee_rate, employer_class1_rate, employer_class2_rate, annual_exemption, effective_from, effective_to",
      ),
    supabase
      .from("contribution_rules")
      .select(
        "contribution_type, employee_rate, employer_rate, annual_insurable_ceiling, effective_from, effective_to",
      ),
  ]);

  const company = companyResult.data as CompanyRow | null;

  if (!company) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        </div>
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            The active company could not be loaded. Please re-select a company and try again.
          </CardContent>
        </Card>
      </div>
    );
  }

  const holidays = (holidaysResult.data ?? []) as HolidayRecord[];
  const taxRows = (taxResult.data ?? []) as unknown as TaxRuleRow[];
  const contributionRows = (contributionResult.data ?? []) as unknown as ContributionRuleRow[];

  let resolvedRules: ResolvedRules | null = null;
  let rulesError: string | null = null;
  try {
    resolvedRules = resolveRules(taxRows, contributionRows, todayIso);
  } catch (error) {
    rulesError = error instanceof Error ? error.message : "Statutory rules could not be resolved.";
  }

  const currency = company.currency ?? "USD";
  const canReadAudit = can(session, companyId, "audit.read");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground">
            Company profile, public holidays, and statutory rates.
          </p>
        </div>
        {canReadAudit ? (
          <Button asChild variant="outline">
            <Link href="/audit">
              <ScrollText />
              View audit log
            </Link>
          </Button>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="size-4 text-muted-foreground" />
            Company
          </CardTitle>
          <CardDescription>
            Legal identity, payroll defaults, and contact details for this company.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CompanyForm company={company} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="size-4 text-muted-foreground" />
            Public holidays
          </CardTitle>
          <CardDescription>
            Holidays for {currentYear} and {currentYear + 1}. These affect attendance status and
            paid-day calculations.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <HolidaysPanel holidays={holidays} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Landmark className="size-4 text-muted-foreground" />
            Statutory rates
          </CardTitle>
          <CardDescription>
            Currently effective BVI Payroll Tax, Social Security, and NHI rates used by the payroll
            engine.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {resolvedRules ? (
            <RulesPanel
              rules={resolvedRules}
              payrollTaxClass={company.payroll_tax_class}
              asOf={todayIso}
              currency={currency}
            />
          ) : (
            <div className="space-y-2">
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
                {rulesError}
              </div>
              <p className="text-xs text-muted-foreground">
                Statutory rates are effective-dated and editable by a super admin via the rule
                tables — never hardcoded.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
