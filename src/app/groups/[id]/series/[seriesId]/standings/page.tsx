import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { PenaltyRuleInput } from "@/lib/scoring/penalty-points";
import {
  computeAppendixARaceScores,
  type HandicapSystem,
  type RaceEntryScoringInput,
} from "@/lib/scoring/race-low-point";
import {
  assignStandingPlaces,
  computeSeriesStandings,
  type DiscardBandInput,
} from "@/lib/scoring/series-standings";
import { createClient } from "@/lib/supabase/server";

function formatPts(n: number) {
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2);
}

type Props = {
  params: Promise<{ id: string; seriesId: string }>;
};

export default async function SeriesStandingsPage({ params }: Props) {
  const { id: groupId, seriesId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: series, error: seriesErr } = await supabase
    .from("series")
    .select("id, group_id, name")
    .eq("id", seriesId)
    .maybeSingle();

  if (seriesErr || !series || series.group_id !== groupId) {
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

  if (!me) {
    redirect(`/groups/${groupId}?error=` + encodeURIComponent("Join this club to view standings."));
  }

  const { data: scoringCfg } = await supabase
    .from("series_scoring_config")
    .select("handicap_system")
    .eq("series_id", seriesId)
    .maybeSingle();

  const { data: penaltyRows } = await supabase
    .from("series_penalty_rules")
    .select("outcome_code, basis, plus, fixed_points")
    .eq("series_id", seriesId);

  const { data: discardRows } = await supabase
    .from("series_discard_rules")
    .select("races_from, races_to, discards")
    .eq("series_id", seriesId)
    .order("races_from", { ascending: true });

  const discardBands: DiscardBandInput[] = (discardRows ?? []).map((r) => ({
    races_from: r.races_from,
    races_to: r.races_to,
    discards: r.discards,
  }));

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

  const { data: registrations } = await supabase
    .from("series_registrations")
    .select("user_id")
    .eq("series_id", seriesId);

  const seriesEntrantCount = registrations?.length ?? 0;

  const { data: finalRaces } = await supabase
    .from("races")
    .select("id, name, scheduled_at, start_signal_at")
    .eq("series_id", seriesId)
    .eq("results_final", true)
    .order("scheduled_at", { ascending: true });

  const handicapSystem: HandicapSystem =
    scoringCfg?.handicap_system === "none" ? "none" : "portsmouth";

  const raceResults: { raceId: string; pointsByUserId: Map<string, number> }[] =
    [];

  for (const race of finalRaces ?? []) {
    const { data: entries } = await supabase
      .from("race_entries")
      .select(
        "id, user_id, boat_id, sail_number_override, outcome, started_marked_at, py_override",
      )
      .eq("race_id", race.id);

    const entryIds = (entries ?? []).map((e) => e.id).filter(Boolean);
    const finishByEntryId = new Map<string, { official_finish_at: string | null }>();

    if (entryIds.length) {
      const { data: finishes } = await supabase
        .from("race_finishes")
        .select("race_entry_id, official_finish_at")
        .in("race_entry_id", entryIds);
      for (const f of finishes ?? []) {
        finishByEntryId.set(f.race_entry_id, {
          official_finish_at: f.official_finish_at,
        });
      }
    }

    const boatIds = [
      ...new Set(
        (entries ?? []).map((e) => e.boat_id).filter(Boolean) as string[],
      ),
    ];
    const boatPyById = new Map<string, number | null>();
    if (boatIds.length) {
      const { data: bts } = await supabase
        .from("boats")
        .select("id, py_rating")
        .in("id", boatIds);
      for (const b of bts ?? []) boatPyById.set(b.id, b.py_rating);
    }

    const startSignalMs =
      race.start_signal_at != null
        ? new Date(race.start_signal_at).getTime()
        : NaN;
    const startSignalMsNorm = Number.isFinite(startSignalMs)
      ? startSignalMs
      : null;

    const scoringInputs: RaceEntryScoringInput[] = (entries ?? []).map((e) => ({
      entryId: e.id,
      userId: e.user_id,
      outcome: e.outcome,
      startedMarkedAt: e.started_marked_at,
      boatPy: e.boat_id ? (boatPyById.get(e.boat_id) ?? null) : null,
      pyOverride: e.py_override,
      officialFinishAt:
        finishByEntryId.get(e.id)?.official_finish_at ?? null,
    }));

    const scores = computeAppendixARaceScores({
      handicapSystem,
      startSignalMs: startSignalMsNorm,
      seriesEntrantCount,
      entries: scoringInputs,
      penaltyRulesByOutcome,
    });

    const pointsByUserId = new Map<string, number>();
    for (const sr of scores) {
      pointsByUserId.set(sr.userId, sr.points);
    }
    raceResults.push({ raceId: race.id, pointsByUserId });
  }

  const sailorIdsSet = new Set<string>(
    (registrations ?? []).map((r) => r.user_id),
  );
  for (const rr of raceResults) {
    for (const uid of rr.pointsByUserId.keys()) sailorIdsSet.add(uid);
  }
  const sailorIds = [...sailorIdsSet];

  const standingsSorted = computeSeriesStandings({
    sailorIds,
    raceResults,
    discardBands,
  });

  const placed = assignStandingPlaces(standingsSorted);

  const regNameByUser = new Map<string, string | null>();
  if (sailorIds.length) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", sailorIds);
    for (const p of profs ?? []) regNameByUser.set(p.id, p.display_name);
  }

  const completedFinalCount = finalRaces?.length ?? 0;

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
          Series standings
        </h1>
        <p className="mt-2 max-w-3xl text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
          Low-point scoring after Appendix A7 race ties. Discards follow your club-admin bands for{" "}
          <strong className="text-zinc-700 dark:text-zinc-300">{completedFinalCount}</strong>{" "}
          results-final races. Series ties use Appendix A8.1 (best scores compared first). Handicap:{" "}
          <strong className="text-zinc-700 dark:text-zinc-300">
            {handicapSystem === "portsmouth" ? "Portsmouth Yardstick" : "None"}
          </strong>
          .
        </p>

        {!completedFinalCount ? (
          <p className="mt-8 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
            No races marked <strong>results-final</strong> yet. Open each race and confirm signals when ready for standings.
          </p>
        ) : (
          <div className="mt-8 overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950">
                <tr>
                  <th className="px-3 py-2 font-medium text-zinc-700 dark:text-zinc-300">
                    Rank
                  </th>
                  <th className="px-3 py-2 font-medium text-zinc-700 dark:text-zinc-300">
                    Sailor
                  </th>
                  <th className="px-3 py-2 font-medium text-zinc-700 dark:text-zinc-300">
                    Net
                  </th>
                  <th className="px-3 py-2 font-medium text-zinc-700 dark:text-zinc-300">
                    Discards
                  </th>
                  {(finalRaces ?? []).map((r) => (
                    <th
                      key={r.id}
                      className="min-w-[72px] px-3 py-2 font-medium text-zinc-700 dark:text-zinc-300"
                    >
                      <span className="block truncate" title={r.name}>
                        {r.name}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {placed.map(({ row, rank }) => (
                  <tr key={row.userId}>
                    <td className="px-3 py-2 font-medium tabular-nums text-zinc-900 dark:text-zinc-100">
                      {rank}
                    </td>
                    <td className="px-3 py-2 text-zinc-900 dark:text-zinc-100">
                      {regNameByUser.get(row.userId) ?? "—"}
                    </td>
                    <td className="px-3 py-2 tabular-nums font-medium text-zinc-900 dark:text-zinc-100">
                      {formatPts(row.netScore)}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-zinc-600 dark:text-zinc-400">
                      {row.discardCount}
                    </td>
                    {(finalRaces ?? []).map((r, ri) => {
                      const rr = raceResults[ri];
                      const pts =
                        rr && rr.raceId === r.id
                          ? rr.pointsByUserId.get(row.userId)
                          : undefined;
                      return (
                        <td
                          key={r.id}
                          className="px-3 py-2 tabular-nums text-zinc-700 dark:text-zinc-300"
                        >
                          {pts !== undefined ? formatPts(pts) : "—"}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-8 text-xs text-zinc-500 dark:text-zinc-400">
          Racing Rules of Sailing Appendix A describes low-point scoring; tie-breaking follows current WS Appendix A8 for series aggregates.
        </p>
      </main>
    </div>
  );
}
