"use client";

import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { updateCompany } from "./actions";

const PAY_FREQUENCY_OPTIONS = [
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Bi-weekly" },
  { value: "semimonthly", label: "Semi-monthly" },
  { value: "monthly", label: "Monthly" },
] as const;

const PAYROLL_TAX_CLASS_OPTIONS = [
  { value: "class_1", label: "Class 1 (small employer)" },
  { value: "class_2", label: "Class 2 (large employer)" },
] as const;

const formSchema = z.object({
  legal_name: z.string().trim().min(1, "Legal name is required").max(200),
  trading_name: z.string().trim().max(200),
  payroll_tax_class: z.enum(["class_1", "class_2"]),
  default_pay_frequency: z.enum(["weekly", "biweekly", "semimonthly", "monthly"]),
  standard_weekly_hours: z.coerce
    .number({ invalid_type_error: "Enter a number" })
    .positive("Must be greater than zero")
    .max(168, "Cannot exceed 168 hours"),
  timezone: z.string().trim().min(1, "Timezone is required").max(100),
  email: z.string().trim().max(200).refine((v) => v === "" || z.string().email().safeParse(v).success, {
    message: "Enter a valid email",
  }),
  phone: z.string().trim().max(50),
  address_line1: z.string().trim().max(200),
  address_line2: z.string().trim().max(200),
  city: z.string().trim().max(120),
  territory: z.string().trim().max(120),
  postal_code: z.string().trim().max(40),
});

type FormValues = z.infer<typeof formSchema>;

export type CompanyRecord = {
  legal_name: string;
  trading_name: string | null;
  payroll_tax_class: "class_1" | "class_2";
  default_pay_frequency: "weekly" | "biweekly" | "semimonthly" | "monthly";
  standard_weekly_hours: number | string | null;
  timezone: string | null;
  email: string | null;
  phone: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  territory: string | null;
  postal_code: string | null;
};

const selectClass =
  "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-destructive">{message}</p>;
}

export function CompanyForm({ company }: { company: CompanyRecord }) {
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      legal_name: company.legal_name ?? "",
      trading_name: company.trading_name ?? "",
      payroll_tax_class: company.payroll_tax_class,
      default_pay_frequency: company.default_pay_frequency,
      standard_weekly_hours:
        company.standard_weekly_hours === null || company.standard_weekly_hours === undefined
          ? 40
          : Number(company.standard_weekly_hours),
      timezone: company.timezone ?? "",
      email: company.email ?? "",
      phone: company.phone ?? "",
      address_line1: company.address_line1 ?? "",
      address_line2: company.address_line2 ?? "",
      city: company.city ?? "",
      territory: company.territory ?? "",
      postal_code: company.postal_code ?? "",
    },
  });

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      const result = await updateCompany(values);
      if (result.ok) {
        toast.success("Company details saved.");
        reset(values);
      } else {
        toast.error(result.error);
      }
    });
  });

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="legal_name">Legal name</Label>
          <Input id="legal_name" {...register("legal_name")} disabled={isPending} />
          <FieldError message={errors.legal_name?.message} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="trading_name">Trading name</Label>
          <Input id="trading_name" {...register("trading_name")} disabled={isPending} />
          <FieldError message={errors.trading_name?.message} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="payroll_tax_class">Payroll tax class</Label>
          <select
            id="payroll_tax_class"
            className={selectClass}
            disabled={isPending}
            {...register("payroll_tax_class")}
          >
            {PAYROLL_TAX_CLASS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <FieldError message={errors.payroll_tax_class?.message} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="default_pay_frequency">Default pay frequency</Label>
          <select
            id="default_pay_frequency"
            className={selectClass}
            disabled={isPending}
            {...register("default_pay_frequency")}
          >
            {PAY_FREQUENCY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <FieldError message={errors.default_pay_frequency?.message} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="standard_weekly_hours">Standard weekly hours</Label>
          <Input
            id="standard_weekly_hours"
            type="number"
            step="0.25"
            min="0"
            {...register("standard_weekly_hours")}
            disabled={isPending}
          />
          <FieldError message={errors.standard_weekly_hours?.message} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="timezone">Timezone</Label>
          <Input id="timezone" {...register("timezone")} disabled={isPending} />
          <FieldError message={errors.timezone?.message} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" {...register("email")} disabled={isPending} />
          <FieldError message={errors.email?.message} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="phone">Phone</Label>
          <Input id="phone" {...register("phone")} disabled={isPending} />
          <FieldError message={errors.phone?.message} />
        </div>
      </div>

      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="address_line1">Address line 1</Label>
            <Input id="address_line1" {...register("address_line1")} disabled={isPending} />
            <FieldError message={errors.address_line1?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="address_line2">Address line 2</Label>
            <Input id="address_line2" {...register("address_line2")} disabled={isPending} />
            <FieldError message={errors.address_line2?.message} />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="city">City</Label>
            <Input id="city" {...register("city")} disabled={isPending} />
            <FieldError message={errors.city?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="territory">Territory</Label>
            <Input id="territory" {...register("territory")} disabled={isPending} />
            <FieldError message={errors.territory?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="postal_code">Postal code</Label>
            <Input id="postal_code" {...register("postal_code")} disabled={isPending} />
            <FieldError message={errors.postal_code?.message} />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-3">
        <Button type="submit" disabled={isPending || !isDirty} className={cn(isPending && "opacity-90")}>
          {isPending ? (
            <>
              <Loader2 className="animate-spin" />
              Saving
            </>
          ) : (
            "Save changes"
          )}
        </Button>
      </div>
    </form>
  );
}
