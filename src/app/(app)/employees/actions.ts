"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession, can } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: boolean; error?: string };

const employmentType = z.enum(["full_time", "part_time", "contract", "temporary"]);
const employeeStatus = z.enum(["active", "on_leave", "suspended", "terminated"]);
const payType = z.enum(["salaried", "hourly"]);
const payFrequency = z.enum(["weekly", "biweekly", "semimonthly", "monthly"]);

// Empty form inputs ("") become undefined BEFORE the target schema runs, and the
// target is itself `.optional()` so undefined short-circuits cleanly. (Putting
// `.optional()` outside the preprocess would still feed undefined into the inner
// number/string schema and fail with "Expected number, received nan".)
const optionalNumber = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? undefined : v),
  z.coerce.number().min(0, "Must be zero or greater").optional(),
);

const optionalEmail = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z.string().email("Invalid email").optional(),
);

const optionalUuid = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z.string().uuid().optional(),
);

const baseSchema = z
  .object({
    first_name: z.string().trim().min(1, "First name is required"),
    last_name: z.string().trim().min(1, "Last name is required"),
    employee_number: z.string().trim().min(1, "Employee number is required"),
    email: optionalEmail,
    hire_date: z.string().trim().min(1, "Hire date is required"),
    employment_type: employmentType,
    status: employeeStatus,
    pay_type: payType,
    pay_frequency: payFrequency,
    annual_salary: optionalNumber,
    hourly_rate: optionalNumber,
    standard_hours_per_period: optionalNumber,
    department_id: optionalUuid,
    subject_to_payroll_tax: z.boolean(),
    subject_to_social_security: z.boolean(),
    subject_to_nhi: z.boolean(),
  })
  .superRefine((value, ctx) => {
    if (value.pay_type === "salaried" && value.annual_salary === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Annual salary is required for salaried employees",
        path: ["annual_salary"],
      });
    }
    if (value.pay_type === "hourly" && value.hourly_rate === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Hourly rate is required for hourly employees",
        path: ["hourly_rate"],
      });
    }
  });

export type EmployeeInput = z.infer<typeof baseSchema>;

/** Builds the persisted column set from validated input, clearing the unused pay field. */
function toRow(input: EmployeeInput, companyId: string) {
  return {
    company_id: companyId,
    first_name: input.first_name,
    last_name: input.last_name,
    employee_number: input.employee_number,
    email: input.email ?? null,
    hire_date: input.hire_date,
    employment_type: input.employment_type,
    status: input.status,
    pay_type: input.pay_type,
    pay_frequency: input.pay_frequency,
    annual_salary: input.pay_type === "salaried" ? (input.annual_salary ?? null) : null,
    hourly_rate: input.pay_type === "hourly" ? (input.hourly_rate ?? null) : null,
    standard_hours_per_period: input.standard_hours_per_period ?? null,
    department_id: input.department_id ?? null,
    subject_to_payroll_tax: input.subject_to_payroll_tax,
    subject_to_social_security: input.subject_to_social_security,
    subject_to_nhi: input.subject_to_nhi,
  };
}

export async function createEmployee(input: unknown): Promise<ActionResult> {
  const parsed = baseSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const session = await requireSession();
  const companyId = session.activeCompanyId;
  if (!companyId) return { ok: false, error: "No active company" };
  if (!can(session, companyId, "employees.manage")) {
    return { ok: false, error: "You do not have permission to manage employees" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("employees")
    .insert(toRow(parsed.data, companyId) as never);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/employees");
  return { ok: true };
}

export async function updateEmployee(id: string, input: unknown): Promise<ActionResult> {
  if (!id || typeof id !== "string") {
    return { ok: false, error: "Missing employee id" };
  }

  const parsed = baseSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const session = await requireSession();
  const companyId = session.activeCompanyId;
  if (!companyId) return { ok: false, error: "No active company" };
  if (!can(session, companyId, "employees.manage")) {
    return { ok: false, error: "You do not have permission to manage employees" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("employees")
    .update(toRow(parsed.data, companyId) as never)
    .eq("id", id)
    .eq("company_id", companyId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/employees");
  revalidatePath(`/employees/${id}`);
  return { ok: true };
}
