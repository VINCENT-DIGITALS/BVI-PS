"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const schema = z.object({
  legal_name: z.string().trim().min(1, "Legal name is required"),
  trading_name: z.string().trim().optional(),
  payroll_tax_class: z.enum(["class_1", "class_2"]),
});
type FormValues = z.infer<typeof schema>;

export function OnboardingForm() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      legal_name: "",
      trading_name: "",
      payroll_tax_class: "class_1",
    },
  });

  async function onSubmit(values: FormValues) {
    setSubmitting(true);
    const supabase = createClient();
    const args = {
      p_legal_name: values.legal_name,
      p_trading_name: values.trading_name?.trim() ? values.trading_name.trim() : null,
      p_payroll_tax_class: values.payroll_tax_class,
    };
    // The generated `Database` type is a loose placeholder, so RPC arg types are
    // not inferred; the runtime call matches the `create_company` SQL signature.
    const rpc = supabase.rpc.bind(supabase) as unknown as (
      fn: string,
      params: typeof args,
    ) => Promise<{ error: { message: string } | null }>;
    const { error } = await rpc("create_company", args);

    if (error) {
      setSubmitting(false);
      toast.error(error.message || "Could not create the company. Please try again.");
      return;
    }

    toast.success("Company created successfully.");
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="legal_name">Legal name</Label>
        <Input
          id="legal_name"
          autoComplete="organization"
          placeholder="Acme (BVI) Ltd."
          {...register("legal_name")}
        />
        {errors.legal_name && (
          <p className="text-xs text-destructive">{errors.legal_name.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="trading_name">Trading name (optional)</Label>
        <Input
          id="trading_name"
          autoComplete="organization"
          placeholder="Acme"
          {...register("trading_name")}
        />
        {errors.trading_name && (
          <p className="text-xs text-destructive">{errors.trading_name.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="payroll_tax_class">Payroll tax class</Label>
        <select
          id="payroll_tax_class"
          className={cn(
            "flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm shadow-sm transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
          {...register("payroll_tax_class")}
        >
          <option value="class_1">Class 1</option>
          <option value="class_2">Class 2</option>
        </select>
        {errors.payroll_tax_class && (
          <p className="text-xs text-destructive">{errors.payroll_tax_class.message}</p>
        )}
      </div>

      <Button type="submit" className="w-full" disabled={submitting}>
        {submitting && <Loader2 className="animate-spin" />}
        Create company
      </Button>
    </form>
  );
}
