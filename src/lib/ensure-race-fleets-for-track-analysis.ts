import type { SupabaseClient } from "@supabase/supabase-js";
import { scheduleTemplateFleetsFromJson } from "@/lib/schedule-template-fleets";
import { seedRaceFleetsFromGroupSelection } from "@/lib/seed-race-fleets-from-group";

export type RaceFleetForAnalysis = {
  id: string;
  name: string;
  sort_order: number;
  start_signal_at: string | null;
};

async function loadRaceFleets(
  supabase: SupabaseClient,
  raceId: string,
): Promise<{ fleets: RaceFleetForAnalysis[]; error: string | null }> {
  const { data, error } = await supabase
    .from("race_fleets")
    .select("id, name, sort_order, start_signal_at")
    .eq("race_id", raceId)
    .order("sort_order", { ascending: true });

  return {
    fleets: (data ?? []) as RaceFleetForAnalysis[],
    error: error?.message ?? null,
  };
}

/**
 * Returns race_fleets for a race. If none exist, seeds from `series.schedule_template_fleets`
 * (same source as the series race generator) so Track analysis fleet tabs appear.
 */
export async function loadOrSeedRaceFleetsForTrackAnalysis(
  supabase: SupabaseClient,
  opts: { raceId: string; seriesId: string; groupId: string },
): Promise<{
  fleets: RaceFleetForAnalysis[];
  syncedFromTemplate: boolean;
  syncError: string | null;
  templateFleetCount: number;
}> {
  const first = await loadRaceFleets(supabase, opts.raceId);
  if (first.error) {
    return {
      fleets: [],
      syncedFromTemplate: false,
      syncError: first.error,
      templateFleetCount: 0,
    };
  }
  if (first.fleets.length > 0) {
    return {
      fleets: first.fleets,
      syncedFromTemplate: false,
      syncError: null,
      templateFleetCount: first.fleets.length,
    };
  }

  const { data: series } = await supabase
    .from("series")
    .select("schedule_template_fleets")
    .eq("id", opts.seriesId)
    .maybeSingle();

  const selection = scheduleTemplateFleetsFromJson(series?.schedule_template_fleets);
  const templateFleetCount = selection?.length ?? 0;

  if (!selection?.length) {
    return {
      fleets: [],
      syncedFromTemplate: false,
      syncError: null,
      templateFleetCount: 0,
    };
  }

  const seeded = await seedRaceFleetsFromGroupSelection(
    supabase,
    opts.raceId,
    opts.groupId,
    selection,
  );
  if (seeded.error) {
    return {
      fleets: [],
      syncedFromTemplate: false,
      syncError: seeded.error,
      templateFleetCount,
    };
  }

  const after = await loadRaceFleets(supabase, opts.raceId);
  return {
    fleets: after.fleets,
    syncedFromTemplate: after.fleets.length > 0,
    syncError: after.error,
    templateFleetCount,
  };
}
