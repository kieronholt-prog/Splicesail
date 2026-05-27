import type { SupabaseClient } from "@supabase/supabase-js";

/** Shared redirect target after auth (login client-side or signup server action). */
export async function resolvePostAuthRedirectPathForUser(
  supabase: SupabaseClient,
  userId: string,
): Promise<string> {
  const { data: prof } = await supabase
    .from("profiles")
    .select("has_finished_account_intro")
    .eq("id", userId)
    .maybeSingle();
  if (!prof?.has_finished_account_intro) return "/account";
  return "/";
}
