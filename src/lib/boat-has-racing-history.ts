import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * True if this hull has any race participation or finish data (soft-remove must keep the DB row).
 */
export async function boatHasRacingHistory(supabase: SupabaseClient, boatId: string): Promise<boolean> {
  const { data: rows } = await supabase
    .from("race_entries")
    .select("id, outcome, tally_afloat_at, tally_ashore_at, started_marked_at")
    .eq("boat_id", boatId)
    .limit(500);

  if (!rows?.length) return false;

  for (const r of rows) {
    if (r.outcome != null) return true;
    if (r.started_marked_at != null) return true;
    if (r.tally_afloat_at != null || r.tally_ashore_at != null) return true;
  }

  const ids = rows.map((r) => r.id).filter(Boolean);
  const { data: finishes } = await supabase
    .from("race_finishes")
    .select("ro_finish_at, official_finish_at")
    .in("race_entry_id", ids)
    .limit(50);

  return (finishes ?? []).some((f) => f.ro_finish_at != null || f.official_finish_at != null);
}
