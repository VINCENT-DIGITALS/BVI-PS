"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const markReadSchema = z.object({
  id: z.string().uuid(),
});

/**
 * Marks a single notification belonging to the current user as read.
 * Accepts the notification id either as a string argument or via FormData
 * so it can be wired directly to a `<form action>`.
 */
export async function markRead(input: FormData | string): Promise<void> {
  const session = await requireSession();
  const supabase = await createClient();

  const rawId = typeof input === "string" ? input : input.get("id");
  const { id } = markReadSchema.parse({ id: rawId });

  const nowIso = new Date().toISOString();

  await supabase
    .from("notifications")
    .update({ is_read: true, read_at: nowIso })
    .eq("id", id)
    .eq("user_id", session.userId)
    .eq("is_read", false);

  revalidatePath("/notifications");
}

/** Marks every unread notification belonging to the current user as read. */
export async function markAllRead(): Promise<void> {
  const session = await requireSession();
  const supabase = await createClient();

  const nowIso = new Date().toISOString();

  await supabase
    .from("notifications")
    .update({ is_read: true, read_at: nowIso })
    .eq("user_id", session.userId)
    .eq("is_read", false);

  revalidatePath("/notifications");
}
