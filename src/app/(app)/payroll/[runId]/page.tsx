import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ArrowLeft,
  BadgeCheck,
  CheckCircle2,
  CircleDollarSign,
  FileText,
  Lock,
  Users,
} from "lucide-react";
import { can, requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/payroll";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import {
  approveAction,
  generatePayslipsAction,
  lockAction,
  markPaidAction,
} from "../actions";

const STATUS_VARIANT: Record<
  string,
  "default" | "secondary" | "success" | "warning" | "destructive" | "outline"
> = {
  draft: "secondary",
  processing: "secondary",
  pending_approval: "warning",
  approved: "default",
  locked: "warning",
  paid: "success",
  cancelled: "destructive",
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  processing: "Processing",
  pending_approval: "Pending approval",
  approved: "Approved",
  locked: "Locked",
  paid: "Paid",
  cancelled: "Cancelled",
};

interface RunRow {
  id: string;
  name: string;
  period_start: string;
  period_end: string;
  pay_date: string;
  status: string;
  employee_count: number;
  total_gross: number | string;
  total_employee_deductions: number | string;
  total_employer_contributions: number | string;
  total_net: number | string;
  total_employer_cost: number | string;
}

interface RunEmployeeRow {
  id: string;
  employee_id: string;
  gross_pay: number | string;
  total_deductions: number | string;
  total_employer_contributions: number | string;
  net_pay: number | string;
  employees: {
    first_name: string;
    middle_name: string | null;
    last_name: string;
    employee_number: string;
  } | null;
}

export default async function PayrollRunDetailPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;

  const session = await requireSession();
  const companyId = session.activeCompanyId;
  if (!companyId || !can(session, companyId, "payroll.read")) {
    redirect("/");
  }

  const supabase = await createClient();

  const { data: runData } = await supabase
    .from("payroll_runs")
    .select(
      "id, name, period_start, period_end, pay_date, status, employee_count, total_gross, total_employee_deductions, total_employer_contributions, total_net, total_employer_cost",
    )
    .eq("id", runId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (!runData) {
    notFound();
  }
  const run = runData as unknown as RunRow;

  const { data: lineRows } = await supabase
    .from("payroll_run_employees")
    .select(
      "id, employee_id, gross_pay, total_deductions, total_employer_contributions, net_pay, employees(first_name, middle_name, last_name, employee_number)",
    )
    .eq("payroll_run_id", runId)
    .eq("company_id", companyId)
    .order("created_at", { ascending: true });

  const lines = (lineRows ?? []) as unknown as RunEmployeeRow[];

  const canApprove = can(session, companyId, "payroll.approve");
  const canLock = can(session, companyId, "payroll.lock");
  const canManage = can(session, companyId, "payroll.manage");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={run.name}
        description={`${formatDate(run.period_start)} – ${formatDate(run.period_end)} · Pay date ${formatDate(run.pay_date)}`}
      >
        <Button asChild variant="outline" size="sm">
          <Link href="/payroll">
            <ArrowLeft className="h-4 w-4" />
            Back to payroll
          </Link>
        </Button>
      </PageHeader>

      <div className="flex flex-wrap items-center gap-3">
        <Badge variant={STATUS_VARIANT[run.status] ?? "secondary"}>
          {STATUS_LABEL[run.status] ?? run.status}
        </Badge>
        <span className="text-sm text-muted-foreground">
          {run.employee_count} employee{run.employee_count === 1 ? "" : "s"}
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total gross" value={formatMoney(run.total_gross)} icon={CircleDollarSign} />
        <StatCard
          label="Employee deductions"
          value={formatMoney(run.total_employee_deductions)}
          icon={BadgeCheck}
        />
        <StatCard
          label="Employer contributions"
          value={formatMoney(run.total_employer_contributions)}
          icon={Users}
        />
        <StatCard
          label="Total net pay"
          value={formatMoney(run.total_net)}
          hint={`Employer cost ${formatMoney(run.total_employer_cost)}`}
          icon={CircleDollarSign}
        />
      </div>

      <RunActions
        runId={run.id}
        status={run.status}
        canApprove={canApprove}
        canLock={canLock}
        canManage={canManage}
      />

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead className="text-right">Gross</TableHead>
                <TableHead className="text-right">Deductions</TableHead>
                <TableHead className="text-right">Employer contrib.</TableHead>
                <TableHead className="text-right">Net pay</TableHead>
                <TableHead className="text-right">Payslip</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    No employees were included in this run.
                  </TableCell>
                </TableRow>
              ) : (
                lines.map((line) => {
                  const emp = line.employees;
                  const name = emp
                    ? [emp.first_name, emp.middle_name, emp.last_name]
                        .filter(Boolean)
                        .join(" ")
                    : "Unknown employee";
                  return (
                    <TableRow key={line.id}>
                      <TableCell className="font-medium">
                        {name}
                        {emp?.employee_number ? (
                          <span className="block text-xs text-muted-foreground">
                            {emp.employee_number}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right">{formatMoney(line.gross_pay)}</TableCell>
                      <TableCell className="text-right">
                        {formatMoney(line.total_deductions)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatMoney(line.total_employer_contributions)}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatMoney(line.net_pay)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button asChild variant="ghost" size="sm">
                          <Link href={`/payroll/${run.id}/payslip/${line.employee_id}`}>
                            <FileText className="h-4 w-4" />
                            View
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function RunActions({
  runId,
  status,
  canApprove,
  canLock,
  canManage,
}: {
  runId: string;
  status: string;
  canApprove: boolean;
  canLock: boolean;
  canManage: boolean;
}) {
  const approve = approveAction.bind(null, runId);
  const lock = lockAction.bind(null, runId);
  const markPaid = markPaidAction.bind(null, runId);
  const generatePayslips = generatePayslipsAction.bind(null, runId);

  return (
    <div className="flex flex-wrap items-center gap-3">
      {status === "draft" && canApprove ? (
        <form action={approve}>
          <Button type="submit">
            <CheckCircle2 className="h-4 w-4" />
            Approve run
          </Button>
        </form>
      ) : null}

      {status === "approved" && canLock ? (
        <form action={lock}>
          <Button type="submit">
            <Lock className="h-4 w-4" />
            Lock run
          </Button>
        </form>
      ) : null}

      {status === "locked" ? (
        <>
          {canLock ? (
            <form action={markPaid}>
              <Button type="submit">
                <CircleDollarSign className="h-4 w-4" />
                Mark paid
              </Button>
            </form>
          ) : null}
          {canManage ? (
            <form action={generatePayslips}>
              <Button type="submit" variant="outline">
                <FileText className="h-4 w-4" />
                Generate payslips
              </Button>
            </form>
          ) : null}
        </>
      ) : null}

      {status === "paid" ? (
        <Badge variant="success">
          <CircleDollarSign className="mr-1 h-3.5 w-3.5" />
          Paid
        </Badge>
      ) : null}
    </div>
  );
}
