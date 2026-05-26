import { fleetStartSignalUtcMs, primaryRaceFleet } from "@/lib/resolve-fleet-start-signal";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Seconds after the first GPS point when the race start signal fired. */
export function raceStartSecAfterFirstGps(
  raceStartUtcMs: number | null,
  firstGpsTimeSec: number | null | undefined,
): number {
  if (raceStartUtcMs == null || !Number.isFinite(firstGpsTimeSec)) return 0;
  return Math.max(0, Math.round(raceStartUtcMs / 1000 - Number(firstGpsTimeSec)));
}

export async function resolveRaceStartUtcMs(
  supabase: SupabaseClient,
  raceId: string,
): Promise<number | null> {
  const { data: race } = await supabase
    .from("races")
    .select("scheduled_at")
    .eq("id", raceId)
    .maybeSingle();

  if (!race?.scheduled_at) return null;

  const { data: fleets } = await supabase
    .from("race_fleets")
    .select("id, start_signal_at, start_offset_minutes, sort_order")
    .eq("race_id", raceId)
    .order("sort_order");

  const primary = primaryRaceFleet(fleets ?? []);
  return fleetStartSignalUtcMs(race.scheduled_at, primary);
}

export function mergeRaceStartIntoCourseSetup(
  courseSetup: Record<string, unknown>,
  raceStartUtcMs: number | null,
  firstGpsTimeSec?: number | null,
): Record<string, unknown> {
  const next = { ...courseSetup };
  if (raceStartUtcMs != null) {
    next.raceStartUnixSec = Math.round(raceStartUtcMs / 1000);
    if (firstGpsTimeSec != null && Number.isFinite(firstGpsTimeSec)) {
      next.raceStartSec = raceStartSecAfterFirstGps(raceStartUtcMs, firstGpsTimeSec);
    }
  }
  return next;
}
