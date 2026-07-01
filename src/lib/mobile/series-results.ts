import type { SupabaseClient } from "@supabase/supabase-js";
import { formatRaceElapsedOrCorrectedHms } from "@/lib/club-display-format";
import { fetchHomeBoatRaceResults } from "@/lib/home-boat-race-results";
import { loadUserTrackLinks, resolveTrackLink } from "@/lib/mobile/track-submissions";
import { raceTypeUsesPositionalScoring, normalizeRaceType } from "@/lib/race-type";

export type MobileSeriesRaceResult = {
  raceId: string;
  raceName: string;
  scheduledAt: string;
  raceEntryId: string;
  boatId: string;
  sailNumber: string;
  boatLabel: string | null;
  finishDisplay: string;
  trackSubmissionId: string | null;
  trackStatus: string | null;
};

export type MobileSeriesResultsGroup = {
  seriesId: string;
  seriesName: string;
  groupId: string;
  clubName: string | null;
  overallPosition: { rank: number; of: number } | null;
  races: MobileSeriesRaceResult[];
};

function unwrapOne<T>(rel: T | T[] | null | undefined): T | null {
  if (rel == null) return null;
  return Array.isArray(rel) ? rel[0] ?? null : rel;
}

function finishDisplayForRow(args: {
  raceType: string;
  finishPosition: number | null;
  elapsedSeconds: number | null;
  correctedSeconds: number | null;
  outcome: string | null;
}): string {
  const type = normalizeRaceType(args.raceType);
  if (raceTypeUsesPositionalScoring(type)) {
    if (args.finishPosition != null) return String(args.finishPosition);
    const code = args.outcome?.trim().toUpperCase();
    return code && code.length ? code : "—";
  }
  return formatRaceElapsedOrCorrectedHms(args.correctedSeconds ?? args.elapsedSeconds);
}

/**
 * Series-grouped race results for mobile Results tab: overall standing per series,
 * with per-race finishes when expanded.
 */
export async function loadMobileSeriesResults(
  supabase: SupabaseClient,
  userId: string,
): Promise<MobileSeriesResultsGroup[]> {
  const { data: entryRows, error } = await supabase
    .from("race_entries")
    .select(
      `
      id,
      race_id,
      boat_id,
      outcome,
      tally_ashore_at,
      races (
        id,
        name,
        scheduled_at,
        race_type,
        series_id,
        series (
          name,
          group_id,
          groups ( name )
        )
      ),
      boats ( default_sail_number, label ),
      race_finishes (
        finish_position,
        elapsed_seconds,
        corrected_seconds
      )
    `,
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("loadMobileSeriesResults entries:", error.message);
    return [];
  }
  if (!entryRows?.length) return [];

  const trackLinks = await loadUserTrackLinks(userId);

  type SeriesAcc = {
    seriesId: string;
    seriesName: string;
    groupId: string;
    clubName: string | null;
    races: MobileSeriesRaceResult[];
    latestRaceMs: number;
  };

  const bySeriesId = new Map<string, SeriesAcc>();
  const seenRaceIdsBySeries = new Map<string, Set<string>>();

  for (const row of entryRows) {
    const race = unwrapOne(
      row.races as unknown as
        | {
            id: string;
            name: string;
            scheduled_at: string;
            race_type: string | null;
            series_id: string;
            series?: unknown;
          }
        | null,
    );
    if (!race?.id || !race.series_id) continue;

    const finish = unwrapOne(
      row.race_finishes as unknown as
        | {
            finish_position: number | null;
            elapsed_seconds: number | null;
            corrected_seconds: number | null;
          }
        | null,
    );
    const hasFinish = finish != null;
    const hasOutcome = row.tally_ashore_at != null || row.outcome != null;
    if (!hasFinish && !hasOutcome) continue;

    const seen = seenRaceIdsBySeries.get(race.series_id) ?? new Set<string>();
    if (seen.has(race.id)) continue;
    seen.add(race.id);
    seenRaceIdsBySeries.set(race.series_id, seen);

    const series = unwrapOne(
      race.series as
        | { name: string; group_id: string; groups?: { name?: string | null } | null }
        | null,
    );
    if (!series) continue;

    const group = unwrapOne(series.groups);
    const boat = unwrapOne(
      row.boats as unknown as
        | { default_sail_number: string | null; label: string | null }
        | null,
    );
    const raceType = race.race_type ?? "handicap";
    const track = resolveTrackLink(trackLinks, row.id, race.id, row.boat_id);
    const scheduledMs = race.scheduled_at ? new Date(race.scheduled_at).getTime() : 0;

    const raceResult: MobileSeriesRaceResult = {
      raceId: race.id,
      raceName: race.name,
      scheduledAt: race.scheduled_at,
      raceEntryId: row.id,
      boatId: row.boat_id,
      sailNumber: boat?.default_sail_number?.trim() || "—",
      boatLabel: boat?.label?.trim() || null,
      finishDisplay: finishDisplayForRow({
        raceType,
        finishPosition: finish?.finish_position ?? null,
        elapsedSeconds: finish?.elapsed_seconds ?? null,
        correctedSeconds: finish?.corrected_seconds ?? null,
        outcome: row.outcome,
      }),
      trackSubmissionId: track?.id ?? null,
      trackStatus: track?.status ?? null,
    };

    const existing = bySeriesId.get(race.series_id);
    if (existing) {
      existing.races.push(raceResult);
      existing.latestRaceMs = Math.max(existing.latestRaceMs, scheduledMs);
    } else {
      bySeriesId.set(race.series_id, {
        seriesId: race.series_id,
        seriesName: series.name,
        groupId: series.group_id,
        clubName: group?.name?.trim() || null,
        races: [raceResult],
        latestRaceMs: scheduledMs,
      });
    }
  }

  if (!bySeriesId.size) return [];

  const seriesBase = [...bySeriesId.values()].map((s) => ({
    seriesId: s.seriesId,
    seriesName: s.seriesName,
    groupId: s.groupId,
    clubName: s.clubName ?? "Club",
  }));

  const standingsGroups = await fetchHomeBoatRaceResults(supabase, userId, seriesBase);
  const overallBySeriesId = new Map<string, { rank: number; of: number } | null>();
  for (const group of standingsGroups) {
    let best: { rank: number; of: number } | null = null;
    for (const boat of group.boatGroups) {
      const pos = boat.seriesPosition;
      if (!pos) continue;
      if (!best || pos.rank < best.rank) best = pos;
    }
    overallBySeriesId.set(group.seriesId, best);
  }

  const groups: MobileSeriesResultsGroup[] = [...bySeriesId.values()].map((s) => {
    s.races.sort((a, b) => {
      const aMs = a.scheduledAt ? new Date(a.scheduledAt).getTime() : 0;
      const bMs = b.scheduledAt ? new Date(b.scheduledAt).getTime() : 0;
      return bMs - aMs;
    });
    return {
      seriesId: s.seriesId,
      seriesName: s.seriesName,
      groupId: s.groupId,
      clubName: s.clubName,
      overallPosition: overallBySeriesId.get(s.seriesId) ?? null,
      races: s.races,
    };
  });

  groups.sort((a, b) => {
    const aLatest = a.races[0]?.scheduledAt ? new Date(a.races[0].scheduledAt).getTime() : 0;
    const bLatest = b.races[0]?.scheduledAt ? new Date(b.races[0].scheduledAt).getTime() : 0;
    return bLatest - aLatest;
  });

  return groups;
}
