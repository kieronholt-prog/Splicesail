import { cache } from "react";
import { createClient, type SupabaseServerClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";

/** One Auth + DB client handshake per incoming RSC / Server Action invocation (via React cache()). */
export const getServerAuth = cache(async (): Promise<{
  supabase: SupabaseServerClient;
  user: User | null;
}> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
});
