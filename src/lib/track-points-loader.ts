import type { SupabaseClient } from "@supabase/supabase-js";
import { parseFIT, parseGPX } from "@/lib/sailing-analysis";
import { fetchStravaTrackPoints, getStravaConnection } from "@/lib/strava";

export type TrackPointRow = {
  lat: number;
  lon: number;
  time: number;
  hdg?: number;
  heading?: number;
  heel?: number;
  turn?: number;
};

export function normalizeTrackPoints(raw: unknown): TrackPointRow[] {
  if (!Array.isArray(raw)) return [];
  const out: TrackPointRow[] = [];
  for (const p of raw) {
    if (p == null || typeof p !== "object") continue;
    const row = p as {
      lat?: unknown;
      lon?: unknown;
      time?: unknown;
      t?: unknown;
      hdg?: unknown;
      heading?: unknown;
      heel?: unknown;
      turn?: unknown;
    };
    const lat = Number(row.lat);
    const lon = Number(row.lon);
    const time = Number(row.time ?? row.t);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(time)) continue;
    const pt: TrackPointRow = { lat, lon, time };
    const hdg = Number(row.hdg ?? row.heading);
    if (Number.isFinite(hdg)) pt.hdg = hdg;
    const heel = Number(row.heel);
    if (Number.isFinite(heel)) pt.heel = heel;
    const turn = Number(row.turn);
    if (Number.isFinite(turn)) pt.turn = turn;
    out.push(pt);
  }
  return out;
}

async function persistTrackPointsCache(
  supabase: SupabaseClient,
  submissionId: string,
  points: TrackPointRow[],
): Promise<void> {
  if (points.length < 2) return;
  await supabase.rpc("set_track_submission_points_cache", {
    p_submission_id: submissionId,
    p_points: points,
  });
}

export function trackPointsJsonPath(userId: string, externalActivityId: string) {
  return `${userId}/${externalActivityId}.json`;
}

export async function cacheSubmissionTrackPoints(
  supabase: SupabaseClient,
  userId: string,
  sub: {
    id?: string;
    track_source: string;
    external_activity_id: string;
    storage_path: string | null;
  },
): Promise<void> {
  const jsonPath = trackPointsJsonPath(userId, sub.external_activity_id);
  const { data: existing } = await supabase.storage.from("race-tracks").download(jsonPath);
  if (existing) {
    if (sub.id) {
      try {
        const parsed = normalizeTrackPoints(JSON.parse(await existing.text()));
        if (parsed.length >= 2) await persistTrackPointsCache(supabase, sub.id, parsed);
      } catch {
        /* optional db cache */
      }
    }
    return;
  }

  const points = await loadTrackPointsForSubmission(supabase, userId, sub);
  if (points.length < 20) return;

  await supabase.storage.from("race-tracks").upload(jsonPath, JSON.stringify(points), {
    upsert: true,
    contentType: "application/json",
  });

  if (sub.id) {
    await persistTrackPointsCache(supabase, sub.id, points);
  }
}

async function loadTrackPointsFromStorage(
  supabase: SupabaseClient,
  sub: {
    user_id?: string;
    track_source: string;
    external_activity_id: string;
    storage_path: string | null;
  },
  userId: string,
): Promise<TrackPointRow[]> {
  const jsonPath = trackPointsJsonPath(userId, sub.external_activity_id);
  const { data: cached } = await supabase.storage.from("race-tracks").download(jsonPath);
  if (cached) {
    try {
      const parsed = JSON.parse(await cached.text()) as TrackPointRow[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch {
      /* fall through */
    }
  }

  if (!sub.storage_path) return [];

  const { data, error } = await supabase.storage.from("race-tracks").download(sub.storage_path);
  if (error || !data) return [];

  const name = sub.storage_path.toLowerCase();
  if (name.endsWith(".gpx") || name.endsWith(".xml")) {
    const raw = parseGPX(await data.text());
    return raw.filter((p) => p.time != null) as TrackPointRow[];
  }
  if (name.endsWith(".fit")) {
    const raw = parseFIT(await data.arrayBuffer());
    return raw.filter((p) => p.time != null) as TrackPointRow[];
  }
  return [];
}

export async function loadTrackPointsForSubmission(
  supabase: SupabaseClient,
  userId: string,
  sub: {
    track_source: string;
    external_activity_id: string;
    storage_path: string | null;
  },
  opts?: { staffView?: boolean },
): Promise<TrackPointRow[]> {
  const fromStorage = await loadTrackPointsFromStorage(supabase, sub, userId);
  if (fromStorage.length > 0) return fromStorage;

  if (opts?.staffView || sub.track_source !== "strava") return [];

  const conn = await getStravaConnection(supabase, userId);
  if (!conn) return [];
  const pts = await fetchStravaTrackPoints(conn, sub.external_activity_id);
  return pts.filter((p) => Number.isFinite(p.time)) as TrackPointRow[];
}
