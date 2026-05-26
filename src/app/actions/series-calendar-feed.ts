"use server";

import { revokeSeriesCalendarFeedToken } from "@/lib/series-calendar-feed";
import { getServerAuth } from "@/lib/supabase/auth-cache";
import { revalidatePath } from "next/cache";

export async function revokeSeriesCalendarFeedAction(
  formData: FormData,
): Promise<{ ok: true } | { error: string }> {
  const groupId = String(formData.get("group_id") ?? "").trim();
  const seriesId = String(formData.get("series_id") ?? "").trim();

  if (!groupId || !seriesId) {
    return { error: "Missing series context." };
  }

  const { supabase, user } = await getServerAuth();
  if (!user) return { error: "Sign in required." };

  const { data: membership } = await supabase
    .from("group_memberships")
    .select("user_id")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) {
    return { error: "Club membership required." };
  }

  const revoked = await revokeSeriesCalendarFeedToken(supabase, {
    userId: user.id,
    seriesId,
  });
  if (revoked.error) return { error: revoked.error };

  revalidatePath(`/groups/${groupId}/series/${seriesId}/races`);
  return { ok: true };
}
