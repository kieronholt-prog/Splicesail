import type { SupabaseClient } from "@supabase/supabase-js";
import { formatRaceElapsedOrCorrectedHms } from "@/lib/club-display-format";
import { resolveClubIanaTimeZone } from "@/lib/club-time";
import { raceTypeUsesPositionalScoring, normalizeRaceType } from "@/lib/race-type";

export type MobileRecentResultRow = {
  raceId: string;
  raceName: string;
  seriesId: string;
  seriesName: string;
  groupId: string;
  clubName: string | null;
  scheduledAt: string;
  raceType: string;
  raceEntryId: string;
  boatId: string;
  sailNumber: string;
  boatLabel: string | null;
  outcome: string | null;
  finishPosition: number | null;
  elapsedSeconds: number | null;
  correctedSeconds: number | null;
  finishDisplay: string;
  trackSubmissionId: string | null;
  trackStatus: string | null;
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
 * Recent races where the sailor has an official finish or ashore tally outcome.
 */
export async function loadMobileRecentResults(
  supabase: SupabaseClient,
  userId: string,
  limit = 25,
): Promise<MobileRecentResultRow[]> {
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
          groups ( name, iana_timezone )
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
    .order("created_at", { ascending: false })
    .limit(limit * 3);

  if (error || !entryRows?.length) return [];

  const entryIds = entryRows.map((r) => r.id);
  const { data: trackRows } = await supabase
    .from("race_track_submissions")
    .select("id, race_entry_id, status")
    .eq("user_id", userId)
    .in("race_entry_id", entryIds)
    .neq("status", "cancelled");

  const trackByEntryId = new Map<string, { id: string; status: string }>();
  for (const t of trackRows ?? []) {
    if (!t.race_entry_id) continue;
    trackByEntryId.set(t.race_entry_id, { id: t.id, status: t.status });
  }

  const seenRaceIds = new Set<string>();
  const results: MobileRecentResultRow[] = [];

  const sorted = [...entryRows].sort((a, b) => {
    const aRace = unwrapOne(a.races as { scheduled_at?: string } | null);
    const bRace = unwrapOne(b.races as { scheduled_at?: string } | null);
    const aMs = aRace?.scheduled_at ? new Date(aRace.scheduled_at).getTime() : 0;
    const bMs = bRace?.scheduled_at ? new Date(bRace.scheduled_at).getTime() : 0;
    return bMs - aMs;
  });

  for (const row of sorted) {
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
        | {
            id: string;
            name: string;
            scheduled_at: string;
            race_type: string | null;
            series_id: string;
            series?: unknown;
          }[]
        | null,
    );
    if (!race?.id || seenRaceIds.has(race.id)) continue;

    const finish = unwrapOne(
      row.race_finishes as unknown as
        | {
            finish_position: number | null;
            elapsed_seconds: number | null;
            corrected_seconds: number | null;
          }
        | {
            finish_position: number | null;
            elapsed_seconds: number | null;
            corrected_seconds: number | null;
          }[]
        | null,
    );
    const hasFinish = finish != null;
    const hasOutcome = row.tally_ashore_at != null || row.outcome != null;
    if (!hasFinish && !hasOutcome) continue;

    seenRaceIds.add(race.id);
    const series = unwrapOne(
      race.series as
        | { name: string; group_id: string; groups?: { name?: string | null; iana_timezone?: string | null } | null }
        | null,
    );
    if (!series) continue;

    const group = unwrapOne(series.groups);
    resolveClubIanaTimeZone(group?.iana_timezone);

    const boat = unwrapOne(
      row.boats as unknown as
        | { default_sail_number: string | null; label: string | null }
        | { default_sail_number: string | null; label: string | null }[]
        | null,
    );
    const track = trackByEntryId.get(row.id);
    const raceType = race.race_type ?? "handicap";

    results.push({
      raceId: race.id,
      raceName: race.name,
      seriesId: race.series_id,
      seriesName: series.name,
      groupId: series.group_id,
      clubName: group?.name?.trim() || null,
      scheduledAt: race.scheduled_at,
      raceType,
      raceEntryId: row.id,
      boatId: row.boat_id,
      sailNumber: boat?.default_sail_number?.trim() || "—",
      boatLabel: boat?.label?.trim() || null,
      outcome: row.outcome,
      finishPosition: finish?.finish_position ?? null,
      elapsedSeconds: finish?.elapsed_seconds ?? null,
      correctedSeconds: finish?.corrected_seconds ?? null,
      finishDisplay: finishDisplayForRow({
        raceType,
        finishPosition: finish?.finish_position ?? null,
        elapsedSeconds: finish?.elapsed_seconds ?? null,
        correctedSeconds: finish?.corrected_seconds ?? null,
        outcome: row.outcome,
      }),
      trackSubmissionId: track?.id ?? null,
      trackStatus: track?.status ?? null,
    });

    if (results.length >= limit) break;
  }

  return results;
}
