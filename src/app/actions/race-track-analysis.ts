"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerAuth } from "@/lib/supabase/auth-cache";
import {
  executeAnalysis,
  serializeAnalysisForDb,
  DETECTION_DEFAULTS,
  parseFIT,
  parseGPX,
} from "@/lib/sailing-analysis";
import type { MarkOverride } from "@/lib/sailing-analysis/types";
import { fetchStravaTrackPoints, getStravaConnection } from "@/lib/strava";

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

async function loadPointsForSubmission(
  supabase: Awaited<ReturnType<typeof getServerAuth>>["supabase"],
  sub: {
    user_id: string;
    track_source: string;
    external_activity_id: string;
    storage_path: string | null;
  },
) {
  if (sub.track_source === "strava") {
    const conn = await getStravaConnection(supabase, sub.user_id);
    if (!conn) return [];
    return fetchStravaTrackPoints(conn, sub.external_activity_id);
  }
  if (!sub.storage_path) return [];
  const jsonPath = `${sub.user_id}/${sub.external_activity_id}.json`;
  const { data: cached } = await supabase.storage.from("race-tracks").download(jsonPath);
  if (cached) {
    try {
      return JSON.parse(await cached.text()) as { lat: number; lon: number; time: number }[];
    } catch {
      /* fall through */
    }
  }
  const { data } = await supabase.storage.from("race-tracks").download(sub.storage_path);
  if (!data) return [];
  const name = sub.storage_path.toLowerCase();
  if (name.endsWith(".gpx")) return parseGPX(await data.text());
  return parseFIT(await data.arrayBuffer());
}

export async function saveRaceAnalysisSettingsAction(formData: FormData) {
  const groupId = String(formData.get("group_id") ?? "").trim();
  const raceId = String(formData.get("race_id") ?? "").trim();
  const seriesId = String(formData.get("series_id") ?? "").trim();
  const courseLetter = String(formData.get("course_letter") ?? "").trim() || null;
  const laps = Math.max(1, Number(formData.get("laps") ?? 1));
  const windDirection = formData.get("wind_direction");
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
    redirect(
      `/groups/${groupId}/series/${seriesId}/races/${raceId}/track-analysis?error=` +
        encodeURIComponent("Invalid settings JSON."),
    );
  }

  const { supabase } = await requireRaceStaff(groupId, raceId);

  await supabase.from("race_analysis_settings").upsert(
    {
      race_id: raceId,
      group_id: groupId,
      course_letter: courseLetter,
      laps,
      wind_direction: windDirection != null && windDirection !== "" ? Number(windDirection) : null,
      mark_overrides,
      course_setup,
      det_settings,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "race_id" },
  );

  revalidatePath(`/groups/${groupId}/series/${seriesId}/races/${raceId}/track-analysis`);
  redirect(
    `/groups/${groupId}/series/${seriesId}/races/${raceId}/track-analysis?settings_saved=1`,
  );
}

export async function confirmRaceAnalysisCompleteAction(formData: FormData) {
  const groupId = String(formData.get("group_id") ?? "").trim();
  const raceId = String(formData.get("race_id") ?? "").trim();
  const seriesId = String(formData.get("series_id") ?? "").trim();

  const { supabase, user } = await requireRaceStaff(groupId, raceId);

  const { data: settings } = await supabase
    .from("race_analysis_settings")
    .select("*")
    .eq("race_id", raceId)
    .maybeSingle();

  if (!settings?.course_letter) {
    redirect(
      `/groups/${groupId}/series/${seriesId}/races/${raceId}/track-analysis?error=` +
        encodeURIComponent("Select a course letter before confirming."),
    );
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

  const { data: submissions } = await supabase
    .from("race_track_submissions")
    .select("*")
    .eq("race_id", raceId)
    .eq("analysis_mode", "collated")
    .eq("status", "pending_ro");

  for (const sub of submissions ?? []) {
    const points = await loadPointsForSubmission(supabase, sub);
    if (points.length < 20) continue;

    const results = executeAnalysis({
      points,
      marks: marks ?? [],
      course,
      laps: settings.laps ?? 1,
      markOverrides: (settings.mark_overrides ?? {}) as Record<string, MarkOverride>,
      courseSetup: (settings.course_setup ?? {}) as Record<string, unknown>,
      detSettings: (settings.det_settings ?? DETECTION_DEFAULTS) as typeof DETECTION_DEFAULTS,
      userWind: settings.wind_direction,
    });

    if (!results) continue;

    const serialized = serializeAnalysisForDb(results);
    await supabase.from("race_track_analyses").upsert(
      { submission_id: sub.id, ...serialized, updated_at: new Date().toISOString() },
      { onConflict: "submission_id" },
    );

    await supabase
      .from("race_track_submissions")
      .update({ status: "ready", updated_at: new Date().toISOString() })
      .eq("id", sub.id);
  }

  await supabase
    .from("race_analysis_settings")
    .update({
      ro_confirmed_at: new Date().toISOString(),
      ro_confirmed_by: user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("race_id", raceId);

  revalidatePath("/tracks");
  revalidatePath("/");
  revalidatePath(`/groups/${groupId}/series/${seriesId}/races/${raceId}/track-analysis`);
  redirect(
    `/groups/${groupId}/series/${seriesId}/races/${raceId}/track-analysis?analysis_ready=1`,
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
