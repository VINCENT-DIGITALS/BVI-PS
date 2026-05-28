import Link from "next/link";
import {
  Banknote,
  Building2,
  CalendarDays,
  FileText,
  IdCard,
  UserCircle,
} from "lucide-react";
import { requireSession } from "@/lib/auth";
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
import { RequestLeaveForm } from "./request-leave-form";

type EmployeeRow = {
  id: string;
  company_id: string;
  employee_number: string | null;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  preferred_name: string | null;
  email: string | null;
  employment_type: string | null;
  status: string | null;
  pay_type: string | null;
  pay_frequency: string | null;
  annual_salary: number | string | null;
  hourly_rate: number | string | null;
  departments: { name: string | null } | null;
};

type PayslipRow = {
  id: string;
  payslip_number: string | null;
  net_pay: number | string | null;
  currency: string | null;
  issued_at: string | null;
  created_at: string | null;
};

type LeaveRequestRow = {
  id: string;
  leave_type: string | null;
  start_date: string | null;
  end_date: string | null;
  days_requested: number | string | null;
  is_paid: boolean | null;
  reason: string | null;
  status: string | null;
  created_at: string | null;
};

const LEAVE_STATUS_VARIANT: Record<
  string,
  "default" | "secondary" | "success" | "warning" | "destructive" | "outline"
> = {
  pending: "warning",
  approved: "success",
  rejected: "destructive",
  cancelled: "secondary",
};

const TITLE_CASE = (value: string | null | undefined) =>
  value
    ? value
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase())
    : "—";

function formatMoney(value: number | string | null | undefined, currency = "USD") {
  const numeric = typeof value === "string" ? Number.parseFloat(value) : value ?? 0;
  const safe = Number.isFinite(numeric as number) ? (numeric as number) : 0;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
    }).format(safe);
  } catch {
    return `${currency || "USD"} ${safe.toFixed(2)}`;
  }
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(parsed);
}

export default async function PortalPage() {
  const session = await requireSession();
  const companyId = session.activeCompanyId;
  const supabase = await createClient();

  let employee: EmployeeRow | null = null;

  if (companyId) {
    const { data } = await supabase
      .from("employees")
      .select(
        "id, company_id, employee_number, first_name, middle_name, last_name, preferred_name, email, employment_type, status, pay_type, pay_frequency, annual_salary, hourly_rate, departments(name)",
      )
      .eq("company_id", companyId)
      .eq("user_id", session.userId)
      .maybeSingle();

    employee = (data as EmployeeRow | null) ?? null;
  }

  if (!companyId || !employee) {
    return (
      <div className="space-y-6">
        <PageHeader title="My Portal" description="Your personal employee self-service area." />
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <UserCircle className="size-6" />
            </div>
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-foreground">
                Your account is not linked to an employee record
              </h2>
              <p className="mx-auto max-w-md text-sm text-muted-foreground">
                We could not find an employee profile connected to your account for this company.
                Please contact your HR administrator to have your account linked so you can view
                your payslips and request leave.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const employeeId = employee.id;

  const [{ data: payslipData }, { data: leaveData }] = await Promise.all([
    supabase
      .from("payslips")
      .select("id, payslip_number, net_pay, currency, issued_at, created_at")
      .eq("company_id", companyId)
      .eq("employee_id", employeeId)
      .order("issued_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("leave_requests")
      .select(
        "id, leave_type, start_date, end_date, days_requested, is_paid, reason, status, created_at",
      )
      .eq("company_id", companyId)
      .eq("employee_id", employeeId)
      .order("created_at", { ascending: false }),
  ]);

  const payslips = (payslipData as PayslipRow[] | null) ?? [];
  const leaveRequests = (leaveData as LeaveRequestRow[] | null) ?? [];

  const displayName =
    [employee.preferred_name || employee.first_name, employee.last_name]
      .filter(Boolean)
      .join(" ") || "Employee";

  const payInfo =
    employee.pay_type === "hourly"
      ? `${formatMoney(employee.hourly_rate, "USD")} / hr`
      : `${formatMoney(employee.annual_salary, "USD")} / yr`;

  return (
    <div className="space-y-6">
      <PageHeader title="My Portal" description="Your personal employee self-service area." />

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Your employment details on record.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <ProfileField icon={UserCircle} label="Name" value={displayName} />
            <ProfileField
              icon={IdCard}
              label="Employee number"
              value={employee.employee_number || "—"}
            />
            <ProfileField
              icon={Building2}
              label="Department"
              value={employee.departments?.name || "Unassigned"}
            />
            <ProfileField
              icon={CalendarDays}
              label="Employment type"
              value={TITLE_CASE(employee.employment_type)}
            />
            <ProfileField icon={UserCircle} label="Status" value={TITLE_CASE(employee.status)} />
            <ProfileField icon={Banknote} label="Pay" value={payInfo} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payslips</CardTitle>
          <CardDescription>Your most recent payslips, newest first.</CardDescription>
        </CardHeader>
        <CardContent>
          {payslips.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
              <div className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <FileText className="size-5" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">No payslips yet</p>
                <p className="text-sm text-muted-foreground">
                  Your payslips will appear here once payroll has been processed.
                </p>
              </div>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Payslip</TableHead>
                  <TableHead>Issued</TableHead>
                  <TableHead className="text-right">Net pay</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payslips.map((slip) => (
                  <TableRow key={slip.id}>
                    <TableCell className="font-medium text-foreground">
                      {slip.payslip_number || "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(slip.issued_at ?? slip.created_at)}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatMoney(slip.net_pay, slip.currency || "USD")}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/payroll/payslips/${slip.id}`}>View</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
          <div className="space-y-1.5">
            <CardTitle>Leave requests</CardTitle>
            <CardDescription>Track your submitted leave and request more.</CardDescription>
          </div>
          <RequestLeaveForm employeeId={employeeId} companyId={companyId} />
        </CardHeader>
        <CardContent>
          {leaveRequests.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
              <div className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <CalendarDays className="size-5" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">No leave requests yet</p>
                <p className="text-sm text-muted-foreground">
                  Use the button above to submit your first leave request.
                </p>
              </div>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Dates</TableHead>
                  <TableHead className="text-right">Days</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leaveRequests.map((req) => {
                  const status = (req.status || "pending").toLowerCase();
                  return (
                    <TableRow key={req.id}>
                      <TableCell className="font-medium text-foreground">
                        {TITLE_CASE(req.leave_type)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(req.start_date)} – {formatDate(req.end_date)}
                      </TableCell>
                      <TableCell className="text-right">
                        {req.days_requested != null ? String(req.days_requested) : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={LEAVE_STATUS_VARIANT[status] ?? "secondary"}>
                          {TITLE_CASE(status)}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PageHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="space-y-1">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
      {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
    </div>
  );
}

function ProfileField({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <Icon className="size-4" />
      </div>
      <div className="min-w-0 space-y-0.5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="truncate text-sm font-medium text-foreground">{value}</p>
      </div>
    </div>
  );
}
