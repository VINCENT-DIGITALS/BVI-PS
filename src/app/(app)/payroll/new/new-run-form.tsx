"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import type { PayFrequency } from "@/lib/payroll";
import { generateRunAction } from "../actions";

const PAY_FREQUENCIES: { value: PayFrequency; label: string }[] = [
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Bi-weekly" },
  { value: "semimonthly", label: "Semi-monthly" },
  { value: "monthly", label: "Monthly" },
];

const formSchema = z
  .object({
    name: z.string().trim().min(1, "A run name is required."),
    pay_frequency: z.enum(["weekly", "biweekly", "semimonthly", "monthly"]),
    period_start: z.string().min(1, "Period start is required."),
    period_end: z.string().min(1, "Period end is required."),
    pay_date: z.string().min(1, "Pay date is required."),
  })
  .refine((v) => v.period_end >= v.period_start, {
    message: "Period end must be on or after the period start.",
    path: ["period_end"],
  });

type FormValues = z.infer<typeof formSchema>;

export function NewRunForm({ defaultFrequency }: { defaultFrequency: PayFrequency }) {
  const [isPending, startTransition] = useTransition();
  const [payFrequency, setPayFrequency] = useState<PayFrequency>(defaultFrequency);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      pay_frequency: defaultFrequency,
      period_start: "",
      period_end: "",
      pay_date: "",
    },
  });

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      const result = await generateRunAction(values);
      // A successful action redirects; only an error result is returned here.
      if (result?.error) {
        toast.error(result.error);
      }
    });
  }

  return (
    <Card>
      <CardContent className="p-6">
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6">
          <div className="grid gap-2">
            <Label htmlFor="name">Run name</Label>
            <Input
              id="name"
              placeholder="e.g. May 2026 — Monthly"
              {...register("name")}
              aria-invalid={Boolean(errors.name)}
            />
            {errors.name ? (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            ) : null}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="pay_frequency">Pay frequency</Label>
            <Select
              value={payFrequency}
              onValueChange={(value) => {
                const next = value as PayFrequency;
                setPayFrequency(next);
                setValue("pay_frequency", next, { shouldValidate: true });
              }}
            >
              <SelectTrigger id="pay_frequency">
                <SelectValue placeholder="Select a pay frequency" />
              </SelectTrigger>
              <SelectContent>
                {PAY_FREQUENCIES.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.pay_frequency ? (
              <p className="text-sm text-destructive">{errors.pay_frequency.message}</p>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-2">
              <Label htmlFor="period_start">Period start</Label>
              <Input
                id="period_start"
                type="date"
                {...register("period_start")}
                aria-invalid={Boolean(errors.period_start)}
              />
              {errors.period_start ? (
                <p className="text-sm text-destructive">{errors.period_start.message}</p>
              ) : null}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="period_end">Period end</Label>
              <Input
                id="period_end"
                type="date"
                {...register("period_end")}
                aria-invalid={Boolean(errors.period_end)}
              />
              {errors.period_end ? (
                <p className="text-sm text-destructive">{errors.period_end.message}</p>
              ) : null}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pay_date">Pay date</Label>
              <Input
                id="pay_date"
                type="date"
                {...register("pay_date")}
                aria-invalid={Boolean(errors.pay_date)}
              />
              {errors.pay_date ? (
                <p className="text-sm text-destructive">{errors.pay_date.message}</p>
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={isPending}>
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {isPending ? "Generating…" : "Generate payroll run"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
