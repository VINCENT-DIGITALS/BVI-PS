import { redirect } from "next/navigation";
import { format } from "date-fns";
import { CalendarClock, Clock } from "lucide-react";
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
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { AttendanceForm } from "./attendance-form";

export const metadata = { title: "Attendance" };

type EmployeeRef = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  preferred_name: string | null;
} | null;

type AttendanceRow = {
  id: string;
  work_date: string;
  status: string;
  clock_in: string | null;
  clock_out: string | null;
  worked_hours: number | string | null;
  overtime_hours: number | string | null;
  employees: EmployeeRef;
};

type ShiftRow = {
  id: string;
  name: string | null;
  shift_date: string | null;
  start_time: string;
  end_time: string;
  break_minutes: number | null;
  employees: EmployeeRef;
};

const STATUS_BADGE: Record<
  string,
  { label: string; variant: "default" | "secondary" | "success" | "warning" | "destructive" | "outline" }
> = {
  present: { label: "Present", variant: "success" },
  late: { label: "Late", variant: "warning" },
  half_day: { label: "Half day", variant: "warning" },
  holiday: { label: "Holiday", variant: "secondary" },
  on_leave: { label: "On leave", variant: "secondary" },
  absent: { label: "Absent", variant: "destructive" },
};

function employeeName(employee: EmployeeRef): string {
  if (!employee) return "Unknown";
  const display =
    employee.preferred_name ||
    [employee.first_name, employee.last_name].filter(Boolean).join(" ").trim();
  return display || "Unnamed employee";
}

function fmtTimestamp(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return format(d, "dd MMM yyyy, HH:mm");
}

function fmtDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return format(d, "dd MMM yyyy");
}

function fmtHours(value: number | string | null): string {
  if (value === null || value === undefined) return "0.00";
  const n = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(n)) return "0.00";
  return n.toFixed(2);
}

function fmtTime(value: string): string {
  // Postgres time comes back as "HH:mm:ss" — trim to HH:mm.
  return value.slice(0, 5);
}

export default async function AttendancePage() {
  const session = await requireSession();
  const companyId = session.activeCompanyId;

  if (!companyId || !can(session, companyId, "attendance.read")) {
    redirect("/dashboard");
  }

  const canManage = can(session, companyId, "attendance.manage");
  const supabase = await createClient();

  const since = new Date();
  since.setDate(since.getDate() - 30);
  const sinceDate = since.toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);

  const [logsRes, shiftsRes, employeesRes] = await Promise.all([
    supabase
      .from("attendance_logs")
      .select(
        "id, work_date, status, clock_in, clock_out, worked_hours, overtime_hours, employees(id, first_name, last_name, preferred_name)",
      )
      .eq("company_id", companyId)
      .gte("work_date", sinceDate)
      .order("work_date", { ascending: false })
      .limit(100),
    supabase
      .from("shifts")
      .select(
        "id, name, shift_date, start_time, end_time, break_minutes, employees(id, first_name, last_name, preferred_name)",
      )
      .eq("company_id", companyId)
      .gte("shift_date", today)
      .order("shift_date", { ascending: true })
      .limit(50),
    canManage
      ? supabase
          .from("employees")
          .select("id, first_name, last_name, preferred_name, status")
          .eq("company_id", companyId)
          .neq("status", "terminated")
          .order("last_name", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
  ]);

  const logs = (logsRes.data ?? []) as unknown as AttendanceRow[];
  const shifts = (shiftsRes.data ?? []) as unknown as ShiftRow[];
  const employees = ((employeesRes.data ?? []) as unknown as EmployeeRef[])
    .filter((e): e is NonNullable<EmployeeRef> => Boolean(e))
    .map((e) => ({ id: e.id, name: employeeName(e) }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Attendance</h1>
          <p className="text-sm text-muted-foreground">
            Track worked hours and upcoming shift schedules.
          </p>
        </div>
        {canManage && <AttendanceForm employees={employees} />}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent attendance</CardTitle>
          <CardDescription>Logs recorded in the last 30 days.</CardDescription>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <EmptyState
              icon={Clock}
              title="No attendance recorded"
              description="Recorded attendance for the last 30 days will appear here."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Employee</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Clock in</TableHead>
                  <TableHead>Clock out</TableHead>
                  <TableHead className="text-right">Worked</TableHead>
                  <TableHead className="text-right">Overtime</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => {
                  const badge = STATUS_BADGE[log.status] ?? {
                    label: log.status,
                    variant: "outline" as const,
                  };
                  return (
                    <TableRow key={log.id}>
                      <TableCell className="whitespace-nowrap">{fmtDate(log.work_date)}</TableCell>
                      <TableCell className="font-medium">{employeeName(log.employees)}</TableCell>
                      <TableCell>
                        <Badge variant={badge.variant}>{badge.label}</Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {fmtTimestamp(log.clock_in)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {fmtTimestamp(log.clock_out)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtHours(log.worked_hours)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtHours(log.overtime_hours)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Upcoming shifts</CardTitle>
          <CardDescription>Scheduled shifts from today onward.</CardDescription>
        </CardHeader>
        <CardContent>
          {shifts.length === 0 ? (
            <EmptyState
              icon={CalendarClock}
              title="No upcoming shifts"
              description="Scheduled shifts will appear here once created."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Shift</TableHead>
                  <TableHead>Employee</TableHead>
                  <TableHead>Start</TableHead>
                  <TableHead>End</TableHead>
                  <TableHead className="text-right">Break (min)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shifts.map((shift) => (
                  <TableRow key={shift.id}>
                    <TableCell className="whitespace-nowrap">{fmtDate(shift.shift_date)}</TableCell>
                    <TableCell className="font-medium">{shift.name ?? "Shift"}</TableCell>
                    <TableCell>
                      {shift.employees ? employeeName(shift.employees) : "Unassigned"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{fmtTime(shift.start_time)}</TableCell>
                    <TableCell className="whitespace-nowrap">{fmtTime(shift.end_time)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {shift.break_minutes ?? 0}
                    </TableCell>
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

function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Clock;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-12 text-center">
      <div className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="size-5" />
      </div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
