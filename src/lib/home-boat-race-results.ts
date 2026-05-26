import type { SupabaseClient } from "@supabase/supabase-js";
import {
  boatSeriesPositionsFromBuilt,
  buildSeriesStandingsPlaced,
} from "@/lib/scoring/build-series-standings";

export type HomeBoatRaceResultsBoatGroup = {
  boatId: string;
  boatLabel: string;
  seriesPosition: { rank: number; of: number } | null;
};

export type HomeBoatRaceResultsSeriesGroup = {
  seriesId: string;
  seriesName: string;
  clubName: string;
  groupId: string;
  boatGroups: HomeBoatRaceResultsBoatGroup[];
};

export type HomeBoatRaceResultsInputSeries = {
  seriesId: string;
  seriesName: string;
  groupId: string;
  clubName: string;
};

/** Overall series position per signup boat — no per-race rows. */
export async function fetchHomeBoatRaceResults(
  supabase: SupabaseClient,
  userId: string,
  seriesList: HomeBoatRaceResultsInputSeries[],
): Promise<HomeBoatRaceResultsSeriesGroup[]> {
  if (!seriesList.length) return [];

  const seriesIds = seriesList.map((s) => s.seriesId);

  const { data: signupBoatRows } = await supabase
    .from("series_registration_boats")
    .select("series_id, boat_id")
    .eq("user_id", userId)
    .in("series_id", seriesIds);

  const boatIdsBySeriesId = new Map<string, string[]>();
  const allBoatIds = new Set<string>();
  for (const row of signupBoatRows ?? []) {
    const seriesId = row.series_id as string | null;
    const boatId = row.boat_id as string | null;
    if (!seriesId || !boatId) continue;
    const list = boatIdsBySeriesId.get(seriesId) ?? [];
    list.push(boatId);
    boatIdsBySeriesId.set(seriesId, list);
    allBoatIds.add(boatId);
  }

  if (!allBoatIds.size) return [];

  const boatLabelById = new Map<string, string>();
  const { data: boatRows } = await supabase
    .from("boats")
    .select("id, label")
    .in("id", [...allBoatIds]);
  for (const b of boatRows ?? []) {
    boatLabelById.set(b.id, (b.label as string)?.trim() || "Boat");
  }

  const groupResults = await Promise.all(
    seriesList.map(async (s) => {
      const boatIds = boatIdsBySeriesId.get(s.seriesId);
      if (!boatIds?.length) return null;

      const built = await buildSeriesStandingsPlaced(supabase, {
        groupId: s.groupId,
        seriesId: s.seriesId,
      });
      if (!built?.standingsRaces.length) return null;

      const positionByBoatId = boatSeriesPositionsFromBuilt(built, boatIds);
      const boatGroups: HomeBoatRaceResultsBoatGroup[] = [...new Set(boatIds)]
        .map((boatId) => ({
          boatId,
          boatLabel: boatLabelById.get(boatId) ?? "Boat",
          seriesPosition: positionByBoatId.get(boatId) ?? null,
        }))
        .filter((g) => g.seriesPosition != null)
        .sort((a, b) =>
          a.boatLabel.localeCompare(b.boatLabel, undefined, { sensitivity: "base" }),
        );

      if (!boatGroups.length) return null;

      return {
        seriesId: s.seriesId,
        seriesName: s.seriesName,
        clubName: s.clubName,
        groupId: s.groupId,
        boatGroups,
      } satisfies HomeBoatRaceResultsSeriesGroup;
    }),
  );

  const groups = groupResults.filter((g): g is HomeBoatRaceResultsSeriesGroup => g != null);

  groups.sort(
    (a, b) =>
      a.clubName.localeCompare(b.clubName, undefined, { sensitivity: "base" }) ||
      a.seriesName.localeCompare(b.seriesName, undefined, { sensitivity: "base" }),
  );

  return groups;
}
