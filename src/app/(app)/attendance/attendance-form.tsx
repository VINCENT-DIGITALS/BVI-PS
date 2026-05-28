"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown, Loader2, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { recordAttendance } from "./actions";

type EmployeeOption = { id: string; name: string };

const STATUS_OPTIONS = [
  { value: "present", label: "Present" },
  { value: "absent", label: "Absent" },
  { value: "late", label: "Late" },
  { value: "half_day", label: "Half day" },
  { value: "holiday", label: "Holiday" },
  { value: "on_leave", label: "On leave" },
] as const;

const formSchema = z.object({
  employee_id: z.string().uuid("Select an employee"),
  work_date: z.string().min(1, "Work date is required"),
  status: z.enum(["present", "absent", "late", "half_day", "holiday", "on_leave"]),
  worked_hours: z.coerce.number().min(0, "Must be 0 or more"),
  overtime_hours: z.coerce.number().min(0, "Must be 0 or more"),
  clock_in: z.string().optional(),
  clock_out: z.string().optional(),
});
type FormValues = z.infer<typeof formSchema>;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function AttendanceForm({ employees }: { employees: EmployeeOption[] }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      employee_id: "",
      work_date: todayIso(),
      status: "present",
      worked_hours: 0,
      overtime_hours: 0,
      clock_in: "",
      clock_out: "",
    },
  });

  async function onSubmit(values: FormValues) {
    setSubmitting(true);
    const result = await recordAttendance({
      employee_id: values.employee_id,
      work_date: values.work_date,
      status: values.status,
      worked_hours: values.worked_hours,
      overtime_hours: values.overtime_hours,
      clock_in: values.clock_in,
      clock_out: values.clock_out,
    });
    setSubmitting(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Attendance recorded.");
    reset({
      employee_id: "",
      work_date: todayIso(),
      status: "present",
      worked_hours: 0,
      overtime_hours: 0,
      clock_in: "",
      clock_out: "",
    });
    setOpen(false);
    router.refresh();
  }

  const noEmployees = employees.length === 0;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>
        <Button size="sm">
          <Plus />
          Record attendance
        </Button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 grid w-full max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl border border-border bg-card p-6 text-card-foreground shadow-lg focus:outline-none">
          <div className="flex flex-col gap-1.5">
            <DialogPrimitive.Title className="text-lg font-semibold leading-none tracking-tight">
              Record attendance
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="text-sm text-muted-foreground">
              Log a worked day for an employee. Existing entries for the same date are updated.
            </DialogPrimitive.Description>
          </div>

          {noEmployees ? (
            <p className="text-sm text-muted-foreground">
              Add an employee before recording attendance.
            </p>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="employee_id">Employee</Label>
                <Controller
                  control={control}
                  name="employee_id"
                  render={({ field }) => (
                    <SelectField
                      id="employee_id"
                      value={field.value}
                      onValueChange={field.onChange}
                      placeholder="Select employee"
                      options={employees.map((e) => ({ value: e.id, label: e.name }))}
                    />
                  )}
                />
                {errors.employee_id && (
                  <p className="text-xs text-destructive">{errors.employee_id.message}</p>
                )}
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="work_date">Work date</Label>
                  <Input id="work_date" type="date" {...register("work_date")} />
                  {errors.work_date && (
                    <p className="text-xs text-destructive">{errors.work_date.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="status">Status</Label>
                  <Controller
                    control={control}
                    name="status"
                    render={({ field }) => (
                      <SelectField
                        id="status"
                        value={field.value}
                        onValueChange={field.onChange}
                        placeholder="Select status"
                        options={STATUS_OPTIONS.map((s) => ({ value: s.value, label: s.label }))}
                      />
                    )}
                  />
                  {errors.status && (
                    <p className="text-xs text-destructive">{errors.status.message}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="worked_hours">Worked hours</Label>
                  <Input
                    id="worked_hours"
                    type="number"
                    step="0.01"
                    min="0"
                    {...register("worked_hours")}
                  />
                  {errors.worked_hours && (
                    <p className="text-xs text-destructive">{errors.worked_hours.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="overtime_hours">Overtime hours</Label>
                  <Input
                    id="overtime_hours"
                    type="number"
                    step="0.01"
                    min="0"
                    {...register("overtime_hours")}
                  />
                  {errors.overtime_hours && (
                    <p className="text-xs text-destructive">{errors.overtime_hours.message}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="clock_in">Clock in</Label>
                  <Input id="clock_in" type="datetime-local" {...register("clock_in")} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="clock_out">Clock out</Label>
                  <Input id="clock_out" type="datetime-local" {...register("clock_out")} />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <DialogPrimitive.Close asChild>
                  <Button type="button" variant="outline" disabled={submitting}>
                    Cancel
                  </Button>
                </DialogPrimitive.Close>
                <Button type="submit" disabled={submitting}>
                  {submitting && <Loader2 className="animate-spin" />}
                  Save
                </Button>
              </div>
            </form>
          )}

          <DialogPrimitive.Close
            className="absolute right-4 top-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring"
            aria-label="Close"
          >
            <X className="size-4" />
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

type SelectFieldProps = {
  id?: string;
  value: string;
  onValueChange: (value: string) => void;
  placeholder: string;
  options: { value: string; label: string }[];
};

function SelectField({ id, value, onValueChange, placeholder, options }: SelectFieldProps) {
  return (
    <SelectPrimitive.Root value={value || undefined} onValueChange={onValueChange}>
      <SelectPrimitive.Trigger
        id={id}
        className={cn(
          "flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1",
        )}
      >
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon asChild>
          <ChevronDown className="size-4 opacity-50" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={4}
          className="relative z-50 max-h-72 min-w-[8rem] overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out"
        >
          <SelectPrimitive.Viewport className="w-full min-w-[var(--radix-select-trigger-width)] p-1">
            {options.map((opt) => (
              <SelectPrimitive.Item
                key={opt.value}
                value={opt.value}
                className="relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
              >
                <span className="absolute left-2 flex size-3.5 items-center justify-center">
                  <SelectPrimitive.ItemIndicator>
                    <Check className="size-4" />
                  </SelectPrimitive.ItemIndicator>
                </span>
                <SelectPrimitive.ItemText>{opt.label}</SelectPrimitive.ItemText>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
