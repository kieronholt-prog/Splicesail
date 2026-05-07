import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  markRaceEntryStartedAction,
  updateOfficialFinishAction,
  upsertRoFinishAction,
} from "@/app/actions/ro-finishes";
import { updateRaceSignalsAction } from "@/app/actions/race-meta";
import {
  createRaceEntryAction,
  setRaceOutcomeAction,
  tallyAfloatAction,
  tallyAshoreAction,
  updateRaceEntryBoatAction,
  updateRaceEntryPyOverrideAction,
} from "@/app/actions/race-entries";
import type { PenaltyRuleInput } from "@/lib/scoring/penalty-points";
import {
  computeAppendixARaceScores,
  type HandicapSystem,
  type RaceEntryScoringInput,
} from "@/lib/scoring/race-low-point";
import { createClient } from "@/lib/supabase/server";
import { utcIsoToDatetimeLocalValue } from "@/lib/utc-datetime-local";

function formatUtc(iso: string) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function formatTs(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function formatPts(n: number) {
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2);
}

function formatSecs(n: number | null) {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toFixed(1);
}

type Props = {
  params: Promise<{ id: string; seriesId: string; raceId: string }>;
  searchParams: Promise<{
    error?: string;
    started?: string;
    saved?: string;
    afloat?: string;
    ashore?: string;
    outcome?: string;
    mark_started?: string;
    ro_finish?: string;
    official_saved?: string;
    signals_saved?: string;
    py_saved?: string;
  }>;
};

export default async function RaceDetailPage({ params, searchParams }: Props) {
  const { id: groupId, seriesId, raceId } = await params;
  const q = await searchParams;
  const error = q.error ? decodeURIComponent(q.error) : null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: race, error: raceErr } = await supabase
    .from("races")
    .select("id, series_id, name, scheduled_at, start_signal_at, results_final")
    .eq("id", raceId)
    .maybeSingle();

  if (raceErr || !race || race.series_id !== seriesId) {
    notFound();
  }

  const { data: series } = await supabase
    .from("series")
    .select("id, name, group_id")
    .eq("id", seriesId)
    .maybeSingle();

  if (!series || series.group_id !== groupId) {
    notFound();
  }

  const { data: group } = await supabase
    .from("groups")
    .select("name")
    .eq("id", groupId)
    .maybeSingle();

  const { data: me } = await supabase
    .from("group_memberships")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .maybeSingle();

  const isMember = !!me;
  const isStaff = me?.role === "club_admin" || me?.role === "race_officer";

  const { data: seriesReg } = await supabase
    .from("series_registrations")
    .select("series_id")
    .eq("series_id", seriesId)
    .eq("user_id", user.id)
    .maybeSingle();

  const isSeriesRegistered = !!seriesReg;

  const { data: myEntry } = await supabase
    .from("race_entries")
    .select(
      "id, boat_id, sail_number_override, tally_afloat_at, tally_ashore_at, outcome, started_marked_at, py_override",
    )
    .eq("race_id", raceId)
    .eq("user_id", user.id)
    .maybeSingle();

  const { data: boats } = await supabase
    .from("boats")
    .select("id, label, default_sail_number, py_rating")
    .eq("owner_user_id", user.id)
    .order("label", { ascending: true });

  const { data: allEntries } = await supabase
    .from("race_entries")
    .select(
      "id, user_id, boat_id, sail_number_override, tally_afloat_at, tally_ashore_at, outcome, started_marked_at, py_override",
    )
    .eq("race_id", raceId)
    .order("created_at", { ascending: true });

  const entryIds = (allEntries ?? []).map((e) => e.id).filter(Boolean);
  const finishByEntryId = new Map<
    string,
    { ro_finish_at: string | null; official_finish_at: string | null }
  >();

  if (entryIds.length) {
    const { data: finishes } = await supabase
      .from("race_finishes")
      .select("race_entry_id, ro_finish_at, official_finish_at")
      .in("race_entry_id", entryIds);

    for (const f of finishes ?? []) {
      finishByEntryId.set(f.race_entry_id, {
        ro_finish_at: f.ro_finish_at,
        official_finish_at: f.official_finish_at,
      });
    }
  }

  const entryUserIds = [...new Set((allEntries ?? []).map((e) => e.user_id))];
  const entryBoatIds = [
    ...new Set(
      (allEntries ?? []).map((e) => e.boat_id).filter(Boolean) as string[],
    ),
  ];

  const { data: scoringCfg } = await supabase
    .from("series_scoring_config")
    .select("handicap_system")
    .eq("series_id", seriesId)
    .maybeSingle();

  const { data: penaltyRows } = await supabase
    .from("series_penalty_rules")
    .select("outcome_code, basis, plus, fixed_points")
    .eq("series_id", seriesId);

  const { count: seriesEntrantCount } = await supabase
    .from("series_registrations")
    .select("*", { count: "exact", head: true })
    .eq("series_id", seriesId);

  const penaltyRulesByOutcome = new Map<string, PenaltyRuleInput>();
  const basesOk = new Set([
    "series_entrants",
    "race_starters",
    "race_finishers",
    "fixed",
  ]);
  for (const r of penaltyRows ?? []) {
    if (!basesOk.has(r.basis)) continue;
    penaltyRulesByOutcome.set(r.outcome_code, {
      outcome_code: r.outcome_code,
      basis: r.basis as PenaltyRuleInput["basis"],
      plus: r.plus,
      fixed_points:
        r.fixed_points != null && String(r.fixed_points).length
          ? Number(r.fixed_points)
          : null,
    });
  }

  const boatPyById = new Map<string, number | null>();
  const labelByBoat = new Map<string, string>();
  if (entryBoatIds.length) {
    const { data: bts } = await supabase
      .from("boats")
      .select("id, label, py_rating")
      .in("id", entryBoatIds);
    for (const b of bts ?? []) {
      labelByBoat.set(b.id, b.label);
      boatPyById.set(b.id, b.py_rating);
    }
  }

  const nameByUser = new Map<string, string | null>();
  if (entryUserIds.length) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", entryUserIds);
    for (const p of profs ?? []) nameByUser.set(p.id, p.display_name);
  }

  const handicapSystem: HandicapSystem =
    scoringCfg?.handicap_system === "none" ? "none" : "portsmouth";

  const startSignalMs =
    race.start_signal_at != null
      ? new Date(race.start_signal_at).getTime()
      : NaN;
  const startSignalMsNorm = Number.isFinite(startSignalMs)
    ? startSignalMs
    : null;

  const scoringInputs: RaceEntryScoringInput[] = (allEntries ?? []).map(
    (e) => ({
      entryId: e.id,
      userId: e.user_id,
      outcome: e.outcome,
      startedMarkedAt: e.started_marked_at,
      boatPy: e.boat_id ? (boatPyById.get(e.boat_id) ?? null) : null,
      pyOverride: e.py_override,
      officialFinishAt:
        finishByEntryId.get(e.id)?.official_finish_at ?? null,
    }),
  );

  const appendixScores = computeAppendixARaceScores({
    handicapSystem,
    startSignalMs: startSignalMsNorm,
    seriesEntrantCount: seriesEntrantCount ?? 0,
    entries: scoringInputs,
    penaltyRulesByOutcome,
  });

  const scoreByEntryId = new Map(
    appendixScores.map((r) => [r.entryId, r] as const),
  );

  const entryById = new Map((allEntries ?? []).map((e) => [e.id, e] as const));

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 px-4 py-12 dark:bg-zinc-950">
      <main className="mx-auto w-full max-w-6xl">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          <Link
            href={`/groups/${groupId}/series/${seriesId}`}
            className="text-blue-600 hover:underline dark:text-blue-400"
          >
            ← {series.name}
          </Link>
          <span className="mx-2 text-zinc-400">·</span>
          <span className="text-zinc-500">{group?.name}</span>
        </p>

        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          {race.name}
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Scheduled <strong className="text-zinc-800 dark:text-zinc-200">{formatUtc(race.scheduled_at)}</strong>{" "}
          UTC
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-zinc-500 dark:text-zinc-400">
          {race.start_signal_at ? (
            <span>
              Start signal{" "}
              <strong className="text-zinc-700 dark:text-zinc-300">
                {formatUtc(race.start_signal_at)}
              </strong>{" "}
              UTC
            </span>
          ) : (
            <span className="text-amber-800 dark:text-amber-200/90">
              No start signal yet — required for Portsmouth elapsed/corrected times.
            </span>
          )}
          <span
            className={
              race.results_final
                ? "font-medium text-emerald-800 dark:text-emerald-300"
                : ""
            }
          >
            {race.results_final
              ? "Marked results-final (counts in series standings)."
              : "Not results-final (excluded from standings until confirmed)."}
          </span>
          <Link
            href={`/groups/${groupId}/series/${seriesId}/standings`}
            className="text-blue-600 underline dark:text-blue-400"
          >
            Series standings →
          </Link>
        </div>

        {error ? (
          <p
            className="mt-6 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/50 dark:text-red-200"
            role="alert"
          >
            {error}
          </p>
        ) : null}
        {q.started === "1" ? (
          <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
            Race entry created — add boat, tally, and outcome below.
          </p>
        ) : null}
        {q.saved === "1" ? (
          <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
            Boat and sail number saved.
          </p>
        ) : null}
        {q.afloat === "1" ? (
          <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
            Tally afloat recorded.
          </p>
        ) : null}
        {q.ashore === "1" ? (
          <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
            Tally ashore recorded.
          </p>
        ) : null}
        {q.outcome === "1" ? (
          <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
            Outcome saved.
          </p>
        ) : null}
        {q.mark_started === "1" ? (
          <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
            Entry marked as started (RO).
          </p>
        ) : null}
        {q.ro_finish === "1" ? (
          <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
            RO finish recorded (official time matches RO for now).
          </p>
        ) : null}
        {q.official_saved === "1" ? (
          <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
            Official finish time updated (RO time unchanged).
          </p>
        ) : null}
        {q.signals_saved === "1" ? (
          <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
            Race start signal and results-final flag saved.
          </p>
        ) : null}
        {q.py_saved === "1" ? (
          <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
            Portsmouth override saved for this race entry.
          </p>
        ) : null}

        {!isMember ? (
          <p className="mt-8 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
            Join this club&apos;s group to participate.
          </p>
        ) : null}

        {isMember && !isSeriesRegistered ? (
          <div className="mt-8 rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
            <p>
              Register for the{" "}
              <strong className="font-medium">series</strong> before entering individual races.
            </p>
            <Link
              href={`/groups/${groupId}/series/${seriesId}`}
              className="mt-2 inline-block font-medium text-blue-700 underline dark:text-blue-300"
            >
              Go to series → Series registration
            </Link>
          </div>
        ) : null}

        {isMember && isSeriesRegistered && !myEntry ? (
          <section className="mt-10 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              Race entry
            </h2>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              Create your entry for this race (boat, tally afloat/ashore, outcome come next).
            </p>
            <form action={createRaceEntryAction} className="mt-4">
              <input type="hidden" name="group_id" value={groupId} />
              <input type="hidden" name="series_id" value={seriesId} />
              <input type="hidden" name="race_id" value={raceId} />
              <button
                type="submit"
                className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
              >
                Start race entry
              </button>
            </form>
          </section>
        ) : null}

        {isMember && isSeriesRegistered && myEntry ? (
          <>
            <section className="mt-10 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                Your boat &amp; sail
              </h2>
              <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                Per-race overrides here; fleet defaults live under{" "}
                <Link href="/fleet" className="text-blue-600 dark:text-blue-400">
                  Fleet
                </Link>
                .
              </p>
              {!boats?.length ? (
                <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
                  No boats yet.{" "}
                  <Link href="/fleet/new" className="font-medium text-blue-600 dark:text-blue-400">
                    Add a boat
                  </Link>{" "}
                  first.
                </p>
              ) : (
                <form action={updateRaceEntryBoatAction} className="mt-4 flex flex-col gap-4">
                  <input type="hidden" name="group_id" value={groupId} />
                  <input type="hidden" name="series_id" value={seriesId} />
                  <input type="hidden" name="race_id" value={raceId} />
                  <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Boat
                    <select
                      name="boat_id"
                      defaultValue={myEntry.boat_id ?? ""}
                      className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
                    >
                      <option value="">— Select boat —</option>
                      {boats.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.label}
                          {b.default_sail_number ? ` (#${b.default_sail_number})` : ""}
                          {b.py_rating ? ` · PY ${b.py_rating}` : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Sail number override <span className="font-normal text-zinc-500">(optional)</span>
                    <input
                      name="sail_number_override"
                      defaultValue={myEntry.sail_number_override ?? ""}
                      placeholder="Leave blank to use boat default"
                      className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
                    />
                  </label>
                  <button
                    type="submit"
                    className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
                  >
                    Save boat &amp; sail
                  </button>
                </form>
              )}
            </section>

            <section className="mt-8 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                Portsmouth Yardstick override
              </h2>
              <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                Optional PN for this race only (charter boat, numbers changed mid-series). Leave blank to use the boat&apos;s fleet PN from{" "}
                <Link href="/fleet" className="text-blue-600 dark:text-blue-400">
                  Fleet
                </Link>
                .
              </p>
              <form action={updateRaceEntryPyOverrideAction} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
                <input type="hidden" name="group_id" value={groupId} />
                <input type="hidden" name="series_id" value={seriesId} />
                <input type="hidden" name="race_id" value={raceId} />
                <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  PN (400–2500)
                  <input
                    name="py_override"
                    type="number"
                    min={400}
                    max={2500}
                    step={1}
                    placeholder="Blank = boat default"
                    defaultValue={myEntry.py_override ?? ""}
                    className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100 sm:w-48"
                  />
                </label>
                <button
                  type="submit"
                  className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-900 dark:border-zinc-600 dark:text-zinc-100"
                >
                  Save PN override
                </button>
              </form>
            </section>

            <section className="mt-8 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                Tally (Wave B)
              </h2>
              <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                Distinct <strong className="text-zinc-700 dark:text-zinc-300">afloat</strong> and{" "}
                <strong className="text-zinc-700 dark:text-zinc-300">ashore</strong> checkpoints.
              </p>
              <dl className="mt-4 grid gap-2 text-sm text-zinc-700 dark:text-zinc-300 sm:grid-cols-2">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    Afloat
                  </dt>
                  <dd>{formatTs(myEntry.tally_afloat_at)}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    Ashore
                  </dt>
                  <dd>{formatTs(myEntry.tally_ashore_at)}</dd>
                </div>
              </dl>
              <div className="mt-4 flex flex-wrap gap-3">
                <form action={tallyAfloatAction}>
                  <input type="hidden" name="group_id" value={groupId} />
                  <input type="hidden" name="series_id" value={seriesId} />
                  <input type="hidden" name="race_id" value={raceId} />
                  <button
                    type="submit"
                    className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
                  >
                    Mark tally afloat (now)
                  </button>
                </form>
                <form action={tallyAshoreAction}>
                  <input type="hidden" name="group_id" value={groupId} />
                  <input type="hidden" name="series_id" value={seriesId} />
                  <input type="hidden" name="race_id" value={raceId} />
                  <button
                    type="submit"
                    className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-900 dark:border-zinc-600 dark:text-zinc-100"
                  >
                    Mark tally ashore (now)
                  </button>
                </form>
              </div>
            </section>

            <section className="mt-8 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                Ashore outcome
              </h2>
              <form action={setRaceOutcomeAction} className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end">
                <input type="hidden" name="group_id" value={groupId} />
                <input type="hidden" name="series_id" value={seriesId} />
                <input type="hidden" name="race_id" value={raceId} />
                <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Result
                  <select
                    name="outcome"
                    defaultValue={myEntry.outcome ?? ""}
                    className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
                  >
                    <option value="">— Not set —</option>
                    <option value="finished">Finished</option>
                    <option value="retired">Retired</option>
                    <option value="dnf">DNF</option>
                    <option value="dns">DNS</option>
                    <option value="dsq">DSQ</option>
                    <option value="ocs">OCS</option>
                  </select>
                </label>
                <button
                  type="submit"
                  className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
                >
                  Save outcome
                </button>
              </form>
            </section>

            <section className="mt-8 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                Start &amp; finish times
              </h2>
              <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                Shown when the race officer records them. Times use the same UTC{" "}
                <strong className="text-zinc-700 dark:text-zinc-300">datetime-local</strong> convention as the race schedule.
              </p>
              <dl className="mt-4 grid gap-3 text-sm text-zinc-700 dark:text-zinc-300 sm:grid-cols-3">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    Started (RO)
                  </dt>
                  <dd>{formatTs(myEntry.started_marked_at)}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    RO finish
                  </dt>
                  <dd>
                    {formatTs(finishByEntryId.get(myEntry.id)?.ro_finish_at ?? null)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    Official finish
                  </dt>
                  <dd>
                    {formatTs(finishByEntryId.get(myEntry.id)?.official_finish_at ?? null)}
                  </dd>
                </div>
              </dl>
            </section>
          </>
        ) : null}

        {!isStaff ? (
          <p className="mt-8 text-xs text-zinc-500 dark:text-zinc-400">
            Rig measurement snapshots live in <code className="rounded bg-zinc-200 px-1 dark:bg-zinc-800">rig_settings_json</code>{" "}
            for future Wave B UI.
          </p>
        ) : null}

        {isStaff ? (
          <section className="mt-10 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              Race signals &amp; standings eligibility
            </h2>
            <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
              Start signal is clock-zero for elapsed time. Mark results-final when this race should feed the{" "}
              <Link
                href={`/groups/${groupId}/series/${seriesId}/standings`}
                className="text-blue-600 underline dark:text-blue-400"
              >
                series standings
              </Link>{" "}
              and discard schedule.
            </p>
            <form action={updateRaceSignalsAction} className="mt-4 flex flex-col gap-4 sm:max-w-md">
              <input type="hidden" name="group_id" value={groupId} />
              <input type="hidden" name="series_id" value={seriesId} />
              <input type="hidden" name="race_id" value={raceId} />
              <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Start signal (UTC <span className="font-normal text-zinc-500">datetime-local</span>)
                <input
                  type="datetime-local"
                  name="start_signal_at"
                  step={60}
                  defaultValue={
                    race.start_signal_at
                      ? utcIsoToDatetimeLocalValue(race.start_signal_at)
                      : ""
                  }
                  className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
                />
              </label>
              <label className="flex items-center gap-2 text-sm text-zinc-800 dark:text-zinc-200">
                <input
                  type="checkbox"
                  name="results_final"
                  value="1"
                  defaultChecked={race.results_final}
                />
                Results final (include in series standings)
              </label>
              <button
                type="submit"
                className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
              >
                Save signals
              </button>
            </form>
          </section>
        ) : null}

        {isMember && allEntries && allEntries.length > 0 ? (
          <>
            <section className="mt-12">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Race scoring (Appendix A low-point)
              </h2>
              <p className="mt-2 max-w-3xl text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                Handicap:{" "}
                <strong className="text-zinc-700 dark:text-zinc-300">
                  {handicapSystem === "portsmouth"
                    ? "Portsmouth Yardstick — corrected seconds = elapsed × 1000 ÷ PN"
                    : "None — order by elapsed (or finish time if no start signal)"}
                </strong>
                . Finishing ties split race points using Appendix A7 (fractional points allowed).
                Series aggregation drops worst scores per your discard bands and resolves ties with Appendix A8.1
                (lexicographic compare of race scores best→worst).
              </p>
              <div className="mt-4 overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
                <table className="w-full min-w-[880px] text-left text-sm">
                  <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950">
                    <tr>
                      <th className="px-3 py-2 font-medium text-zinc-700 dark:text-zinc-300">
                        Place
                      </th>
                      <th className="px-3 py-2 font-medium text-zinc-700 dark:text-zinc-300">Sailor</th>
                      <th className="px-3 py-2 font-medium text-zinc-700 dark:text-zinc-300">Boat</th>
                      <th className="px-3 py-2 font-medium text-zinc-700 dark:text-zinc-300">Sail</th>
                      <th className="px-3 py-2 font-medium text-zinc-700 dark:text-zinc-300">Outcome</th>
                      <th className="px-3 py-2 font-medium text-zinc-700 dark:text-zinc-300">Points</th>
                      <th className="px-3 py-2 font-medium text-zinc-700 dark:text-zinc-300">
                        Elapsed (s)
                      </th>
                      <th className="px-3 py-2 font-medium text-zinc-700 dark:text-zinc-300">
                        Corrected (s)
                      </th>
                      <th className="px-3 py-2 font-medium text-zinc-700 dark:text-zinc-300">PN</th>
                      <th className="min-w-[140px] px-3 py-2 font-medium text-zinc-700 dark:text-zinc-300">
                        Note
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                    {appendixScores.map((sr) => {
                      const erow = entryById.get(sr.entryId);
                      return (
                        <tr key={sr.entryId}>
                          <td className="px-3 py-2 font-medium tabular-nums text-zinc-900 dark:text-zinc-100">
                            {sr.placeLabel ?? "—"}
                          </td>
                          <td className="px-3 py-2 text-zinc-900 dark:text-zinc-100">
                            {nameByUser.get(sr.userId) ?? "—"}
                          </td>
                          <td className="px-3 py-2 text-zinc-700 dark:text-zinc-300">
                            {erow?.boat_id ? labelByBoat.get(erow.boat_id) ?? "—" : "—"}
                          </td>
                          <td className="px-3 py-2 text-zinc-700 dark:text-zinc-300">
                            {erow?.sail_number_override ?? "—"}
                          </td>
                          <td className="px-3 py-2 capitalize text-zinc-700 dark:text-zinc-300">
                            {erow?.outcome ?? "—"}
                          </td>
                          <td className="px-3 py-2 tabular-nums text-zinc-900 dark:text-zinc-100">
                            {formatPts(sr.points)}
                          </td>
                          <td className="px-3 py-2 text-xs tabular-nums text-zinc-600 dark:text-zinc-400">
                            {formatSecs(sr.elapsedSeconds)}
                          </td>
                          <td className="px-3 py-2 text-xs tabular-nums text-zinc-600 dark:text-zinc-400">
                            {formatSecs(sr.correctedSeconds)}
                          </td>
                          <td className="px-3 py-2 text-xs tabular-nums text-zinc-600 dark:text-zinc-400">
                            {sr.effectivePy ?? "—"}
                          </td>
                          <td className="px-3 py-2 text-xs text-zinc-500 dark:text-zinc-400">
                            {sr.note ?? ""}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

          <section className="mt-12">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Entries ({group?.name})
            </h2>
            <div className="mt-4 overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
              <table className="w-full min-w-[960px] text-left text-sm">
                <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950">
                  <tr>
                    <th className="px-3 py-2 font-medium text-zinc-700 dark:text-zinc-300">
                      Sailor
                    </th>
                    <th className="px-3 py-2 font-medium text-zinc-700 dark:text-zinc-300">Boat</th>
                    <th className="px-3 py-2 font-medium text-zinc-700 dark:text-zinc-300">Sail</th>
                    <th className="px-3 py-2 font-medium text-zinc-700 dark:text-zinc-300">Afloat</th>
                    <th className="px-3 py-2 font-medium text-zinc-700 dark:text-zinc-300">Ashore</th>
                    <th className="px-3 py-2 font-medium text-zinc-700 dark:text-zinc-300">Outcome</th>
                    <th className="px-3 py-2 font-medium text-zinc-700 dark:text-zinc-300">
                      Started
                    </th>
                    <th className="px-3 py-2 font-medium text-zinc-700 dark:text-zinc-300">
                      RO finish
                    </th>
                    <th className="px-3 py-2 font-medium text-zinc-700 dark:text-zinc-300">
                      Official
                    </th>
                    <th className="px-3 py-2 font-medium text-zinc-700 dark:text-zinc-300">
                      Points
                    </th>
                    {isStaff ? (
                      <th className="min-w-[200px] px-3 py-2 font-medium text-zinc-700 dark:text-zinc-300">
                        RO actions
                      </th>
                    ) : null}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {allEntries.map((row) => {
                    const finish = finishByEntryId.get(row.id);
                    const sc = scoreByEntryId.get(row.id);
                    return (
                      <tr key={row.id}>
                        <td className="px-3 py-2 text-zinc-900 dark:text-zinc-100">
                          {nameByUser.get(row.user_id) ?? "—"}
                        </td>
                        <td className="px-3 py-2 text-zinc-700 dark:text-zinc-300">
                          {row.boat_id ? labelByBoat.get(row.boat_id) ?? "—" : "—"}
                        </td>
                        <td className="px-3 py-2 text-zinc-700 dark:text-zinc-300">
                          {row.sail_number_override ?? "—"}
                        </td>
                        <td className="px-3 py-2 text-xs text-zinc-600 dark:text-zinc-400">
                          {formatTs(row.tally_afloat_at)}
                        </td>
                        <td className="px-3 py-2 text-xs text-zinc-600 dark:text-zinc-400">
                          {formatTs(row.tally_ashore_at)}
                        </td>
                        <td className="px-3 py-2 capitalize text-zinc-700 dark:text-zinc-300">
                          {row.outcome ?? "—"}
                        </td>
                        <td className="px-3 py-2 text-xs text-zinc-600 dark:text-zinc-400">
                          {formatTs(row.started_marked_at)}
                        </td>
                        <td className="px-3 py-2 text-xs text-zinc-600 dark:text-zinc-400">
                          {formatTs(finish?.ro_finish_at ?? null)}
                        </td>
                        <td className="px-3 py-2 text-xs text-zinc-600 dark:text-zinc-400">
                          {formatTs(finish?.official_finish_at ?? null)}
                        </td>
                        <td className="px-3 py-2 tabular-nums text-zinc-700 dark:text-zinc-300">
                          {sc ? formatPts(sc.points) : "—"}
                        </td>
                        {isStaff ? (
                          <td className="space-y-2 px-3 py-2 align-top">
                            {!row.started_marked_at ? (
                              <form action={markRaceEntryStartedAction}>
                                <input type="hidden" name="group_id" value={groupId} />
                                <input type="hidden" name="series_id" value={seriesId} />
                                <input type="hidden" name="race_id" value={raceId} />
                                <input type="hidden" name="race_entry_id" value={row.id} />
                                <button
                                  type="submit"
                                  className="rounded bg-zinc-900 px-2 py-1 text-xs font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
                                >
                                  Mark started
                                </button>
                              </form>
                            ) : (
                              <p className="text-xs text-emerald-700 dark:text-emerald-400">Started</p>
                            )}
                            <form action={upsertRoFinishAction} className="flex flex-col gap-1">
                              <input type="hidden" name="group_id" value={groupId} />
                              <input type="hidden" name="series_id" value={seriesId} />
                              <input type="hidden" name="race_id" value={raceId} />
                              <input type="hidden" name="race_entry_id" value={row.id} />
                              <label className="text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                                UTC finish
                                <input
                                  type="datetime-local"
                                  name="ro_finish_at"
                                  step={60}
                                  className="mt-0.5 w-full rounded border border-zinc-300 bg-white px-1 py-1 text-xs text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
                                />
                              </label>
                              <button
                                type="submit"
                                className="rounded border border-zinc-300 px-2 py-1 text-xs font-medium text-zinc-900 dark:border-zinc-600 dark:text-zinc-100"
                              >
                                Save finish
                              </button>
                            </form>
                            {finish ? (
                              <form
                                action={updateOfficialFinishAction}
                                className="flex flex-col gap-1 border-t border-zinc-200 pt-2 dark:border-zinc-700"
                              >
                                <input type="hidden" name="group_id" value={groupId} />
                                <input type="hidden" name="series_id" value={seriesId} />
                                <input type="hidden" name="race_id" value={raceId} />
                                <input type="hidden" name="race_entry_id" value={row.id} />
                                <label className="text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                                  Official UTC
                                  <input
                                    type="datetime-local"
                                    name="official_finish_at"
                                    step={60}
                                    defaultValue={utcIsoToDatetimeLocalValue(
                                      finish.official_finish_at ?? finish.ro_finish_at ?? "",
                                    )}
                                    className="mt-0.5 w-full rounded border border-zinc-300 bg-white px-1 py-1 text-xs text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
                                  />
                                </label>
                                <button
                                  type="submit"
                                  className="rounded border border-amber-600/50 px-2 py-1 text-xs font-medium text-amber-950 dark:border-amber-500/40 dark:text-amber-100"
                                >
                                  Save official only
                                </button>
                              </form>
                            ) : null}
                          </td>
                        ) : null}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
          </>
        ) : null}
      </main>
    </div>
  );
}
