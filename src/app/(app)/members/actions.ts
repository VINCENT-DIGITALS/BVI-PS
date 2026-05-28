"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession, can } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export type ActionResult = { ok: boolean; error?: string };

const uuid = z.string().uuid();

async function authorize() {
  const session = await requireSession();
  const companyId = session.activeCompanyId;
  if (!companyId) return { error: "No active company" as const };
  if (!can(session, companyId, "members.manage")) {
    return { error: "You do not have permission to manage members" as const };
  }
  return { session, companyId };
}

/** Change a member's role. */
export async function changeMemberRole(memberId: string, roleId: string): Promise<ActionResult> {
  if (!uuid.safeParse(memberId).success || !uuid.safeParse(roleId).success) {
    return { ok: false, error: "Invalid selection" };
  }
  const auth = await authorize();
  if ("error" in auth) return { ok: false, error: auth.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("company_members")
    .update({ role_id: roleId } as never)
    .eq("id", memberId)
    .eq("company_id", auth.companyId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/members");
  return { ok: true };
}

/** Add an existing (already signed-up) user to this company by email. */
export async function addMemberByEmail(email: string, roleId: string): Promise<ActionResult> {
  const parsedEmail = z.string().email().safeParse(email.trim());
  if (!parsedEmail.success) return { ok: false, error: "Enter a valid email" };
  if (!uuid.safeParse(roleId).success) return { ok: false, error: "Select a role" };

  const auth = await authorize();
  if ("error" in auth) return { ok: false, error: auth.error };

  // Service client: a non-member user is invisible under RLS, so look them up
  // with elevated access — but only after the permission check above.
  const admin = createServiceClient();

  const { data: user, error: lookupError } = await admin
    .from("users")
    .select("id")
    .eq("email", parsedEmail.data)
    .maybeSingle();
  if (lookupError) return { ok: false, error: lookupError.message };
  if (!user) {
    return { ok: false, error: "No account with that email. Ask them to sign up first." };
  }

  const { error: insertError } = await admin.from("company_members").insert({
    user_id: (user as { id: string }).id,
    company_id: auth.companyId,
    role_id: roleId,
    invited_by: auth.session.userId,
    is_active: true,
  } as never);
  if (insertError) {
    if (insertError.code === "23505") {
      return { ok: false, error: "That user is already a member of this company" };
    }
    return { ok: false, error: insertError.message };
  }

  revalidatePath("/members");
  return { ok: true };
}

/** Remove a member from the company (cannot remove yourself or the owner). */
export async function removeMember(memberId: string): Promise<ActionResult> {
  if (!uuid.safeParse(memberId).success) return { ok: false, error: "Invalid member" };

  const auth = await authorize();
  if ("error" in auth) return { ok: false, error: auth.error };

  const supabase = await createClient();
  const { data: member } = await supabase
    .from("company_members")
    .select("user_id")
    .eq("id", memberId)
    .eq("company_id", auth.companyId)
    .single();
  if (!member) return { ok: false, error: "Member not found" };

  const targetUserId = (member as { user_id: string }).user_id;
  if (targetUserId === auth.session.userId) {
    return { ok: false, error: "You cannot remove your own membership" };
  }

  const { data: company } = await supabase
    .from("companies")
    .select("owner_id")
    .eq("id", auth.companyId)
    .single();
  if (company && (company as { owner_id: string | null }).owner_id === targetUserId) {
    return { ok: false, error: "The company owner cannot be removed" };
  }

  const { error } = await supabase
    .from("company_members")
    .delete()
    .eq("id", memberId)
    .eq("company_id", auth.companyId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/members");
  return { ok: true };
}

/** Link (or unlink) a member to an employee record for self-service access. */
export async function linkMemberEmployee(
  memberId: string,
  employeeId: string,
): Promise<ActionResult> {
  if (!uuid.safeParse(memberId).success) return { ok: false, error: "Invalid member" };
  const targetEmployeeId = employeeId === "" ? null : employeeId;
  if (targetEmployeeId && !uuid.safeParse(targetEmployeeId).success) {
    return { ok: false, error: "Invalid employee" };
  }

  const auth = await authorize();
  if ("error" in auth) return { ok: false, error: auth.error };

  const supabase = await createClient();
  const { data: member } = await supabase
    .from("company_members")
    .select("user_id")
    .eq("id", memberId)
    .eq("company_id", auth.companyId)
    .single();
  if (!member) return { ok: false, error: "Member not found" };

  const { error } = await supabase
    .from("company_members")
    .update({ employee_id: targetEmployeeId } as never)
    .eq("id", memberId)
    .eq("company_id", auth.companyId);
  if (error) return { ok: false, error: error.message };

  // Keep employees.user_id in sync so the self-service portal resolves "my" data.
  if (targetEmployeeId) {
    await supabase
      .from("employees")
      .update({ user_id: (member as { user_id: string }).user_id } as never)
      .eq("id", targetEmployeeId)
      .eq("company_id", auth.companyId);
  }

  revalidatePath("/members");
  revalidatePath("/portal");
  return { ok: true };
}
