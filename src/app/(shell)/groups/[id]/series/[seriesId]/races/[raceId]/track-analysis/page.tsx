import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { RoTrackAnalysisSetupForm } from "@/components/sailing-analysis/ro-track-analysis-setup-form";
import { getServerAuth } from "@/lib/supabase/auth-cache";
import { loadRaceFleetTracks } from "@/lib/sailing-analysis/load-race-fleet-tracks";
import {
  raceStartSecAfterFirstGps,
  resolveRaceStartUtcMs,
} from "@/lib/sailing-analysis/race-start-from-schedule";
import { formatClubHmFromIso } from "@/lib/club-display-format";
import type { MarkOverride } from "@/lib/sailing-analysis/types";
import {
  buildRoRaceLineNav,
  RO_RACE_LINE_NAV_ACTIVE_CLASS,
  RO_RACE_LINE_NAV_LINK_CLASS,
} from "@/lib/ro-race-line-nav";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string; seriesId: string; raceId: string }>;
  searchParams: Promise<{ error?: string; settings_saved?: string; analysis_ready?: string }>;
};

export default async function RoTrackAnalysisPage({ params, searchParams }: Props) {
  const { id: groupId, seriesId, raceId } = await params;
  const q = await searchParams;
  const error = q.error ? decodeURIComponent(q.error) : null;

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

  const [{ data: race }, { data: group }] = await Promise.all([
    supabase.from("races").select("id, name, scheduled_at").eq("id", raceId).maybeSingle(),
    supabase.from("groups").select("iana_timezone").eq("id", groupId).maybeSingle(),
  ]);

  if (!race) notFound();

  const clubTz = group?.iana_timezone ?? "Europe/London";

  const [
    { data: settings, error: settingsError },
    { data: courses, error: coursesError },
    { count: pendingCount, error: pendingError },
    { data: clubMarks, error: marksError },
    raceStartUtcMs,
    fleetTracks,
  ] = await Promise.all([
    supabase.from("race_analysis_settings").select("*").eq("race_id", raceId).maybeSingle(),
    supabase.from("group_sailing_courses").select("*").eq("group_id", groupId).order("sort_order"),
    supabase
      .from("race_track_submissions")
      .select("*", { count: "exact", head: true })
      .eq("race_id", raceId)
      .eq("analysis_mode", "collated")
      .eq("status", "pending_ro"),
    supabase.from("group_sailing_marks").select("*").eq("group_id", groupId).order("sort_order"),
    resolveRaceStartUtcMs(supabase, raceId),
    loadRaceFleetTracks(supabase, raceId, ["pending_ro", "ready"]),
  ]);

  const previewTrack = fleetTracks[0]?.points ?? [];
  const firstGps = previewTrack.find((p) => p.time != null)?.time ?? previewTrack[0]?.time;
  const raceStartUnixSec = raceStartUtcMs != null ? Math.round(raceStartUtcMs / 1000) : null;
  const raceStartSec = raceStartSecAfterFirstGps(raceStartUtcMs, firstGps ?? null);
  const raceStartLabel =
    raceStartUtcMs != null
      ? formatClubHmFromIso(new Date(raceStartUtcMs).toISOString(), clubTz)
      : null;

  const courseRows = courses ?? [];
  const loadError = settingsError?.message ?? coursesError?.message ?? pendingError?.message ?? marksError?.message ?? null;
  const isClubAdmin = me?.role === "club_admin";

  const nav = buildRoRaceLineNav({ groupId, seriesId, raceId, current: "track-analysis" });

  return (
    <div className="flex flex-1 flex-col bg-splice-surface px-4 py-12 dark:bg-splice-navy">
      <main className="mx-auto w-full max-w-5xl rounded-xl border border-splice-sky bg-white p-8 shadow-sm dark:border-splice-navy-light dark:bg-splice-navy">
        <nav className="mt-6 flex flex-wrap items-center gap-3">
          {nav.map((item) =>
            item.current ? (
              <span key={item.href} className={RO_RACE_LINE_NAV_ACTIVE_CLASS}>
                {item.label}
              </span>
            ) : (
              <Link key={item.href} href={item.href} className={RO_RACE_LINE_NAV_LINK_CLASS}>
                {item.label}
              </Link>
            ),
          )}
        </nav>

        <p className="mt-6 text-sm text-splice-ocean dark:text-splice-water">
          {race.name}
          {race.scheduled_at ? ` · ${new Date(race.scheduled_at).toLocaleString()}` : ""}
        </p>

        {error || loadError ? (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error ?? loadError}
          </p>
        ) : null}
        {q.settings_saved === "1" ? (
          <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            Course settings saved — you can now run fleet analysis.
          </p>
        ) : null}
        {q.analysis_ready === "1" ? (
          <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            Fleet analysis complete — sailors have been notified on their home page.
          </p>
        ) : null}

        <div className="mt-6">
          {courseRows.length === 0 ? (
            <p className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
              No course letters are configured for this club yet.
              {isClubAdmin ? (
                <>
                  {" "}
                  <Link href={`/groups/${groupId}/club-admin/sailing-area`} className="font-medium underline">
                    Import WSC marks &amp; courses
                  </Link>
                </>
              ) : (
                " Ask a club administrator to set up the sailing area."
              )}
            </p>
          ) : null}

          <RoTrackAnalysisSetupForm
            groupId={groupId}
            raceId={raceId}
            seriesId={seriesId}
            courses={courseRows}
            clubMarks={clubMarks ?? []}
            fleetTracks={fleetTracks}
            raceStartUnixSec={raceStartUnixSec}
            raceStartSec={raceStartSec}
            raceStartLabel={raceStartLabel}
            defaultCourseLetter={settings?.course_letter}
            defaultLaps={settings?.laps}
            defaultWind={settings?.wind_direction}
            defaultCourseSetup={(settings?.course_setup ?? null) as Record<string, unknown> | null}
            defaultMarkOverrides={(settings?.mark_overrides ?? null) as Record<string, MarkOverride> | null}
            pendingCount={pendingCount ?? 0}
            hasSavedCourse={Boolean(settings?.course_letter)}
          />
        </div>
      </main>
    </div>
  );
}
