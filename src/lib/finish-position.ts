import type { SupabaseClient } from "@supabase/supabase-js";

/** Next finish position within a fleet (1-based) for level rated / pursuit races. */
export async function nextFinishPositionInFleet(
  supabase: SupabaseClient,
  raceId: string,
  fleetId: string | null,
): Promise<number> {
  const { data: entries } = await supabase
    .from("race_entries")
    .select("id, fleet_id")
    .eq("race_id", raceId);

  const entryIds = (entries ?? [])
    .filter((e) => (e.fleet_id ?? null) === fleetId)
    .map((e) => e.id);

  if (!entryIds.length) return 1;

  const { data: finishes } = await supabase
    .from("race_finishes")
    .select("finish_position")
    .in("race_entry_id", entryIds)
    .not("finish_position", "is", null);

  let max = 0;
  for (const f of finishes ?? []) {
    const p = f.finish_position;
    if (p != null && p > max) max = p;
  }

  const { data: guestEntries } = await supabase
    .from("race_guest_entries")
    .select("id, fleet_id")
    .eq("race_id", raceId);

  const guestIds = (guestEntries ?? [])
    .filter((e) => (e.fleet_id ?? null) === fleetId)
    .map((e) => e.id);

  if (guestIds.length) {
    const { data: guestFinishes } = await supabase
      .from("race_guest_finishes")
      .select("finish_position")
      .in("race_guest_entry_id", guestIds)
      .not("finish_position", "is", null);
    for (const f of guestFinishes ?? []) {
      const p = f.finish_position;
      if (p != null && p > max) max = p;
    }
  }

  return max + 1;
}
