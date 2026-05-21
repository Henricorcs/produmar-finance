import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client — server-side only.
 * Bypasses RLS; never expose this to the browser.
 * Requires SUPABASE_SERVICE_ROLE_KEY in your environment variables.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não configurados"
    );
  }

  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
