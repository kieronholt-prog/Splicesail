import type { SupabaseClient } from "@supabase/supabase-js";
import { formatClubDdMmmHmFromIso } from "@/lib/club-display-format";

/** Latest time after `races.scheduled_at` that still overlaps a GPS track (4 hours). */
export const TRACK_RACE_MATCH_MAX_DURATION_MS = 4 * 60 * 60 * 1000;
/** When series has no tally open hours, matching uses this many hours before scheduled start. */
export const TRACK_RACE_MATCH_DEFAULT_OPEN_HOURS = 2;

const DEFAULT_MAX_RACE_DURATION_MS = TRACK_RACE_MATCH_MAX_DURATION_MS;
const DEFAULT_CLUB_TIMEZONE = "Europe/London";

/** Human-readable match window for RO/sailor help text. */
export function describeTrackRaceMatchWindow(openHoursBeforeStart: number): string {
  const hBefore = openHoursBeforeStart;
  const hAfter = TRACK_RACE_MATCH_MAX_DURATION_MS / (60 * 60 * 1000);
  return `${hBefore} hour${hBefore === 1 ? "" : "s"} before the race scheduled start through ${hAfter} hours after it`;
}

export type RaceMatchCandidate = {
  raceId: string;
  seriesId: string;
  groupId: string;
  groupName: string;
  seriesName: string;
  raceName: string;
  scheduledAt: string;
  scheduledAtLabel: string;
  score: number;
  hasEntry: boolean;
  boats: { boatId: string; label: string | null; sailNumber: string | null }[];
};

type RaceRow = {
  id: string;
  name: string;
  scheduled_at: string;
  series_id: string;
  series: {
    id: string;
    name: string;
    group_id: string;
    tally_open_hours_before_fleet_start: number | null;
    groups: { id: string; name: string; iana_timezone?: string | null } | { id: string; name: string; iana_timezone?: string | null }[] | null;
  } | null;
};

function unwrapOne<T>(rel: T | T[] | null | undefined): T | null {
  if (rel == null) return null;
  return Array.isArray(rel) ? (rel[0] ?? null) : rel;
}

function overlapMs(
  trackStart: number,
  trackEnd: number,
  raceStart: number,
  windowBeforeMs: number,
  windowAfterMs: number,
): number {
  const winStart = raceStart - windowBeforeMs;
  const winEnd = raceStart + windowAfterMs;
  const start = Math.max(trackStart, winStart);
  const end = Math.min(trackEnd, winEnd);
  return Math.max(0, end - start);
}

export function rankRaceCandidates(
  trackStartMs: number,
  trackEndMs: number,
  races: RaceRow[],
  entryRaceIds: Set<string>,
  boatsBySeriesId: Map<string, RaceMatchCandidate["boats"]>,
): RaceMatchCandidate[] {
  const out: RaceMatchCandidate[] = [];

  for (const race of races) {
    const series = unwrapOne(race.series);
    if (!series?.group_id) continue;
    const group = unwrapOne(series.groups);
    if (!group) continue;

    const scheduledMs = new Date(race.scheduled_at).getTime();
    if (!Number.isFinite(scheduledMs)) continue;

    const openHours = series.tally_open_hours_before_fleet_start ?? 2;
    const windowBeforeMs = openHours * 60 * 60 * 1000;
    const overlap = overlapMs(
      trackStartMs,
      trackEndMs,
      scheduledMs,
      windowBeforeMs,
      DEFAULT_MAX_RACE_DURATION_MS,
    );
    if (overlap <= 0) continue;

    const hasEntry = entryRaceIds.has(race.id);
    const score = overlap + (hasEntry ? 1_000_000_000 : 0);

    out.push({
      raceId: race.id,
      seriesId: series.id,
      groupId: series.group_id,
      groupName: group.name,
      seriesName: series.name,
      raceName: race.name,
      scheduledAt: race.scheduled_at,
      scheduledAtLabel: formatClubDdMmmHmFromIso(
        race.scheduled_at,
        group.iana_timezone?.trim() || DEFAULT_CLUB_TIMEZONE,
      ),
      score,
      hasEntry,
      boats: boatsBySeriesId.get(series.id) ?? [],
    });
  }

  return out.sort((a, b) => b.score - a.score);
}

export async function loadRaceMatchCandidates(
  supabase: SupabaseClient,
  userId: string,
  trackStartMs: number,
  trackEndMs: number,
): Promise<RaceMatchCandidate[]> {
  const { data: memberships } = await supabase
    .from("group_memberships")
    .select("group_id")
    .eq("user_id", userId);

  const groupIds = [...new Set((memberships ?? []).map((m) => m.group_id))];
  if (groupIds.length === 0) return [];

  const { data: seriesRows } = await supabase
    .from("series")
    .select("id")
    .in("group_id", groupIds);

  const seriesIds = (seriesRows ?? []).map((s) => s.id);
  if (seriesIds.length === 0) return [];

  const searchStart = new Date(trackStartMs - DEFAULT_MAX_RACE_DURATION_MS).toISOString();
  const searchEnd = new Date(trackEndMs + DEFAULT_MAX_RACE_DURATION_MS).toISOString();

  const { data: racesRaw } = await supabase
    .from("races")
    .select(
      "id, name, scheduled_at, series_id, series:series_id(id, name, group_id, tally_open_hours_before_fleet_start, groups:group_id(id, name, iana_timezone))",
    )
    .in("series_id", seriesIds)
    .gte("scheduled_at", searchStart)
    .lte("scheduled_at", searchEnd);

  const races = (racesRaw ?? []) as unknown as RaceRow[];
  const seriesIdsForRaces = [...new Set(races.map((r) => r.series_id))];
  if (races.length === 0) return [];

  const [{ data: entries }, { data: seriesBoats }] = await Promise.all([
    supabase.from("race_entries").select("race_id").eq("user_id", userId).in("race_id", races.map((r) => r.id)),
    seriesIdsForRaces.length > 0
      ? supabase
          .from("series_registration_boats")
          .select("series_id, boat_id, boats(id, label, default_sail_number)")
          .eq("user_id", userId)
          .in("series_id", seriesIdsForRaces)
      : Promise.resolve({
          data: [] as {
            series_id: string;
            boat_id: string;
            boats: unknown;
          }[],
        }),
  ]);

  const entryRaceIds = new Set<string>((entries ?? []).map((e) => e.race_id));
  const boatsBySeriesId = new Map<string, RaceMatchCandidate["boats"]>();

  for (const row of seriesBoats ?? []) {
    const boat = unwrapOne(
      row.boats as
        | { id: string; label: string | null; default_sail_number: string | null }
        | { id: string; label: string | null; default_sail_number: string | null }[]
        | null,
    );
    const list = boatsBySeriesId.get(row.series_id) ?? [];
    if (!list.some((b) => b.boatId === row.boat_id)) {
      list.push({
        boatId: row.boat_id,
        label: boat?.label ?? null,
        sailNumber: boat?.default_sail_number ?? null,
      });
    }
    boatsBySeriesId.set(row.series_id, list);
  }

  return rankRaceCandidates(trackStartMs, trackEndMs, races, entryRaceIds, boatsBySeriesId);
}
