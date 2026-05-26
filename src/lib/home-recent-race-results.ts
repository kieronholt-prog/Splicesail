import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchRaceResultsDisplay,
  type RaceResultRow,
  type RaceResultsDisplay,
  type RaceResultsFleetSection,
} from "@/lib/race-results-display";

export type HomeRaceResultRow = RaceResultRow;
export type HomeRaceResultsFleetSection = RaceResultsFleetSection;
export type HomeRecentRaceResults = RaceResultsDisplay;

function unwrapOne<T>(rel: T | T[] | null | undefined): T | null {
  if (rel == null) return null;
  return Array.isArray(rel) ? rel[0] ?? null : rel;
}

/**
 * Most recent race (by scheduled start) in the sailor's registered series that has at least one
 * recorded official finish, with full Portsmouth ranking for boats that started or finished.
 */
export async function fetchHomeRecentRaceResults(
  supabase: SupabaseClient,
  userId: string,
  registeredSeriesIds: string[],
): Promise<HomeRecentRaceResults | null> {
  if (!registeredSeriesIds.length) return null;

  const { data: recentRaceRows, error: racePickErr } = await supabase
    .from("races")
    .select(
      `
      id,
      name,
      scheduled_at,
      series_id,
      series (
        name,
        group_id,
        groups ( name, iana_timezone, slug )
      ),
      race_entries!inner (
        race_finishes!inner ( id )
      )
    `,
    )
    .in("series_id", registeredSeriesIds)
    .order("scheduled_at", { ascending: false })
    .limit(1);

  if (racePickErr || !recentRaceRows?.length) return null;

  const raceRaw = recentRaceRows[0];
  const seriesNest = unwrapOne(
    raceRaw.series as
      | { name: string; group_id: string; groups?: unknown }
      | { name: string; group_id: string; groups?: unknown }[]
      | null,
  );
  if (!seriesNest) return null;

  const groupNest = unwrapOne(
    seriesNest.groups as
      | { name?: string | null; iana_timezone?: string | null; slug?: string | null }
      | null,
  );
  const groupId = seriesNest.group_id;
  const seriesId = raceRaw.series_id;

  return fetchRaceResultsDisplay(supabase, {
    groupId,
    seriesId,
    raceId: raceRaw.id,
    raceName: raceRaw.name,
    seriesName: seriesNest.name,
    scheduledAt: raceRaw.scheduled_at,
    clubName: groupNest?.name?.trim() || null,
    clubSlug: groupNest?.slug?.trim() || null,
    clubTz: groupNest?.iana_timezone ?? undefined,
    highlightUserId: userId,
  });
}
