"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerAuth } from "@/lib/supabase/auth-cache";
import { loadRaceMatchCandidates } from "@/lib/track-race-matching";
import {
  cacheSubmissionTrackPoints,
  loadTrackPointsForSubmission,
} from "@/lib/track-points-loader";
import {
  mergeRaceStartIntoCourseSetup,
  resolveRaceStartUtcMs,
} from "@/lib/sailing-analysis/race-start-from-schedule";
import {
  executeAnalysis,
  parseFIT,
  parseGPX,
  serializeAnalysisForDb,
  DETECTION_DEFAULTS,
} from "@/lib/sailing-analysis";
import type { AnalysisMode, MarkOverride } from "@/lib/sailing-analysis/types";
import { ensureFleetAnalysisSettingsRow, ensureRaceEntryForTrackSubmission } from "@/lib/sailing-analysis/race-fleet-analysis-settings";
import { tryAutoAnalyseCollatedSubmission } from "@/lib/sailing-analysis/auto-collated-fleet-analysis";

function redirectTracks(submissionId: string, query?: string) {
  redirect(`/tracks/${submissionId}${query ? `?${query}` : ""}`);
}

async function loadSubmissionOwned(submissionId: string) {
  const { supabase, user } = await getServerAuth();
  if (!user) redirect("/login");

  const { data: sub } = await supabase
    .from("race_track_submissions")
    .select("*")
    .eq("id", submissionId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!sub) redirect("/tracks?error=" + encodeURIComponent("Track submission not found."));
  return { supabase, user, sub };
}

async function loadClubSailingContext(
  supabase: Awaited<ReturnType<typeof getServerAuth>>["supabase"],
  groupId: string,
  courseLetter: string | null,
) {
  const { data: marks } = await supabase
    .from("group_sailing_marks")
    .select("*")
    .eq("group_id", groupId)
    .order("sort_order");

  let course = null;
  if (courseLetter) {
    const { data } = await supabase
      .from("group_sailing_courses")
      .select("*")
      .eq("group_id", groupId)
      .eq("course_letter", courseLetter)
      .maybeSingle();
    course = data;
  }

  return { marks: marks ?? [], course };
}

export async function createStravaSubmissionAction(formData: FormData) {
  const { supabase, user } = await getServerAuth();
  if (!user) redirect("/login");

  const activityId = String(formData.get("activity_id") ?? "").trim();
  const activityName = String(formData.get("activity_name") ?? "").trim();
  const startDate = String(formData.get("start_date") ?? "").trim();
  const elapsed = Number(formData.get("elapsed_time") ?? 0);

  if (!activityId || !startDate) {
    redirect("/tracks/new?error=" + encodeURIComponent("Invalid Strava activity."));
  }

  const startMs = new Date(startDate).getTime();
  const endMs = startMs + elapsed * 1000;

  const candidates = await loadRaceMatchCandidates(supabase, user.id, startMs, endMs);
  const best = candidates[0];

  if (!best?.groupId) {
    redirect("/tracks/new?error=" + encodeURIComponent("No matching race found for this activity time."));
  }

  const { data: sub, error } = await supabase
    .from("race_track_submissions")
    .upsert(
      {
        user_id: user.id,
        group_id: best.groupId,
        proposed_race_id: best.raceId,
        track_source: "strava",
        external_activity_id: activityId,
        activity_name: activityName || null,
        activity_started_at: new Date(startMs).toISOString(),
        activity_ended_at: new Date(endMs).toISOString(),
        status: "pending_confirm",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,external_activity_id" },
    )
    .select("id")
    .single();

  if (error || !sub) {
    redirect("/tracks/new?error=" + encodeURIComponent(error?.message ?? "Could not save submission."));
  }

  revalidatePath("/tracks");
  redirectTracks(sub.id, "step=confirm");
}

export async function createUploadSubmissionAction(formData: FormData) {
  const { supabase, user } = await getServerAuth();
  if (!user) redirect("/login");

  const file = formData.get("track_file");
  if (!(file instanceof File) || file.size === 0) {
    redirect("/tracks/new?error=" + encodeURIComponent("Choose a GPX or FIT file."));
  }

  const lower = file.name.toLowerCase();
  let points: { lat: number; lon: number; time: number | null }[] = [];
  if (lower.endsWith(".gpx") || lower.endsWith(".xml")) {
    points = parseGPX(await file.text());
  } else if (lower.endsWith(".fit")) {
    points = parseFIT(await file.arrayBuffer());
  } else {
    redirect("/tracks/new?error=" + encodeURIComponent("Use GPX or FIT format."));
  }

  const timed = points.filter((p) => p.time != null) as { lat: number; lon: number; time: number }[];
  if (timed.length < 20) {
    redirect("/tracks/new?error=" + encodeURIComponent("Track needs at least 20 timed GPS points."));
  }

  const startMs = timed[0].time * 1000;
  const endMs = timed[timed.length - 1].time * 1000;
  const candidates = await loadRaceMatchCandidates(supabase, user.id, startMs, endMs);
  const best = candidates[0];
  if (!best?.groupId) {
    redirect("/tracks/new?error=" + encodeURIComponent("No matching race found for this track time."));
  }

  const activityId = `file-${Date.now()}`;
  const storagePath = `${user.id}/${activityId}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

  const { error: upErr } = await supabase.storage.from("race-tracks").upload(storagePath, file, {
    upsert: true,
    contentType: file.type || "application/octet-stream",
  });
  if (upErr) {
    redirect("/tracks/new?error=" + encodeURIComponent(upErr.message));
  }

  await supabase.storage.from("race-tracks").upload(
    `${user.id}/${activityId}.json`,
    JSON.stringify(timed),
    { upsert: true, contentType: "application/json" },
  );

  const { data: sub, error } = await supabase
    .from("race_track_submissions")
    .insert({
      user_id: user.id,
      group_id: best.groupId,
      proposed_race_id: best.raceId,
      track_source: "upload",
      external_activity_id: activityId,
      activity_name: file.name,
      activity_started_at: new Date(startMs).toISOString(),
      activity_ended_at: new Date(endMs).toISOString(),
      storage_path: storagePath,
      status: "pending_confirm",
    })
    .select("id")
    .single();

  if (error || !sub) {
    redirect("/tracks/new?error=" + encodeURIComponent(error?.message ?? "Could not save submission."));
  }

  await supabase.rpc("set_track_submission_points_cache", {
    p_submission_id: sub.id,
    p_points: timed,
  });

  revalidatePath("/tracks");
  redirectTracks(sub.id, "step=confirm");
}

export async function confirmRaceBoatAction(formData: FormData) {
  const submissionId = String(formData.get("submission_id") ?? "").trim();
  const raceId = String(formData.get("race_id") ?? "").trim();
  const boatId = String(formData.get("boat_id") ?? "").trim();
  const { supabase, sub } = await loadSubmissionOwned(submissionId);

  if (!raceId || !boatId) {
    redirectTracks(submissionId, "error=" + encodeURIComponent("Select a race and boat."));
  }

  const { data: race } = await supabase
    .from("races")
    .select("id, series_id, series:series_id(group_id)")
    .eq("id", raceId)
    .maybeSingle();

  const series = Array.isArray(race?.series) ? race?.series[0] : race?.series;
  const groupId = series?.group_id ?? sub.group_id;

  const seriesId = race?.series_id;
  if (!seriesId) {
    redirectTracks(submissionId, "error=" + encodeURIComponent("Race not found."));
  }

  const { data: seriesBoat } = await supabase
    .from("series_registration_boats")
    .select("boat_id")
    .eq("series_id", seriesId)
    .eq("user_id", sub.user_id)
    .eq("boat_id", boatId)
    .maybeSingle();

  if (!seriesBoat) {
    redirectTracks(
      submissionId,
      "error=" + encodeURIComponent("Choose a boat you entered for this series."),
    );
  }

  let raceEntryId: string | null = null;
  try {
    const ensured = await ensureRaceEntryForTrackSubmission(supabase, {
      raceId,
      userId: sub.user_id,
      boatId,
      seriesId,
      groupId,
    });
    raceEntryId = ensured.raceEntryId;
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not link race entry.";
    redirectTracks(submissionId, "error=" + encodeURIComponent(message));
  }

  await supabase
    .from("race_track_submissions")
    .update({
      race_id: raceId,
      boat_id: boatId,
      group_id: groupId,
      race_entry_id: raceEntryId,
      status: "pending_mode",
      updated_at: new Date().toISOString(),
    })
    .eq("id", submissionId);

  try {
    await cacheSubmissionTrackPoints(supabase, sub.user_id, sub);
  } catch {
    /* map overlay is optional until cache succeeds */
  }

  revalidatePath("/tracks");
  redirectTracks(submissionId, "step=mode");
}

export async function setAnalysisModeAction(formData: FormData) {
  const submissionId = String(formData.get("submission_id") ?? "").trim();
  const mode = String(formData.get("analysis_mode") ?? "") as AnalysisMode;
  const { supabase, user, sub } = await loadSubmissionOwned(submissionId);

  if (mode !== "standalone" && mode !== "collated") {
    redirectTracks(submissionId, "error=" + encodeURIComponent("Choose an analysis mode."));
  }

  if (mode === "collated") {
    const { data: profile } = await supabase
      .from("profiles")
      .select("share_track_for_enhanced_analytics")
      .eq("id", user.id)
      .maybeSingle();

    if (profile?.share_track_for_enhanced_analytics === false) {
      redirectTracks(
        submissionId,
        "error=" +
          encodeURIComponent("Enable track sharing on your account page for collated fleet analysis."),
      );
    }

    const { count } = await supabase
      .from("group_sailing_courses")
      .select("*", { count: "exact", head: true })
      .eq("group_id", sub.group_id)
      .neq("course_type", "custom");

    if ((count ?? 0) === 0) {
      redirectTracks(
        submissionId,
        "error=" + encodeURIComponent("Your club has no courses configured yet — ask a club admin."),
      );
    }

    let raceFleetId: string | null = null;
    if (sub.race_entry_id) {
      const { data: entry } = await supabase
        .from("race_entries")
        .select("fleet_id")
        .eq("id", sub.race_entry_id)
        .maybeSingle();
      raceFleetId = entry?.fleet_id ?? null;
    }

    if (!raceFleetId && sub.race_id && sub.boat_id) {
      const { data: race } = await supabase
        .from("races")
        .select("series_id")
        .eq("id", sub.race_id)
        .maybeSingle();

      if (race?.series_id) {
        try {
          const ensured = await ensureRaceEntryForTrackSubmission(supabase, {
            raceId: sub.race_id,
            userId: user.id,
            boatId: sub.boat_id,
            seriesId: race.series_id,
            groupId: sub.group_id,
          });
          raceFleetId = ensured.fleetId;
          if (!sub.race_entry_id) {
            await supabase
              .from("race_track_submissions")
              .update({ race_entry_id: ensured.raceEntryId, updated_at: new Date().toISOString() })
              .eq("id", submissionId);
          }
        } catch {
          /* fleet may still resolve at analysis time via boat rules */
        }
      }
    }

    if (raceFleetId && sub.race_id) {
      await ensureFleetAnalysisSettingsRow(supabase, {
        raceId: sub.race_id,
        raceFleetId,
        groupId: sub.group_id,
      });
    }
  }

  const nextStatus = mode === "standalone" ? "pending_setup" : "pending_ro";

  if (mode === "collated") {
    try {
      await cacheSubmissionTrackPoints(supabase, user.id, sub);
    } catch {
      /* RO can still set course without overlay */
    }
  } else {
    try {
      await cacheSubmissionTrackPoints(supabase, user.id, sub);
    } catch {
      /* standalone map may load live from Strava */
    }
  }

  await supabase
    .from("race_track_submissions")
    .update({
      analysis_mode: mode,
      status: nextStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", submissionId);

  if (mode === "collated" && sub.race_id) {
    const { data: freshSub } = await supabase
      .from("race_track_submissions")
      .select(
        "id, user_id, race_id, race_entry_id, boat_id, track_source, external_activity_id, storage_path, track_points_cache",
      )
      .eq("id", submissionId)
      .maybeSingle();
    if (freshSub) {
      try {
        await tryAutoAnalyseCollatedSubmission(supabase, {
          groupId: sub.group_id,
          raceId: sub.race_id,
          submission: freshSub,
        });
      } catch (err) {
        console.error("tryAutoAnalyseCollatedSubmission:", err);
      }
    }
  }

  revalidatePath("/tracks");
  revalidatePath("/");

  if (mode === "standalone") {
    redirectTracks(submissionId, "step=setup");
  }
  redirectTracks(submissionId, "step=pending_ro");
}

export async function saveStandaloneSetupAction(formData: FormData) {
  const submissionId = String(formData.get("submission_id") ?? "").trim();
  const courseLetter = String(formData.get("course_letter") ?? "").trim() || null;
  const laps = Math.max(1, Number(formData.get("laps") ?? 1));
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
    redirectTracks(submissionId, "error=" + encodeURIComponent("Invalid setup data."));
  }

  const { supabase, user, sub } = await loadSubmissionOwned(submissionId);

  await supabase
    .from("race_track_submissions")
    .update({
      course_letter: courseLetter,
      laps,
      mark_overrides,
      course_setup,
      det_settings,
      updated_at: new Date().toISOString(),
    })
    .eq("id", submissionId);

  const points = await loadTrackPointsForSubmission(supabase, user.id, sub);
  if (points.length < 20) {
    redirectTracks(submissionId, "error=" + encodeURIComponent("Could not load GPS track — check Strava link or re-upload."));
  }
  const { marks, course } = await loadClubSailingContext(supabase, sub.group_id, courseLetter);
  const results = executeAnalysis({
    points,
    marks,
    course,
    laps,
    markOverrides: mark_overrides,
    courseSetup: course_setup,
    detSettings: det_settings,
  });

  if (!results) {
    redirectTracks(submissionId, "error=" + encodeURIComponent("Analysis failed — check course and crop settings."));
  }

  const serialized = serializeAnalysisForDb(results as NonNullable<typeof results>);

  await supabase.from("race_track_analyses").upsert(
    { submission_id: submissionId, ...serialized, updated_at: new Date().toISOString() },
    { onConflict: "submission_id" },
  );

  await supabase
    .from("race_track_submissions")
    .update({ status: "ready", updated_at: new Date().toISOString() })
    .eq("id", submissionId);

  revalidatePath("/tracks");
  revalidatePath("/");
  redirect(`/tracks/${submissionId}/analysis`);
}

export async function rerunTrackAnalysisAction(formData: FormData) {
  const submissionId = String(formData.get("submission_id") ?? "").trim();
  const markOverridesRaw = String(formData.get("mark_overrides") ?? "{}");
  const courseSetupRaw = String(formData.get("course_setup") ?? "{}");
  const windRaw = formData.get("wind_direction");

  let mark_overrides: Record<string, MarkOverride> = {};
  let course_setup: Record<string, unknown> = {};
  try {
    mark_overrides = JSON.parse(markOverridesRaw);
    course_setup = JSON.parse(courseSetupRaw);
  } catch {
    redirect(`/tracks/${submissionId}/analysis?error=` + encodeURIComponent("Invalid setup data."));
  }

  const userWind =
    windRaw != null && String(windRaw).trim() !== "" && Number.isFinite(Number(windRaw))
      ? Number(windRaw)
      : null;

  const { supabase, user, sub } = await loadSubmissionOwned(submissionId);

  await supabase
    .from("race_track_submissions")
    .update({
      mark_overrides,
      course_setup,
      updated_at: new Date().toISOString(),
    })
    .eq("id", submissionId);

  const points = await loadTrackPointsForSubmission(supabase, user.id, sub);
  if (points.length < 20) {
    redirect(`/tracks/${submissionId}/analysis?error=` + encodeURIComponent("Could not load GPS track."));
  }

  const { marks, course } = await loadClubSailingContext(supabase, sub.group_id, sub.course_letter);

  if (sub.race_id) {
    const raceStartUtcMs = await resolveRaceStartUtcMs(supabase, sub.race_id);
    course_setup = mergeRaceStartIntoCourseSetup(
      course_setup,
      raceStartUtcMs,
      points[0]?.time ?? null,
    );
  }

  const results = executeAnalysis({
    points,
    marks,
    course,
    laps: sub.laps ?? 1,
    markOverrides: mark_overrides,
    courseSetup: course_setup,
    detSettings: (sub.det_settings ?? DETECTION_DEFAULTS) as typeof DETECTION_DEFAULTS,
    userWind,
  });

  if (!results) {
    redirect(`/tracks/${submissionId}/analysis?error=` + encodeURIComponent("Analysis failed."));
  }

  const serialized = serializeAnalysisForDb(results as NonNullable<typeof results>);
  await supabase.from("race_track_analyses").upsert(
    { submission_id: submissionId, ...serialized, updated_at: new Date().toISOString() },
    { onConflict: "submission_id" },
  );

  revalidatePath(`/tracks/${submissionId}/analysis`);
  revalidatePath("/tracks");
  redirect(`/tracks/${submissionId}/analysis?rerun=1`);
}

export async function dismissTrackNotificationAction(formData: FormData) {
  const submissionId = String(formData.get("submission_id") ?? "").trim();
  const { supabase } = await loadSubmissionOwned(submissionId);
  await supabase
    .from("race_track_submissions")
    .update({ ready_notified_at: new Date().toISOString() })
    .eq("id", submissionId);
  revalidatePath("/");
  revalidatePath("/tracks");
}

export async function renameTrackSubmissionAction(formData: FormData) {
  const submissionId = String(formData.get("submission_id") ?? "").trim();
  const activityName = String(formData.get("activity_name") ?? "").trim();

  if (!activityName) {
    redirect("/tracks?error=" + encodeURIComponent("Enter a track name."));
  }
  if (activityName.length > 200) {
    redirect("/tracks?error=" + encodeURIComponent("Track name is too long (200 characters max)."));
  }

  const { supabase, sub } = await loadSubmissionOwned(submissionId);
  if (sub.status === "cancelled") {
    redirect("/tracks?error=" + encodeURIComponent("That track was removed."));
  }

  const { error } = await supabase
    .from("race_track_submissions")
    .update({ activity_name: activityName, updated_at: new Date().toISOString() })
    .eq("id", submissionId);

  if (error) {
    redirect("/tracks?error=" + encodeURIComponent(error.message));
  }

  revalidatePath("/tracks");
  revalidatePath(`/tracks/${submissionId}`);
  redirect("/tracks?renamed=1");
}

export async function removeTrackSubmissionAction(formData: FormData) {
  const submissionId = String(formData.get("submission_id") ?? "").trim();
  const { supabase, sub } = await loadSubmissionOwned(submissionId);

  if (sub.status === "cancelled") {
    redirect("/tracks");
  }

  const { error } = await supabase
    .from("race_track_submissions")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", submissionId);

  if (error) {
    redirect("/tracks?error=" + encodeURIComponent(error.message));
  }

  revalidatePath("/tracks");
  revalidatePath("/");
  revalidatePath(`/tracks/${submissionId}`);
  redirect("/tracks?removed=1");
}

export async function loadSubmissionMatchCandidatesAction(submissionId: string) {
  const { supabase, user, sub } = await loadSubmissionOwned(submissionId);
  const startMs = new Date(sub.activity_started_at).getTime();
  const endMs = new Date(sub.activity_ended_at).getTime();
  return loadRaceMatchCandidates(supabase, user.id, startMs, endMs);
}
