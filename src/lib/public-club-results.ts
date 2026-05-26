import type { SupabaseClient } from "@supabase/supabase-js";
import { buildSeriesStandingsPlaced } from "@/lib/scoring/build-series-standings";
import { fetchRaceResultsDisplay, type RaceResultsDisplay } from "@/lib/race-results-display";
import { resolveClubIanaTimeZone } from "@/lib/club-time";
import { raceIdsWithRecordedScoringInputs } from "@/lib/series-recorded-results";
import { loadSeriesStandingsBoatDisplayMeta } from "@/lib/series-standings-boat-display";

export type PublicSeriesOption = { id: string; name: string };

export type PublicFleetOption = { id: string; name: string };

export type PublicSeriesTableRow = {
  rank: number;
  boatId: string;
  sailNumber: string;
  boatType: string;
  helm: string;
  crew: string;
  racePoints: (string | null)[];
  netScore: number;
  fleetId: string | null;
};

export type PublicClubResultsFailure =
  | { kind: "not_found" }
  | { kind: "no_results" }
  | { kind: "query_error"; message: string };

export type PublicClubResultsPayload = {
  groupId: string;
  clubName: string;
  clubSlug: string;
  clubTz: string;
  seriesOptions: PublicSeriesOption[];
  selectedSeriesId: string;
  selectedSeriesName: string;
  fleets: PublicFleetOption[];
  standingsRaces: { id: string; name: string; scheduledAt: string }[];
  seriesTableByFleetId: Record<string, PublicSeriesTableRow[]>;
  raceSections: RaceResultsDisplay[];
};

function formatPts(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2);
}

export async function fetchPublicClubResults(
  supabase: SupabaseClient,
  slug: string,
  preferredSeriesId?: string | null,
): Promise<PublicClubResultsPayload | PublicClubResultsFailure> {
  const slugNorm = slug.trim().toLowerCase();
  if (!slugNorm) return { kind: "not_found" };

  const { data: group, error: groupErr } = await supabase
    .from("groups")
    .select("id, name, slug, iana_timezone")
    .eq("slug", slugNorm)
    .maybeSingle();

  if (groupErr) return { kind: "query_error", message: groupErr.message };
  if (!group?.slug) return { kind: "not_found" };

  const groupId = group.id;
  const clubTz = resolveClubIanaTimeZone(group.iana_timezone);

  const { data: allSeries } = await supabase
    .from("series")
    .select("id, name, created_at")
    .eq("group_id", groupId)
    .order("created_at", { ascending: false });

  const seriesWithResults: PublicSeriesOption[] = [];
  for (const s of allSeries ?? []) {
    const { data: races } = await supabase.from("races").select("id").eq("series_id", s.id);
    const raceIds = (races ?? []).map((r) => r.id);
    if (!raceIds.length) continue;
    const eligible = await raceIdsWithRecordedScoringInputs(supabase, raceIds);
    if (eligible.size > 0) seriesWithResults.push({ id: s.id, name: s.name });
  }

  if (!seriesWithResults.length) return { kind: "no_results" };

  const selectedSeriesId =
    preferredSeriesId && seriesWithResults.some((s) => s.id === preferredSeriesId)
      ? preferredSeriesId
      : seriesWithResults[0].id;
  const selectedSeriesName =
    seriesWithResults.find((s) => s.id === selectedSeriesId)?.name ?? seriesWithResults[0].name;

  const built = await buildSeriesStandingsPlaced(supabase, { groupId, seriesId: selectedSeriesId });

  const boatIds = new Set<string>();
  for (const rows of Object.values(built.tableRowsByFleetId)) {
    for (const r of rows) boatIds.add(r.boatId);
  }

  const { data: registeredBoats } = await supabase
    .from("series_registration_boats")
    .select("boat_id")
    .eq("series_id", selectedSeriesId);
  for (const r of registeredBoats ?? []) {
    if (r.boat_id) boatIds.add(r.boat_id);
  }

  const boatMeta = await loadSeriesStandingsBoatDisplayMeta(
    supabase,
    groupId,
    selectedSeriesId,
    [...boatIds],
  );

  const seriesTableByFleetId: Record<string, PublicSeriesTableRow[]> = {};

  for (const fleet of built.fleets) {
    const standingRows = built.tableRowsByFleetId[fleet.id] ?? [];
    const seen = new Set(standingRows.map((r) => r.boatId));

    const enriched: PublicSeriesTableRow[] = standingRows.map((row) => {
      const meta = boatMeta.get(row.boatId);
      return {
        rank: row.rank,
        boatId: row.boatId,
        sailNumber: meta?.sailNumber ?? "—",
        boatType: meta?.boatType ?? row.boatLabel,
        helm: meta?.helm ?? row.sailorName,
        crew: meta?.crew ?? "—",
        racePoints: row.racePoints.map((p) => (p !== null ? formatPts(p) : null)),
        netScore: row.netScore,
        fleetId: fleet.id,
      };
    });

    for (const [boatId, meta] of boatMeta) {
      if (seen.has(boatId)) continue;
      if (meta.primaryFleetId !== fleet.id) continue;
      enriched.push({
        rank: 0,
        boatId,
        sailNumber: meta.sailNumber,
        boatType: meta.boatType,
        helm: meta.helm,
        crew: meta.crew,
        racePoints: built.standingsRaces.map(() => null),
        netScore: 0,
        fleetId: fleet.id,
      });
    }

    enriched.sort((a, b) => {
      if (a.rank > 0 && b.rank > 0) return a.rank - b.rank;
      if (a.rank > 0) return -1;
      if (b.rank > 0) return 1;
      return a.sailNumber.localeCompare(b.sailNumber);
    });

    seriesTableByFleetId[fleet.id] = enriched;
  }

  const unassignedRows: PublicSeriesTableRow[] = [];
  for (const [boatId, meta] of boatMeta) {
    const inAnyFleet = built.fleets.some((f) =>
      (seriesTableByFleetId[f.id] ?? []).some((r) => r.boatId === boatId),
    );
    if (inAnyFleet) continue;
    if (!meta.primaryFleetId) {
      unassignedRows.push({
        rank: 0,
        boatId,
        sailNumber: meta.sailNumber,
        boatType: meta.boatType,
        helm: meta.helm,
        crew: meta.crew,
        racePoints: built.standingsRaces.map(() => null),
        netScore: 0,
        fleetId: null,
      });
    }
  }
  if (unassignedRows.length) {
    seriesTableByFleetId["__unassigned__"] = unassignedRows;
  }

  const raceSections: RaceResultsDisplay[] = [];
  for (const race of built.standingsRaces) {
    const display = await fetchRaceResultsDisplay(supabase, {
      groupId,
      seriesId: selectedSeriesId,
      raceId: race.id,
      raceName: race.name,
      seriesName: selectedSeriesName,
      scheduledAt: race.scheduled_at,
      clubName: group.name,
      clubTz,
    });
    if (display) raceSections.push(display);
  }

  const hasUnassignedRaceRows = raceSections.some((race) =>
    race.fleetSections.some((s) => s.fleetId == null && s.rows.length > 0),
  );

  const fleets: PublicFleetOption[] = built.fleets.map((f) => ({ id: f.id, name: f.name }));
  if (unassignedRows.length || hasUnassignedRaceRows) {
    fleets.push({ id: "__unassigned__", name: "Unassigned fleet" });
  }

  return {
    groupId,
    clubName: group.name,
    clubSlug: group.slug,
    clubTz,
    seriesOptions: seriesWithResults,
    selectedSeriesId,
    selectedSeriesName,
    fleets,
    standingsRaces: built.standingsRaces.map((r) => ({
      id: r.id,
      name: r.name,
      scheduledAt: r.scheduled_at,
    })),
    seriesTableByFleetId,
    raceSections,
  };
}
