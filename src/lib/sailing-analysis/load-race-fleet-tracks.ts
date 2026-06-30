import type { SupabaseClient } from "@supabase/supabase-js";
import {
  loadTrackPointsForSubmission,
  normalizeTrackPoints,
} from "@/lib/track-points-loader";
import { resolveSubmissionRaceFleetId } from "@/lib/sailing-analysis/race-fleet-analysis-settings";

/** Max points per track when loading map overlays (keeps RSC payloads small). */
export const FLEET_TRACK_MAP_PREVIEW_MAX_POINTS = 500;

export const FLEET_TRACK_PALETTE = [
  "#e879f9",
  "#38bdf8",
  "#fb7185",
  "#a3e635",
  "#fbbf24",
  "#c084fc",
  "#2dd4bf",
  "#f97316",
  "#818cf8",
  "#4ade80",
];

export type FleetTrackOverlay = {
  id: string;
  label: string;
  color: string;
  points: { lat: number; lon: number; time?: number | null }[];
};

type FleetSubmissionRow = {
  id: string;
  user_id: string;
  race_entry_id: string | null;
  activity_name: string | null;
  track_source: string;
  external_activity_id: string;
  storage_path: string | null;
  track_points_cache: unknown;
  boat_id: string | null;
  boats:
    | { default_sail_number: string | null; label: string | null }
    | { default_sail_number: string | null; label: string | null }[]
    | null;
};

function downsampleTrackPoints<T extends { lat: number; lon: number }>(
  points: T[],
  maxPoints: number,
): T[] {
  if (points.length <= maxPoints) return points;
  const step = Math.ceil(points.length / maxPoints);
  const out: T[] = [];
  for (let i = 0; i < points.length; i += step) out.push(points[i]!);
  const last = points[points.length - 1]!;
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

async function resolveFleetTrackPoints(
  supabase: SupabaseClient,
  sub: FleetSubmissionRow,
): Promise<{ lat: number; lon: number; time: number }[]> {
  const cached = normalizeTrackPoints(sub.track_points_cache);
  if (cached.length >= 2) return cached;

  const fromStorage = await loadTrackPointsForSubmission(supabase, sub.user_id, sub, { staffView: true });
  if (fromStorage.length >= 2) {
    try {
      await supabase.rpc("set_track_submission_points_cache", {
        p_submission_id: sub.id,
        p_points: fromStorage,
      });
    } catch {
      /* db cache optional until migration applied */
    }
    return fromStorage;
  }

  return [];
}

function submissionMatchesFleet(
  subFleetId: string | null,
  filterFleetId: string | null | undefined,
): boolean {
  if (filterFleetId === undefined) return true;
  return subFleetId === filterFleetId;
}

export async function loadRaceFleetTracks(
  supabase: SupabaseClient,
  raceId: string,
  opts?: {
    statuses?: string[];
    /** When set, only tracks for entries in this race_fleet (null = no fleet assigned). */
    raceFleetId?: string | null;
  },
): Promise<FleetTrackOverlay[]> {
  const statuses = opts?.statuses ?? ["pending_ro", "ready"];

  const { data: subs, error } = await supabase
    .from("race_track_submissions")
    .select(
      `
      id,
      user_id,
      race_entry_id,
      activity_name,
      track_source,
      external_activity_id,
      storage_path,
      track_points_cache,
      boat_id,
      boats:boat_id ( default_sail_number, label )
    `,
    )
    .eq("race_id", raceId)
    .eq("analysis_mode", "collated")
    .in("status", statuses)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("loadRaceFleetTracks:", error.message);
    return [];
  }

  const out: FleetTrackOverlay[] = [];
  let colorIndex = 0;

  for (const raw of subs ?? []) {
    const sub = raw as FleetSubmissionRow;
    const subFleetId = await resolveSubmissionRaceFleetId(supabase, sub);
    if (!submissionMatchesFleet(subFleetId, opts?.raceFleetId)) continue;

    const points = await resolveFleetTrackPoints(supabase, sub);
    if (points.length < 2) continue;

    const boat = Array.isArray(sub.boats) ? sub.boats[0] : sub.boats;
    const sail = boat?.default_sail_number?.trim();
    const boatName = boat?.label?.trim();
    const label =
      sail && boatName
        ? `${sail} · ${boatName}`
        : sail || boatName || sub.activity_name || `Track ${colorIndex + 1}`;

    out.push({
      id: sub.id,
      label,
      color: FLEET_TRACK_PALETTE[colorIndex % FLEET_TRACK_PALETTE.length],
      points: downsampleTrackPoints(points, FLEET_TRACK_MAP_PREVIEW_MAX_POINTS),
    });
    colorIndex++;
  }

  return out;
}

/** Pending collated submission counts per race_fleet_id (null key = unassigned). */
export async function countPendingCollatedByFleet(
  supabase: SupabaseClient,
  raceId: string,
): Promise<Map<string | null, number>> {
  const { data: subs, error } = await supabase
    .from("race_track_submissions")
    .select("id, race_entry_id, user_id, boat_id, race_id")
    .eq("race_id", raceId)
    .eq("analysis_mode", "collated")
    .eq("status", "pending_ro");

  if (error) {
    console.error("countPendingCollatedByFleet:", error.message);
    return new Map();
  }

  const counts = new Map<string | null, number>();
  for (const sub of subs ?? []) {
    const fleetId = await resolveSubmissionRaceFleetId(supabase, sub);
    counts.set(fleetId, (counts.get(fleetId) ?? 0) + 1);
  }
  return counts;
}
