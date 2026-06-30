"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerAuth } from "@/lib/supabase/auth-cache";
import { DETECTION_DEFAULTS } from "@/lib/sailing-analysis";
import type { MarkOverride } from "@/lib/sailing-analysis/types";
import {
  mergeRaceStartIntoCourseSetup,
  resolveFleetStartUtcMs,
} from "@/lib/sailing-analysis/race-start-from-schedule";
import { runCollatedAnalysisForFleet } from "@/lib/sailing-analysis/run-collated-fleet-analysis";
import type { RaceFleetAnalysisSettingsRow } from "@/lib/sailing-analysis/race-fleet-analysis-settings";
import {
  ensureFleetAnalysisSettingsRow,
  loadRaceFleetAnalysisSettingsMap,
} from "@/lib/sailing-analysis/race-fleet-analysis-settings";
import { loadOrSeedRaceFleetsForTrackAnalysis } from "@/lib/ensure-race-fleets-for-track-analysis";
import { loadRaceFleetTracks, type FleetTrackOverlay } from "@/lib/sailing-analysis/load-race-fleet-tracks";

function trackAnalysisPath(groupId: string, seriesId: string, raceId: string, query?: string) {
  const base = `/groups/${groupId}/series/${seriesId}/races/${raceId}/track-analysis`;
  return query ? `${base}?${query}` : base;
}

async function requireRaceStaff(groupId: string, raceId: string) {
  const { supabase, user } = await getServerAuth();
  if (!user) redirect("/login");

  const { data: me } = await supabase
    .from("group_memberships")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (me?.role !== "club_admin" && me?.role !== "race_officer") {
    redirect(`/groups/${groupId}/race-officer?error=` + encodeURIComponent("Race staff only."));
  }

  const { data: race } = await supabase.from("races").select("id, series_id").eq("id", raceId).maybeSingle();
  if (!race) redirect(`/groups/${groupId}/race-officer?error=` + encodeURIComponent("Race not found."));

  return { supabase, user, race };
}

function parseSettingsPayload(formData: FormData) {
  const markOverridesRaw = String(formData.get("mark_overrides") ?? "{}");
  const courseSetupRaw = String(formData.get("course_setup") ?? "{}");
  const detSettingsRaw = String(formData.get("det_settings") ?? "{}");

  let mark_overrides: Record<string, MarkOverride> = {};
  let course_setup: Record<string, unknown> = {};
  let det_settings = DETECTION_DEFAULTS;
  try {
    mark_overrides = JSON.parse(markOverridesRaw);
    course_setup = JSON.parse(courseSetupRaw);
    const parsedDet = JSON.parse(detSettingsRaw);
    if (parsedDet?.tack && parsedDet?.gybe) det_settings = parsedDet;
  } catch {
    return null;
  }
  return { mark_overrides, course_setup, det_settings };
}

export async function saveRaceFleetAnalysisSettingsAction(formData: FormData) {
  const groupId = String(formData.get("group_id") ?? "").trim();
  const raceId = String(formData.get("race_id") ?? "").trim();
  const seriesId = String(formData.get("series_id") ?? "").trim();
  const raceFleetId = String(formData.get("race_fleet_id") ?? "").trim();
  const courseLetter = String(formData.get("course_letter") ?? "").trim() || null;
  const laps = Math.max(1, Number(formData.get("laps") ?? 1));
  const windDirection = formData.get("wind_direction");

  const parsed = parseSettingsPayload(formData);
  if (!parsed || !raceFleetId) {
    redirect(
      trackAnalysisPath(groupId, seriesId, raceId, `error=${encodeURIComponent("Invalid fleet settings.")}`),
    );
  }

  const { supabase } = await requireRaceStaff(groupId, raceId);

  const { data: fleet } = await supabase
    .from("race_fleets")
    .select("id")
    .eq("id", raceFleetId)
    .eq("race_id", raceId)
    .maybeSingle();

  if (!fleet) {
    redirect(
      trackAnalysisPath(groupId, seriesId, raceId, `error=${encodeURIComponent("Fleet not found for this race.")}`),
    );
  }

  const fleetStartUtcMs = await resolveFleetStartUtcMs(supabase, raceId, raceFleetId);
  const course_setup = mergeRaceStartIntoCourseSetup(parsed.course_setup, fleetStartUtcMs);

  await supabase.from("race_fleet_analysis_settings").upsert(
    {
      race_id: raceId,
      race_fleet_id: raceFleetId,
      group_id: groupId,
      course_letter: courseLetter,
      laps,
      wind_direction: windDirection != null && windDirection !== "" ? Number(windDirection) : null,
      mark_overrides: parsed.mark_overrides,
      course_setup,
      det_settings: parsed.det_settings,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "race_fleet_id" },
  );

  revalidatePath(trackAnalysisPath(groupId, seriesId, raceId));
  redirect(
    trackAnalysisPath(
      groupId,
      seriesId,
      raceId,
      `fleet=${encodeURIComponent(raceFleetId)}&settings_saved=1`,
    ),
  );
}

/** @deprecated Use saveRaceFleetAnalysisSettingsAction */
export const saveRaceAnalysisSettingsAction = saveRaceFleetAnalysisSettingsAction;

export async function confirmRaceFleetAnalysisAction(formData: FormData) {
  const groupId = String(formData.get("group_id") ?? "").trim();
  const raceId = String(formData.get("race_id") ?? "").trim();
  const seriesId = String(formData.get("series_id") ?? "").trim();
  const raceFleetId = String(formData.get("race_fleet_id") ?? "").trim();

  const { supabase, user } = await requireRaceStaff(groupId, raceId);

  const { data: settings } = await supabase
    .from("race_fleet_analysis_settings")
    .select("*")
    .eq("race_fleet_id", raceFleetId)
    .maybeSingle();

  if (!settings?.course_letter) {
    redirect(
      trackAnalysisPath(
        groupId,
        seriesId,
        raceId,
        `fleet=${encodeURIComponent(raceFleetId)}&error=${encodeURIComponent("Select a course letter and save before analysing this fleet.")}`,
      ),
    );
  }

  const { data: submissions } = await supabase
    .from("race_track_submissions")
    .select("id, user_id, race_id, race_entry_id, boat_id, track_source, external_activity_id, storage_path")
    .eq("race_id", raceId)
    .eq("analysis_mode", "collated")
    .eq("status", "pending_ro");

  const { analysed } = await runCollatedAnalysisForFleet(supabase, {
    groupId,
    raceId,
    raceFleetId,
    settings: settings as RaceFleetAnalysisSettingsRow,
    submissions: submissions ?? [],
    confirmedByUserId: user.id,
  });

  revalidatePath("/tracks");
  revalidatePath("/");
  revalidatePath(trackAnalysisPath(groupId, seriesId, raceId));
  redirect(
    trackAnalysisPath(
      groupId,
      seriesId,
      raceId,
      `fleet=${encodeURIComponent(raceFleetId)}&analysis_ready=1&analysed=${analysed}`,
    ),
  );
}

export async function confirmAllRaceFleetAnalysisAction(formData: FormData) {
  const groupId = String(formData.get("group_id") ?? "").trim();
  const raceId = String(formData.get("race_id") ?? "").trim();
  const seriesId = String(formData.get("series_id") ?? "").trim();

  const { supabase, user } = await requireRaceStaff(groupId, raceId);

  const settingsMap = await loadRaceFleetAnalysisSettingsMap(supabase, raceId);
  const { data: fleets } = await supabase
    .from("race_fleets")
    .select("id")
    .eq("race_id", raceId)
    .order("sort_order");

  const { data: submissions } = await supabase
    .from("race_track_submissions")
    .select("id, user_id, race_id, race_entry_id, boat_id, track_source, external_activity_id, storage_path")
    .eq("race_id", raceId)
    .eq("analysis_mode", "collated")
    .eq("status", "pending_ro");

  let totalAnalysed = 0;
  const missingCourse: string[] = [];

  for (const fleet of fleets ?? []) {
    const settings = settingsMap.get(fleet.id);
    if (!settings?.course_letter) {
      missingCourse.push(fleet.id);
      continue;
    }
    const { analysed } = await runCollatedAnalysisForFleet(supabase, {
      groupId,
      raceId,
      raceFleetId: fleet.id,
      settings,
      submissions: submissions ?? [],
      confirmedByUserId: user.id,
    });
    totalAnalysed += analysed;
  }

  if (missingCourse.length > 0 && totalAnalysed === 0) {
    redirect(
      trackAnalysisPath(
        groupId,
        seriesId,
        raceId,
        `error=${encodeURIComponent("Save course and laps for each fleet with pending tracks before analysing all.")}`,
      ),
    );
  }

  revalidatePath("/tracks");
  revalidatePath("/");
  revalidatePath(trackAnalysisPath(groupId, seriesId, raceId));
  redirect(
    trackAnalysisPath(groupId, seriesId, raceId, `analysis_ready=1&analysed=${totalAnalysed}`),
  );
}

/** @deprecated Use confirmRaceFleetAnalysisAction or confirmAllRaceFleetAnalysisAction */
export const confirmRaceAnalysisCompleteAction = confirmAllRaceFleetAnalysisAction;

/** Staff: create race_fleets on one race from the series schedule template (when missing). */
export async function syncRaceFleetsFromSeriesTemplateAction(formData: FormData) {
  const groupId = String(formData.get("group_id") ?? "").trim();
  const raceId = String(formData.get("race_id") ?? "").trim();
  const seriesId = String(formData.get("series_id") ?? "").trim();

  const { supabase } = await requireRaceStaff(groupId, raceId);

  const { fleets, syncError, templateFleetCount } = await loadOrSeedRaceFleetsForTrackAnalysis(
    supabase,
    { raceId, seriesId, groupId },
  );

  revalidatePath(trackAnalysisPath(groupId, seriesId, raceId));

  if (syncError) {
    redirect(
      trackAnalysisPath(
        groupId,
        seriesId,
        raceId,
        `error=${encodeURIComponent(syncError)}`,
      ),
    );
  }

  if (fleets.length === 0) {
    redirect(
      trackAnalysisPath(
        groupId,
        seriesId,
        raceId,
        `error=${encodeURIComponent(
          templateFleetCount === 0
            ? "No applicable fleets on this series — open the series page, select fleets on the generator, and save before syncing."
            : "Could not create race fleets. Check club fleet setup and try again.",
        )}`,
      ),
    );
  }

  redirect(
    trackAnalysisPath(groupId, seriesId, raceId, `fleets_synced=${fleets.length}`),
  );
}

export async function countPendingRaceTrackAnalysis(groupId: string): Promise<number> {
  const { supabase, user } = await getServerAuth();
  if (!user) return 0;

  const { data: me } = await supabase
    .from("group_memberships")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (me?.role !== "club_admin" && me?.role !== "race_officer") return 0;

  const { count } = await supabase
    .from("race_track_submissions")
    .select("*", { count: "exact", head: true })
    .eq("group_id", groupId)
    .eq("analysis_mode", "collated")
    .eq("status", "pending_ro");

  return count ?? 0;
}

/** Load map overlay tracks for one fleet (client-side fleet switch on track-analysis). */
export async function loadRaceFleetTracksAction(
  groupId: string,
  raceId: string,
  raceFleetId: string,
): Promise<FleetTrackOverlay[]> {
  const { supabase, user } = await getServerAuth();
  if (!user || !groupId) return [];

  const { data: me } = await supabase
    .from("group_memberships")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (me?.role !== "club_admin" && me?.role !== "race_officer") return [];

  const { data: race } = await supabase.from("races").select("id").eq("id", raceId).maybeSingle();
  if (!race) return [];

  return loadRaceFleetTracks(supabase, raceId, { raceFleetId });
}
