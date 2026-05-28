/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Database type placeholder.
 *
 * This is an intentionally permissive stand-in: the Supabase client is typed as
 * an `any` schema so query builders accept inserts/updates without resolving to
 * `never`. There is NO compile-time column safety until you replace this with
 * the real schema generated from your Supabase project:
 *
 *   npx supabase login
 *   npx supabase link --project-ref <your-ref>
 *   npx supabase gen types typescript --linked > src/types/database.ts
 *
 * (or `npm run db:types` against a local stack). Once generated, every query in
 * the app gains full end-to-end type safety with no other code changes.
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = any;
