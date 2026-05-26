import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveClubIanaTimeZone } from "@/lib/club-time";

export async function selectGroupIanaTimeZone(supabase: SupabaseClient, groupId: string): Promise<string> {
  const { data } = await supabase.from("groups").select("iana_timezone").eq("id", groupId).maybeSingle();
  return resolveClubIanaTimeZone((data as { iana_timezone?: string } | null)?.iana_timezone);
}
