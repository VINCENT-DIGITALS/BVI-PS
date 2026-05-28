import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Membership = {
  company_id: string;
  role_id: string;
  role_name: string | null;
  company_name: string | null;
  permissions: string[];
};

export type SessionContext = {
  userId: string;
  email: string;
  fullName: string | null;
  isSuperAdmin: boolean;
  memberships: Membership[];
  activeCompanyId: string | null;
};

/** Returns the authenticated auth user, or null. */
export async function getAuthUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/**
 * Loads the full session context (profile, memberships, resolved permissions).
 * Returns null when unauthenticated.
 */
export async function getSessionContext(): Promise<SessionContext | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("users")
    .select("id, email, full_name, is_super_admin, default_company_id")
    .eq("id", user.id)
    .single();

  const { data: memberRows } = await supabase
    .from("company_members")
    .select(
      "company_id, role_id, is_active, companies(legal_name, trading_name), roles(name, role_permissions(permissions(key)))",
    )
    .eq("user_id", user.id)
    .eq("is_active", true);

  const memberships: Membership[] = (memberRows ?? []).map((m: Record<string, unknown>) => {
    const company = m.companies as { legal_name?: string; trading_name?: string } | null;
    const role = m.roles as
      | { name?: string; role_permissions?: { permissions?: { key?: string } | null }[] }
      | null;
    const permissions =
      role?.role_permissions
        ?.map((rp) => rp.permissions?.key)
        .filter((k): k is string => Boolean(k)) ?? [];
    return {
      company_id: m.company_id as string,
      role_id: m.role_id as string,
      role_name: role?.name ?? null,
      company_name: company?.trading_name || company?.legal_name || null,
      permissions,
    };
  });

  const activeCompanyId =
    (profile?.default_company_id as string | null) ?? memberships[0]?.company_id ?? null;

  return {
    userId: user.id,
    email: (profile?.email as string) ?? user.email ?? "",
    fullName: (profile?.full_name as string | null) ?? null,
    isSuperAdmin: Boolean(profile?.is_super_admin),
    memberships,
    activeCompanyId,
  };
}

/** Redirects to /login if unauthenticated; otherwise returns the session. */
export async function requireSession(): Promise<SessionContext> {
  const session = await getSessionContext();
  if (!session) redirect("/login");
  return session;
}

/** True if the user holds `permission` in the given company (super admin always true). */
export function can(session: SessionContext, companyId: string | null, permission: string) {
  if (session.isSuperAdmin) return true;
  if (!companyId) return false;
  const membership = session.memberships.find((m) => m.company_id === companyId);
  return membership?.permissions.includes(permission) ?? false;
}
