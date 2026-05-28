"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireSession, can } from "@/lib/auth";

const LEAVE_TYPES = [
  "annual",
  "sick",
  "maternity",
  "paternity",
  "unpaid",
  "bereavement",
  "other",
] as const;

export type ActionResult = { ok: true } | { ok: false; error: string };

const createLeaveSchema = z.object({
  employee_id: z.string().uuid("Select an employee."),
  leave_type: z.enum(LEAVE_TYPES),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid start date."),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid end date."),
  days_requested: z
    .number({ invalid_type_error: "Days requested must be a number." })
    .positive("Days requested must be greater than zero."),
  is_paid: z.boolean(),
  reason: z.string().trim().max(2000).optional().nullable(),
});

export type CreateLeaveInput = z.infer<typeof createLeaveSchema>;

/**
 * Row shapes for the `leave_requests` table. The generated Supabase types in
 * `src/types/database.ts` are still the loose placeholder, so the typed client
 * infers `never` for write payloads. These interfaces keep our payloads fully
 * type-checked; we cast only at the `.from()` boundary.
 */
type LeaveInsert = {
  company_id: string;
  employee_id: string;
  leave_type: (typeof LEAVE_TYPES)[number];
  start_date: string;
  end_date: string;
  days_requested: number;
  is_paid: boolean;
  reason: string | null;
  status: "pending";
  requested_by: string;
};

type LeaveReviewUpdate = {
  status: "approved" | "rejected";
  reviewed_by: string;
  reviewed_at: string;
  review_note: string | null;
};

const idSchema = z.string().uuid("Invalid leave request.");
const rejectSchema = z.object({
  id: z.string().uuid("Invalid leave request."),
  note: z.string().trim().max(2000).optional().nullable(),
});

/** Resolve the company the current request operates against, or throw. */
async function resolveCompanyId(): Promise<{
  companyId: string;
  session: Awaited<ReturnType<typeof requireSession>>;
}> {
  const session = await requireSession();
  const companyId = session.activeCompanyId;
  if (!companyId) {
    throw new Error("No active company selected.");
  }
  return { companyId, session };
}

export async function createLeave(input: CreateLeaveInput): Promise<ActionResult> {
  const parsed = createLeaveSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const data = parsed.data;
  if (data.end_date < data.start_date) {
    return { ok: false, error: "End date must be on or after the start date." };
  }

  const { companyId, session } = await resolveCompanyId();
  if (!can(session, companyId, "leave.manage")) {
    return { ok: false, error: "You do not have permission to create leave requests." };
  }

  const supabase = await createClient();

  // Ensure the employee belongs to the active company before inserting.
  const { data: employee, error: empError } = await supabase
    .from("employees")
    .select("id")
    .eq("id", data.employee_id)
    .eq("company_id", companyId)
    .maybeSingle();

  if (empError) {
    return { ok: false, error: empError.message };
  }
  if (!employee) {
    return { ok: false, error: "Selected employee was not found for this company." };
  }

  const insertRow: LeaveInsert = {
    company_id: companyId,
    employee_id: data.employee_id,
    leave_type: data.leave_type,
    start_date: data.start_date,
    end_date: data.end_date,
    days_requested: data.days_requested,
    is_paid: data.is_paid,
    reason: data.reason?.trim() ? data.reason.trim() : null,
    status: "pending",
    requested_by: session.userId,
  };

  const { error } = await supabase
    .from("leave_requests")
    .insert(insertRow as never);

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/leave");
  return { ok: true };
}

async function reviewLeave(
  id: string,
  status: "approved" | "rejected",
  note: string | null,
): Promise<ActionResult> {
  const { companyId, session } = await resolveCompanyId();
  if (!can(session, companyId, "leave.approve")) {
    return { ok: false, error: "You do not have permission to review leave requests." };
  }

  const supabase = await createClient();
  const reviewedAt = new Date().toISOString();

  const updateRow: LeaveReviewUpdate = {
    status,
    reviewed_by: session.userId,
    reviewed_at: reviewedAt,
    review_note: note,
  };

  const { data: updated, error } = await supabase
    .from("leave_requests")
    .update(updateRow as never)
    .eq("id", id)
    .eq("company_id", companyId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  if (error) {
    return { ok: false, error: error.message };
  }
  if (!updated) {
    return { ok: false, error: "This request is no longer pending review." };
  }

  revalidatePath("/leave");
  return { ok: true };
}

export async function approveLeave(id: string): Promise<ActionResult> {
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid leave request." };
  }
  return reviewLeave(parsed.data, "approved", null);
}

export async function rejectLeave(id: string, note?: string): Promise<ActionResult> {
  const parsed = rejectSchema.safeParse({ id, note });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid leave request." };
  }
  const cleaned = parsed.data.note?.trim();
  return reviewLeave(parsed.data.id, "rejected", cleaned ? cleaned : null);
}
