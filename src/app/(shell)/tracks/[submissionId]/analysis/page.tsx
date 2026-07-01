import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AnalysisInteractive } from "@/components/sailing-analysis/analysis-interactive";
import { buildCourseLinePoints, buildMapMarksWithSfEnds } from "@/lib/sailing-analysis/map-display";
import { buildGateOverlayFC, sfLineFromCourseSetup } from "@/lib/sailing-analysis/gate-overlay";
import { loadTrackPointsForSubmission } from "@/lib/track-points-loader";
import { resolveCollatedCourseContext } from "@/lib/sailing-analysis/resolve-collated-course-context";
import { fleetWindGridToGeoJSON, parseFleetWindGrid } from "@/lib/sailing-analysis/fleet-wind-grid";
import { resolveSubmissionRaceFleetId } from "@/lib/sailing-analysis/race-fleet-analysis-settings";
import type { AnalysisSnapshot } from "@/lib/sailing-analysis/analysis-types";
import { getServerAuth } from "@/lib/supabase/auth-cache";
import { dismissTrackNotificationAction } from "@/app/actions/track-submissions";

type Props = {
  params: Promise<{ submissionId: string }>;
  searchParams: Promise<{ error?: string; rerun?: string }>;
};

export default async function TrackAnalysisPage({ params, searchParams }: Props) {
  const { submissionId } = await params;
  const q = await searchParams;
  const error = q.error ? decodeURIComponent(q.error) : null;

  const { supabase, user } = await getServerAuth();
  if (!user) redirect("/login");

  const { data: sub } = await supabase
    .from("race_track_submissions")
    .select(
      "id, activity_name, status, analysis_mode, race_id, race_entry_id, group_id, course_letter, laps, mark_overrides, course_setup, det_settings, track_source, external_activity_id, storage_path",
    )
    .eq("id", submissionId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!sub || sub.status !== "ready") notFound();

  const { data: analysis } = await supabase
    .from("race_track_analyses")
    .select("stats, leg_summary, wind_direction, analysis_snapshot")
    .eq("submission_id", submissionId)
    .maybeSingle();

  if (!analysis) notFound();

  const stats = (analysis.stats ?? {}) as Record<string, unknown>;
  const snapshot = (analysis.analysis_snapshot ?? {}) as AnalysisSnapshot;

  const courseCtx = await resolveCollatedCourseContext(supabase, sub);

  const [{ data: clubMarks }, { data: course }, trackPoints] = await Promise.all([
    supabase.from("group_sailing_marks").select("*").eq("group_id", sub.group_id).order("sort_order"),
    courseCtx.courseLetter
      ? supabase
          .from("group_sailing_courses")
          .select("*")
          .eq("group_id", sub.group_id)
          .eq("course_letter", courseCtx.courseLetter)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    loadTrackPointsForSubmission(supabase, user.id, sub),
  ]);

  const markOverrides = courseCtx.markOverrides;
  const courseSetup = courseCtx.courseSetup;

  let windGridFC: GeoJSON.FeatureCollection | null = null;
  if (sub.analysis_mode === "collated" && sub.race_id) {
    const fleetId = await resolveSubmissionRaceFleetId(supabase, sub);
    if (fleetId) {
      const { data: fleetSettings } = await supabase
        .from("race_fleet_analysis_settings")
        .select("course_setup")
        .eq("race_fleet_id", fleetId)
        .maybeSingle();
      const grid = parseFleetWindGrid(
        (fleetSettings?.course_setup as Record<string, unknown> | undefined)?.fleetWindGrid,
      );
      if (grid) windGridFC = fleetWindGridToGeoJSON(grid);
    }
  }

  let collatedPeers: { id: string; activity_name: string | null }[] = [];
  if (sub.analysis_mode === "collated" && sub.race_id) {
    const { data: peers } = await supabase
      .from("race_track_submissions")
      .select("id, activity_name, user_id")
      .eq("race_id", sub.race_id)
      .eq("analysis_mode", "collated")
      .eq("status", "ready")
      .neq("user_id", user.id);

    collatedPeers = (peers ?? []).map((p) => ({ id: p.id, activity_name: p.activity_name }));
  }

  return (
    <div className="flex flex-1 flex-col bg-splice-surface px-4 py-12 dark:bg-splice-navy">
      <main className="mx-auto w-full max-w-5xl rounded-xl border border-splice-sky bg-white p-8 shadow-sm dark:border-splice-navy-light dark:bg-splice-navy">
        <Link href="/tracks" className="text-sm text-splice-blue underline dark:text-splice-sky">
          ← Tracks
        </Link>
        <h1 className="mt-4 text-xl font-semibold text-splice-navy dark:text-splice-foam">
          {sub.activity_name ?? "Analysis"}
        </h1>
        {sub.analysis_mode === "collated" ? (
          <p className="mt-1 text-sm text-splice-ocean dark:text-splice-water">
            Collated fleet analysis — {collatedPeers.length + 1} boat
            {collatedPeers.length === 0 ? "" : "s"} on this race
          </p>
        ) : (
          <p className="mt-1 text-sm text-splice-ocean dark:text-splice-water">Standalone analysis</p>
        )}

        {error ? (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
        ) : null}
        {q.rerun === "1" ? (
          <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            Analysis updated with your mark adjustments.
          </p>
        ) : null}

        <div className="mt-8">
          <AnalysisInteractive
            submissionId={submissionId}
            snapshot={snapshot}
            stats={stats}
            windDirection={analysis.wind_direction}
            clubMarks={clubMarks ?? []}
            course={course}
            laps={courseCtx.laps}
            initialMarkOverrides={markOverrides}
            initialCourseSetup={courseSetup}
            trackPoints={trackPoints}
            collatedPreset={sub.analysis_mode === "collated"}
            windGridFC={windGridFC}
          />
        </div>

        {collatedPeers.length > 0 ? (
          <section className="mt-10">
            <h2 className="text-lg font-medium">Other fleet tracks</h2>
            <ul className="mt-3 list-disc pl-5 text-sm text-splice-ocean dark:text-splice-water">
              {collatedPeers.map((p) => (
                <li key={p.id}>{p.activity_name ?? "Sailor track"}</li>
              ))}
            </ul>
          </section>
        ) : null}

        <form action={dismissTrackNotificationAction} className="mt-8">
          <input type="hidden" name="submission_id" value={submissionId} />
          <button type="submit" className="text-sm text-splice-blue underline dark:text-splice-sky">
            Dismiss home notification
          </button>
        </form>
      </main>
    </div>
  );
}
