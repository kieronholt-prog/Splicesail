import { loadSeriesCalendarTombstones, raceCalendarUid } from "@/lib/calendar-event-tombstone";
import { raceTypeLabel, normalizeRaceType } from "@/lib/race-type";
import {
  buildSeriesIcalendar,
  SERIES_ICAL_DEFAULT_DURATION_MS,
  type SeriesIcalEvent,
} from "@/lib/series-ical";
import type { SupabaseClient } from "@supabase/supabase-js";

export type SeriesCalendarRaceRow = {
  id: string;
  name: string;
  scheduled_at: string;
  race_type?: string | null;
};

export type SeriesCalendarTombstoneRow = {
  uid: string;
  summary: string;
  start_utc: string;
  end_utc: string;
};

export type SeriesCalendarSource = {
  calendarName: string;
  clubName: string;
  seriesName: string;
  races: SeriesCalendarRaceRow[];
  tombstones: SeriesCalendarTombstoneRow[];
};

export function buildSeriesCalendarEvents(source: SeriesCalendarSource): SeriesIcalEvent[] {
  const { clubName, seriesName } = source;

  const activeEvents: SeriesIcalEvent[] = source.races
    .filter((r) => r.scheduled_at && !Number.isNaN(new Date(r.scheduled_at).getTime()))
    .map((r) => {
      const startUtc = new Date(r.scheduled_at);
      const endUtc = new Date(startUtc.getTime() + SERIES_ICAL_DEFAULT_DURATION_MS);
      const raceKind = raceTypeLabel(normalizeRaceType(r.race_type));
      return {
        uid: raceCalendarUid(r.id),
        summary: `${seriesName} — ${r.name}`,
        description: `${clubName} · ${seriesName} · ${raceKind}`,
        location: clubName,
        startUtc,
        endUtc,
        lastModifiedUtc: startUtc,
      };
    });

  const activeUids = new Set(activeEvents.map((e) => e.uid));
  const cancelledEvents: SeriesIcalEvent[] = source.tombstones
    .filter((t) => !activeUids.has(t.uid))
    .map((t) => ({
      uid: t.uid,
      summary: t.summary,
      location: clubName,
      startUtc: new Date(t.start_utc),
      endUtc: new Date(t.end_utc),
      cancelled: true as const,
      sequence: 1,
      lastModifiedUtc: new Date(t.end_utc),
    }));

  return [...activeEvents, ...cancelledEvents];
}

export function buildSeriesCalendarIcsBody(
  source: SeriesCalendarSource,
  opts?: { refreshIntervalHours?: number },
): string {
  return buildSeriesIcalendar({
    calendarName: source.calendarName,
    events: buildSeriesCalendarEvents(source),
    refreshIntervalHours: opts?.refreshIntervalHours,
  });
}

export function safeSeriesCalendarFilename(seriesName: string): string {
  return seriesName.replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-") || "series";
}

type FeedPayloadJson = {
  calendar_name: string;
  club_name: string;
  series_name: string;
  races: SeriesCalendarRaceRow[];
  tombstones: SeriesCalendarTombstoneRow[];
};

export function seriesCalendarSourceFromFeedPayload(payload: FeedPayloadJson): SeriesCalendarSource {
  return {
    calendarName: payload.calendar_name,
    clubName: payload.club_name,
    seriesName: payload.series_name,
    races: payload.races ?? [],
    tombstones: payload.tombstones ?? [],
  };
}

export async function fetchSeriesCalendarFeedPayload(
  supabase: SupabaseClient,
  token: string,
): Promise<SeriesCalendarSource | null> {
  const { data, error } = await supabase.rpc("series_calendar_feed_payload", { p_token: token });
  if (error || !data) return null;
  return seriesCalendarSourceFromFeedPayload(data as FeedPayloadJson);
}

export async function getOrCreateSeriesCalendarFeedToken(
  supabase: SupabaseClient,
  opts: { userId: string; groupId: string; seriesId: string },
): Promise<{ token: string | null; error?: string }> {
  const { userId, groupId, seriesId } = opts;

  const { data: existing, error: existingErr } = await supabase
    .from("series_calendar_feeds")
    .select("token")
    .eq("user_id", userId)
    .eq("series_id", seriesId)
    .maybeSingle();

  if (existingErr) return { token: null, error: existingErr.message };
  if (existing?.token) return { token: existing.token };

  const { data: inserted, error: insertErr } = await supabase
    .from("series_calendar_feeds")
    .insert({ user_id: userId, group_id: groupId, series_id: seriesId })
    .select("token")
    .single();

  if (insertErr) return { token: null, error: insertErr.message };
  return { token: inserted.token };
}

export async function revokeSeriesCalendarFeedToken(
  supabase: SupabaseClient,
  opts: { userId: string; seriesId: string },
): Promise<{ error?: string }> {
  const { error } = await supabase
    .from("series_calendar_feeds")
    .delete()
    .eq("user_id", opts.userId)
    .eq("series_id", opts.seriesId);
  if (error) return { error: error.message };
  return {};
}

export async function loadSeriesCalendarSourceForMember(
  supabase: SupabaseClient,
  opts: { groupId: string; seriesId: string },
): Promise<{ source: SeriesCalendarSource | null; error?: string }> {
  const [{ data: series }, { data: group }, { data: races }, { rows: tombstoneRows }] = await Promise.all([
    supabase.from("series").select("id, group_id, name").eq("id", opts.seriesId).maybeSingle(),
    supabase.from("groups").select("name").eq("id", opts.groupId).maybeSingle(),
    supabase
      .from("races")
      .select("id, name, scheduled_at, race_type")
      .eq("series_id", opts.seriesId)
      .order("scheduled_at", { ascending: true }),
    loadSeriesCalendarTombstones(supabase, opts.seriesId),
  ]);

  if (!series || series.group_id !== opts.groupId) {
    return { source: null, error: "Series not found." };
  }

  const clubName = group?.name ?? "Club";
  return {
    source: {
      calendarName: `${series.name} — ${clubName}`,
      clubName,
      seriesName: series.name,
      races: (races ?? []) as SeriesCalendarRaceRow[],
      tombstones: tombstoneRows.map((t) => ({
        uid: t.uid,
        summary: t.summary,
        start_utc: t.start_utc,
        end_utc: t.end_utc,
      })),
    },
  };
}
