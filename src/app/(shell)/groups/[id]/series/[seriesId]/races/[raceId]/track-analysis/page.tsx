import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { RoTrackAnalysisSetupForm } from "@/components/sailing-analysis/ro-track-analysis-setup-form";
import { fleetStartLabel } from "@/components/sailing-analysis/ro-track-analysis-fleet-panel";
import { getServerAuth } from "@/lib/supabase/auth-cache";
import {
  countPendingCollatedByFleet,
  loadRaceFleetTracks,
} from "@/lib/sailing-analysis/load-race-fleet-tracks";
import {
  ensureFleetAnalysisSettingsRow,
  loadRaceFleetAnalysisSettingsMap,
  type RaceFleetAnalysisSettingsRow,
} from "@/lib/sailing-analysis/race-fleet-analysis-settings";
import {
  describeTrackRaceMatchWindow,
  TRACK_RACE_MATCH_DEFAULT_OPEN_HOURS,
} from "@/lib/track-race-matching";
import { loadOrSeedRaceFleetsForTrackAnalysis } from "@/lib/ensure-race-fleets-for-track-analysis";
import { syncRaceFleetsFromSeriesTemplateAction } from "@/app/actions/race-track-analysis";
import {
  raceStartSecAfterFirstGps,
  resolveFleetStartUtcMs,
} from "@/lib/sailing-analysis/race-start-from-schedule";
import {
  buildRoRaceLineNav,
  RO_RACE_LINE_NAV_ACTIVE_CLASS,
  RO_RACE_LINE_NAV_LINK_CLASS,
} from "@/lib/ro-race-line-nav";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string; seriesId: string; raceId: string }>;
  searchParams: Promise<{
    error?: string;
    settings_saved?: string;
    analysis_ready?: string;
    fleet?: string;
    analysed?: string;
    fleets_synced?: string;
  }>;
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
    { data: seriesRow },
    { data: courses, error: coursesError },
    { data: clubMarks, error: marksError },
    fleetLoad,
    pendingByFleet,
    settingsLoad,
  ] = await Promise.all([
    supabase
      .from("races")
      .select("series:series_id(tally_open_hours_before_fleet_start)")
      .eq("id", raceId)
      .maybeSingle(),
    supabase.from("group_sailing_courses").select("*").eq("group_id", groupId).order("sort_order"),
    supabase.from("group_sailing_marks").select("*").eq("group_id", groupId).order("sort_order"),
    loadOrSeedRaceFleetsForTrackAnalysis(supabase, { raceId, seriesId, groupId }),
    countPendingCollatedByFleet(supabase, raceId),
    supabase.from("race_fleet_analysis_settings").select("id").eq("race_id", raceId).limit(1),
  ]);

  const fleetRows = fleetLoad.fleets;
  const fleetsSyncedOnLoad = fleetLoad.syncedFromTemplate;
  const fleetsError = fleetLoad.syncError ? { message: fleetLoad.syncError } : null;
  const templateFleetCount = fleetLoad.templateFleetCount;

  const settingsTableMissing = Boolean(
    settingsLoad.error?.message?.includes("race_fleet_analysis_settings"),
  );

  let settingsMap = await loadRaceFleetAnalysisSettingsMap(supabase, raceId);

  const raceFleets = (fleetRows ?? []).map((f) => ({
    id: f.id,
    name: f.name,
    startSignalLabel: fleetStartLabel(f.start_signal_at, clubTz),
  }));

  const settingsByFleetId: Record<string, RaceFleetAnalysisSettingsRow | null> = {};
  const fleetTracksByFleetId: Record<string, Awaited<ReturnType<typeof loadRaceFleetTracks>>> = {};
  const pendingByFleetId: Record<string, number> = {};
  const raceStartByFleetId: Record<string, { unixSec: number | null; sec: number }> = {};

  if (!settingsTableMissing) {
    for (const f of raceFleets) {
      await ensureFleetAnalysisSettingsRow(supabase, {
        raceId,
        raceFleetId: f.id,
        groupId,
      });
    }
    settingsMap = await loadRaceFleetAnalysisSettingsMap(supabase, raceId);
  }

  for (const f of raceFleets) {
    settingsByFleetId[f.id] = settingsMap.get(f.id) ?? null;
    fleetTracksByFleetId[f.id] = await loadRaceFleetTracks(supabase, raceId, {
      raceFleetId: f.id,
    });
    pendingByFleetId[f.id] = pendingByFleet.get(f.id) ?? 0;

    const previewTrack = fleetTracksByFleetId[f.id][0]?.points ?? [];
    const firstGps = previewTrack.find((p) => p.time != null)?.time ?? previewTrack[0]?.time;
    const fleetStartUtcMs = await resolveFleetStartUtcMs(supabase, raceId, f.id);
    raceStartByFleetId[f.id] = {
      unixSec: fleetStartUtcMs != null ? Math.round(fleetStartUtcMs / 1000) : null,
      sec: raceStartSecAfterFirstGps(fleetStartUtcMs, firstGps ?? null),
    };
  }

  const unassignedPending = pendingByFleet.get(null) ?? 0;
  const courseRows = courses ?? [];
  const seriesRel = seriesRow?.series;
  const seriesOpenHours =
    (Array.isArray(seriesRel) ? seriesRel[0] : seriesRel)?.tally_open_hours_before_fleet_start ??
    TRACK_RACE_MATCH_DEFAULT_OPEN_HOURS;
  const matchWindowLabel = describeTrackRaceMatchWindow(seriesOpenHours);
  const loadError =
    (settingsTableMissing
      ? "Database migration required: apply 20261715120000_race_fleet_analysis_settings.sql (supabase db push)."
      : null) ??
    coursesError?.message ??
    marksError?.message ??
    fleetsError?.message ??
    null;
  const isClubAdmin = me?.role === "club_admin";
  const totalPending = [...pendingByFleet.values()].reduce((a, b) => a + b, 0);

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
          {" · "}
          <Link
            href={`/groups/${groupId}/series/${seriesId}/races/${raceId}/track-compare`}
            className="underline"
          >
            Fleet compare
          </Link>
        </p>

        {error || loadError ? (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error ?? loadError}
          </p>
        ) : null}
        {q.settings_saved === "1" ? (
          <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            Fleet course settings saved.
          </p>
        ) : null}
        {q.analysis_ready === "1" ? (
          <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            Track analysis complete
            {q.analysed ? ` — ${q.analysed} track${q.analysed === "1" ? "" : "s"} processed` : ""}. Sailors are
            notified on their home page.
          </p>
        ) : null}
        {fleetsSyncedOnLoad || q.fleets_synced ? (
          <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            Race fleets were created from this series&apos; schedule template
            {q.fleets_synced ? ` (${q.fleets_synced} fleets)` : ""}. Select a fleet below to set course and laps.
          </p>
        ) : null}

        <div className="mt-6">
          {totalPending === 0 && raceFleets.length > 0 && courseRows.length > 0 ? (
            <p className="mb-6 rounded-lg border border-splice-sky/80 bg-splice-sky/15 px-3 py-2 text-sm text-splice-navy dark:border-splice-ocean dark:bg-splice-navy-light/40 dark:text-splice-foam">
              No collated tracks are waiting yet — you can still preset <strong>course and laps per fleet</strong>{" "}
              below and save mark positions before sailors upload GPS.
            </p>
          ) : null}

          <details className="mb-6 text-sm text-splice-ocean dark:text-splice-water">
            <summary className="cursor-pointer font-medium text-splice-navy dark:text-splice-foam">
              When does a GPS track link to this race?
            </summary>
            <p className="mt-2 pl-1">
              Automatic matching uses the activity time range overlapping{" "}
              <strong>{matchWindowLabel}</strong> (from this series&apos; tally-open setting, default 2 hours before).
              Any overlap qualifies; races where you already have an entry are preferred. Sailors can also pick the race
              manually when confirming their upload.
            </p>
          </details>

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

          {unassignedPending > 0 ? (
            <p className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
              {unassignedPending} collated track{unassignedPending !== 1 ? "s" : ""}{" "}
              {unassignedPending !== 1 ? "are" : "is"} not linked to a fleet (check race entries on Manage).
            </p>
          ) : null}

          {raceFleets.length === 0 ? (
            <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-950">
              <p className="font-medium">No race fleets on this race yet</p>
              <p className="mt-2">
                Fleet pills come from <code className="text-xs">race_fleets</code> rows per race (not the series
                page checklist alone). This race has none
                {templateFleetCount > 0
                  ? `, but the series template lists ${templateFleetCount} fleet${templateFleetCount === 1 ? "" : "s"}.`
                  : "."}
              </p>
              {templateFleetCount > 0 ? (
                <form action={syncRaceFleetsFromSeriesTemplateAction} className="mt-3">
                  <input type="hidden" name="group_id" value={groupId} />
                  <input type="hidden" name="race_id" value={raceId} />
                  <input type="hidden" name="series_id" value={seriesId} />
                  <button
                    type="submit"
                    className="rounded-lg bg-splice-navy px-3 py-1.5 text-sm font-medium text-white dark:bg-splice-foam dark:text-splice-navy"
                  >
                    Create fleets from series template
                  </button>
                </form>
              ) : (
                <p className="mt-2">
                  <Link
                    href={`/groups/${groupId}/series/${seriesId}`}
                    className="font-medium underline"
                  >
                    Open the series page
                  </Link>{" "}
                  and save applicable fleets on the race generator, then return here.
                </p>
              )}
            </div>
          ) : null}

          <RoTrackAnalysisSetupForm
            groupId={groupId}
            raceId={raceId}
            seriesId={seriesId}
            courses={courseRows}
            clubMarks={clubMarks ?? []}
            raceFleets={raceFleets}
            settingsByFleetId={settingsByFleetId}
            fleetTracksByFleetId={fleetTracksByFleetId}
            pendingByFleetId={pendingByFleetId}
            raceStartByFleetId={raceStartByFleetId}
            initialFleetId={q.fleet}
          />
        </div>

      </main>
    </div>
  );
}
