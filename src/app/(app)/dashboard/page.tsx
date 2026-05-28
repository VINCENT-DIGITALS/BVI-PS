import type { LucideIcon } from "lucide-react";
import { Users, UserCheck, CalendarClock, Wallet, Inbox } from "lucide-react";
import { requireSession, can } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/payroll";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type PayrollRunStatus =
  | "draft"
  | "processing"
  | "pending_approval"
  | "approved"
  | "locked"
  | "paid"
  | "cancelled";

type RecentRun = {
  id: string;
  name: string | null;
  period_start: string | null;
  period_end: string | null;
  pay_date: string | null;
  status: PayrollRunStatus;
  total_net: number | string | null;
};

const STATUS_BADGE: Record<
  PayrollRunStatus,
  { label: string; variant: "default" | "secondary" | "success" | "warning" | "destructive" | "outline" }
> = {
  draft: { label: "Draft", variant: "secondary" },
  processing: { label: "Processing", variant: "warning" },
  pending_approval: { label: "Pending approval", variant: "warning" },
  approved: { label: "Approved", variant: "default" },
  locked: { label: "Locked", variant: "default" },
  paid: { label: "Paid", variant: "success" },
  cancelled: { label: "Cancelled", variant: "destructive" },
};

function formatPeriod(start: string | null, end: string | null): string {
  const fmt = (value: string | null) => {
    if (!value) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };
  const s = fmt(start);
  const e = fmt(end);
  if (s && e) return `${s} – ${e}`;
  return s ?? e ?? "—";
}

function StatCard({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: LucideIcon;
}) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-4 p-6">
        <div className="space-y-1">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className="text-2xl font-semibold tracking-tight text-foreground">{value}</p>
          {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
        </div>
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Icon className="size-5" aria-hidden />
        </span>
      </CardContent>
    </Card>
  );
}

export default async function DashboardPage() {
  const session = await requireSession();
  const companyId = session.activeCompanyId;

  const canReadEmployees = can(session, companyId, "employees.read");
  const canReadLeave = can(session, companyId, "leave.read");
  const canReadPayroll = can(session, companyId, "payroll.read");

  async function countEmployees(active: boolean): Promise<number | null> {
    if (!companyId || !canReadEmployees) return null;
    const supabase = await createClient();
    let query = supabase
      .from("employees")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId);
    if (active) query = query.eq("status", "active");
    const { count } = await query;
    return count ?? 0;
  }

  async function countPendingLeave(): Promise<number | null> {
    if (!companyId || !canReadLeave) return null;
    const supabase = await createClient();
    const { count } = await supabase
      .from("leave_requests")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("status", "pending");
    return count ?? 0;
  }

  async function loadRecentRuns(): Promise<RecentRun[]> {
    if (!companyId || !canReadPayroll) return [];
    const supabase = await createClient();
    const { data } = await supabase
      .from("payroll_runs")
      .select("id, name, period_start, period_end, pay_date, status, total_net")
      .eq("company_id", companyId)
      .order("period_start", { ascending: false })
      .limit(5);
    return (data as RecentRun[] | null) ?? [];
  }

  const [totalEmployees, activeEmployees, pendingLeave, recentRuns] = await Promise.all([
    countEmployees(false),
    countEmployees(true),
    countPendingLeave(),
    loadRecentRuns(),
  ]);

  const latestRun = recentRuns[0] ?? null;
  const hasAnyStat = canReadEmployees || canReadLeave || canReadPayroll;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          {session.fullName ? `Welcome back, ${session.fullName}.` : "Welcome back."} Here is the
          latest activity for your organization.
        </p>
      </div>

      {hasAnyStat ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {canReadEmployees ? (
            <>
              <StatCard
                label="Employees"
                value={totalEmployees !== null ? String(totalEmployees) : "—"}
                hint="Total on record"
                icon={Users}
              />
              <StatCard
                label="Active"
                value={activeEmployees !== null ? String(activeEmployees) : "—"}
                hint="Currently active"
                icon={UserCheck}
              />
            </>
          ) : null}
          {canReadLeave ? (
            <StatCard
              label="Pending leave"
              value={pendingLeave !== null ? String(pendingLeave) : "—"}
              hint="Awaiting review"
              icon={CalendarClock}
            />
          ) : null}
          {canReadPayroll ? (
            <StatCard
              label="Latest net payroll"
              value={latestRun ? formatMoney(latestRun.total_net) : formatMoney(0)}
              hint={
                latestRun
                  ? latestRun.name ?? formatPeriod(latestRun.period_start, latestRun.period_end)
                  : "No runs yet"
              }
              icon={Wallet}
            />
          ) : null}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Inbox className="size-6" aria-hidden />
            </span>
            <p className="text-base font-medium text-foreground">You&apos;re all set</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              You don&apos;t have access to company metrics yet. Reach out to an administrator if
              you need additional permissions.
            </p>
          </CardContent>
        </Card>
      )}

      {canReadPayroll ? (
        <Card>
          <CardHeader>
            <CardTitle>Recent payroll runs</CardTitle>
            <CardDescription>The five most recent pay periods.</CardDescription>
          </CardHeader>
          <CardContent>
            {recentRuns.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Net total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentRuns.map((run) => {
                    const badge = STATUS_BADGE[run.status] ?? {
                      label: run.status,
                      variant: "secondary" as const,
                    };
                    return (
                      <TableRow key={run.id}>
                        <TableCell className="font-medium text-foreground">
                          {run.name ?? "Untitled run"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatPeriod(run.period_start, run.period_end)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={badge.variant}>{badge.label}</Badge>
                        </TableCell>
                        <TableCell className="text-right font-medium text-foreground">
                          {formatMoney(run.total_net)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            ) : (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <Wallet className="size-6" aria-hidden />
                </span>
                <p className="text-base font-medium text-foreground">No payroll runs yet</p>
                <p className="max-w-sm text-sm text-muted-foreground">
                  Once you process a payroll run it will appear here.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
