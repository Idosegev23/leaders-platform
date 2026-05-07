import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = SupabaseClient<any, any, any>;

let cached: AnySupabase | null = null;

/**
 * Service-role Supabase client. Use ONLY in trusted server contexts (API
 * routes, workflow handlers). Bypasses RLS — never expose to the browser.
 *
 * Note: the hub already exposes `createServiceClient` from
 * `@/lib/supabase/server`, but that variant requires a Next cookies()
 * context — wrong shape for the QStash workflow handler which has no
 * cookies. This is the cookieless equivalent for research-hub workers.
 */
export function createSupabaseService(): AnySupabase {
  if (cached) return cached;
  cached = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  ) as AnySupabase;
  return cached;
}
