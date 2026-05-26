import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveClubIanaTimeZone } from "@/lib/club-time";
import { wallTimeMs } from "@/lib/wall-time";

export type RaceOfficerNextRace = {
  raceId: string;
  raceName: string;
  scheduledAt: string;
  scheduledAtMs: number;
  seriesId: string;
  seriesName: string;
  groupId: string;
  clubName: string;
  clubTz: string;
  resultsFinal: boolean;
  status: "upcoming" | "in_progress";
};

type RaceRow = {
  id: string;
  name: string;
  scheduled_at: string;
  results_final: boolean | null;
  series_id: string;
  series: unknown;
};

const RACE_SELECT = `
  id,
  name,
  scheduled_at,
  results_final,
  series_id,
  series!inner (
    id,
    name,
    group_id,
    groups ( name, iana_timezone )
  )
`;

function mapRaceRow(row: RaceRow, status: RaceOfficerNextRace["status"]): RaceOfficerNextRace | null {
  const nested = row.series;
  const s = (Array.isArray(nested) ? nested[0] : nested) as
    | {
        id: string;
        name: string;
        group_id: string;
        groups?: unknown;
      }
    | null
    | undefined;
  if (!s?.id || !s.group_id) return null;

  const gRaw = s.groups;
  const g = (Array.isArray(gRaw) ? gRaw[0] : gRaw) as
    | { name?: string | null; iana_timezone?: string | null }
    | null
    | undefined;

  const ms = new Date(row.scheduled_at).getTime();
  if (!Number.isFinite(ms)) return null;

  return {
    raceId: row.id,
    raceName: row.name,
    scheduledAt: row.scheduled_at,
    scheduledAtMs: ms,
    seriesId: s.id,
    seriesName: s.name,
    groupId: s.group_id,
    clubName: typeof g?.name === "string" && g.name.trim() ? g.name.trim() : "Club",
    clubTz: resolveClubIanaTimeZone(g?.iana_timezone),
    resultsFinal: !!row.results_final,
    status,
  };
}

/** Soonest upcoming race across clubs, or a recent in-progress race when none are scheduled ahead. */
export async function fetchRaceOfficerNextRace(
  supabase: SupabaseClient,
  groupIds: string[],
): Promise<{ race: RaceOfficerNextRace | null; error: string | null }> {
  if (!groupIds.length) return { race: null, error: null };

  const nowMs = wallTimeMs();
  const nowIso = new Date(nowMs).toISOString();

  const { data: futureRows, error: futureErr } = await supabase
    .from("races")
    .select(RACE_SELECT)
    .in("series.group_id", groupIds)
    .gt("scheduled_at", nowIso)
    .order("scheduled_at", { ascending: true })
    .limit(1);

  if (futureErr) return { race: null, error: futureErr.message };

  const future = (futureRows as RaceRow[] | null)?.[0];
  if (future) {
    return { race: mapRaceRow(future, "upcoming"), error: null };
  }

  const lookbackIso = new Date(nowMs - 12 * 60 * 60 * 1000).toISOString();
  const { data: recentRows, error: recentErr } = await supabase
    .from("races")
    .select(RACE_SELECT)
    .in("series.group_id", groupIds)
    .lte("scheduled_at", nowIso)
    .gte("scheduled_at", lookbackIso)
    .eq("results_final", false)
    .order("scheduled_at", { ascending: false })
    .limit(1);

  if (recentErr) return { race: null, error: recentErr.message };

  const recent = (recentRows as RaceRow[] | null)?.[0];
  if (!recent) return { race: null, error: null };

  return { race: mapRaceRow(recent, "in_progress"), error: null };
}
