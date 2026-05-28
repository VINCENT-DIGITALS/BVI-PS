import { redirect } from "next/navigation";
import { can, requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shared/page-header";
import type { PayFrequency } from "@/lib/payroll";
import { NewRunForm } from "./new-run-form";

export default async function NewPayrollRunPage() {
  const session = await requireSession();
  const companyId = session.activeCompanyId;

  if (!companyId || !can(session, companyId, "payroll.manage")) {
    redirect("/payroll");
  }

  const supabase = await createClient();
  const { data: company } = await supabase
    .from("companies")
    .select("default_pay_frequency")
    .eq("id", companyId)
    .single();

  const defaultFrequency =
    ((company as { default_pay_frequency?: PayFrequency } | null)?.default_pay_frequency ??
      "monthly") as PayFrequency;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="New payroll run"
        description="Set the period and pay date. Active employees on the selected frequency are included automatically."
      />
      <NewRunForm defaultFrequency={defaultFrequency} />
    </div>
  );
}
