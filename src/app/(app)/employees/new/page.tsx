import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireSession, can } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { listDepartments, listPositions } from "@/lib/services/employees";
import { EmployeeForm } from "../employee-form";
import { createEmployee } from "../actions";

export default async function NewEmployeePage() {
  const session = await requireSession();
  const companyId = session.activeCompanyId;

  if (!companyId || !can(session, companyId, "employees.manage")) {
    redirect("/employees");
  }

  const [departments, positions] = await Promise.all([
    listDepartments(companyId),
    listPositions(companyId),
  ]);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
          <Link href="/employees">
            <ArrowLeft className="h-4 w-4" />
            Back to employees
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">New employee</h1>
          <p className="text-sm text-muted-foreground">
            Add a new employee to your company.
          </p>
        </div>
      </div>

      <EmployeeForm
        mode="create"
        departments={departments}
        positions={positions}
        action={createEmployee}
      />
    </div>
  );
}
