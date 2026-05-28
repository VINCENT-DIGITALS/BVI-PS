"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as SelectPrimitive from "@radix-ui/react-select";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Plus, X, Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createLeave } from "./actions";

export type LeaveFormEmployee = {
  id: string;
  name: string;
};

const LEAVE_TYPES = [
  { value: "annual", label: "Annual" },
  { value: "sick", label: "Sick" },
  { value: "maternity", label: "Maternity" },
  { value: "paternity", label: "Paternity" },
  { value: "unpaid", label: "Unpaid" },
  { value: "bereavement", label: "Bereavement" },
  { value: "other", label: "Other" },
] as const;

const formSchema = z.object({
  employee_id: z.string().uuid("Select an employee."),
  leave_type: z.enum([
    "annual",
    "sick",
    "maternity",
    "paternity",
    "unpaid",
    "bereavement",
    "other",
  ]),
  start_date: z.string().min(1, "Start date is required."),
  end_date: z.string().min(1, "End date is required."),
  days_requested: z.coerce
    .number({ invalid_type_error: "Enter the number of days." })
    .positive("Days requested must be greater than zero."),
  is_paid: z.boolean(),
  reason: z.string().max(2000).optional(),
});

type FormValues = z.input<typeof formSchema>;

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-destructive">{message}</p>;
}

export function LeaveForm({ employees }: { employees: LeaveFormEmployee[] }) {
  const [open, setOpen] = React.useState(false);
  const [isPending, startTransition] = React.useTransition();

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
      leave_type: "annual",
      start_date: "",
      end_date: "",
      days_requested: 1,
      is_paid: true,
      reason: "",
    },
  });

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      const result = await createLeave({
        employee_id: values.employee_id,
        leave_type: values.leave_type,
        start_date: values.start_date,
        end_date: values.end_date,
        days_requested: Number(values.days_requested),
        is_paid: values.is_paid,
        reason: values.reason?.trim() ? values.reason.trim() : null,
      });

      if (result.ok) {
        toast.success("Leave request submitted.");
        reset();
        setOpen(false);
      } else {
        toast.error(result.error);
      }
    });
  });

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogPrimitive.Trigger asChild>
        <Button size="sm">
          <Plus />
          New request
        </Button>
      </DialogPrimitive.Trigger>

      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 grid w-full max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 border border-border bg-card p-6 shadow-lg sm:rounded-xl">
          <div className="flex flex-col gap-1.5">
            <DialogPrimitive.Title className="text-lg font-semibold leading-none tracking-tight">
              New leave request
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="text-sm text-muted-foreground">
              Record a leave request on behalf of an employee.
            </DialogPrimitive.Description>
          </div>

          <form onSubmit={onSubmit} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="employee_id">Employee</Label>
              <Controller
                control={control}
                name="employee_id"
                render={({ field }) => (
                  <SelectField
                    id="employee_id"
                    placeholder="Select employee"
                    value={field.value}
                    onValueChange={field.onChange}
                    options={employees.map((e) => ({ value: e.id, label: e.name }))}
                  />
                )}
              />
              <FieldError message={errors.employee_id?.message} />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="leave_type">Leave type</Label>
              <Controller
                control={control}
                name="leave_type"
                render={({ field }) => (
                  <SelectField
                    id="leave_type"
                    placeholder="Select type"
                    value={field.value}
                    onValueChange={field.onChange}
                    options={LEAVE_TYPES.map((t) => ({ value: t.value, label: t.label }))}
                  />
                )}
              />
              <FieldError message={errors.leave_type?.message} />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="start_date">Start date</Label>
                <Input id="start_date" type="date" {...register("start_date")} />
                <FieldError message={errors.start_date?.message} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="end_date">End date</Label>
                <Input id="end_date" type="date" {...register("end_date")} />
                <FieldError message={errors.end_date?.message} />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="days_requested">Days requested</Label>
              <Input
                id="days_requested"
                type="number"
                min="0"
                step="0.5"
                {...register("days_requested")}
              />
              <FieldError message={errors.days_requested?.message} />
            </div>

            <div className="flex items-center gap-2">
              <input
                id="is_paid"
                type="checkbox"
                className="h-4 w-4 rounded border-input text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                {...register("is_paid")}
              />
              <Label htmlFor="is_paid" className="font-normal">
                Paid leave
              </Label>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="reason">Reason</Label>
              <textarea
                id="reason"
                rows={3}
                className={cn(
                  "flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
                )}
                placeholder="Optional context for this request"
                {...register("reason")}
              />
              <FieldError message={errors.reason?.message} />
            </div>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <DialogPrimitive.Close asChild>
                <Button type="button" variant="outline" disabled={isPending}>
                  Cancel
                </Button>
              </DialogPrimitive.Close>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Submitting..." : "Submit request"}
              </Button>
            </div>
          </form>

          <DialogPrimitive.Close
            className="absolute right-4 top-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function SelectField({
  id,
  value,
  onValueChange,
  options,
  placeholder,
}: {
  id?: string;
  value: string;
  onValueChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder: string;
}) {
  return (
    <SelectPrimitive.Root value={value || undefined} onValueChange={onValueChange}>
      <SelectPrimitive.Trigger
        id={id}
        className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 data-[placeholder]:text-muted-foreground"
      >
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon asChild>
          <ChevronDown className="h-4 w-4 opacity-50" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={4}
          className="z-50 max-h-72 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-md"
        >
          <SelectPrimitive.Viewport className="p-1">
            {options.length === 0 ? (
              <div className="px-2 py-1.5 text-sm text-muted-foreground">No options</div>
            ) : (
              options.map((option) => (
                <SelectPrimitive.Item
                  key={option.value}
                  value={option.value}
                  className="relative flex cursor-pointer select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
                >
                  <span className="absolute left-2 flex h-4 w-4 items-center justify-center">
                    <SelectPrimitive.ItemIndicator>
                      <Check className="h-4 w-4" />
                    </SelectPrimitive.ItemIndicator>
                  </span>
                  <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                </SelectPrimitive.Item>
              ))
            )}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
