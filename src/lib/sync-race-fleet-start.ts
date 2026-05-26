import { primaryRaceFleet } from "@/lib/resolve-fleet-start-signal";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function applyRaceFleetStartSignal(
  supabase: SupabaseClient,
  input: { raceId: string; fleetId: string; startAtIso: string },
): Promise<{ ok: true } | { error: string }> {
  const { error } = await supabase.rpc("apply_race_fleet_start_signal", {
    p_race_id: input.raceId,
    p_fleet_id: input.fleetId,
    p_start_at: input.startAtIso,
  });
  if (error) return { error: error.message };
  return { ok: true };
}

/** Admin series race editor: align primary fleet signal + race schedule (or schedule-only when no fleets). */
export async function applyPrimaryRaceScheduledStart(
  supabase: SupabaseClient,
  input: { raceId: string; startAtIso: string },
): Promise<{ ok: true } | { error: string }> {
  const { data: fleetsRaw } = await supabase
    .from("race_fleets")
    .select("id, sort_order, start_signal_at, start_offset_minutes")
    .eq("race_id", input.raceId)
    .order("sort_order", { ascending: true });

  const primary = primaryRaceFleet(fleetsRaw ?? []);
  if (primary) {
    return applyRaceFleetStartSignal(supabase, {
      raceId: input.raceId,
      fleetId: primary.id,
      startAtIso: input.startAtIso,
    });
  }

  const { error } = await supabase
    .from("races")
    .update({ scheduled_at: input.startAtIso })
    .eq("id", input.raceId);
  if (error) return { error: error.message };
  return { ok: true };
}
