import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveFleetIdByBoatIdMap } from "@/lib/resolve-fleet-for-boats";
import type { MarkOverride } from "./types";

function unwrapOne<T>(rel: T | T[] | null | undefined): T | null {
  if (rel == null) return null;
  return Array.isArray(rel) ? (rel[0] ?? null) : rel;
}

export type TrackSubmissionFleetContext = {
  race_entry_id?: string | null;
  race_id?: string | null;
  user_id?: string | null;
  boat_id?: string | null;
};

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

/**
 * Resolve race_fleets.id for a track submission.
 * Uses race_entries when present; otherwise matches the tagged boat to race_fleets rules
 * (same logic as Manage / tally).
 */
export async function resolveSubmissionRaceFleetId(
  supabase: SupabaseClient,
  sub: TrackSubmissionFleetContext,
): Promise<string | null> {
  if (sub.race_entry_id) {
    const { data: entry } = await supabase
      .from("race_entries")
      .select("fleet_id, race_id, user_id, boat_id")
      .eq("id", sub.race_entry_id)
      .maybeSingle();
    if (entry?.fleet_id) return entry.fleet_id;

    const fleetFromEntryBoat = await resolveFleetFromBoatOnRace(
      supabase,
      entry?.race_id ?? sub.race_id ?? null,
      entry?.boat_id ?? sub.boat_id ?? null,
    );
    if (fleetFromEntryBoat) return fleetFromEntryBoat;
  }

  if (sub.race_id && sub.user_id && sub.boat_id) {
    const { data: entry } = await supabase
      .from("race_entries")
      .select("fleet_id")
      .eq("race_id", sub.race_id)
      .eq("user_id", sub.user_id)
      .eq("boat_id", sub.boat_id)
      .maybeSingle();
    if (entry?.fleet_id) return entry.fleet_id;
  }

  return resolveFleetFromBoatOnRace(supabase, sub.race_id ?? null, sub.boat_id ?? null);
}

async function resolveFleetFromBoatOnRace(
  supabase: SupabaseClient,
  raceId: string | null,
  boatId: string | null,
): Promise<string | null> {
  if (!raceId || !boatId) return null;

  const { data: race } = await supabase
    .from("races")
    .select("series_id, series:series_id(group_id)")
    .eq("id", raceId)
    .maybeSingle();

  const series = unwrapOne(race?.series as { group_id?: string } | { group_id?: string }[] | null);
  if (!race?.series_id || !series?.group_id) return null;

  const map = await resolveFleetIdByBoatIdMap(
    supabase,
    { groupId: series.group_id, seriesId: race.series_id },
    raceId,
    [boatId],
  );
  return map.get(boatId) ?? null;
}

/** Ensure a race_entries row exists (with fleet_id) when a sailor confirms race + boat on upload. */
export async function ensureRaceEntryForTrackSubmission(
  supabase: SupabaseClient,
  opts: {
    raceId: string;
    userId: string;
    boatId: string;
    seriesId: string;
    groupId: string;
  },
): Promise<{ raceEntryId: string; fleetId: string | null }> {
  const { raceId, userId, boatId, seriesId, groupId } = opts;

  const fleetMap = await resolveFleetIdByBoatIdMap(supabase, { groupId, seriesId }, raceId, [boatId]);
  const fleetId = fleetMap.get(boatId) ?? null;

  const { data: existing } = await supabase
    .from("race_entries")
    .select("id, fleet_id")
    .eq("race_id", raceId)
    .eq("user_id", userId)
    .eq("boat_id", boatId)
    .maybeSingle();

  if (existing) {
    if (!existing.fleet_id && fleetId) {
      await supabase.from("race_entries").update({ fleet_id: fleetId }).eq("id", existing.id);
    }
    return { raceEntryId: existing.id, fleetId: existing.fleet_id ?? fleetId };
  }

  const { data: inserted, error } = await supabase
    .from("race_entries")
    .insert({
      race_id: raceId,
      user_id: userId,
      boat_id: boatId,
      fleet_id: fleetId,
    })
    .select("id")
    .single();

  if (error || !inserted) {
    throw new Error(error?.message ?? "Could not create race entry for this track.");
  }

  return { raceEntryId: inserted.id, fleetId };
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
