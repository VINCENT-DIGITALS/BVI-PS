import { ScrollText, ShieldAlert } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { requireSession, can } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";

type AuditLogRow = {
  id: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  summary: string | null;
  actor_id: string | null;
  created_at: string;
  new_data: Record<string, unknown> | null;
  old_data: Record<string, unknown> | null;
};

const ENTITY_LABELS: Record<string, string> = {
  companies: "Company",
  company_members: "Member",
  employees: "Employee",
  leave_requests: "Leave request",
  payroll_runs: "Payroll run",
  tax_rules: "Payroll tax rule",
  contribution_rules: "Contribution rule",
  government_rules: "Government rule",
};

function entityLabel(type: string | null): string {
  if (!type) return "—";
  return ENTITY_LABELS[type] ?? type.replace(/_/g, " ");
}

/** Builds a human-readable label for the changed record from its snapshot. */
function describe(log: AuditLogRow): string {
  const data = log.new_data ?? log.old_data ?? {};
  const str = (key: string): string | undefined =>
    typeof data[key] === "string" && data[key] !== "" ? (data[key] as string) : undefined;

  switch (log.entity_type) {
    case "employees": {
      const name = [str("first_name"), str("last_name")].filter(Boolean).join(" ");
      return name || str("employee_number") || "Employee record";
    }
    case "payroll_runs":
      return str("name") || "Payroll run";
    case "leave_requests": {
      const type = str("leave_type");
      const label = type ? type.charAt(0).toUpperCase() + type.slice(1) : "Leave";
      const start = str("start_date");
      const end = str("end_date");
      if (!start) return `${label} request`;
      return end && end !== start ? `${label} · ${start} – ${end}` : `${label} · ${start}`;
    }
    case "companies":
      return str("trading_name") || str("legal_name") || "Company profile";
    case "company_members":
      return "Membership";
    case "tax_rules":
      return str("name") || "Payroll tax rule";
    case "contribution_rules":
      return str("name") || str("contribution_type") || "Contribution rule";
    case "government_rules":
      return str("rule_key") || "Government rule";
    default:
      return log.summary || "—";
  }
}

export default async function AuditLogPage() {
  const session = await requireSession();
  const companyId = session.activeCompanyId;

  if (!session.isSuperAdmin && (!companyId || !can(session, companyId, "audit.read"))) {
    return (
      <div className="space-y-6">
        <PageHeader title="Audit log" description="Immutable record of changes across this company." />
        <EmptyState
          icon={ShieldAlert}
          title="No access"
          description="You do not have permission to view the audit log for this company."
        />
      </div>
    );
  }

  const supabase = await createClient();

  let query = supabase
    .from("audit_logs")
    .select("id, action, entity_type, entity_id, summary, actor_id, created_at, new_data, old_data")
    .order("created_at", { ascending: false })
    .limit(100);

  if (companyId) {
    query = query.eq("company_id", companyId);
  }

  const { data } = await query;
  const logs = (data ?? []) as AuditLogRow[];

  // Resolve actor ids to names/emails in one query.
  const actorIds = [...new Set(logs.map((l) => l.actor_id).filter((id): id is string => Boolean(id)))];
  const actorMap = new Map<string, { full_name: string | null; email: string | null }>();
  if (actorIds.length > 0) {
    const { data: users } = await supabase
      .from("users")
      .select("id, full_name, email")
      .in("id", actorIds);
    for (const u of (users ?? []) as { id: string; full_name: string | null; email: string | null }[]) {
      actorMap.set(u.id, { full_name: u.full_name, email: u.email });
    }
  }

  function actorName(id: string | null): string {
    if (!id) return "System";
    const u = actorMap.get(id);
    return u?.full_name || u?.email || "Unknown user";
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Audit log" description="Immutable record of changes across this company." />

      {logs.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title="No activity yet"
          description="Actions taken in this company will be recorded here."
        />
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-44">When</TableHead>
                <TableHead className="w-28">Action</TableHead>
                <TableHead className="w-40">Entity</TableHead>
                <TableHead>Details</TableHead>
                <TableHead className="w-56">Actor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log) => {
                const actor = actorMap.get(log.actor_id ?? "");
                return (
                  <TableRow key={log.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatDateTime(log.created_at)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-[11px] capitalize">
                        {log.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-foreground">{entityLabel(log.entity_type)}</TableCell>
                    <TableCell className="text-foreground">{describe(log)}</TableCell>
                    <TableCell>
                      <div className="leading-tight">
                        <div className="text-sm text-foreground">{actorName(log.actor_id)}</div>
                        {actor?.full_name && actor.email ? (
                          <div className="text-xs text-muted-foreground">{actor.email}</div>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
