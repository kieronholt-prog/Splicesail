import { SERIES_ICAL_DEFAULT_DURATION_MS } from "@/lib/series-ical";
import type { SupabaseClient } from "@supabase/supabase-js";

export function raceCalendarUid(raceId: string): string {
  return `${raceId}@splice`;
}

export type RaceCalendarTombstoneSource = {
  id: string;
  name: string;
  scheduled_at: string;
};

export function raceCalendarTombstoneRows(
  races: RaceCalendarTombstoneSource[],
  opts: { groupId: string; seriesId: string; seriesName: string },
) {
  return races.map((r) => {
    const startUtc = new Date(r.scheduled_at);
    const endUtc = new Date(startUtc.getTime() + SERIES_ICAL_DEFAULT_DURATION_MS);
    return {
      uid: raceCalendarUid(r.id),
      series_id: opts.seriesId,
      group_id: opts.groupId,
      summary: `${opts.seriesName} — ${r.name}`,
      start_utc: startUtc.toISOString(),
      end_utc: endUtc.toISOString(),
    };
  });
}

/** Upsert tombstones so subscribed calendars can emit STATUS:CANCELLED for removed races. */
export async function recordRaceCalendarTombstones(
  supabase: SupabaseClient,
  races: RaceCalendarTombstoneSource[],
  opts: { groupId: string; seriesId: string; seriesName: string },
): Promise<{ error?: string }> {
  if (races.length === 0) return {};
  const rows = raceCalendarTombstoneRows(races, opts);
  const { error } = await supabase.from("calendar_event_tombstones").upsert(rows, { onConflict: "uid" });
  if (error) return { error: error.message };
  return {};
}

export type CalendarTombstoneRow = {
  uid: string;
  summary: string;
  start_utc: string;
  end_utc: string;
  cancelled_at: string;
};

export async function loadSeriesCalendarTombstones(
  supabase: SupabaseClient,
  seriesId: string,
): Promise<{ rows: CalendarTombstoneRow[]; error?: string }> {
  const { data, error } = await supabase
    .from("calendar_event_tombstones")
    .select("uid, summary, start_utc, end_utc, cancelled_at")
    .eq("series_id", seriesId);
  if (error) return { rows: [], error: error.message };
  return { rows: (data ?? []) as CalendarTombstoneRow[] };
}
