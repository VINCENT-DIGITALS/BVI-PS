import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/database";
import { assertSupabaseEnv } from "@/lib/env";

/**
 * Supabase client for Server Components, Route Handlers and Server Actions.
 * `cookies()` is async in Next 15+, so this factory is async too.
 */
export async function createClient() {
  // Read cookies first: this marks the route as dynamic during build, so pages
  // are never statically prerendered (and the env check below only runs at
  // request time, not at build time).
  const cookieStore = await cookies();
  const { url, anonKey } = assertSupabaseEnv();

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Called from a Server Component where cookies are read-only.
          // The middleware refreshes the session cookie, so this is safe to ignore.
        }
      },
    },
  });
}
