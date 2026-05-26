import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveClubIanaTimeZone } from "@/lib/club-time";
import { fetchRaceResultsDisplay } from "@/lib/race-results-display";
import {
  boatSeriesPositionsFromBuilt,
  buildSeriesStandingsPlaced,
} from "@/lib/scoring/build-series-standings";
import { raceIdsWithRecordedScoringInputs } from "@/lib/series-recorded-results";

export type HomeBoatRaceResultRow = {
  entryId: string;
  boatId: string;
  raceName: string;
  scheduledAt: string;
  sailNumber: string;
  boatType: string;
  finishPosition: string;
};

export type HomeBoatRaceResultsBoatGroup = {
  boatId: string;
  boatLabel: string;
  seriesPosition: { rank: number; of: number } | null;
  rows: HomeBoatRaceResultRow[];
};

export type HomeBoatRaceResultsSeriesGroup = {
  seriesId: string;
  seriesName: string;
  clubName: string;
  groupId: string;
  clubTz: string;
  boatGroups: HomeBoatRaceResultsBoatGroup[];
};

export type HomeBoatRaceResultsInputSeries = {
  seriesId: string;
  seriesName: string;
  groupId: string;
  clubName: string;
};

function unwrapOne<T>(rel: T | T[] | null | undefined): T | null {
  if (rel == null) return null;
  return Array.isArray(rel) ? rel[0] ?? null : rel;
}

function positionByEntryIdFromDisplay(
  fleetSections: NonNullable<Awaited<ReturnType<typeof fetchRaceResultsDisplay>>>["fleetSections"],
): Map<string, string> {
  const out = new Map<string, string>();
  if (!fleetSections) return out;
  for (const section of fleetSections) {
    for (const row of section.rows) {
      out.set(row.entryId, row.position);
    }
  }
  return out;
}

/**
 * Per-boat race results for the signed-in sailor, grouped by registered series, with overall series position.
 */
export async function fetchHomeBoatRaceResults(
  supabase: SupabaseClient,
  userId: string,
  seriesList: HomeBoatRaceResultsInputSeries[],
  clubTzByGroupId: Map<string, string>,
): Promise<HomeBoatRaceResultsSeriesGroup[]> {
  if (!seriesList.length) return [];

  const seriesIds = seriesList.map((s) => s.seriesId);
  const seriesMetaById = new Map(seriesList.map((s) => [s.seriesId, s] as const));

  const { data: raceRows } = await supabase
    .from("races")
    .select("id, name, scheduled_at, series_id")
    .in("series_id", seriesIds)
    .order("scheduled_at", { ascending: true });

  const allRaceIds = (raceRows ?? []).map((r) => r.id);
  if (!allRaceIds.length) return [];

  const scoredRaceIds = await raceIdsWithRecordedScoringInputs(supabase, allRaceIds);
  if (!scoredRaceIds.size) return [];

  const raceById = new Map(
    (raceRows ?? [])
      .filter((r) => scoredRaceIds.has(r.id))
      .map((r) => [r.id, r] as const),
  );
  const scoredIds = [...raceById.keys()];
  if (!scoredIds.length) return [];

  const { data: signupBoatRows } = await supabase
    .from("series_registration_boats")
    .select("series_id, boat_id")
    .eq("user_id", userId)
    .in("series_id", seriesIds);

  const signupBoatIds = new Set(
    (signupBoatRows ?? []).map((r) => r.boat_id).filter(Boolean) as string[],
  );
  const { data: entryRows } = await supabase
    .from("race_entries")
    .select("id, race_id, boat_id")
    .not("boat_id", "is", null)
    .in("race_id", scoredIds);

  const entriesByRaceId = new Map<string, { id: string; boat_id: string }[]>();
  for (const e of entryRows ?? []) {
    const boatId = e.boat_id as string | null;
    if (!boatId || !signupBoatIds.has(boatId)) continue;
    const race = raceById.get(e.race_id as string);
    if (!race || !seriesMetaById.has(race.series_id)) continue;
    const list = entriesByRaceId.get(e.race_id as string) ?? [];
    list.push({ id: e.id as string, boat_id: boatId });
    entriesByRaceId.set(e.race_id as string, list);
  }

  const raceIdsToFetch = [...entriesByRaceId.keys()];
  if (!raceIdsToFetch.length) return [];

  const positionByEntryId = new Map<string, string>();
  const displayMetaByEntryId = new Map<
    string,
    { sailNumber: string; boatType: string; raceId: string }
  >();

  await Promise.all(
    raceIdsToFetch.map(async (raceId) => {
      const race = raceById.get(raceId);
      if (!race) return;
      const seriesMeta = seriesMetaById.get(race.series_id);
      if (!seriesMeta) return;

      const { data: seriesNest } = await supabase
        .from("series")
        .select("name, groups ( name, iana_timezone, slug )")
        .eq("id", race.series_id)
        .maybeSingle();

      const groupNest = unwrapOne(
        seriesNest?.groups as
          | { name?: string | null; iana_timezone?: string | null; slug?: string | null }
          | { name?: string | null; iana_timezone?: string | null; slug?: string | null }[]
          | null,
      );

      const display = await fetchRaceResultsDisplay(supabase, {
        groupId: seriesMeta.groupId,
        seriesId: race.series_id,
        raceId,
        raceName: race.name,
        seriesName: seriesNest?.name ?? seriesMeta.seriesName,
        scheduledAt: race.scheduled_at,
        clubName: groupNest?.name?.trim() || seriesMeta.clubName,
        clubSlug: groupNest?.slug?.trim() || null,
        clubTz: groupNest?.iana_timezone ?? clubTzByGroupId.get(seriesMeta.groupId),
        highlightUserId: userId,
      });

      if (!display) return;

      const positions = positionByEntryIdFromDisplay(display.fleetSections);
      for (const section of display.fleetSections) {
        for (const row of section.rows) {
          const userEntries = entriesByRaceId.get(raceId) ?? [];
          if (!userEntries.some((ue) => ue.id === row.entryId)) continue;
          positionByEntryId.set(row.entryId, positions.get(row.entryId) ?? row.position);
          displayMetaByEntryId.set(row.entryId, {
            sailNumber: row.sailNumber,
            boatType: row.boatType,
            raceId,
          });
        }
      }
    }),
  );

  const rowsBySeriesId = new Map<string, HomeBoatRaceResultRow[]>();

  for (const [raceId, entries] of entriesByRaceId) {
    const race = raceById.get(raceId);
    if (!race) continue;
    for (const entry of entries) {
      const meta = displayMetaByEntryId.get(entry.id);
      const position = positionByEntryId.get(entry.id);
      if (!meta || position === undefined) continue;

      const row: HomeBoatRaceResultRow = {
        entryId: entry.id,
        boatId: entry.boat_id,
        raceName: race.name,
        scheduledAt: race.scheduled_at,
        sailNumber: meta.sailNumber,
        boatType: meta.boatType,
        finishPosition: position,
      };

      const list = rowsBySeriesId.get(race.series_id) ?? [];
      list.push(row);
      rowsBySeriesId.set(race.series_id, list);
    }
  }

  if (!rowsBySeriesId.size) return [];

  const boatLabelById = new Map<string, string>();
  if (signupBoatIds.size) {
    const { data: boatRows } = await supabase
      .from("boats")
      .select("id, label")
      .in("id", [...signupBoatIds]);
    for (const b of boatRows ?? []) {
      boatLabelById.set(b.id, (b.label as string)?.trim() || "Boat");
    }
  }

  const groups: HomeBoatRaceResultsSeriesGroup[] = [];

  for (const s of seriesList) {
    const rows = rowsBySeriesId.get(s.seriesId);
    if (!rows?.length) continue;

    const boatIdsInResults = [...new Set(rows.map((r) => r.boatId))];
    const built = await buildSeriesStandingsPlaced(supabase, {
      groupId: s.groupId,
      seriesId: s.seriesId,
    });
    const positionByBoatId = boatSeriesPositionsFromBuilt(built, boatIdsInResults);

    const rowsByBoatId = new Map<string, HomeBoatRaceResultRow[]>();
    for (const row of rows) {
      const list = rowsByBoatId.get(row.boatId) ?? [];
      list.push(row);
      rowsByBoatId.set(row.boatId, list);
    }

    const boatGroups: HomeBoatRaceResultsBoatGroup[] = boatIdsInResults
      .map((boatId) => {
        const boatRows = rowsByBoatId.get(boatId) ?? [];
        boatRows.sort(
          (a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime(),
        );
        return {
          boatId,
          boatLabel: boatLabelById.get(boatId) ?? "Boat",
          seriesPosition: positionByBoatId.get(boatId) ?? null,
          rows: boatRows,
        };
      })
      .sort((a, b) =>
        a.boatLabel.localeCompare(b.boatLabel, undefined, { sensitivity: "base" }),
      );

    groups.push({
      seriesId: s.seriesId,
      seriesName: s.seriesName,
      clubName: s.clubName,
      groupId: s.groupId,
      clubTz: clubTzByGroupId.get(s.groupId) ?? resolveClubIanaTimeZone(null),
      boatGroups,
    });
  }

  return groups;
}
