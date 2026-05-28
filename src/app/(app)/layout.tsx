import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { AppShell } from "@/components/layout/app-shell";

export default async function AppGroupLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();

  if (!session.activeCompanyId && !session.isSuperAdmin) {
    redirect("/onboarding");
  }

  const activeMembership = session.memberships.find(
    (m) => m.company_id === session.activeCompanyId,
  );

  return (
    <AppShell
      session={{
        email: session.email,
        fullName: session.fullName,
        isSuperAdmin: session.isSuperAdmin,
        activeCompanyId: session.activeCompanyId,
        activeCompanyName: activeMembership?.company_name ?? null,
        permissions: activeMembership?.permissions ?? [],
      }}
    >
      {children}
    </AppShell>
  );
}
