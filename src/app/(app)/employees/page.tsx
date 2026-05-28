import Link from "next/link";
import { Plus, Users } from "lucide-react";
import { requireSession, can } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  listEmployees,
  type EmployeeListRow,
  type EmployeeStatus,
} from "@/lib/services/employees";

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

function fullName(e: EmployeeListRow) {
  return [e.first_name, e.last_name].filter(Boolean).join(" ");
}

export default async function EmployeesPage() {
  const session = await requireSession();
  const companyId = session.activeCompanyId;

  if (!companyId || !can(session, companyId, "employees.read")) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Employees</h1>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 py-16 text-center">
            <Users className="h-8 w-8 text-muted-foreground" />
            <p className="text-base font-medium">No access</p>
            <p className="text-sm text-muted-foreground">
              You do not have permission to view employees.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const canManage = can(session, companyId, "employees.manage");
  const employees = await listEmployees(companyId);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Employees</h1>
          <p className="text-sm text-muted-foreground">
            Manage your company&apos;s workforce records.
          </p>
        </div>
        {canManage ? (
          <Button asChild>
            <Link href="/employees/new">
              <Plus className="h-4 w-4" />
              Add employee
            </Link>
          </Button>
        ) : null}
      </div>

      {employees.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 py-16 text-center">
            <Users className="h-8 w-8 text-muted-foreground" />
            <p className="text-base font-medium">No employees yet</p>
            <p className="text-sm text-muted-foreground">
              Get started by adding your first employee.
            </p>
            {canManage ? (
              <Button asChild className="mt-2">
                <Link href="/employees/new">
                  <Plus className="h-4 w-4" />
                  Add employee
                </Link>
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee #</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="hidden md:table-cell">Department</TableHead>
                  <TableHead className="hidden sm:table-cell">Type</TableHead>
                  <TableHead className="hidden sm:table-cell">Pay</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {employees.map((employee) => (
                  <TableRow key={employee.id} className="cursor-pointer">
                    <TableCell className="font-medium">
                      <Link
                        href={`/employees/${employee.id}`}
                        className="block focus:outline-none focus-visible:underline"
                      >
                        {employee.employee_number}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/employees/${employee.id}`}
                        className="block focus:outline-none focus-visible:underline"
                      >
                        {fullName(employee)}
                      </Link>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground">
                      {employee.department_name ?? "—"}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-muted-foreground">
                      {EMPLOYMENT_LABELS[employee.employment_type] ?? employee.employment_type}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-muted-foreground">
                      {PAY_TYPE_LABELS[employee.pay_type] ?? employee.pay_type}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANTS[employee.status]}>
                        {STATUS_LABELS[employee.status]}
                      </Badge>
                    </TableCell>
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
