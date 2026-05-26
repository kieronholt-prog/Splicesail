import { createClient } from "@supabase/supabase-js";

/**
 * Server-only anon Supabase client for public club results (/results/[slug]).
 * RLS policies scope reads to groups with a non-empty slug.
 */
export function createPublicResultsClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }

  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
