import type { SupabaseClient } from "@supabase/supabase-js";

export type StravaConnection = {
  user_id: string;
  strava_athlete_id: number;
  access_token: string;
  refresh_token: string;
  token_expires_at: string;
  firstname: string | null;
  lastname: string | null;
};

export function stravaConfig() {
  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  if (!clientId || !clientSecret) {
    throw new Error("Missing STRAVA_CLIENT_ID or STRAVA_CLIENT_SECRET");
  }
  return {
    clientId,
    clientSecret,
    redirectUri: `${appUrl.replace(/\/$/, "")}/api/strava/callback`,
  };
}

export async function refreshStravaTokenIfNeeded(
  supabase: SupabaseClient,
  conn: StravaConnection,
): Promise<StravaConnection> {
  const expiresMs = new Date(conn.token_expires_at).getTime();
  if (Number.isFinite(expiresMs) && expiresMs > Date.now() + 60_000) {
    return conn;
  }

  const { clientId, clientSecret } = stravaConfig();
  const res = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: conn.refresh_token,
    }),
  });
  const data = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_at?: number;
    message?: string;
  };
  if (!res.ok || !data.access_token) {
    throw new Error(data.message ?? "Strava token refresh failed");
  }

  const updated: StravaConnection = {
    ...conn,
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? conn.refresh_token,
    token_expires_at: new Date((data.expires_at ?? 0) * 1000).toISOString(),
  };

  await supabase
    .from("user_strava_connections")
    .update({
      access_token: updated.access_token,
      refresh_token: updated.refresh_token,
      token_expires_at: updated.token_expires_at,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", conn.user_id);

  return updated;
}

export async function getStravaConnection(
  supabase: SupabaseClient,
  userId: string,
): Promise<StravaConnection | null> {
  const { data } = await supabase
    .from("user_strava_connections")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return null;
  return refreshStravaTokenIfNeeded(supabase, data as StravaConnection);
}

export async function stravaApiGet<T>(
  conn: StravaConnection,
  path: string,
): Promise<T> {
  const res = await fetch(`https://www.strava.com/api/v3${path}`, {
    headers: { Authorization: `Bearer ${conn.access_token}` },
  });
  const data = (await res.json()) as T & { message?: string };
  if (!res.ok) {
    throw new Error((data as { message?: string }).message ?? `Strava API ${res.status}`);
  }
  return data;
}

export type StravaActivitySummary = {
  id: number;
  name: string;
  type: string;
  start_date: string;
  elapsed_time: number;
  distance: number;
};

export type StravaStream = {
  type: string;
  data: number[];
};

export async function fetchStravaActivities(
  conn: StravaConnection,
  page = 1,
): Promise<StravaActivitySummary[]> {
  const acts = await stravaApiGet<StravaActivitySummary[]>(
    conn,
    `/athlete/activities?page=${page}&per_page=30`,
  );
  return acts.filter((a) => a.type === "Sail" || a.type === "Windsurf");
}

export async function fetchStravaTrackPoints(
  conn: StravaConnection,
  activityId: string | number,
): Promise<{ lat: number; lon: number; time: number }[]> {
  const streams = await stravaApiGet<StravaStream[]>(
    conn,
    `/activities/${activityId}/streams?keys=latlng,time&key_by_type=true`,
  );
  const latlng = streams.find((s) => s.type === "latlng")?.data as [number, number][] | undefined;
  const time = streams.find((s) => s.type === "time")?.data as number[] | undefined;
  if (!latlng?.length || !time?.length) return [];
  const n = Math.min(latlng.length, time.length);
  const pts: { lat: number; lon: number; time: number }[] = [];
  for (let i = 0; i < n; i++) {
    const [lat, lon] = latlng[i];
    pts.push({ lat, lon, time: time[i] });
  }
  return pts;
}
