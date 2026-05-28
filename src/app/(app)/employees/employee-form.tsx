"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ActionResult } from "./actions";
import type { DepartmentOption, PositionOption } from "@/lib/services/employees";

const formSchema = z
  .object({
    first_name: z.string().trim().min(1, "First name is required"),
    last_name: z.string().trim().min(1, "Last name is required"),
    employee_number: z.string().trim().min(1, "Employee number is required"),
    email: z.string().email("Invalid email").or(z.literal("")),
    hire_date: z.string().trim().min(1, "Hire date is required"),
    employment_type: z.enum(["full_time", "part_time", "contract", "temporary"]),
    status: z.enum(["active", "on_leave", "suspended", "terminated"]),
    pay_type: z.enum(["salaried", "hourly"]),
    pay_frequency: z.enum(["weekly", "biweekly", "semimonthly", "monthly"]),
    annual_salary: z.string(),
    hourly_rate: z.string(),
    standard_hours_per_period: z.string(),
    department_id: z.string(),
    subject_to_payroll_tax: z.boolean(),
    subject_to_social_security: z.boolean(),
    subject_to_nhi: z.boolean(),
  })
  .superRefine((value, ctx) => {
    if (value.pay_type === "salaried" && value.annual_salary.trim() === "") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Annual salary is required for salaried employees",
        path: ["annual_salary"],
      });
    }
    if (value.pay_type === "hourly" && value.hourly_rate.trim() === "") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Hourly rate is required for hourly employees",
        path: ["hourly_rate"],
      });
    }
  });

export type EmployeeFormValues = z.infer<typeof formSchema>;

export type EmployeeFormProps = {
  mode: "create" | "edit";
  defaultValues?: Partial<EmployeeFormValues>;
  departments: DepartmentOption[];
  positions: PositionOption[];
  action: (values: EmployeeFormValues) => Promise<ActionResult>;
};

const EMPLOYMENT_TYPES: { value: EmployeeFormValues["employment_type"]; label: string }[] = [
  { value: "full_time", label: "Full time" },
  { value: "part_time", label: "Part time" },
  { value: "contract", label: "Contract" },
  { value: "temporary", label: "Temporary" },
];

const STATUSES: { value: EmployeeFormValues["status"]; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "on_leave", label: "On leave" },
  { value: "suspended", label: "Suspended" },
  { value: "terminated", label: "Terminated" },
];

const PAY_TYPES: { value: EmployeeFormValues["pay_type"]; label: string }[] = [
  { value: "salaried", label: "Salaried" },
  { value: "hourly", label: "Hourly" },
];

const PAY_FREQUENCIES: { value: EmployeeFormValues["pay_frequency"]; label: string }[] = [
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Bi-weekly" },
  { value: "semimonthly", label: "Semi-monthly" },
  { value: "monthly", label: "Monthly" },
];

const DEFAULTS: EmployeeFormValues = {
  first_name: "",
  last_name: "",
  employee_number: "",
  email: "",
  hire_date: "",
  employment_type: "full_time",
  status: "active",
  pay_type: "salaried",
  pay_frequency: "monthly",
  annual_salary: "",
  hourly_rate: "",
  standard_hours_per_period: "",
  department_id: "",
  subject_to_payroll_tax: true,
  subject_to_social_security: true,
  subject_to_nhi: true,
};

const selectClass =
  "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

export function EmployeeForm({
  mode,
  defaultValues,
  departments,
  action,
}: EmployeeFormProps) {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<EmployeeFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { ...DEFAULTS, ...defaultValues },
  });

  const payType = watch("pay_type");

  async function onSubmit(values: EmployeeFormValues) {
    const result = await action(values);
    if (result.ok) {
      toast.success(mode === "create" ? "Employee created" : "Employee updated");
      router.push("/employees");
      router.refresh();
    } else {
      toast.error(result.error ?? "Something went wrong");
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Personal details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="First name" error={errors.first_name?.message}>
            <Input {...register("first_name")} aria-invalid={Boolean(errors.first_name)} />
          </Field>
          <Field label="Last name" error={errors.last_name?.message}>
            <Input {...register("last_name")} aria-invalid={Boolean(errors.last_name)} />
          </Field>
          <Field label="Employee number" error={errors.employee_number?.message}>
            <Input
              {...register("employee_number")}
              aria-invalid={Boolean(errors.employee_number)}
            />
          </Field>
          <Field label="Email" error={errors.email?.message}>
            <Input type="email" {...register("email")} aria-invalid={Boolean(errors.email)} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Employment</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Hire date" error={errors.hire_date?.message}>
            <Input type="date" {...register("hire_date")} aria-invalid={Boolean(errors.hire_date)} />
          </Field>
          <Field label="Department" error={errors.department_id?.message}>
            <select className={selectClass} {...register("department_id")}>
              <option value="">No department</option>
              {departments.map((dept) => (
                <option key={dept.id} value={dept.id}>
                  {dept.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Employment type" error={errors.employment_type?.message}>
            <select className={selectClass} {...register("employment_type")}>
              {EMPLOYMENT_TYPES.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Status" error={errors.status?.message}>
            <select className={selectClass} {...register("status")}>
              {STATUSES.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Compensation</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Pay type" error={errors.pay_type?.message}>
            <select className={selectClass} {...register("pay_type")}>
              {PAY_TYPES.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Pay frequency" error={errors.pay_frequency?.message}>
            <select className={selectClass} {...register("pay_frequency")}>
              {PAY_FREQUENCIES.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </Field>
          {payType === "salaried" ? (
            <Field label="Annual salary" error={errors.annual_salary?.message}>
              <Input
                type="number"
                step="0.01"
                min="0"
                {...register("annual_salary")}
                aria-invalid={Boolean(errors.annual_salary)}
              />
            </Field>
          ) : (
            <Field label="Hourly rate" error={errors.hourly_rate?.message}>
              <Input
                type="number"
                step="0.01"
                min="0"
                {...register("hourly_rate")}
                aria-invalid={Boolean(errors.hourly_rate)}
              />
            </Field>
          )}
          <Field
            label="Standard hours per period"
            error={errors.standard_hours_per_period?.message}
          >
            <Input
              type="number"
              step="0.01"
              min="0"
              {...register("standard_hours_per_period")}
              aria-invalid={Boolean(errors.standard_hours_per_period)}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Statutory contributions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <CheckboxField
            label="Subject to payroll tax"
            {...register("subject_to_payroll_tax")}
          />
          <CheckboxField
            label="Subject to social security"
            {...register("subject_to_social_security")}
          />
          <CheckboxField label="Subject to NHI" {...register("subject_to_nhi")} />
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting
            ? "Saving..."
            : mode === "create"
              ? "Create employee"
              : "Save changes"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={isSubmitting}
          onClick={() => router.push("/employees")}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

function CheckboxField({
  label,
  className,
  ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex items-center gap-2 text-sm text-foreground">
      <input
        type="checkbox"
        className={cn(
          "h-4 w-4 rounded border-input text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          className,
        )}
        {...props}
      />
      {label}
    </label>
  );
}
