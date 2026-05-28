"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { can, requireSession } from "@/lib/auth";
import {
  approveRun,
  generatePayrollRun,
  generatePayslips,
  lockRun,
  markRunPaid,
} from "@/lib/services/payroll";

export type ActionResult = { error: string };

const generateRunSchema = z.object({
  name: z.string().trim().min(1, "A run name is required."),
  pay_frequency: z.enum(["weekly", "biweekly", "semimonthly", "monthly"]),
  period_start: z.string().min(1, "Period start is required."),
  period_end: z.string().min(1, "Period end is required."),
  pay_date: z.string().min(1, "Pay date is required."),
});

export type GenerateRunValues = z.infer<typeof generateRunSchema>;

/** Create a draft payroll run, then redirect to it. Returns {error} on failure. */
export async function generateRunAction(values: GenerateRunValues): Promise<ActionResult> {
  const session = await requireSession();
  const companyId = session.activeCompanyId;
  if (!companyId || !can(session, companyId, "payroll.manage")) {
    return { error: "You do not have permission to manage payroll." };
  }

  const parsed = generateRunSchema.safeParse(values);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid payroll run details." };
  }

  if (parsed.data.period_end < parsed.data.period_start) {
    return { error: "Period end must be on or after the period start." };
  }

  let runId: string;
  try {
    const supabase = await createClient();
    runId = await generatePayrollRun(supabase, {
      companyId,
      name: parsed.data.name,
      pay_frequency: parsed.data.pay_frequency,
      period_start: parsed.data.period_start,
      period_end: parsed.data.period_end,
      pay_date: parsed.data.pay_date,
      createdBy: session.userId,
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to generate payroll run." };
  }

  revalidatePath("/payroll");
  redirect(`/payroll/${runId}`);
}

/**
 * The status-transition actions below are bound to a `runId` and used directly
 * as native `<form action>` handlers in a Server Component, so they take the
 * form signature `(runId, formData)` and return `void`. DB triggers and the
 * permission guard surface failures by throwing — Next renders them through the
 * route's error boundary.
 */
export async function approveAction(runId: string, _formData?: FormData): Promise<void> {
  void _formData;
  const session = await requireSession();
  const companyId = session.activeCompanyId;
  if (!companyId || !can(session, companyId, "payroll.approve")) {
    throw new Error("You do not have permission to approve payroll.");
  }
  const supabase = await createClient();
  await approveRun(supabase, runId, session.userId);
  revalidatePath(`/payroll/${runId}`);
  revalidatePath("/payroll");
}

export async function lockAction(runId: string, _formData?: FormData): Promise<void> {
  void _formData;
  const session = await requireSession();
  const companyId = session.activeCompanyId;
  if (!companyId || !can(session, companyId, "payroll.lock")) {
    throw new Error("You do not have permission to lock payroll.");
  }
  const supabase = await createClient();
  await lockRun(supabase, runId, session.userId);
  revalidatePath(`/payroll/${runId}`);
  revalidatePath("/payroll");
}

export async function markPaidAction(runId: string, _formData?: FormData): Promise<void> {
  void _formData;
  const session = await requireSession();
  const companyId = session.activeCompanyId;
  if (!companyId || !can(session, companyId, "payroll.lock")) {
    throw new Error("You do not have permission to finalize payroll.");
  }
  const supabase = await createClient();
  await markRunPaid(supabase, runId);
  revalidatePath(`/payroll/${runId}`);
  revalidatePath("/payroll");
}

export async function generatePayslipsAction(runId: string, _formData?: FormData): Promise<void> {
  void _formData;
  const session = await requireSession();
  const companyId = session.activeCompanyId;
  if (!companyId || !can(session, companyId, "payroll.manage")) {
    throw new Error("You do not have permission to generate payslips.");
  }
  const supabase = await createClient();
  await generatePayslips(supabase, runId, companyId);
  revalidatePath(`/payroll/${runId}`);
}
