"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, CalendarOff } from "lucide-react";
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
import { addHoliday, deleteHoliday } from "./actions";

export type HolidayRecord = {
  id: string;
  name: string;
  holiday_date: string;
  is_paid: boolean;
  is_recurring: boolean;
};

/** Format an ISO `YYYY-MM-DD` date without timezone drift. */
function formatHolidayDate(value: string): string {
  const parts = value.slice(0, 10).split("-").map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return value;
  const [year, month, day] = parts;
  const date = new Date(Date.UTC(year, month - 1, day));
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function HolidaysPanel({ holidays }: { holidays: HolidayRecord[] }) {
  const [isPending, startTransition] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [holidayDate, setHolidayDate] = useState("");
  const [isPaid, setIsPaid] = useState(true);
  const [isRecurring, setIsRecurring] = useState(false);

  function handleAdd(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) {
      toast.error("Enter a holiday name.");
      return;
    }
    if (!holidayDate) {
      toast.error("Pick a date.");
      return;
    }
    startTransition(async () => {
      const result = await addHoliday({
        name: name.trim(),
        holiday_date: holidayDate,
        is_paid: isPaid,
        is_recurring: isRecurring,
      });
      if (result.ok) {
        toast.success("Holiday added.");
        setName("");
        setHolidayDate("");
        setIsPaid(true);
        setIsRecurring(false);
      } else {
        toast.error(result.error);
      }
    });
  }

  function handleDelete(id: string) {
    setDeletingId(id);
    startTransition(async () => {
      const result = await deleteHoliday(id);
      if (result.ok) {
        toast.success("Holiday removed.");
      } else {
        toast.error(result.error);
      }
      setDeletingId(null);
    });
  }

  return (
    <div className="space-y-6">
      <form
        onSubmit={handleAdd}
        className="grid items-end gap-3 rounded-lg border border-border bg-muted/30 p-4 sm:grid-cols-[1fr_auto_auto_auto_auto]"
      >
        <div className="space-y-1.5">
          <Label htmlFor="holiday_name">Name</Label>
          <Input
            id="holiday_name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Territory Day"
            disabled={isPending}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="holiday_date">Date</Label>
          <Input
            id="holiday_date"
            type="date"
            value={holidayDate}
            onChange={(e) => setHolidayDate(e.target.value)}
            disabled={isPending}
          />
        </div>
        <div className="flex items-center gap-2 pb-2 sm:pb-2.5">
          <input
            id="holiday_is_paid"
            type="checkbox"
            className="h-4 w-4 rounded border-input accent-primary"
            checked={isPaid}
            onChange={(e) => setIsPaid(e.target.checked)}
            disabled={isPending}
          />
          <Label htmlFor="holiday_is_paid" className="cursor-pointer">
            Paid
          </Label>
        </div>
        <div className="flex items-center gap-2 pb-2 sm:pb-2.5">
          <input
            id="holiday_is_recurring"
            type="checkbox"
            className="h-4 w-4 rounded border-input accent-primary"
            checked={isRecurring}
            onChange={(e) => setIsRecurring(e.target.checked)}
            disabled={isPending}
          />
          <Label htmlFor="holiday_is_recurring" className="cursor-pointer">
            Recurring
          </Label>
        </div>
        <Button type="submit" disabled={isPending}>
          {isPending ? <Loader2 className="animate-spin" /> : <Plus />}
          Add
        </Button>
      </form>

      {holidays.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-10 text-center">
          <CalendarOff className="size-6 text-muted-foreground" />
          <p className="text-sm font-medium">No holidays configured</p>
          <p className="text-xs text-muted-foreground">
            Add public holidays so attendance and payroll treat them correctly.
          </p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {holidays.map((holiday) => (
              <TableRow key={holiday.id}>
                <TableCell className="whitespace-nowrap font-medium">
                  {formatHolidayDate(holiday.holiday_date)}
                </TableCell>
                <TableCell>{holiday.name}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant={holiday.is_paid ? "success" : "secondary"}>
                      {holiday.is_paid ? "Paid" : "Unpaid"}
                    </Badge>
                    {holiday.is_recurring ? <Badge variant="outline">Recurring</Badge> : null}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Delete ${holiday.name}`}
                    onClick={() => handleDelete(holiday.id)}
                    disabled={isPending}
                  >
                    {isPending && deletingId === holiday.id ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <Trash2 className="text-destructive" />
                    )}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
