"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm, useController } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const LEAVE_TYPES = [
  { value: "annual", label: "Annual" },
  { value: "sick", label: "Sick" },
  { value: "maternity", label: "Maternity" },
  { value: "paternity", label: "Paternity" },
  { value: "unpaid", label: "Unpaid" },
  { value: "bereavement", label: "Bereavement" },
  { value: "other", label: "Other" },
] as const;

const leaveTypeValues = LEAVE_TYPES.map((t) => t.value) as [string, ...string[]];

const formSchema = z
  .object({
    leave_type: z.enum(leaveTypeValues, {
      required_error: "Select a leave type",
    }),
    start_date: z.string().min(1, "Start date is required"),
    end_date: z.string().min(1, "End date is required"),
    days_requested: z.coerce
      .number({ invalid_type_error: "Enter the number of days" })
      .positive("Days must be greater than zero"),
    reason: z.string().trim().max(1000, "Reason is too long").optional(),
  })
  .refine((data) => data.end_date >= data.start_date, {
    message: "End date must be on or after the start date",
    path: ["end_date"],
  });

type FormValues = z.infer<typeof formSchema>;

type RequestLeaveFormProps = {
  employeeId: string;
  companyId: string;
};

export function RequestLeaveForm({ employeeId, companyId }: RequestLeaveFormProps) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      leave_type: "annual",
      start_date: "",
      end_date: "",
      days_requested: 1,
      reason: "",
    },
  });

  const { field: leaveTypeField } = useController({ control, name: "leave_type" });

  const onSubmit = async (values: FormValues) => {
    const supabase = createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      toast.error("Your session has expired. Please sign in again.");
      return;
    }

    const { error } = await supabase.from("leave_requests").insert({
      company_id: companyId,
      employee_id: employeeId,
      leave_type: values.leave_type,
      start_date: values.start_date,
      end_date: values.end_date,
      days_requested: values.days_requested,
      reason: values.reason?.trim() ? values.reason.trim() : null,
      status: "pending",
      requested_by: user.id,
    });

    if (error) {
      toast.error(error.message || "Could not submit your leave request.");
      return;
    }

    toast.success("Leave request submitted for approval.");
    reset();
    setOpen(false);
    router.refresh();
  };

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogPrimitive.Trigger asChild>
        <Button type="button">Request leave</Button>
      </DialogPrimitive.Trigger>

      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-50 grid w-full max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4",
            "border border-border bg-card p-6 shadow-lg sm:rounded-lg",
            "max-h-[90vh] overflow-y-auto",
          )}
        >
          <div className="flex flex-col gap-1.5">
            <DialogPrimitive.Title className="text-lg font-semibold leading-none tracking-tight text-foreground">
              Request leave
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="text-sm text-muted-foreground">
              Submit a leave request for approval. It will be created with a pending status.
            </DialogPrimitive.Description>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="leave_type">Leave type</Label>
              <SelectPrimitive.Root
                value={leaveTypeField.value}
                onValueChange={(value) =>
                  leaveTypeField.onChange(value as FormValues["leave_type"])
                }
              >
                <SelectPrimitive.Trigger
                  id="leave_type"
                  className={cn(
                    "flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm",
                    "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    "data-[placeholder]:text-muted-foreground",
                  )}
                >
                  <SelectPrimitive.Value placeholder="Select a leave type" />
                  <SelectPrimitive.Icon asChild>
                    <ChevronDown className="size-4 opacity-50" />
                  </SelectPrimitive.Icon>
                </SelectPrimitive.Trigger>
                <SelectPrimitive.Portal>
                  <SelectPrimitive.Content
                    position="popper"
                    sideOffset={4}
                    className={cn(
                      "relative z-50 max-h-72 min-w-[8rem] overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-md",
                      "w-[var(--radix-select-trigger-width)]",
                    )}
                  >
                    <SelectPrimitive.Viewport className="p-1">
                      {LEAVE_TYPES.map((option) => (
                        <SelectPrimitive.Item
                          key={option.value}
                          value={option.value}
                          className={cn(
                            "relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none",
                            "focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
                          )}
                        >
                          <span className="absolute left-2 flex size-3.5 items-center justify-center">
                            <SelectPrimitive.ItemIndicator>
                              <Check className="size-4" />
                            </SelectPrimitive.ItemIndicator>
                          </span>
                          <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                        </SelectPrimitive.Item>
                      ))}
                    </SelectPrimitive.Viewport>
                  </SelectPrimitive.Content>
                </SelectPrimitive.Portal>
              </SelectPrimitive.Root>
              {errors.leave_type ? (
                <p className="text-sm text-destructive">{errors.leave_type.message}</p>
              ) : null}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="start_date">Start date</Label>
                <Input id="start_date" type="date" {...register("start_date")} />
                {errors.start_date ? (
                  <p className="text-sm text-destructive">{errors.start_date.message}</p>
                ) : null}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="end_date">End date</Label>
                <Input id="end_date" type="date" {...register("end_date")} />
                {errors.end_date ? (
                  <p className="text-sm text-destructive">{errors.end_date.message}</p>
                ) : null}
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="days_requested">Days requested</Label>
              <Input
                id="days_requested"
                type="number"
                min="0.5"
                step="0.5"
                {...register("days_requested")}
              />
              {errors.days_requested ? (
                <p className="text-sm text-destructive">{errors.days_requested.message}</p>
              ) : null}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="reason">Reason</Label>
              <textarea
                id="reason"
                rows={3}
                placeholder="Optional note for your manager"
                className={cn(
                  "flex min-h-[72px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm",
                  "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  "disabled:cursor-not-allowed disabled:opacity-50",
                )}
                {...register("reason")}
              />
              {errors.reason ? (
                <p className="text-sm text-destructive">{errors.reason.message}</p>
              ) : null}
            </div>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <DialogPrimitive.Close asChild>
                <Button type="button" variant="outline" disabled={isSubmitting}>
                  Cancel
                </Button>
              </DialogPrimitive.Close>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Submitting
                  </>
                ) : (
                  "Submit request"
                )}
              </Button>
            </div>
          </form>

          <DialogPrimitive.Close
            className={cn(
              "absolute right-4 top-4 rounded-sm opacity-70 transition-opacity hover:opacity-100",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            )}
            aria-label="Close"
          >
            <X className="size-4" />
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
