"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireSession, can } from "@/lib/auth";

export type ActionResult = { ok: true } | { ok: false; error: string };

const PAY_FREQUENCIES = ["weekly", "biweekly", "semimonthly", "monthly"] as const;
const PAYROLL_TAX_CLASSES = ["class_1", "class_2"] as const;

const companySchema = z.object({
  legal_name: z.string().trim().min(1, "Legal name is required").max(200),
  trading_name: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => (v ? v : null)),
  payroll_tax_class: z.enum(PAYROLL_TAX_CLASSES),
  default_pay_frequency: z.enum(PAY_FREQUENCIES),
  standard_weekly_hours: z.coerce
    .number({ invalid_type_error: "Enter a number" })
    .positive("Must be greater than zero")
    .max(168, "Cannot exceed 168 hours"),
  timezone: z.string().trim().min(1, "Timezone is required").max(100),
  email: z
    .string()
    .trim()
    .email("Enter a valid email")
    .max(200)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v : null)),
  phone: z
    .string()
    .trim()
    .max(50)
    .optional()
    .transform((v) => (v ? v : null)),
  address_line1: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => (v ? v : null)),
  address_line2: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => (v ? v : null)),
  city: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((v) => (v ? v : null)),
  territory: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((v) => (v ? v : null)),
  postal_code: z
    .string()
    .trim()
    .max(40)
    .optional()
    .transform((v) => (v ? v : null)),
});

export type CompanyFormValues = z.input<typeof companySchema>;

const holidaySchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  holiday_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date"),
  is_paid: z.coerce.boolean().default(true),
  is_recurring: z.coerce.boolean().default(false),
});

export type HolidayFormValues = z.input<typeof holidaySchema>;

const idSchema = z.string().uuid("Invalid identifier");

function firstError(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Invalid input";
}

export async function updateCompany(values: CompanyFormValues): Promise<ActionResult> {
  const session = await requireSession();
  const companyId = session.activeCompanyId;
  if (!companyId) return { ok: false, error: "No active company selected." };
  if (!can(session, companyId, "settings.manage")) {
    return { ok: false, error: "You do not have permission to manage settings." };
  }

  const parsed = companySchema.safeParse(values);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase
    .from("companies")
    .update({
      legal_name: parsed.data.legal_name,
      trading_name: parsed.data.trading_name,
      payroll_tax_class: parsed.data.payroll_tax_class,
      default_pay_frequency: parsed.data.default_pay_frequency,
      standard_weekly_hours: parsed.data.standard_weekly_hours,
      timezone: parsed.data.timezone,
      email: parsed.data.email,
      phone: parsed.data.phone,
      address_line1: parsed.data.address_line1,
      address_line2: parsed.data.address_line2,
      city: parsed.data.city,
      territory: parsed.data.territory,
      postal_code: parsed.data.postal_code,
    })
    .eq("id", companyId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/settings");
  return { ok: true };
}

export async function addHoliday(values: HolidayFormValues): Promise<ActionResult> {
  const session = await requireSession();
  const companyId = session.activeCompanyId;
  if (!companyId) return { ok: false, error: "No active company selected." };
  if (!can(session, companyId, "settings.manage")) {
    return { ok: false, error: "You do not have permission to manage settings." };
  }

  const parsed = holidaySchema.safeParse(values);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.from("holidays").insert({
    company_id: companyId,
    name: parsed.data.name,
    holiday_date: parsed.data.holiday_date,
    is_paid: parsed.data.is_paid,
    is_recurring: parsed.data.is_recurring,
  });

  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "A holiday with that name already exists on that date." };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath("/settings");
  return { ok: true };
}

export async function deleteHoliday(id: string): Promise<ActionResult> {
  const session = await requireSession();
  const companyId = session.activeCompanyId;
  if (!companyId) return { ok: false, error: "No active company selected." };
  if (!can(session, companyId, "settings.manage")) {
    return { ok: false, error: "You do not have permission to manage settings." };
  }

  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase
    .from("holidays")
    .delete()
    .eq("id", parsed.data)
    .eq("company_id", companyId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/settings");
  return { ok: true };
}
