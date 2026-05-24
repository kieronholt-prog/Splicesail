import type { SupabaseClient } from "@supabase/supabase-js";
import { formatClubDdMmmYyyyHmsFromIso } from "@/lib/club-display-format";

const DEFAULT_MAX_RACE_DURATION_MS = 4 * 60 * 60 * 1000;
const DEFAULT_CLUB_TIMEZONE = "Europe/London";

export type RaceMatchCandidate = {
  raceId: string;
  seriesId: string;
  groupId: string;
  groupName: string;
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
  boatsByRaceId: Map<string, RaceMatchCandidate["boats"]>,
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
      raceName: race.name,
      scheduledAt: race.scheduled_at,
      scheduledAtLabel: formatClubDdMmmYyyyHmsFromIso(
        race.scheduled_at,
        group.iana_timezone?.trim() || DEFAULT_CLUB_TIMEZONE,
      ),
      score,
      hasEntry,
      boats: boatsByRaceId.get(race.id) ?? [],
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
      "id, name, scheduled_at, series_id, series:series_id(id, group_id, tally_open_hours_before_fleet_start, groups:group_id(id, name, iana_timezone))",
    )
    .in("series_id", seriesIds)
    .gte("scheduled_at", searchStart)
    .lte("scheduled_at", searchEnd);

  const races = (racesRaw ?? []) as unknown as RaceRow[];
  const raceIds = races.map((r) => r.id);
  if (raceIds.length === 0) return [];

  const { data: entries } = await supabase
    .from("race_entries")
    .select("race_id, boat_id, boats(id, label, default_sail_number)")
    .eq("user_id", userId)
    .in("race_id", raceIds);

  const entryRaceIds = new Set<string>();
  const boatsByRaceId = new Map<string, RaceMatchCandidate["boats"]>();

  for (const e of entries ?? []) {
    entryRaceIds.add(e.race_id);
    const boat = unwrapOne(
      e.boats as
        | { id: string; label: string | null; default_sail_number: string | null }
        | { id: string; label: string | null; default_sail_number: string | null }[]
        | null,
    );
    const list = boatsByRaceId.get(e.race_id) ?? [];
    list.push({
      boatId: e.boat_id,
      label: boat?.label ?? null,
      sailNumber: boat?.default_sail_number ?? null,
    });
    boatsByRaceId.set(e.race_id, list);
  }

  return rankRaceCandidates(trackStartMs, trackEndMs, races, entryRaceIds, boatsByRaceId);
}
