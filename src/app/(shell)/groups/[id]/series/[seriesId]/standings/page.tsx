import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  SeriesStandingsTable,
  type SeriesStandingsDisplayRow,
} from "@/components/series-standings-table";
import { buildSeriesStandingsPlaced } from "@/lib/scoring/build-series-standings";
import { loadSeriesStandingsBoatDisplayMeta } from "@/lib/series-standings-boat-display";
import { getServerAuth } from "@/lib/supabase/auth-cache";

type Props = {
  params: Promise<{ id: string; seriesId: string }>;
};

export default async function SeriesStandingsPage({ params }: Props) {
  const { id: groupId, seriesId } = await params;

  const { supabase, user } = await getServerAuth();

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
    .select("name, ro_added_boats_series_standings")
    .eq("id", groupId)
    .maybeSingle();

  const includeRoAddedInStandings = Boolean(
    (group as { ro_added_boats_series_standings?: boolean | null } | null)
      ?.ro_added_boats_series_standings,
  );

  const { data: me } = await supabase
    .from("group_memberships")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!me) {
    redirect(`/groups/${groupId}?error=` + encodeURIComponent("Join this club to view standings."));
  }

  const built = await buildSeriesStandingsPlaced(supabase, { groupId, seriesId });

  const { fleets, tableRowsByFleetId, standingsRaces, handicapSystem } = built;

  const boatIds = new Set<string>();
  for (const rows of Object.values(tableRowsByFleetId)) {
    for (const row of rows) boatIds.add(row.boatId);
  }

  const boatMeta = await loadSeriesStandingsBoatDisplayMeta(
    supabase,
    groupId,
    seriesId,
    [...boatIds],
  );

  const displayRowsByFleetId: Record<string, SeriesStandingsDisplayRow[]> = {};
  for (const [fleetId, rows] of Object.entries(tableRowsByFleetId)) {
    displayRowsByFleetId[fleetId] = rows.map((row) => {
      const meta = boatMeta.get(row.boatId);
      return {
        ...row,
        sailNumber: meta?.sailNumber ?? "—",
        boatType: meta?.boatType ?? row.boatLabel,
        helm: meta?.helm ?? row.sailorName,
        crew: meta?.crew ?? "—",
      };
    });
  }

  const standingsRaceCount = standingsRaces.length;

  return (
    <div className="flex flex-1 flex-col bg-splice-surface px-4 py-12 dark:bg-splice-navy">
      <main className="mx-auto w-full max-w-6xl">
        <p className="text-sm text-splice-ocean dark:text-splice-water">
          <Link href="/" className="text-splice-blue hover:underline dark:text-splice-water">
            ← Home
          </Link>
          <span className="mx-2 text-splice-water">·</span>
          <Link href="/groups" className="text-splice-blue hover:underline dark:text-splice-water">
            ← My Entries
          </Link>
          <span className="mx-2 text-splice-water">·</span>
          <Link
            href={`/groups#club-${groupId}`}
            className="text-splice-blue hover:underline dark:text-splice-water"
          >
            ← Series schedule
          </Link>
          <span className="mx-2 text-splice-water">·</span>
          <span className="text-splice-blue">{group?.name}</span>
        </p>

        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-splice-navy dark:text-splice-surface">
          Series standings
        </h1>
        <p className="mt-2 max-w-3xl text-xs leading-relaxed text-splice-blue dark:text-splice-water">
          Low-point scoring after Appendix A7 race ties, ranked{" "}
          <strong className="text-splice-ocean dark:text-splice-water">per fleet</strong>. Discards follow your club-admin
          bands for{" "}
          <strong className="text-splice-ocean dark:text-splice-water">{standingsRaceCount}</strong> races with recorded
          results (provisional or results-final). Series ties use Appendix A8.1 (best scores compared first).
          Handicap:{" "}
          <strong className="text-splice-ocean dark:text-splice-water">
            {handicapSystem === "portsmouth"
              ? "Portsmouth Yardstick (series → club → RYA list, unless entry override)"
              : "None"}
          </strong>
          . Every boat with recorded results in the selected fleet is listed; guest finishes count under the linked
          member when club admin has tied guest sailors and boats to signed-in members.
          {includeRoAddedInStandings
            ? " Race-officer added boats (sail and class only) are included when they have recorded results, matched by sail number and class across races."
            : null}
        </p>

        {!standingsRaceCount ? (
          <p className="mt-8 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
            No recorded race results yet. Enter finishes or outcomes on a race (provisional is enough) to populate
            standings.
          </p>
        ) : (
          <SeriesStandingsTable
            fleets={fleets.map((f) => ({ id: f.id, name: f.name }))}
            tableRowsByFleetId={displayRowsByFleetId}
            standingsRaces={standingsRaces.map((r) => ({ id: r.id, name: r.name }))}
          />
        )}

        <p className="mt-8 text-xs text-splice-blue dark:text-splice-water">
          Racing Rules of Sailing Appendix A describes low-point scoring; tie-breaking follows current WS Appendix A8 for
          series aggregates.
        </p>
      </main>
    </div>
  );
}
