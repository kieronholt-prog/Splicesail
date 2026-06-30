import type { SupabaseClient } from "@supabase/supabase-js";
import { formatRaceElapsedOrCorrectedHms } from "@/lib/club-display-format";
import { normalizeRaceType, raceTypeUsesPositionalScoring } from "@/lib/race-type";

export type RaceContextPayload = {
  raceEntryId: string;
  raceId: string;
  raceName: string;
  seriesId: string;
  seriesName: string;
  groupId: string;
  clubName: string | null;
  scheduledAt: string;
  raceType: string;
  boatId: string;
  sailNumber: string;
  boatLabel: string | null;
  outcome: string | null;
  finish: {
    position: number | null;
    elapsedSeconds: number | null;
    correctedSeconds: number | null;
    display: string;
  } | null;
  track: {
    submissionId: string;
    status: string;
    analysisMode: string | null;
    activityName: string | null;
    durationSeconds: number | null;
    windDirection: number | null;
    legCount: number | null;
    analysisUrl: string;
  } | null;
};

function unwrapOne<T>(rel: T | T[] | null | undefined): T | null {
  if (rel == null) return null;
  return Array.isArray(rel) ? rel[0] ?? null : rel;
}

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function loadRaceContext(
  supabase: SupabaseClient,
  userId: string,
  raceEntryId: string,
  appOrigin: string,
): Promise<RaceContextPayload | null> {
  const { data: entry, error } = await supabase
    .from("race_entries")
    .select(
      `
      id,
      race_id,
      boat_id,
      outcome,
      user_id,
      races (
        id,
        name,
        scheduled_at,
        race_type,
        series_id,
        series ( name, group_id, groups ( name ) )
      ),
      boats ( default_sail_number, label ),
      race_finishes (
        finish_position,
        elapsed_seconds,
        corrected_seconds
      )
    `,
    )
    .eq("id", raceEntryId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !entry) return null;

  const race = unwrapOne(
    entry.races as unknown as
      | {
          id: string;
          name: string;
          scheduled_at: string;
          race_type: string | null;
          series_id: string;
          series?: unknown;
        }
      | {
          id: string;
          name: string;
          scheduled_at: string;
          race_type: string | null;
          series_id: string;
          series?: unknown;
        }[]
      | null,
  );
  if (!race) return null;

  const series = unwrapOne(
    race.series as { name: string; group_id: string; groups?: { name?: string | null } | null } | null,
  );
  if (!series) return null;

  const group = unwrapOne(series.groups);
  const boat = unwrapOne(
    entry.boats as unknown as
      | { default_sail_number: string | null; label: string | null }
      | { default_sail_number: string | null; label: string | null }[]
      | null,
  );
  const finishRow = unwrapOne(
    entry.race_finishes as unknown as
      | {
          finish_position: number | null;
          elapsed_seconds: number | null;
          corrected_seconds: number | null;
        }
      | {
          finish_position: number | null;
          elapsed_seconds: number | null;
          corrected_seconds: number | null;
        }[]
      | null,
  );

  const raceType = race.race_type ?? "handicap";
  const type = normalizeRaceType(raceType);
  let finishDisplay = "—";
  if (raceTypeUsesPositionalScoring(type)) {
    if (finishRow?.finish_position != null) finishDisplay = String(finishRow.finish_position);
    else {
      const code = entry.outcome?.trim().toUpperCase();
      finishDisplay = code && code.length ? code : "—";
    }
  } else {
    finishDisplay = formatRaceElapsedOrCorrectedHms(
      finishRow?.corrected_seconds ?? finishRow?.elapsed_seconds,
    );
  }

  const { data: trackRow } = await supabase
    .from("race_track_submissions")
    .select(
      `
      id,
      status,
      analysis_mode,
      activity_name,
      race_track_analyses ( stats, leg_summary, wind_direction )
    `,
    )
    .eq("user_id", userId)
    .eq("race_entry_id", raceEntryId)
    .neq("status", "cancelled")
    .order("activity_started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let track: RaceContextPayload["track"] = null;
  if (trackRow) {
    const analysis = unwrapOne(
      trackRow.race_track_analyses as
        | { stats?: Record<string, unknown>; leg_summary?: unknown[]; wind_direction?: number | null }
        | null,
    );
    const stats = (analysis?.stats ?? {}) as Record<string, unknown>;
    const legs = Array.isArray(analysis?.leg_summary) ? analysis.leg_summary : [];
    track = {
      submissionId: trackRow.id,
      status: trackRow.status,
      analysisMode: trackRow.analysis_mode,
      activityName: trackRow.activity_name,
      durationSeconds: num(stats.duration),
      windDirection: analysis?.wind_direction ?? num(stats.windDir),
      legCount: legs.length || null,
      analysisUrl: `${appOrigin.replace(/\/$/, "")}/tracks/${trackRow.id}/analysis`,
    };
  }

  return {
    raceEntryId: entry.id,
    raceId: race.id,
    raceName: race.name,
    seriesId: race.series_id,
    seriesName: series.name,
    groupId: series.group_id,
    clubName: group?.name?.trim() || null,
    scheduledAt: race.scheduled_at,
    raceType,
    boatId: entry.boat_id,
    sailNumber: boat?.default_sail_number?.trim() || "—",
    boatLabel: boat?.label?.trim() || null,
    outcome: entry.outcome,
    finish: finishRow
      ? {
          position: finishRow.finish_position,
          elapsedSeconds: finishRow.elapsed_seconds,
          correctedSeconds: finishRow.corrected_seconds,
          display: finishDisplay,
        }
      : null,
    track,
  };
}
