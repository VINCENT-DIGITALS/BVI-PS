import { Bell, CheckCheck } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { markAllRead, markRead } from "./actions";

type NotificationType =
  | "info"
  | "success"
  | "warning"
  | "error"
  | "payroll"
  | "leave"
  | "system";

type NotificationRow = {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
};

const TYPE_VARIANT: Record<NotificationType, NonNullable<BadgeProps["variant"]>> = {
  info: "secondary",
  success: "success",
  warning: "warning",
  error: "destructive",
  payroll: "default",
  leave: "outline",
  system: "secondary",
};

export default async function NotificationsPage() {
  const session = await requireSession();
  const supabase = await createClient();

  const { data } = await supabase
    .from("notifications")
    .select("id, type, title, body, link, is_read, created_at")
    .eq("user_id", session.userId)
    .order("created_at", { ascending: false });

  const notifications = (data ?? []) as NotificationRow[];
  const hasUnread = notifications.some((n) => !n.is_read);

  return (
    <div className="space-y-6">
      <PageHeader title="Notifications" description="Updates and alerts directed to your account.">
        <form action={markAllRead}>
          <Button type="submit" variant="outline" size="sm" disabled={!hasUnread}>
            <CheckCheck className="size-4" />
            Mark all read
          </Button>
        </form>
      </PageHeader>

      {notifications.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="No notifications"
          description="You're all caught up. New alerts will show up here."
        />
      ) : (
        <div className="space-y-3">
          {notifications.map((n) => (
            <Card
              key={n.id}
              className={cn(
                "flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between",
                !n.is_read && "bg-accent",
              )}
            >
              <div className="min-w-0 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={TYPE_VARIANT[n.type]} className="capitalize">
                    {n.type}
                  </Badge>
                  <span className="font-medium text-foreground">{n.title}</span>
                  {!n.is_read ? (
                    <span className="size-2 rounded-full bg-primary" aria-label="Unread" />
                  ) : null}
                </div>
                {n.body ? <p className="text-sm text-muted-foreground">{n.body}</p> : null}
                <p className="text-xs text-muted-foreground">{formatDateTime(n.created_at)}</p>
              </div>
              {!n.is_read ? (
                <form action={markRead} className="shrink-0">
                  <input type="hidden" name="id" value={n.id} />
                  <Button type="submit" variant="ghost" size="sm">
                    Mark read
                  </Button>
                </form>
              ) : null}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
