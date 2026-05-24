import type { SupabaseClient } from "@supabase/supabase-js";

export type HomeTrackNotification = {
  id: string;
  activity_name: string | null;
  status: string;
  kind: "ready" | "pending_ro";
};

export async function fetchHomeTrackNotifications(
  supabase: SupabaseClient,
  userId: string,
): Promise<HomeTrackNotification[]> {
  const { data } = await supabase
    .from("race_track_submissions")
    .select("id, activity_name, status, ready_notified_at")
    .eq("user_id", userId)
    .in("status", ["ready", "pending_ro"])
    .is("ready_notified_at", null)
    .order("updated_at", { ascending: false })
    .limit(5);

  return (data ?? []).map((r) => ({
    id: r.id,
    activity_name: r.activity_name,
    status: r.status,
    kind: r.status === "ready" ? "ready" : "pending_ro",
  }));
}

export async function countUnreadTrackNotifications(
  supabase: SupabaseClient,
  userId: string,
): Promise<number> {
  const { count } = await supabase
    .from("race_track_submissions")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "ready")
    .is("ready_notified_at", null);

  return count ?? 0;
}
