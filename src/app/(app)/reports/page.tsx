import { BarChart3, ShieldAlert } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { requireSession, can } from "@/lib/auth";
import {
  headcountByDepartment,
  payrollCostByRun,
  statutoryTotals,
} from "@/lib/services/reports";
import { ReportsCharts } from "./charts";

export default async function ReportsPage() {
  const session = await requireSession();
  const companyId = session.activeCompanyId;

  if (!companyId || !can(session, companyId, "reports.read")) {
    return (
      <div className="space-y-6">
        <PageHeader title="Reports" description="Payroll and workforce analytics." />
        <EmptyState
          icon={ShieldAlert}
          title="No access"
          description="You do not have permission to view reports for this company."
        />
      </div>
    );
  }

  const [payrollByRun, headcount, statutory] = await Promise.all([
    payrollCostByRun(companyId),
    headcountByDepartment(companyId),
    statutoryTotals(companyId),
  ]);

  const hasStatutory =
    statutory.payrollTax > 0 || statutory.socialSecurity > 0 || statutory.nhi > 0;
  const everythingEmpty =
    payrollByRun.length === 0 && headcount.length === 0 && !hasStatutory;

  return (
    <div className="space-y-6">
      <PageHeader title="Reports" description="Payroll and workforce analytics." />
      {everythingEmpty ? (
        <EmptyState
          icon={BarChart3}
          title="Nothing to report yet"
          description="Add employees and process a payroll run to see analytics here."
        />
      ) : (
        <ReportsCharts
          payrollByRun={payrollByRun}
          headcount={headcount}
          statutory={statutory}
        />
      )}
    </div>
  );
}
