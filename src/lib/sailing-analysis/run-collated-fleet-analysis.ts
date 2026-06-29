import type { SupabaseClient } from "@supabase/supabase-js";
import {
  executeAnalysis,
  serializeAnalysisForDb,
  DETECTION_DEFAULTS,
} from "@/lib/sailing-analysis";
import type { MarkOverride } from "@/lib/sailing-analysis/types";
import {
  mergeRaceStartIntoCourseSetup,
  resolveFleetStartUtcMs,
} from "@/lib/sailing-analysis/race-start-from-schedule";
import type { RaceFleetAnalysisSettingsRow } from "@/lib/sailing-analysis/race-fleet-analysis-settings";
import { resolveSubmissionRaceFleetId } from "@/lib/sailing-analysis/race-fleet-analysis-settings";
import { loadTrackPointsForSubmission } from "@/lib/track-points-loader";

type SubmissionRow = {
  id: string;
  user_id: string;
  race_id: string | null;
  race_entry_id: string | null;
  track_source: string;
  external_activity_id: string;
  storage_path: string | null;
};

export async function runCollatedAnalysisForFleet(
  supabase: SupabaseClient,
  opts: {
    groupId: string;
    raceId: string;
    raceFleetId: string;
    settings: RaceFleetAnalysisSettingsRow;
    submissions: SubmissionRow[];
    confirmedByUserId: string;
  },
): Promise<{ analysed: number; skipped: number }> {
  const { groupId, raceId, raceFleetId, settings, submissions, confirmedByUserId } = opts;

  if (!settings.course_letter) {
    return { analysed: 0, skipped: submissions.length };
  }

  const { data: marks } = await supabase
    .from("group_sailing_marks")
    .select("*")
    .eq("group_id", groupId);

  const { data: course } = await supabase
    .from("group_sailing_courses")
    .select("*")
    .eq("group_id", groupId)
    .eq("course_letter", settings.course_letter)
    .maybeSingle();

  const fleetStartUtcMs = await resolveFleetStartUtcMs(supabase, raceId, raceFleetId);

  let analysed = 0;
  let skipped = 0;

  for (const sub of submissions) {
    const subFleetId = await resolveSubmissionRaceFleetId(supabase, sub);
    if (subFleetId !== raceFleetId) {
      skipped++;
      continue;
    }

    const points = await loadTrackPointsForSubmission(supabase, sub.user_id, sub, { staffView: true });
    if (points.length < 20) {
      skipped++;
      continue;
    }

    const firstT = points[0]?.time;
    const courseSetup = mergeRaceStartIntoCourseSetup(
      settings.course_setup ?? {},
      fleetStartUtcMs,
      firstT ?? null,
    );

    const results = executeAnalysis({
      points,
      marks: marks ?? [],
      course,
      laps: settings.laps ?? 1,
      markOverrides: (settings.mark_overrides ?? {}) as Record<string, MarkOverride>,
      courseSetup,
      detSettings: (settings.det_settings ?? DETECTION_DEFAULTS) as typeof DETECTION_DEFAULTS,
      userWind: settings.wind_direction,
    });

    if (!results) {
      skipped++;
      continue;
    }

    const serialized = serializeAnalysisForDb(results);
    await supabase.from("race_track_analyses").upsert(
      { submission_id: sub.id, ...serialized, updated_at: new Date().toISOString() },
      { onConflict: "submission_id" },
    );

    await supabase
      .from("race_track_submissions")
      .update({
        status: "ready",
        course_letter: settings.course_letter,
        laps: settings.laps ?? 1,
        mark_overrides: settings.mark_overrides ?? {},
        course_setup: courseSetup,
        det_settings: settings.det_settings ?? DETECTION_DEFAULTS,
        updated_at: new Date().toISOString(),
      })
      .eq("id", sub.id);

    analysed++;
  }

  await supabase
    .from("race_fleet_analysis_settings")
    .update({
      ro_confirmed_at: new Date().toISOString(),
      ro_confirmed_by: confirmedByUserId,
      updated_at: new Date().toISOString(),
    })
    .eq("race_fleet_id", raceFleetId);

  return { analysed, skipped };
}
