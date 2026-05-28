import { ShieldAlert } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { requireSession, can } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { MembersManager, type MemberRow, type RoleOption, type EmployeeOption } from "./members-manager";

export const metadata = { title: "Members & Roles" };

export default async function MembersPage() {
  const session = await requireSession();
  const companyId = session.activeCompanyId;

  if (!companyId || !can(session, companyId, "members.manage")) {
    return (
      <div className="space-y-6">
        <PageHeader title="Members & Roles" description="Manage who can access this company and what they can do." />
        <EmptyState
          icon={ShieldAlert}
          title="No access"
          description="You need the Members permission to manage roles for this company."
        />
      </div>
    );
  }

  const supabase = await createClient();

  const [{ data: company }, { data: memberRows }, { data: roleRows }, { data: employeeRows }] =
    await Promise.all([
      supabase.from("companies").select("owner_id").eq("id", companyId).single(),
      supabase
        .from("company_members")
        .select(
          "id, user_id, role_id, employee_id, is_active, users(full_name, email), roles(name), employees(first_name, last_name, employee_number)",
        )
        .eq("company_id", companyId)
        .order("created_at", { ascending: true }),
      supabase
        .from("roles")
        .select("id, name, description")
        .or(`company_id.is.null,company_id.eq.${companyId}`)
        .order("name", { ascending: true }),
      supabase
        .from("employees")
        .select("id, first_name, last_name, employee_number")
        .eq("company_id", companyId)
        .order("first_name", { ascending: true }),
    ]);

  const ownerId = (company as { owner_id: string | null } | null)?.owner_id ?? null;

  const members: MemberRow[] = (memberRows ?? []).map((m: Record<string, unknown>) => {
    const user = m.users as { full_name: string | null; email: string | null } | null;
    const role = m.roles as { name: string | null } | null;
    const emp = m.employees as
      | { first_name: string; last_name: string; employee_number: string | null }
      | null;
    return {
      id: m.id as string,
      userId: m.user_id as string,
      name: user?.full_name || user?.email || "Unknown user",
      email: user?.email ?? "",
      roleId: m.role_id as string,
      roleName: role?.name ?? "—",
      employeeId: (m.employee_id as string | null) ?? "",
      employeeName: emp ? `${emp.first_name} ${emp.last_name}` : null,
      isActive: Boolean(m.is_active),
    };
  });

  const roles: RoleOption[] = (roleRows ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    name: r.name as string,
    description: (r.description as string | null) ?? null,
  }));

  const employees: EmployeeOption[] = (employeeRows ?? []).map((e: Record<string, unknown>) => ({
    id: e.id as string,
    label: `${e.first_name as string} ${e.last_name as string}${
      e.employee_number ? ` (${e.employee_number as string})` : ""
    }`,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Members & Roles"
        description="Invite teammates, assign roles, and link logins to employee records."
      />
      <MembersManager
        members={members}
        roles={roles}
        employees={employees}
        ownerId={ownerId}
        currentUserId={session.userId}
      />
    </div>
  );
}
