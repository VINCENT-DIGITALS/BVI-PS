import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireSession, can } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  getEmployee,
  listDepartments,
  listPositions,
  type Employee,
  type EmployeeStatus,
} from "@/lib/services/employees";
import { EmployeeForm, type EmployeeFormValues } from "../employee-form";
import { updateEmployee, type ActionResult } from "../actions";

const STATUS_LABELS: Record<EmployeeStatus, string> = {
  active: "Active",
  on_leave: "On leave",
  suspended: "Suspended",
  terminated: "Terminated",
};

const STATUS_VARIANTS: Record<EmployeeStatus, BadgeProps["variant"]> = {
  active: "success",
  on_leave: "warning",
  suspended: "warning",
  terminated: "destructive",
};

const EMPLOYMENT_LABELS: Record<string, string> = {
  full_time: "Full time",
  part_time: "Part time",
  contract: "Contract",
  temporary: "Temporary",
};

const PAY_TYPE_LABELS: Record<string, string> = {
  salaried: "Salaried",
  hourly: "Hourly",
};

const PAY_FREQUENCY_LABELS: Record<string, string> = {
  weekly: "Weekly",
  biweekly: "Bi-weekly",
  semimonthly: "Semi-monthly",
  monthly: "Monthly",
};

function fmtDate(value: string | null): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function fmtMoney(value: number | string | null): string {
  if (value === null || value === undefined || value === "") return "—";
  const num = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(num)) return String(value);
  return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function toNumberString(value: number | string | null): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

function toFormValues(employee: Employee): EmployeeFormValues {
  return {
    first_name: employee.first_name,
    last_name: employee.last_name,
    employee_number: employee.employee_number,
    email: employee.email ?? "",
    hire_date: employee.hire_date,
    employment_type: employee.employment_type,
    status: employee.status,
    pay_type: employee.pay_type,
    pay_frequency: employee.pay_frequency,
    annual_salary: toNumberString(employee.annual_salary),
    hourly_rate: toNumberString(employee.hourly_rate),
    standard_hours_per_period: toNumberString(employee.standard_hours_per_period),
    department_id: employee.department_id ?? "",
    subject_to_payroll_tax: employee.subject_to_payroll_tax,
    subject_to_social_security: employee.subject_to_social_security,
    subject_to_nhi: employee.subject_to_nhi,
  };
}

export default async function EmployeeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireSession();
  const companyId = session.activeCompanyId;

  if (!companyId || !can(session, companyId, "employees.read")) {
    redirect("/employees");
  }

  const employee = await getEmployee(companyId, id);
  if (!employee) notFound();

  const canManage = can(session, companyId, "employees.manage");
  const fullName = [employee.first_name, employee.last_name].filter(Boolean).join(" ");

  async function saveAction(values: EmployeeFormValues): Promise<ActionResult> {
    "use server";
    return updateEmployee(id, values);
  }

  let departments: Awaited<ReturnType<typeof listDepartments>> = [];
  let positions: Awaited<ReturnType<typeof listPositions>> = [];
  if (canManage) {
    [departments, positions] = await Promise.all([
      listDepartments(companyId),
      listPositions(companyId),
    ]);
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
          <Link href="/employees">
            <ArrowLeft className="h-4 w-4" />
            Back to employees
          </Link>
        </Button>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{fullName}</h1>
            <p className="text-sm text-muted-foreground">
              Employee #{employee.employee_number}
            </p>
          </div>
          <Badge variant={STATUS_VARIANTS[employee.status]}>
            {STATUS_LABELS[employee.status]}
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Personal details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <DetailRow label="Full name" value={fullName} />
            <DetailRow label="Email" value={employee.email ?? "—"} />
            <DetailRow label="Phone" value={employee.phone ?? "—"} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Employment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <DetailRow label="Hire date" value={fmtDate(employee.hire_date)} />
            <DetailRow
              label="Employment type"
              value={EMPLOYMENT_LABELS[employee.employment_type] ?? employee.employment_type}
            />
            <DetailRow label="Status" value={STATUS_LABELS[employee.status]} />
            {employee.termination_date ? (
              <DetailRow label="Termination date" value={fmtDate(employee.termination_date)} />
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Compensation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <DetailRow
              label="Pay type"
              value={PAY_TYPE_LABELS[employee.pay_type] ?? employee.pay_type}
            />
            <DetailRow
              label="Pay frequency"
              value={PAY_FREQUENCY_LABELS[employee.pay_frequency] ?? employee.pay_frequency}
            />
            {employee.pay_type === "salaried" ? (
              <DetailRow label="Annual salary" value={fmtMoney(employee.annual_salary)} />
            ) : (
              <DetailRow label="Hourly rate" value={fmtMoney(employee.hourly_rate)} />
            )}
            <DetailRow
              label="Standard hours / period"
              value={toNumberString(employee.standard_hours_per_period) || "—"}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Statutory contributions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <DetailRow
              label="Payroll tax"
              value={employee.subject_to_payroll_tax ? "Subject" : "Exempt"}
            />
            <DetailRow
              label="Social security"
              value={employee.subject_to_social_security ? "Subject" : "Exempt"}
            />
            <DetailRow label="NHI" value={employee.subject_to_nhi ? "Subject" : "Exempt"} />
          </CardContent>
        </Card>
      </div>

      {canManage ? (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Edit employee</h2>
            <p className="text-sm text-muted-foreground">Update this employee&apos;s record.</p>
          </div>
          <EmployeeForm
            mode="edit"
            defaultValues={toFormValues(employee)}
            departments={departments}
            positions={positions}
            action={saveAction}
          />
        </div>
      ) : null}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground text-right">{value}</span>
    </div>
  );
}
