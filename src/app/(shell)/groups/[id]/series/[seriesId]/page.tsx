import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  deleteSeriesClassPyAction,
  upsertSeriesClassPyAction,
} from "@/app/actions/class-py-overrides";
import { updateRaceSignalsAction } from "@/app/actions/race-meta";
import {
  deleteRaceAction,
  updateRaceScheduledAtAction,
  updateSeriesScheduleAction,
} from "@/app/actions/series-schedule";
import { normalizeScheduleGenerationMode } from "@/lib/schedule-generation-mode";
import { formatClubDdMmmYyyyFromIso, formatClubHmFromIso } from "@/lib/club-display-format";
import { utcMsToClubWallHm } from "@/lib/club-zoned";
import {
  resolveClubIanaTimeZone,
  utcIsoToZonedDatetimeLocalValue,
} from "@/lib/club-time";
import { scheduleTemplateFleetsFromJson } from "@/lib/schedule-template-fleets";
import { SeriesCreateRacesConfirmButton } from "@/components/series-create-races-confirm-button";
import { SeriesRaceGeneratorFields } from "@/components/series-race-generator-fields";
import { PursuitRaceConfigPanel } from "@/components/pursuit-race-config-panel";
import { InfoHint } from "@/components/ui/info-hint";
import { raceTypeLabel, normalizeRaceType } from "@/lib/race-type";
import { raceIdsWithRecordedFinishes } from "@/lib/series-recorded-results";
import { getServerAuth } from "@/lib/supabase/auth-cache";
import { fetchRyaCatalogOptionsForGroup } from "@/lib/rya-catalog-scope";
import { fetchStaffMemberships, readWorkModeForUser } from "@/lib/work-mode-cookie";

type Props = {
  params: Promise<{ id: string; seriesId: string }>;
  searchParams: Promise<{
    error?: string;
    schedule_saved?: string;
    fleets_updated?: string;
    fleets_skipped?: string;
    generated?: string;
    race_updated?: string;
    race_deleted?: string;
    registered?: string;
    withdrawn?: string;
    py_saved?: string;
    py_removed?: string;
    pursuit_saved?: string;
    signals_saved?: string;
  }>;
};

export default async function SeriesDetailPage({ params, searchParams }: Props) {
  const { id: groupId, seriesId } = await params;
  const q = await searchParams;
  const error = q.error ? decodeURIComponent(q.error) : null;
  const scheduleSaved = q.schedule_saved === "1";
  const fleetsUpdatedRaw = q.fleets_updated;
  const fleetsUpdated =
    fleetsUpdatedRaw != null && fleetsUpdatedRaw !== "" && Number.isFinite(Number(fleetsUpdatedRaw))
      ? Number(fleetsUpdatedRaw)
      : null;
  const fleetsSkippedRaw = q.fleets_skipped;
  const fleetsSkipped =
    fleetsSkippedRaw != null &&
    fleetsSkippedRaw !== "" &&
    Number.isFinite(Number(fleetsSkippedRaw))
      ? Number(fleetsSkippedRaw)
      : null;

  const generated = q.generated === "1";
  const raceUpdated = q.race_updated === "1";
  const raceDeleted = q.race_deleted === "1";
  const registeredOk = q.registered === "1";
  const withdrawnOk = q.withdrawn === "1";
  const pySaved = q.py_saved === "1";
  const pyRemoved = q.py_removed === "1";
  const pursuitSaved = q.pursuit_saved === "1";
  const signalsSaved = q.signals_saved === "1";

  const { supabase, user } = await getServerAuth();

  if (!user) {
    redirect("/login");
  }

  const { data: series, error: seriesError } = await supabase
    .from("series")
    // `*` avoids 404 when the DB lacks newer columns (e.g. tally duration fields).
    .select("*")
    .eq("id", seriesId)
    .maybeSingle();

  if (seriesError || !series || series.group_id !== groupId) {
    notFound();
  }

  const { data: group } = await supabase.from("groups").select("name, iana_timezone").eq("id", groupId).maybeSingle();

  const clubTz = resolveClubIanaTimeZone((group as { iana_timezone?: string | null } | null)?.iana_timezone);

  const { data: races, error: racesError } = await supabase
    .from("races")
    .select(
      "id, name, scheduled_at, results_final, race_type, pursuit_finish_at, pursuit_first_start_at, pursuit_start_increment_seconds, pursuit_group_fleet_id",
    )
    .eq("series_id", seriesId)
    .order("scheduled_at", { ascending: true });

  const raceIdsWithFinishes = (
    await raceIdsWithRecordedFinishes(supabase, (races ?? []).map((r) => r.id))
  ).raceIds;

  const { data: me } = await supabase
    .from("group_memberships")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .maybeSingle();

  const isAdmin = me?.role === "club_admin";

  const staffMemberships = await fetchStaffMemberships(supabase, user.id);
  const { mode: workMode } = await readWorkModeForUser(
    user.id,
    staffMemberships,
    `/groups/${groupId}/series/${seriesId}`,
  );

  if (workMode === "sailor") {
    redirect(`/groups/${groupId}/series/${seriesId}/races`);
  }

  const pyCatalogRows = await fetchRyaCatalogOptionsForGroup(supabase, groupId);

  const [{ data: seriesPyRows }, { data: groupPyRows }, { data: clubFleetRows }] = await Promise.all([
    supabase.from("series_class_py").select("class_key, py").eq("series_id", seriesId),
    supabase.from("group_class_py").select("class_key, py").eq("group_id", groupId),
    supabase
      .from("group_fleets")
      .select("id, name, sort_order")
      .eq("group_id", groupId)
      .order("sort_order", { ascending: true }),
  ]);

  const fleetsForRaceForms = (clubFleetRows ?? []).map((f) => ({ id: f.id, name: f.name }));

  const ryaByKey = new Map(pyCatalogRows.map((r) => [r.class_key, r] as const));
  const groupPyByKey = new Map((groupPyRows ?? []).map((r) => [r.class_key, r.py] as const));

  const catalogOptions = pyCatalogRows.map((r) => ({
    key: r.class_key,
    label: `${r.display_name} (${r.py})`,
  }));

  const scheduleGenMode = normalizeScheduleGenerationMode(
    (series as { schedule_generation_mode?: string | null }).schedule_generation_mode,
  );

  const defaultFirstStartTimeHm =
    series.schedule_first_start_at &&
    !Number.isNaN(new Date(series.schedule_first_start_at).getTime())
      ? utcMsToClubWallHm(new Date(series.schedule_first_start_at).getTime(), clubTz)
      : "";

  const defaultPursuitFinishTimeHm =
    (series as { pursuit_template_finish_at?: string | null }).pursuit_template_finish_at &&
    !Number.isNaN(
      new Date((series as { pursuit_template_finish_at?: string }).pursuit_template_finish_at!).getTime(),
    )
      ? utcMsToClubWallHm(
          new Date((series as { pursuit_template_finish_at?: string }).pursuit_template_finish_at!).getTime(),
          clubTz,
        )
      : "";

  const defaultPursuitStartIncrementSeconds =
    (series as { pursuit_template_start_increment_seconds?: number | null })
      .pursuit_template_start_increment_seconds ?? 60;

  const savedTemplateFleets = scheduleTemplateFleetsFromJson(
    (series as { schedule_template_fleets?: unknown }).schedule_template_fleets,
  );
  const fleetTemplateDefaults =
    savedTemplateFleets?.map((s) => ({
      fleetId: s.groupFleetId,
      startOffsetMinutes: s.startOffsetMinutes,
    })) ?? undefined;

  return (
    <div className="flex flex-1 flex-col bg-splice-surface px-4 py-12 dark:bg-splice-navy">
      <main className="mx-auto w-full max-w-2xl">
        <p className="text-sm text-splice-ocean dark:text-splice-water">
          <Link
            href={`/groups/${groupId}#club-series-maint`}
            className="text-splice-blue hover:underline dark:text-splice-water"
          >
            ← Series schedules
          </Link>
          <span className="mx-2 text-splice-water">·</span>
          <span className="text-splice-blue">{group?.name}</span>
        </p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <h1 className="text-2xl font-semibold tracking-tight text-splice-navy dark:text-splice-surface">{series.name}</h1>
          {isAdmin ? (
            <Link
              href={`/groups/${groupId}/series/${seriesId}/scoring`}
              className="shrink-0 rounded-lg border border-splice-water px-3 py-2 text-sm font-medium text-splice-navy dark:border-splice-ocean dark:text-splice-foam"
            >
              Scoring settings
            </Link>
          ) : null}
        </div>
        {series.description ? (
          <p className="mt-2 whitespace-pre-wrap text-sm text-splice-ocean dark:text-splice-water">
            {series.description}
          </p>
        ) : null}

        {registeredOk ? (
          <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
            You are registered for this series.
          </p>
        ) : null}
        {withdrawnOk ? (
          <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
            Registration withdrawn for this series.
          </p>
        ) : null}

        {scheduleSaved ? (
          <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
            Race / series generator saved — dates, first start time, periodicity, start sequence, and applicable fleets.
            {fleetsUpdated != null ? (
              fleetsUpdated === 0 && (!fleetsSkipped || fleetsSkipped === 0) ? (
                <>
                  {" "}
                  Applicable fleet template saved — this series had no races to resync fleets on yet.
                </>
              ) : fleetsUpdated === 0 && (fleetsSkipped ?? 0) > 0 ? (
                <>
                  {" "}
                  Applicable fleet template saved — all{" "}
                  <strong className="tabular-nums">{fleetsSkipped}</strong> race
                  {fleetsSkipped === 1 ? "" : "s"} in this series already have recorded finishes or are marked results-final,
                  so start groups were not modified.
                </>
              ) : (
                <>
                  {" "}
                  Fleets reapplied from this template on{" "}
                  <strong className="tabular-nums">{fleetsUpdated}</strong> race
                  {fleetsUpdated === 1 ? "" : "s"} with no recorded finishes and not marked results-final
                  {(fleetsSkipped ?? 0) > 0 ? (
                    <>
                      {" "}
                      (<strong className="tabular-nums">{fleetsSkipped}</strong> race{fleetsSkipped === 1 ? "" : "s"}{" "}
                      left unchanged — finishes recorded or results-final)
                    </>
                  ) : null}
                  .
                </>
              )
            ) : null}
          </p>
        ) : null}
        {generated ? (
          <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
            Races created from the generator — review and adjust starts below.
          </p>
        ) : null}
        {raceUpdated ? (
          <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
            Race updated.
          </p>
        ) : null}
        {raceDeleted ? (
          <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
            Race deleted.
          </p>
        ) : null}
        {signalsSaved ? (
          <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
            Results marked final — this race is locked for finish entry and counts in series standings.
          </p>
        ) : null}
        {pySaved ? (
          <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
            Series Portsmouth override saved.
          </p>
        ) : null}
        {pyRemoved ? (
          <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
            Series Portsmouth override removed — handicap falls through to club, then RYA list.
          </p>
        ) : null}
        {pursuitSaved ? (
          <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
            Pursuit settings saved and start sheet recalculated.
          </p>
        ) : null}

        {error ? (
          <p
            className="mt-6 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/50 dark:text-red-200"
            role="alert"
          >
            {error}
          </p>
        ) : null}

        {isAdmin ? (
          <section
            id="race-series-generator"
            className="mt-10 scroll-mt-8 rounded-xl border border-splice-sky bg-white p-4 dark:border-splice-navy-light dark:bg-splice-navy"
          >
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-splice-navy dark:text-splice-surface">Race / series generator</h2>
              <InfoHint label="About save and create races">
                <p className="mb-2">
                  <strong className="text-splice-navy-light dark:text-splice-sky">Save generator</strong> stores settings and
                  reapplies applicable fleets to races that have <em>no</em> recorded finishes and are <em>not</em>{" "}
                  results-final. Boat classes per fleet are maintained under Club admin settings → Fleets.
                </p>
                <p className="mb-2">
                  <strong className="text-splice-navy-light dark:text-splice-sky">Create / replan all</strong> syncs unpublished
                  races to the saved template by sequence (Race 1 stays row 1 even when times shift). Races with recorded
                  finish times keep their start time. Results-final races stay unchanged.
                </p>
                <p>
                  <strong className="text-splice-navy-light dark:text-splice-sky">Add races</strong> keeps existing races and only
                  adds start times from the template that are not already on the calendar.
                </p>
              </InfoHint>
            </div>
            <form id="series-race-generator-form" className="mt-3 flex flex-col gap-4">
              <input type="hidden" name="group_id" value={groupId} />
              <input type="hidden" name="series_id" value={seriesId} />

              <SeriesRaceGeneratorFields
                defaultMode={scheduleGenMode}
                defaultStartsOn={(series.starts_on as string | null) ?? ""}
                defaultEndsOn={(series.ends_on as string | null) ?? ""}
                defaultFirstStartTimeHm={defaultFirstStartTimeHm}
                defaultPursuitFinishTimeHm={defaultPursuitFinishTimeHm}
                defaultPursuitStartIncrementSeconds={defaultPursuitStartIncrementSeconds}
                defaultRacePeriodicity={(series.race_periodicity as string | null) ?? ""}
                defaultRacesPerPeriod={series.races_per_period ?? ""}
                defaultMinutesBetweenRaces={series.minutes_between_races ?? ""}
                defaultStartSequence={series.start_sequence ?? "5_4_1_go"}
                defaultRaceType={normalizeRaceType((series as { default_race_type?: string }).default_race_type)}
                defaultPursuitFleetId={String((series as { pursuit_template_fleet_id?: string | null }).pursuit_template_fleet_id ?? "")}
                fleets={fleetsForRaceForms}
                groupId={groupId}
                defaultFleetSelections={fleetTemplateDefaults}
              />

              <div className="flex flex-wrap items-center gap-2 border-t border-splice-foam pt-4 dark:border-splice-navy-light">
                <button
                  type="submit"
                  formAction={updateSeriesScheduleAction}
                  className="rounded-lg bg-splice-navy px-3 py-2 text-sm font-medium text-white dark:bg-splice-foam dark:text-splice-navy"
                >
                  Save generator
                </button>
                <SeriesCreateRacesConfirmButton formId="series-race-generator-form" />
                <InfoHint label="About saving and creating races">
                  <p className="mb-2">
                    For <strong className="text-splice-navy-light dark:text-splice-sky">handicap</strong> and{" "}
                    <strong className="text-splice-navy-light dark:text-splice-sky">level rated</strong>, applicable fleets
                    are stored when you save. For <strong className="text-splice-navy-light dark:text-splice-sky">pursuit</strong>,
                    the pursuit fleet, finish time, and start interval are stored instead.
                  </p>
                  <p>
                    Create races uses the last saved generator settings.
                  </p>
                </InfoHint>
              </div>
            </form>
          </section>
        ) : null}

        <section className="mt-10">
          <h2 className="text-sm font-semibold text-splice-navy dark:text-splice-surface">Races</h2>
          <p className="mt-1 text-xs text-splice-blue dark:text-splice-water">
            Scheduled races for this series. Club admins can adjust start times here (synced with the race officer start
            panel); stored finish times are recalculated when the start changes. Mark results final when finish
            recording is complete.
          </p>
          {racesError ? (
            <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/50 dark:text-red-200">
              {racesError.message}
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-splice-sky rounded-xl border border-splice-sky bg-white dark:divide-splice-navy-light dark:border-splice-navy-light dark:bg-splice-navy">
              {!races?.length ? (
                <li className="px-4 py-8 text-center text-sm text-splice-ocean dark:text-splice-water">
                  No races scheduled yet.
                </li>
              ) : (
                races.map((r) => {
                  const isPursuitRace = normalizeRaceType((r as { race_type?: string }).race_type) === "pursuit";
                  const startTimeLocked = raceIdsWithFinishes.has(r.id);
                  return (
                  <li key={r.id}>
                    {!isAdmin ? (
                      <div className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:justify-between">
                        <span className="font-medium text-splice-navy dark:text-splice-surface">
                          {r.name}
                          <span className="ml-2 text-[10px] font-normal uppercase tracking-wide text-splice-ocean dark:text-splice-water">
                            {raceTypeLabel(normalizeRaceType((r as { race_type?: string }).race_type))}
                          </span>
                        </span>
                        <span className="text-sm tabular-nums text-splice-ocean dark:text-splice-water">
                          {formatClubDdMmmYyyyFromIso(r.scheduled_at, clubTz)} · Start{" "}
                          {formatClubHmFromIso(r.scheduled_at, clubTz)}
                        </span>
                      </div>
                    ) : (
                      <>
                        <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto] sm:items-end sm:gap-x-3 sm:gap-y-2">
                          <form
                            id={`race-update-${r.id}`}
                            action={updateRaceScheduledAtAction}
                            className="hidden"
                            aria-hidden
                          >
                            <input type="hidden" name="group_id" value={groupId} />
                            <input type="hidden" name="series_id" value={seriesId} />
                            <input type="hidden" name="race_id" value={r.id} />
                          </form>
                          <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-splice-ocean dark:text-splice-water">
                            Name
                            <input
                              form={`race-update-${r.id}`}
                              name="name"
                              defaultValue={r.name}
                              required
                              className="rounded-lg border border-splice-water bg-white px-2 py-2 text-sm text-splice-navy dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-foam"
                            />
                          </label>
                          <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-splice-ocean dark:text-splice-water">
                            Start (club local)
                            <input
                              form={`race-update-${r.id}`}
                              name="scheduled_at"
                              type="datetime-local"
                              required
                              readOnly={startTimeLocked}
                              defaultValue={utcIsoToZonedDatetimeLocalValue(r.scheduled_at, clubTz)}
                              className={`rounded-lg border border-splice-water bg-white px-2 py-2 text-sm text-splice-navy dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-foam ${startTimeLocked ? "cursor-not-allowed opacity-70" : ""}`}
                            />
                            {startTimeLocked ? (
                              <span className="text-[10px] leading-snug text-splice-blue dark:text-splice-water">
                                Finish times recorded — change start in{" "}
                                <Link
                                  href={`/groups/${groupId}/series/${seriesId}/races/${r.id}/manage`}
                                  className="underline"
                                >
                                  race manage
                                </Link>
                                .
                              </span>
                            ) : null}
                          </label>
                          <button
                            form={`race-update-${r.id}`}
                            type="submit"
                            className="h-9 shrink-0 self-end rounded-lg bg-splice-sky px-3 text-xs font-medium text-splice-navy dark:bg-splice-ocean dark:text-splice-foam"
                          >
                            Save race
                          </button>
                          <div className="flex min-h-9 shrink-0 flex-col items-stretch justify-end gap-2 sm:items-end">
                            {r.results_final ? (
                              <span className="flex h-9 w-full items-center justify-center rounded-lg border border-transparent text-center text-[11px] text-splice-blue sm:min-w-[7.5rem]">
                                Locked (results final)
                              </span>
                            ) : (
                              <>
                                <form action={updateRaceSignalsAction} className="w-full sm:w-auto">
                                  <input type="hidden" name="group_id" value={groupId} />
                                  <input type="hidden" name="series_id" value={seriesId} />
                                  <input type="hidden" name="race_id" value={r.id} />
                                  <input type="hidden" name="results_final" value="1" />
                                  <input
                                    type="hidden"
                                    name="next"
                                    value={`/groups/${groupId}/series/${seriesId}`}
                                  />
                                  <button
                                    type="submit"
                                    className="h-9 w-full min-w-[7.5rem] rounded-lg bg-emerald-700 px-3 text-xs font-medium text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500"
                                  >
                                    Mark results final
                                  </button>
                                </form>
                                <form action={deleteRaceAction} className="w-full sm:w-auto">
                                  <input type="hidden" name="group_id" value={groupId} />
                                  <input type="hidden" name="series_id" value={seriesId} />
                                  <input type="hidden" name="race_id" value={r.id} />
                                  <button
                                    type="submit"
                                    className="h-9 w-full min-w-[7.5rem] rounded-lg border border-red-200 px-3 text-xs font-medium text-red-800 dark:border-red-900/80 dark:text-red-300"
                                  >
                                    Delete race
                                  </button>
                                </form>
                              </>
                            )}
                          </div>
                          {isPursuitRace ? (
                            <p className="text-[10px] font-medium uppercase tracking-wide text-splice-ocean sm:col-span-full dark:text-splice-water">
                              {raceTypeLabel("pursuit")}
                            </p>
                          ) : null}
                        </div>
                        {isPursuitRace ? (
                          <PursuitRaceConfigPanel
                            embedded
                            groupId={groupId}
                            seriesId={seriesId}
                            raceId={r.id}
                            clubTz={clubTz}
                            raceLabel={r.name}
                            race={{
                              pursuit_finish_at: (r as { pursuit_finish_at?: string | null }).pursuit_finish_at ?? null,
                              pursuit_first_start_at:
                                (r as { pursuit_first_start_at?: string | null }).pursuit_first_start_at ?? null,
                              pursuit_start_increment_seconds:
                                (r as { pursuit_start_increment_seconds?: number | null })
                                  .pursuit_start_increment_seconds ?? null,
                              pursuit_group_fleet_id:
                                (r as { pursuit_group_fleet_id?: string | null }).pursuit_group_fleet_id ?? null,
                              results_final: r.results_final,
                            }}
                            fleets={fleetsForRaceForms}
                            supabase={supabase}
                          />
                        ) : null}
                      </>
                    )}
                  </li>
                  );
                })
              )}
            </ul>
          )}
        </section>

        <section className="mt-10 rounded-xl border border-splice-sky bg-white p-6 dark:border-splice-navy-light dark:bg-splice-navy">
          <h2 className="text-sm font-semibold text-splice-navy dark:text-splice-surface">
            Portsmouth Yardstick (series)
          </h2>
          <p className="mt-2 text-xs text-splice-blue dark:text-splice-water">
            When present, series numbers beat <strong className="text-splice-ocean dark:text-splice-water">club</strong>, then{" "}
            <strong className="text-splice-ocean dark:text-splice-water">RYA</strong> list. Used when scoring races in this series.
            Set series or club handicaps here; sailors use resolved PN from their boat and class at race time.
          </p>
          <div className="mt-4 overflow-x-auto rounded-lg border border-splice-sky dark:border-splice-navy-light">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="border-b border-splice-sky bg-splice-surface dark:border-splice-navy-light dark:bg-splice-navy">
                <tr>
                  <th className="px-3 py-2 font-medium text-splice-ocean dark:text-splice-water">Class</th>
                  <th className="px-3 py-2 font-medium text-splice-ocean dark:text-splice-water">Series PN</th>
                  <th className="px-3 py-2 font-medium text-splice-ocean dark:text-splice-water">Club</th>
                  <th className="px-3 py-2 font-medium text-splice-ocean dark:text-splice-water">RYA</th>
                  {isAdmin ? <th className="px-3 py-2 font-medium text-splice-ocean dark:text-splice-water">Actions</th> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-splice-sky dark:divide-splice-navy-light">
                {!seriesPyRows?.length ? (
                  <tr>
                    <td colSpan={isAdmin ? 5 : 4} className="px-3 py-6 text-center text-xs text-splice-blue">
                      No series overrides — handicap uses club PN if set, otherwise RYA list.
                    </td>
                  </tr>
                ) : (
                  (seriesPyRows ?? []).map((row) => {
                    const rya = ryaByKey.get(row.class_key);
                    const grp = groupPyByKey.get(row.class_key);
                    return (
                      <tr key={row.class_key}>
                        <td className="px-3 py-2 text-splice-navy dark:text-splice-foam">
                          {rya?.display_name ?? row.class_key}
                        </td>
                        <td className="px-3 py-2 tabular-nums font-medium text-splice-navy dark:text-splice-foam">
                          {row.py}
                        </td>
                        <td className="px-3 py-2 tabular-nums text-splice-ocean dark:text-splice-water">
                          {grp != null ? grp : "—"}
                        </td>
                        <td className="px-3 py-2 tabular-nums text-splice-blue">{rya?.py ?? "—"}</td>
                        {isAdmin ? (
                          <td className="px-3 py-2">
                            <form action={deleteSeriesClassPyAction} className="inline">
                              <input type="hidden" name="group_id" value={groupId} />
                              <input type="hidden" name="series_id" value={seriesId} />
                              <input type="hidden" name="class_key" value={row.class_key} />
                              <button
                                type="submit"
                                className="text-xs font-medium text-red-700 underline-offset-4 hover:underline dark:text-red-400"
                              >
                                Remove
                              </button>
                            </form>
                          </td>
                        ) : null}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          {isAdmin ? (
            <form
              action={upsertSeriesClassPyAction}
              className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end"
            >
              <input type="hidden" name="group_id" value={groupId} />
              <input type="hidden" name="series_id" value={seriesId} />
              <label className="flex min-w-[14rem] flex-1 flex-col gap-1 text-xs font-medium text-splice-ocean dark:text-splice-water">
                Class (RYA list)
                <select
                  name="class_key"
                  required
                  className="rounded-lg border border-splice-water bg-white px-2 py-2 text-sm dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-foam"
                  defaultValue=""
                >
                  <option value="" disabled>
                    Choose class…
                  </option>
                  {catalogOptions.map((o) => (
                    <option key={o.key} value={o.key}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex w-32 flex-col gap-1 text-xs font-medium text-splice-ocean dark:text-splice-water">
                Series PN
                <input
                  name="py"
                  type="number"
                  min={400}
                  max={2500}
                  required
                  placeholder="e.g. 1103"
                  className="rounded-lg border border-splice-water bg-white px-2 py-2 text-sm dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-foam"
                />
              </label>
              <button
                type="submit"
                className="rounded-lg bg-splice-navy px-4 py-2 text-sm font-medium text-white dark:bg-splice-foam dark:text-splice-navy"
              >
                Save series override
              </button>
            </form>
          ) : (
            <p className="mt-4 text-xs text-splice-blue dark:text-splice-water">
              Only club admins can edit series Portsmouth numbers here.
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
