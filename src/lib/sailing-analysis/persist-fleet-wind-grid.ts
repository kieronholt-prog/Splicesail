import type { SupabaseClient } from "@supabase/supabase-js";
import { buildFleetWindGrid, type FleetWindGrid } from "./fleet-wind-grid";
import { resolveSubmissionRaceFleetId } from "./race-fleet-analysis-settings";

type AnalysisSnapshotLike = Record<string, unknown>;

export async function buildFleetWindGridForRaceFleet(
  supabase: SupabaseClient,
  opts: {
    raceId: string;
    raceFleetId: string;
    referenceWindFromDeg: number | null;
  },
): Promise<FleetWindGrid | null> {
  const { raceId, raceFleetId, referenceWindFromDeg } = opts;

  const { data: subs } = await supabase
    .from("race_track_submissions")
    .select("id, user_id, race_id, race_entry_id, boat_id, status")
    .eq("race_id", raceId)
    .eq("analysis_mode", "collated")
    .eq("status", "ready");

  const boatSnapshots: { submissionId: string; snapshot: AnalysisSnapshotLike }[] = [];

  for (const sub of subs ?? []) {
    const fleetId = await resolveSubmissionRaceFleetId(supabase, sub);
    if (fleetId !== raceFleetId) continue;

    const { data: analysis } = await supabase
      .from("race_track_analyses")
      .select("analysis_snapshot")
      .eq("submission_id", sub.id)
      .maybeSingle();

    if (analysis?.analysis_snapshot) {
      boatSnapshots.push({
        submissionId: sub.id,
        snapshot: analysis.analysis_snapshot as AnalysisSnapshotLike,
      });
    }
  }

  if (!boatSnapshots.length) return null;

  const refWind =
    referenceWindFromDeg ??
    Number(boatSnapshots[0]?.snapshot?.windDir) ??
    0;

  return buildFleetWindGrid(
    boatSnapshots.map((b) => ({
      submissionId: b.submissionId,
      snapshot: b.snapshot as never,
    })),
    refWind,
  );
}

export async function persistFleetWindGrid(
  supabase: SupabaseClient,
  raceFleetId: string,
  grid: FleetWindGrid | null,
): Promise<void> {
  const { data: row } = await supabase
    .from("race_fleet_analysis_settings")
    .select("course_setup")
    .eq("race_fleet_id", raceFleetId)
    .maybeSingle();

  if (!row) return;

  const courseSetup = { ...((row.course_setup ?? {}) as Record<string, unknown>) };
  if (grid) {
    courseSetup.fleetWindGrid = grid;
  } else {
    delete courseSetup.fleetWindGrid;
  }

  await supabase
    .from("race_fleet_analysis_settings")
    .update({
      course_setup: courseSetup,
      updated_at: new Date().toISOString(),
    })
    .eq("race_fleet_id", raceFleetId);
}
