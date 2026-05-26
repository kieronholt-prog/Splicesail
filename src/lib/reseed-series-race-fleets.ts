import type { SupabaseClient } from "@supabase/supabase-js";
import { recomputeFleetIdForRaceEntry } from "@/lib/recompute-race-entry-fleet";
import { raceIdsWithRecordedFinishes } from "@/lib/series-recorded-results";
import type { ParsedApplicableFleetRow } from "@/lib/seed-race-fleets-from-group";
import { seedRaceFleetsFromGroupSelection } from "@/lib/seed-race-fleets-from-group";

/**
 * Replaces `race_fleets` for every race in `seriesId` where it is safe to change starts:
 * skips races marked results-final or with any recorded finish (provisional or final — official or guest).
 * Then recomputes `race_entries.fleet_id` for races that were updated.
 *
 * Uses the same projection as generating races (`seedRaceFleetsFromGroupSelection`).
 */
export async function reseedRaceFleetsFromSeriesTemplateForNonFinalRaces(
  supabase: SupabaseClient,
  opts: {
    groupId: string;
    seriesId: string;
    fleetSelection: ParsedApplicableFleetRow[];
  },
): Promise<{ error?: string; updatedRaces: number; skippedProtected: number }> {
  const { groupId, seriesId, fleetSelection } = opts;
  if (fleetSelection.length === 0) {
    return { error: "No applicable fleets selected for this series.", updatedRaces: 0, skippedProtected: 0 };
  }

  const { data: races, error: rErr } = await supabase
    .from("races")
    .select("id, results_final")
    .eq("series_id", seriesId);

  if (rErr) return { error: rErr.message, updatedRaces: 0, skippedProtected: 0 };

  const raceList = races ?? [];
  const candidateIds = raceList.map((r) => r.id);
  const { raceIds: withFinishes, error: fErr } = await raceIdsWithRecordedFinishes(supabase, candidateIds);
  if (fErr) {
    return { error: fErr, updatedRaces: 0, skippedProtected: 0 };
  }

  let skippedProtected = 0;
  let updatedRaces = 0;

  for (const r of raceList) {
    if (r.results_final || withFinishes.has(r.id)) {
      skippedProtected += 1;
      continue;
    }

    const { error: delErr } = await supabase.from("race_fleets").delete().eq("race_id", r.id);
    if (delErr) return { error: delErr.message, updatedRaces, skippedProtected };

    const seeded = await seedRaceFleetsFromGroupSelection(supabase, r.id, groupId, fleetSelection);
    if (seeded.error) return { error: seeded.error, updatedRaces, skippedProtected };

    updatedRaces += 1;

    const { data: entryRows } = await supabase
      .from("race_entries")
      .select("user_id")
      .eq("race_id", r.id);
    const userIds = [...new Set((entryRows ?? []).map((e) => e.user_id).filter(Boolean))];
    await Promise.all(
      userIds.map((uid) => recomputeFleetIdForRaceEntry(supabase, { groupId, seriesId }, r.id, uid)),
    );
  }

  return { updatedRaces, skippedProtected };
}
