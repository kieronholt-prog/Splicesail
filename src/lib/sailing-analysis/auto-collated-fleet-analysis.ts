import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { runCollatedAnalysisForFleet } from "./run-collated-fleet-analysis";
import {
  resolveSubmissionRaceFleetId,
  type RaceFleetAnalysisSettingsRow,
} from "./race-fleet-analysis-settings";

type SubmissionRow = {
  id: string;
  user_id: string;
  race_id: string | null;
  race_entry_id: string | null;
  boat_id?: string | null;
  track_source: string;
  external_activity_id: string;
  storage_path: string | null;
};

/**
 * When a sailor uploads a collated track and RO has already saved course settings
 * for their fleet, run analysis immediately without waiting for RO to click again.
 */
export async function tryAutoAnalyseCollatedSubmission(
  supabase: SupabaseClient,
  opts: {
    groupId: string;
    raceId: string;
    submission: SubmissionRow;
  },
): Promise<{ analysed: number; skipped: number }> {
  const { groupId, raceId, submission } = opts;
  const fleetId = await resolveSubmissionRaceFleetId(supabase, submission);
  if (!fleetId) return { analysed: 0, skipped: 1 };

  const { data: settings } = await supabase
    .from("race_fleet_analysis_settings")
    .select("*")
    .eq("race_fleet_id", fleetId)
    .maybeSingle();

  if (!settings?.course_letter) return { analysed: 0, skipped: 1 };

  const confirmedBy =
    (settings as RaceFleetAnalysisSettingsRow).ro_confirmed_by ?? submission.user_id;

  const { analysed, skipped } = await runCollatedAnalysisForFleet(supabase, {
    groupId,
    raceId,
    raceFleetId: fleetId,
    settings: settings as RaceFleetAnalysisSettingsRow,
    submissions: [submission],
    confirmedByUserId: confirmedBy,
  });

  if (analysed > 0) {
    const { data: race } = await supabase
      .from("races")
      .select("series_id")
      .eq("id", raceId)
      .maybeSingle();
    if (race?.series_id) {
      revalidatePath(
        `/groups/${groupId}/series/${race.series_id}/races/${raceId}/track-analysis`,
      );
    }
    revalidatePath("/tracks");
    revalidatePath("/");
  }

  return { analysed, skipped };
}
