import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";
import { assertSupabaseEnv } from "@/lib/env";

/** Supabase client for use in Client Components / the browser. */
export function createClient() {
  const { url, anonKey } = assertSupabaseEnv();
  return createBrowserClient<Database>(url, anonKey);
}
