import type { SupabaseClient } from "@supabase/supabase-js";
import type { MarkOverride } from "./types";

export type RaceFleetAnalysisSettingsRow = {
  id: string;
  race_id: string;
  race_fleet_id: string;
  group_id: string;
  course_letter: string | null;
  laps: number;
  wind_direction: number | null;
  mark_overrides: Record<string, MarkOverride>;
  course_setup: Record<string, unknown>;
  det_settings: Record<string, unknown>;
  ro_confirmed_at: string | null;
  ro_confirmed_by: string | null;
};

/** Resolve race_fleets.id from a track submission via race_entries. */
export async function resolveSubmissionRaceFleetId(
  supabase: SupabaseClient,
  sub: { race_entry_id?: string | null },
): Promise<string | null> {
  if (!sub.race_entry_id) return null;
  const { data: entry } = await supabase
    .from("race_entries")
    .select("fleet_id")
    .eq("id", sub.race_entry_id)
    .maybeSingle();
  return entry?.fleet_id ?? null;
}

export async function loadRaceFleetAnalysisSettingsMap(
  supabase: SupabaseClient,
  raceId: string,
): Promise<Map<string, RaceFleetAnalysisSettingsRow>> {
  const { data, error } = await supabase
    .from("race_fleet_analysis_settings")
    .select("*")
    .eq("race_id", raceId);

  if (error) {
    console.error("loadRaceFleetAnalysisSettingsMap:", error.message);
    return new Map();
  }

  const map = new Map<string, RaceFleetAnalysisSettingsRow>();
  for (const row of data ?? []) {
    map.set(row.race_fleet_id, row as RaceFleetAnalysisSettingsRow);
  }
  return map;
}

export async function ensureFleetAnalysisSettingsRow(
  supabase: SupabaseClient,
  opts: { raceId: string; raceFleetId: string; groupId: string },
): Promise<void> {
  await supabase.from("race_fleet_analysis_settings").upsert(
    {
      race_id: opts.raceId,
      race_fleet_id: opts.raceFleetId,
      group_id: opts.groupId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "race_fleet_id" },
  );
}
