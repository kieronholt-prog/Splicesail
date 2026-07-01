import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

export type MobileTrackSubmissionRow = {
  id: string;
  activityName: string | null;
  activityStartedAt: string;
  activityEndedAt: string;
  status: string;
  analysisMode: string | null;
  trackSource: string;
  raceId: string | null;
  raceEntryId: string | null;
  raceName: string | null;
  seriesName: string | null;
  durationSeconds: number | null;
  windDirection: number | null;
  legCount: number | null;
  tackCount: number | null;
  gybeCount: number | null;
};

export type MobileTrackSubmissionDetail = MobileTrackSubmissionRow & {
  legSummary: Record<string, unknown>[];
  stats: Record<string, unknown>;
  analysisUrl: string;
};

function unwrapOne<T>(rel: T | T[] | null | undefined): T | null {
  if (rel == null) return null;
  return Array.isArray(rel) ? rel[0] ?? null : rel;
}

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Verified mobile reads — service role scoped to JWT user id (same rows as web /tracks). */
function mobileTrackClient(): SupabaseClient {
  return createAdminClient();
}

type TrackRow = {
  id: string;
  activity_name: string | null;
  activity_started_at: string;
  activity_ended_at: string;
  status: string;
  analysis_mode: string | null;
  track_source: string;
  race_id: string | null;
  race_entry_id: string | null;
};

async function loadRaceLabels(
  client: SupabaseClient,
  raceIds: string[],
): Promise<Map<string, { raceName: string | null; seriesName: string | null }>> {
  const out = new Map<string, { raceName: string | null; seriesName: string | null }>();
  if (!raceIds.length) return out;

  const { data: raceRows, error } = await client
    .from("races")
    .select("id, name, series ( name )")
    .in("id", raceIds);

  if (error) {
    console.error("loadMobileTrackSubmissions race labels:", error.message);
    return out;
  }

  for (const row of raceRows ?? []) {
    const series = unwrapOne(row.series as { name?: string } | { name?: string }[] | null);
    out.set(row.id, {
      raceName: row.name ?? null,
      seriesName: series?.name ?? null,
    });
  }
  return out;
}

export async function loadMobileTrackSubmissions(
  _supabase: SupabaseClient,
  userId: string,
  limit = 100,
): Promise<MobileTrackSubmissionRow[]> {
  const client = mobileTrackClient();
  const { data: rows, error } = await client
    .from("race_track_submissions")
    .select(
      "id, activity_name, activity_started_at, activity_ended_at, status, analysis_mode, track_source, race_id, race_entry_id",
    )
    .eq("user_id", userId)
    .neq("status", "cancelled")
    .order("activity_started_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("loadMobileTrackSubmissions:", error.message);
    throw new Error(error.message);
  }
  if (!rows?.length) return [];

  const raceIds = [...new Set(rows.map((r) => r.race_id).filter(Boolean))] as string[];
  const raceLabels = await loadRaceLabels(client, raceIds);

  const readyIds = rows.filter((r) => r.status === "ready").map((r) => r.id);
  const analysisBySubmissionId = new Map<
    string,
    { stats?: Record<string, unknown>; leg_summary?: unknown[]; wind_direction?: number | null }
  >();

  if (readyIds.length > 0) {
    const { data: analysisRows, error: analysisErr } = await client
      .from("race_track_analyses")
      .select("submission_id, stats, leg_summary, wind_direction")
      .in("submission_id", readyIds);

    if (analysisErr) {
      console.error("loadMobileTrackSubmissions analyses:", analysisErr.message);
    } else {
      for (const row of analysisRows ?? []) {
        if (row.submission_id) {
          analysisBySubmissionId.set(row.submission_id, row);
        }
      }
    }
  }

  return rows.map((row) => mapTrackRow(row, raceLabels, analysisBySubmissionId));
}

function mapTrackRow(
  row: TrackRow,
  raceLabels: Map<string, { raceName: string | null; seriesName: string | null }>,
  analysisBySubmissionId: Map<
    string,
    { stats?: Record<string, unknown>; leg_summary?: unknown[]; wind_direction?: number | null }
  >,
): MobileTrackSubmissionRow {
  const analysis = analysisBySubmissionId.get(row.id);
  const stats = (analysis?.stats ?? {}) as Record<string, unknown>;
  const legs = Array.isArray(analysis?.leg_summary) ? analysis.leg_summary : [];
  const labels = row.race_id ? raceLabels.get(row.race_id) : undefined;

  return {
    id: row.id,
    activityName: row.activity_name,
    activityStartedAt: row.activity_started_at,
    activityEndedAt: row.activity_ended_at,
    status: row.status,
    analysisMode: row.analysis_mode,
    trackSource: row.track_source,
    raceId: row.race_id,
    raceEntryId: row.race_entry_id,
    raceName: labels?.raceName ?? null,
    seriesName: labels?.seriesName ?? null,
    durationSeconds: num(stats.duration),
    windDirection: analysis?.wind_direction ?? num(stats.windDir),
    legCount: legs.length || null,
    tackCount: num(stats.tackCount),
    gybeCount: num(stats.gybeCount),
  };
}

export async function loadMobileTrackSubmissionDetail(
  _supabase: SupabaseClient,
  userId: string,
  submissionId: string,
  appOrigin: string,
): Promise<MobileTrackSubmissionDetail | null> {
  const client = mobileTrackClient();
  const { data: row, error } = await client
    .from("race_track_submissions")
    .select(
      "id, activity_name, activity_started_at, activity_ended_at, status, analysis_mode, track_source, race_id, race_entry_id",
    )
    .eq("id", submissionId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("loadMobileTrackSubmissionDetail:", error.message);
    throw new Error(error.message);
  }
  if (!row) return null;

  const raceLabels = row.race_id
    ? await loadRaceLabels(client, [row.race_id])
    : new Map<string, { raceName: string | null; seriesName: string | null }>();

  const analysisBySubmissionId = new Map<
    string,
    { stats?: Record<string, unknown>; leg_summary?: unknown[]; wind_direction?: number | null }
  >();

  if (row.status === "ready") {
    const { data: analysisRow, error: analysisErr } = await client
      .from("race_track_analyses")
      .select("submission_id, stats, leg_summary, wind_direction")
      .eq("submission_id", submissionId)
      .maybeSingle();

    if (analysisErr) {
      console.error("loadMobileTrackSubmissionDetail analysis:", analysisErr.message);
    } else if (analysisRow?.submission_id) {
      analysisBySubmissionId.set(analysisRow.submission_id, analysisRow);
    }
  }

  const summary = mapTrackRow(row, raceLabels, analysisBySubmissionId);
  const analysis = analysisBySubmissionId.get(row.id);
  const stats = (analysis?.stats ?? {}) as Record<string, unknown>;
  const legSummary = Array.isArray(analysis?.leg_summary)
    ? (analysis.leg_summary as Record<string, unknown>[])
    : [];

  return {
    ...summary,
    legSummary,
    stats,
    analysisUrl: `${appOrigin.replace(/\/$/, "")}/tracks/${submissionId}/analysis`,
  };
}

/** Index track submissions for results linking (Strava + upload). */
export async function loadUserTrackLinks(userId: string): Promise<{
  byEntryId: Map<string, { id: string; status: string }>;
  byRaceBoat: Map<string, { id: string; status: string }>;
}> {
  const client = mobileTrackClient();
  const { data: trackRows, error } = await client
    .from("race_track_submissions")
    .select("id, race_entry_id, race_id, boat_id, status")
    .eq("user_id", userId)
    .neq("status", "cancelled");

  if (error) {
    console.error("loadUserTrackLinks:", error.message);
    return { byEntryId: new Map(), byRaceBoat: new Map() };
  }

  const byEntryId = new Map<string, { id: string; status: string }>();
  const byRaceBoat = new Map<string, { id: string; status: string }>();
  for (const t of trackRows ?? []) {
    const link = { id: t.id, status: t.status };
    if (t.race_entry_id) {
      byEntryId.set(t.race_entry_id, link);
    }
    if (t.race_id && t.boat_id) {
      byRaceBoat.set(`${t.race_id}:${t.boat_id}`, link);
    }
  }
  return { byEntryId, byRaceBoat };
}

export function resolveTrackLink(
  links: { byEntryId: Map<string, { id: string; status: string }>; byRaceBoat: Map<string, { id: string; status: string }> },
  raceEntryId: string,
  raceId: string,
  boatId: string,
): { id: string; status: string } | undefined {
  return (
    links.byEntryId.get(raceEntryId) ??
    links.byRaceBoat.get(`${raceId}:${boatId}`)
  );
}

export type CreateMobileTrackBody = {
  raceEntryId: string;
  activityStartedAt: string;
  activityEndedAt: string;
  activityName?: string;
  localSessionId?: string;
  garminActivityExternalId?: string;
};

export async function createMobileTrackSubmission(
  supabase: SupabaseClient,
  userId: string,
  body: CreateMobileTrackBody,
): Promise<{ ok: true; submissionId: string } | { ok: false; error: string }> {
  const raceEntryId = body.raceEntryId.trim();
  if (!raceEntryId) return { ok: false, error: "raceEntryId is required." };

  const startedMs = new Date(body.activityStartedAt).getTime();
  const endedMs = new Date(body.activityEndedAt).getTime();
  if (!Number.isFinite(startedMs) || !Number.isFinite(endedMs) || endedMs <= startedMs) {
    return { ok: false, error: "Invalid activity start or end time." };
  }

  const { data: entry, error: entryErr } = await supabase
    .from("race_entries")
    .select(
      `
      id,
      race_id,
      boat_id,
      user_id,
      races ( series_id, series ( group_id ) )
    `,
    )
    .eq("id", raceEntryId)
    .eq("user_id", userId)
    .maybeSingle();

  if (entryErr || !entry?.race_id) {
    return { ok: false, error: "Race entry not found." };
  }

  const race = unwrapOne(
    entry.races as unknown as
      | { series_id: string; series?: { group_id: string } | null }
      | { series_id: string; series?: { group_id: string } | null }[]
      | null,
  );
  const series = unwrapOne(race?.series ?? null);
  const groupId = series?.group_id;
  if (!groupId) return { ok: false, error: "Could not resolve club for this race." };

  const externalId =
    body.garminActivityExternalId?.trim() ||
    (body.localSessionId?.trim() ? `phone-session-${body.localSessionId.trim()}` : "") ||
    `phone-session-${raceEntryId}-${startedMs}`;

  const activityName =
    body.activityName?.trim() ||
    `Splice Phone — ${new Date(startedMs).toISOString().slice(0, 10)}`;

  const { data: sub, error } = await supabase
    .from("race_track_submissions")
    .upsert(
      {
        user_id: userId,
        group_id: groupId,
        race_id: entry.race_id,
        race_entry_id: entry.id,
        boat_id: entry.boat_id,
        track_source: "upload",
        external_activity_id: externalId,
        activity_name: activityName,
        activity_started_at: new Date(startedMs).toISOString(),
        activity_ended_at: new Date(endedMs).toISOString(),
        status: "draft",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,external_activity_id" },
    )
    .select("id")
    .single();

  if (error || !sub) {
    return { ok: false, error: error?.message ?? "Could not save track submission." };
  }

  return { ok: true, submissionId: sub.id };
}
