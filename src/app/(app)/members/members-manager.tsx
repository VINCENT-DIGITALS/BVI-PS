"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { UserPlus, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  addMemberByEmail,
  changeMemberRole,
  linkMemberEmployee,
  removeMember,
  type ActionResult,
} from "./actions";

export type MemberRow = {
  id: string;
  userId: string;
  name: string;
  email: string;
  roleId: string;
  roleName: string;
  employeeId: string;
  employeeName: string | null;
  isActive: boolean;
};

export type RoleOption = { id: string; name: string; description: string | null };
export type EmployeeOption = { id: string; label: string };

const selectClass =
  "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

export function MembersManager({
  members,
  roles,
  employees,
  ownerId,
  currentUserId,
}: {
  members: MemberRow[];
  roles: RoleOption[];
  employees: EmployeeOption[];
  ownerId: string | null;
  currentUserId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [newRoleId, setNewRoleId] = useState(roles[0]?.id ?? "");

  function run(action: () => Promise<ActionResult>, successMsg: string) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        toast.success(successMsg);
        router.refresh();
      } else {
        toast.error(result.error ?? "Something went wrong");
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Add member */}
      <Card>
        <CardHeader>
          <CardTitle>Add a member</CardTitle>
          <CardDescription>
            The person must already have an account. They&apos;ll be added to this company with the
            role you choose.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              if (!email.trim()) {
                toast.error("Enter an email");
                return;
              }
              run(() => addMemberByEmail(email, newRoleId), "Member added");
              setEmail("");
            }}
          >
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="member-email">Email</Label>
              <Input
                id="member-email"
                type="email"
                placeholder="teammate@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1.5 sm:w-56">
              <Label htmlFor="member-role">Role</Label>
              <select
                id="member-role"
                className={selectClass}
                value={newRoleId}
                onChange={(e) => setNewRoleId(e.target.value)}
              >
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : <UserPlus />}
              Add member
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Members table */}
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Members ({members.length})</CardTitle>
          <CardDescription>Change a role, link an employee record, or remove access.</CardDescription>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Member</TableHead>
                <TableHead className="w-56">Role</TableHead>
                <TableHead className="w-64">Linked employee</TableHead>
                <TableHead className="w-28 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((m) => {
                const isOwner = m.userId === ownerId;
                const isSelf = m.userId === currentUserId;
                return (
                  <TableRow key={m.id}>
                    <TableCell>
                      <div className="leading-tight">
                        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                          {m.name}
                          {isOwner ? <Badge variant="secondary">Owner</Badge> : null}
                          {isSelf ? <Badge variant="outline">You</Badge> : null}
                        </div>
                        <div className="text-xs text-muted-foreground">{m.email}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <select
                        className={selectClass}
                        value={m.roleId}
                        disabled={pending || isOwner}
                        onChange={(e) =>
                          run(() => changeMemberRole(m.id, e.target.value), "Role updated")
                        }
                      >
                        {roles.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                    </TableCell>
                    <TableCell>
                      <select
                        className={selectClass}
                        value={m.employeeId}
                        disabled={pending}
                        onChange={(e) =>
                          run(
                            () => linkMemberEmployee(m.id, e.target.value),
                            "Employee link updated",
                          )
                        }
                      >
                        <option value="">Not linked</option>
                        {employees.map((emp) => (
                          <option key={emp.id} value={emp.id}>
                            {emp.label}
                          </option>
                        ))}
                      </select>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        disabled={pending || isOwner || isSelf}
                        onClick={() => run(() => removeMember(m.id), "Member removed")}
                      >
                        Remove
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Role reference */}
      <Card>
        <CardHeader>
          <CardTitle>What each role can do</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
          {roles.map((r) => (
            <div key={r.id} className="rounded-md border border-border p-3">
              <div className="text-sm font-medium text-foreground">{r.name}</div>
              <div className="text-xs text-muted-foreground">
                {r.description ?? "Custom role"}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
