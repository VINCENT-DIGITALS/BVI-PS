"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession, can } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/** Result returned to client callers. */
export type ActionResult = { ok: true } | { ok: false; error: string };

const ATTENDANCE_STATUSES = [
  "present",
  "absent",
  "late",
  "half_day",
  "holiday",
  "on_leave",
] as const;

// A datetime-local input yields "YYYY-MM-DDTHH:mm"; allow empty -> undefined.
const optionalDateTime = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : undefined));

const recordAttendanceSchema = z.object({
  employee_id: z.string().uuid("Select an employee"),
  work_date: z.string().min(1, "Work date is required"),
  clock_in: optionalDateTime,
  clock_out: optionalDateTime,
  break_minutes: z.coerce.number().int().min(0).optional(),
  worked_hours: z.coerce.number().min(0, "Worked hours must be 0 or more"),
  overtime_hours: z.coerce.number().min(0).optional(),
  status: z.enum(ATTENDANCE_STATUSES),
});

export type RecordAttendanceInput = z.input<typeof recordAttendanceSchema>;

const createShiftSchema = z.object({
  employee_id: z
    .union([z.string().uuid(), z.literal("")])
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  name: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  shift_date: z.string().min(1, "Shift date is required"),
  start_time: z.string().min(1, "Start time is required"),
  end_time: z.string().min(1, "End time is required"),
  break_minutes: z.coerce.number().int().min(0).optional(),
});

export type CreateShiftInput = z.input<typeof createShiftSchema>;

/** Convert a datetime-local string (no zone) into an ISO-8601 timestamp. */
function toIso(value: string | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/** Upsert an attendance log for the active company, keyed on (employee_id, work_date). */
export async function recordAttendance(input: RecordAttendanceInput): Promise<ActionResult> {
  const session = await requireSession();
  const companyId = session.activeCompanyId;
  if (!companyId) return { ok: false, error: "No active company selected." };
  if (!can(session, companyId, "attendance.manage")) {
    return { ok: false, error: "You do not have permission to record attendance." };
  }

  const parsed = recordAttendanceSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const data = parsed.data;

  const supabase = await createClient();

  // Ensure the employee belongs to the active company before writing.
  const { data: employee, error: empError } = await supabase
    .from("employees")
    .select("id")
    .eq("id", data.employee_id)
    .eq("company_id", companyId)
    .maybeSingle();
  if (empError) return { ok: false, error: empError.message };
  if (!employee) return { ok: false, error: "Employee not found in this company." };

  const row = {
    company_id: companyId,
    employee_id: data.employee_id,
    work_date: data.work_date,
    clock_in: toIso(data.clock_in),
    clock_out: toIso(data.clock_out),
    break_minutes: data.break_minutes ?? 0,
    worked_hours: data.worked_hours,
    overtime_hours: data.overtime_hours ?? 0,
    status: data.status,
    source: "manual",
  };

  // The generated `Database` type is a loose placeholder, so the typed query
  // builder narrows write payloads to `never`; cast the row to satisfy it.
  const { error } = await supabase
    .from("attendance_logs")
    .upsert(row as never, { onConflict: "employee_id,work_date" });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/attendance");
  return { ok: true };
}

/** Create a scheduled shift (or template) for the active company. */
export async function createShift(input: CreateShiftInput): Promise<ActionResult> {
  const session = await requireSession();
  const companyId = session.activeCompanyId;
  if (!companyId) return { ok: false, error: "No active company selected." };
  if (!can(session, companyId, "attendance.manage")) {
    return { ok: false, error: "You do not have permission to create shifts." };
  }

  const parsed = createShiftSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const data = parsed.data;

  const supabase = await createClient();

  if (data.employee_id) {
    const { data: employee, error: empError } = await supabase
      .from("employees")
      .select("id")
      .eq("id", data.employee_id)
      .eq("company_id", companyId)
      .maybeSingle();
    if (empError) return { ok: false, error: empError.message };
    if (!employee) return { ok: false, error: "Employee not found in this company." };
  }

  // Detect an overnight shift so downstream hour calculations stay correct.
  const crossesMidnight = data.end_time < data.start_time;

  const row = {
    company_id: companyId,
    employee_id: data.employee_id ?? null,
    name: data.name ?? null,
    shift_date: data.shift_date,
    start_time: data.start_time,
    end_time: data.end_time,
    break_minutes: data.break_minutes ?? 0,
    crosses_midnight: crossesMidnight,
  };

  // Cast for the same reason as recordAttendance: the placeholder `Database`
  // type infers write payloads as `never`.
  const { error } = await supabase.from("shifts").insert(row as never);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/attendance");
  return { ok: true };
}
