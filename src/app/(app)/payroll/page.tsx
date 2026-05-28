import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus, Wallet } from "lucide-react";
import { can, requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/payroll";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
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

interface PayrollRunListRow {
  id: string;
  name: string;
  period_start: string;
  period_end: string;
  pay_date: string;
  status: string;
  total_gross: number | string;
  total_net: number | string;
  employee_count: number;
}

export default async function PayrollPage() {
  const session = await requireSession();
  const companyId = session.activeCompanyId;

  if (!companyId || !can(session, companyId, "payroll.read")) {
    redirect("/");
  }

  const canManage = can(session, companyId, "payroll.manage");

  const supabase = await createClient();
  const { data: runRows } = await supabase
    .from("payroll_runs")
    .select(
      "id, name, period_start, period_end, pay_date, status, total_gross, total_net, employee_count",
    )
    .eq("company_id", companyId)
    .order("pay_date", { ascending: false });

  const runs = (runRows ?? []) as unknown as PayrollRunListRow[];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Payroll" description="Generate, approve and lock payroll runs.">
        {canManage ? (
          <Button asChild>
            <Link href="/payroll/new">
              <Plus className="h-4 w-4" />
              New payroll run
            </Link>
          </Button>
        ) : null}
      </PageHeader>

      {runs.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="No payroll runs yet"
          description="Create your first payroll run to compute pay, statutory deductions and employer contributions."
        >
          {canManage ? (
            <Button asChild>
              <Link href="/payroll/new">
                <Plus className="h-4 w-4" />
                New payroll run
              </Link>
            </Button>
          ) : null}
        </EmptyState>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Pay date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Gross</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                  <TableHead className="text-right">Employees</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((run) => (
                  <TableRow key={run.id}>
                    <TableCell className="font-medium">
                      <Link href={`/payroll/${run.id}`} className="hover:underline">
                        {run.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(run.period_start)} – {formatDate(run.period_end)}
                    </TableCell>
                    <TableCell>{formatDate(run.pay_date)}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[run.status] ?? "secondary"}>
                        {STATUS_LABEL[run.status] ?? run.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{formatMoney(run.total_gross)}</TableCell>
                    <TableCell className="text-right">{formatMoney(run.total_net)}</TableCell>
                    <TableCell className="text-right">{run.employee_count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
