import type { SupabaseClient } from "@supabase/supabase-js";

export type MobileTrackSubmissionRow = {
  id: string;
  activityName: string | null;
  activityStartedAt: string;
  activityEndedAt: string;
  status: string;
  analysisMode: string | null;
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

export async function loadMobileTrackSubmissions(
  supabase: SupabaseClient,
  userId: string,
  limit = 60,
): Promise<MobileTrackSubmissionRow[]> {
  const { data: rows, error } = await supabase
    .from("race_track_submissions")
    .select(
      `
      id,
      activity_name,
      activity_started_at,
      activity_ended_at,
      status,
      analysis_mode,
      race_id,
      race_entry_id,
      races ( name, series ( name ) )
    `,
    )
    .eq("user_id", userId)
    .neq("status", "cancelled")
    .order("activity_started_at", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) {
    console.error("loadMobileTrackSubmissions:", error.message);
    return [];
  }
  if (!rows?.length) return [];

  const readyIds = rows.filter((r) => r.status === "ready").map((r) => r.id);
  const analysisBySubmissionId = new Map<
    string,
    { stats?: Record<string, unknown>; leg_summary?: unknown[]; wind_direction?: number | null }
  >();

  if (readyIds.length > 0) {
    const { data: analysisRows, error: analysisErr } = await supabase
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

  return rows.map((row) => {
    const analysis = analysisBySubmissionId.get(row.id);
    const stats = (analysis?.stats ?? {}) as Record<string, unknown>;
    const legs = Array.isArray(analysis?.leg_summary) ? analysis.leg_summary : [];
    const race = unwrapOne(row.races as { name?: string; series?: { name?: string } | null } | null);
    const series = unwrapOne(race?.series ?? null);

    return {
      id: row.id,
      activityName: row.activity_name,
      activityStartedAt: row.activity_started_at,
      activityEndedAt: row.activity_ended_at,
      status: row.status,
      analysisMode: row.analysis_mode,
      raceId: row.race_id,
      raceEntryId: row.race_entry_id,
      raceName: race?.name ?? null,
      seriesName: series?.name ?? null,
      durationSeconds: num(stats.duration),
      windDirection: analysis?.wind_direction ?? num(stats.windDir),
      legCount: legs.length || null,
      tackCount: num(stats.tackCount),
      gybeCount: num(stats.gybeCount),
    };
  });
}

export async function loadMobileTrackSubmissionDetail(
  supabase: SupabaseClient,
  userId: string,
  submissionId: string,
  appOrigin: string,
): Promise<MobileTrackSubmissionDetail | null> {
  const { data: row, error } = await supabase
    .from("race_track_submissions")
    .select(
      `
      id,
      activity_name,
      activity_started_at,
      activity_ended_at,
      status,
      analysis_mode,
      race_id,
      race_entry_id,
      races ( name, series ( name ) ),
      race_track_analyses ( stats, leg_summary, wind_direction )
    `,
    )
    .eq("id", submissionId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !row) return null;

  const analysis = unwrapOne(
    row.race_track_analyses as
      | { stats?: Record<string, unknown>; leg_summary?: unknown[]; wind_direction?: number | null }
      | null,
  );
  const race = unwrapOne(row.races as { name?: string; series?: { name?: string } | null } | null);
  const series = unwrapOne(race?.series ?? null);
  const stats = (analysis?.stats ?? {}) as Record<string, unknown>;
  const legSummary = Array.isArray(analysis?.leg_summary)
    ? (analysis.leg_summary as Record<string, unknown>[])
    : [];

  return {
    id: row.id,
    activityName: row.activity_name,
    activityStartedAt: row.activity_started_at,
    activityEndedAt: row.activity_ended_at,
    status: row.status,
    analysisMode: row.analysis_mode,
    raceId: row.race_id,
    raceEntryId: row.race_entry_id,
    raceName: race?.name ?? null,
    seriesName: series?.name ?? null,
    durationSeconds: num(stats.duration),
    windDirection: analysis?.wind_direction ?? num(stats.windDir),
    legCount: legSummary.length || null,
    tackCount: num(stats.tackCount),
    gybeCount: num(stats.gybeCount),
    legSummary,
    stats,
    analysisUrl: `${appOrigin.replace(/\/$/, "")}/tracks/${submissionId}/analysis`,
  };
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
