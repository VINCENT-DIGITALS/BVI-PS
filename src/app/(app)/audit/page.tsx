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
};

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
    .select("id, action, entity_type, entity_id, summary, actor_id, created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  if (companyId) {
    query = query.eq("company_id", companyId);
  }

  const { data } = await query;
  const logs = (data ?? []) as AuditLogRow[];

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
                <TableHead className="w-40">Action</TableHead>
                <TableHead className="w-40">Entity</TableHead>
                <TableHead>Details</TableHead>
                <TableHead className="w-64">Actor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {formatDateTime(log.created_at)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="font-mono text-[11px]">
                      {log.action}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-foreground">{log.entity_type ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {log.summary ?? log.entity_id ?? "—"}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {log.actor_id ?? "system"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
