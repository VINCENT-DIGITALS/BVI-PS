import { redirect } from "next/navigation";
import { CalendarOff, Check, X } from "lucide-react";
import { requireSession, can } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { LeaveForm, type LeaveFormEmployee } from "./leave-form";
import { approveLeave, rejectLeave } from "./actions";

type LeaveStatus = "pending" | "approved" | "rejected" | "cancelled";

type LeaveRow = {
  id: string;
  employee_name: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  days_requested: string;
  is_paid: boolean;
  reason: string | null;
  status: LeaveStatus;
};

const STATUS_VARIANT: Record<
  LeaveStatus,
  "default" | "secondary" | "success" | "warning" | "destructive" | "outline"
> = {
  pending: "warning",
  approved: "success",
  rejected: "destructive",
  cancelled: "secondary",
};

const LEAVE_TYPE_LABEL: Record<string, string> = {
  annual: "Annual",
  sick: "Sick",
  maternity: "Maternity",
  paternity: "Paternity",
  unpaid: "Unpaid",
  bereavement: "Bereavement",
  other: "Other",
};

function formatDate(value: string): string {
  // Date columns arrive as YYYY-MM-DD; render in a stable locale-independent way.
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatDays(value: string): string {
  const num = Number(value);
  if (Number.isNaN(num)) return value;
  return num % 1 === 0 ? String(num) : num.toFixed(2);
}

function employeeName(emp: { first_name?: unknown; last_name?: unknown } | null): string {
  if (!emp) return "Unknown employee";
  const first = typeof emp.first_name === "string" ? emp.first_name : "";
  const last = typeof emp.last_name === "string" ? emp.last_name : "";
  const full = `${first} ${last}`.trim();
  return full || "Unknown employee";
}

export default async function LeavePage() {
  const session = await requireSession();
  const companyId = session.activeCompanyId;

  if (!companyId || !can(session, companyId, "leave.read")) {
    redirect("/dashboard");
  }

  const supabase = await createClient();

  const [{ data: leaveData }, { data: employeeData }] = await Promise.all([
    supabase
      .from("leave_requests")
      .select(
        "id, leave_type, start_date, end_date, days_requested, is_paid, reason, status, employees(first_name, last_name)",
      )
      .eq("company_id", companyId)
      .order("start_date", { ascending: false }),
    supabase
      .from("employees")
      .select("id, first_name, last_name")
      .eq("company_id", companyId)
      .eq("status", "active")
      .order("first_name", { ascending: true }),
  ]);

  const requests: LeaveRow[] = (leaveData ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    const emp = (r.employees ?? null) as
      | { first_name?: unknown; last_name?: unknown }
      | { first_name?: unknown; last_name?: unknown }[]
      | null;
    const empObj = Array.isArray(emp) ? (emp[0] ?? null) : emp;
    return {
      id: String(r.id),
      employee_name: employeeName(empObj),
      leave_type: String(r.leave_type),
      start_date: String(r.start_date),
      end_date: String(r.end_date),
      days_requested: String(r.days_requested),
      is_paid: Boolean(r.is_paid),
      reason: typeof r.reason === "string" && r.reason.length > 0 ? r.reason : null,
      status: String(r.status) as LeaveStatus,
    };
  });

  const employees: LeaveFormEmployee[] = (employeeData ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id: String(r.id),
      name:
        `${typeof r.first_name === "string" ? r.first_name : ""} ${
          typeof r.last_name === "string" ? r.last_name : ""
        }`.trim() || "Unnamed employee",
    };
  });

  const canManage = can(session, companyId, "leave.manage");
  const canApprove = can(session, companyId, "leave.approve");

  async function approveAction(formData: FormData) {
    "use server";
    const id = String(formData.get("id") ?? "");
    await approveLeave(id);
  }

  async function rejectAction(formData: FormData) {
    "use server";
    const id = String(formData.get("id") ?? "");
    const note = formData.get("note");
    await rejectLeave(id, typeof note === "string" && note.length > 0 ? note : undefined);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Leave</h1>
          <p className="text-sm text-muted-foreground">
            Review and manage employee leave requests.
          </p>
        </div>
        {canManage ? <LeaveForm employees={employees} /> : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Leave requests</CardTitle>
          <CardDescription>
            {requests.length} request{requests.length === 1 ? "" : "s"} for this company.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {requests.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border py-12 text-center">
              <CalendarOff className="h-10 w-10 text-muted-foreground" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">No leave requests yet</p>
                <p className="text-sm text-muted-foreground">
                  {canManage
                    ? "Create a request to get started."
                    : "Leave requests will appear here once submitted."}
                </p>
              </div>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Days</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Reason</TableHead>
                  {canApprove ? <TableHead className="text-right">Actions</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map((req) => (
                  <TableRow key={req.id}>
                    <TableCell className="font-medium text-foreground">
                      {req.employee_name}
                    </TableCell>
                    <TableCell>
                      <span className="flex flex-col gap-1">
                        <span>{LEAVE_TYPE_LABEL[req.leave_type] ?? req.leave_type}</span>
                        <Badge variant={req.is_paid ? "secondary" : "outline"}>
                          {req.is_paid ? "Paid" : "Unpaid"}
                        </Badge>
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatDate(req.start_date)} – {formatDate(req.end_date)}
                    </TableCell>
                    <TableCell>{formatDays(req.days_requested)}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[req.status]} className="capitalize">
                        {req.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[16rem] text-muted-foreground">
                      <span className="line-clamp-2">{req.reason ?? "—"}</span>
                    </TableCell>
                    {canApprove ? (
                      <TableCell className="text-right">
                        {req.status === "pending" ? (
                          <div className="flex justify-end gap-2">
                            <form action={approveAction}>
                              <input type="hidden" name="id" value={req.id} />
                              <Button type="submit" size="sm" variant="secondary">
                                <Check />
                                Approve
                              </Button>
                            </form>
                            <form action={rejectAction}>
                              <input type="hidden" name="id" value={req.id} />
                              <Button type="submit" size="sm" variant="destructive">
                                <X />
                                Reject
                              </Button>
                            </form>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
