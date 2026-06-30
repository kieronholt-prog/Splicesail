import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveSubmissionRaceFleetId } from "@/lib/sailing-analysis/race-fleet-analysis-settings";

export type MobileFleetAnalysisPeer = {
  submissionId: string;
  userId: string;
  raceEntryId: string | null;
  sailNumber: string;
  boatLabel: string | null;
  activityName: string | null;
  durationSeconds: number | null;
  windDirection: number | null;
  finishPosition: number | null;
  elapsedSeconds: number | null;
  finishDisplay: string;
};

function unwrapOne<T>(rel: T | T[] | null | undefined): T | null {
  if (rel == null) return null;
  return Array.isArray(rel) ? rel[0] ?? null : rel;
}

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function finishDisplay(position: number | null, elapsed: number | null): string {
  if (position != null) return String(position);
  if (elapsed != null && Number.isFinite(elapsed)) {
    const m = Math.floor(elapsed / 60);
    const s = Math.floor(elapsed % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  }
  return "—";
}

/**
 * Ready collated analyses for the same race + fleet as the requesting user's entry.
 * Respects share_track_for_enhanced_analytics on peer profiles.
 */
export async function loadMobileFleetAnalyses(
  supabase: SupabaseClient,
  userId: string,
  raceId: string,
  opts?: { raceEntryId?: string; raceFleetId?: string | null },
): Promise<{
  raceId: string;
  raceFleetId: string | null;
  windDirection: number | null;
  peers: MobileFleetAnalysisPeer[];
  mySubmissionId: string | null;
}> {
  let fleetId = opts?.raceFleetId ?? null;
  let mySubmissionId: string | null = null;

  if (opts?.raceEntryId) {
    const { data: myEntry } = await supabase
      .from("race_entries")
      .select("id, fleet_id")
      .eq("id", opts.raceEntryId)
      .eq("user_id", userId)
      .maybeSingle();
    if (myEntry?.fleet_id) fleetId = myEntry.fleet_id;
  }

  const { data: mySub } = await supabase
    .from("race_track_submissions")
    .select("id, race_entry_id")
    .eq("user_id", userId)
    .eq("race_id", raceId)
    .eq("analysis_mode", "collated")
    .eq("status", "ready")
    .maybeSingle();

  if (mySub) {
    mySubmissionId = mySub.id;
    if (!fleetId && mySub.race_entry_id) {
      const { data: entry } = await supabase
        .from("race_entries")
        .select("fleet_id")
        .eq("id", mySub.race_entry_id)
        .maybeSingle();
      fleetId = entry?.fleet_id ?? null;
    }
  }

  let fleetWind: number | null = null;
  if (fleetId) {
    const { data: settings } = await supabase
      .from("race_fleet_analysis_settings")
      .select("wind_direction")
      .eq("race_id", raceId)
      .eq("race_fleet_id", fleetId)
      .maybeSingle();
    fleetWind = settings?.wind_direction ?? null;
  }

  const { data: subs } = await supabase
    .from("race_track_submissions")
    .select(
      `
      id,
      user_id,
      race_entry_id,
      activity_name,
      race_track_analyses ( stats, wind_direction ),
      race_entries (
        boats ( default_sail_number, label ),
        race_finishes ( finish_position, elapsed_seconds )
      )
    `,
    )
    .eq("race_id", raceId)
    .eq("analysis_mode", "collated")
    .eq("status", "ready");

  const peers: MobileFleetAnalysisPeer[] = [];

  for (const sub of subs ?? []) {
    if (sub.user_id === userId) continue;

    const subFleetId = await resolveSubmissionRaceFleetId(supabase, sub);
    if (fleetId != null && subFleetId !== fleetId) continue;

    const { data: profile } = await supabase
      .from("profiles")
      .select("share_track_for_enhanced_analytics")
      .eq("id", sub.user_id)
      .maybeSingle();

    if (profile?.share_track_for_enhanced_analytics === false) continue;

    const entry = unwrapOne(
      sub.race_entries as
        | {
            boats?: { default_sail_number?: string | null; label?: string | null } | null;
            race_finishes?: { finish_position?: number | null; elapsed_seconds?: number | null } | null;
          }
        | null,
    );
    const boat = unwrapOne(entry?.boats ?? null);
    const finish = unwrapOne(entry?.race_finishes ?? null);
    const analysis = unwrapOne(
      sub.race_track_analyses as { stats?: Record<string, unknown>; wind_direction?: number | null } | null,
    );
    const stats = (analysis?.stats ?? {}) as Record<string, unknown>;

    peers.push({
      submissionId: sub.id,
      userId: sub.user_id,
      raceEntryId: sub.race_entry_id,
      sailNumber: boat?.default_sail_number?.trim() || "—",
      boatLabel: boat?.label?.trim() || null,
      activityName: sub.activity_name,
      durationSeconds: num(stats.duration),
      windDirection: analysis?.wind_direction ?? num(stats.windDir),
      finishPosition: finish?.finish_position ?? null,
      elapsedSeconds: finish?.elapsed_seconds ?? null,
      finishDisplay: finishDisplay(finish?.finish_position ?? null, finish?.elapsed_seconds ?? null),
    });
  }

  peers.sort((a, b) => {
    const ap = a.finishPosition ?? 999;
    const bp = b.finishPosition ?? 999;
    if (ap !== bp) return ap - bp;
    return a.sailNumber.localeCompare(b.sailNumber);
  });

  return {
    raceId,
    raceFleetId: fleetId,
    windDirection: fleetWind,
    peers,
    mySubmissionId,
  };
}

export async function loadComparePair(
  supabase: SupabaseClient,
  userId: string,
  leftSubmissionId: string,
  rightSubmissionId: string,
) {
  const ids = [leftSubmissionId, rightSubmissionId];
  const { data: rows } = await supabase
    .from("race_track_submissions")
    .select(
      `
      id,
      user_id,
      activity_name,
      activity_started_at,
      race_id,
      analysis_mode,
      status,
      race_entry_id,
      race_track_analyses ( stats, leg_summary, wind_direction ),
      race_entries ( boats ( default_sail_number, label ) )
    `,
    )
    .in("id", ids)
    .eq("status", "ready");

  const byId = new Map((rows ?? []).map((r) => [r.id, r]));
  const left = byId.get(leftSubmissionId);
  const right = byId.get(rightSubmissionId);
  if (!left || !right) return null;
  if (left.race_id !== right.race_id) return null;

  type SubmissionRow = NonNullable<typeof rows>[number];

  const canRead = async (sub: SubmissionRow) => {
    if (sub.user_id === userId) return true;
    if (sub.analysis_mode !== "collated") return false;
    const { data: profile } = await supabase
      .from("profiles")
      .select("share_track_for_enhanced_analytics")
      .eq("id", sub.user_id)
      .maybeSingle();
    return profile?.share_track_for_enhanced_analytics !== false;
  };

  if (!(await canRead(left)) || !(await canRead(right))) return null;

  function toInput(sub: SubmissionRow) {
    const analysis = unwrapOne(
      sub.race_track_analyses as
        | { stats?: Record<string, unknown>; leg_summary?: unknown[]; wind_direction?: number | null }
        | null,
    );
    const entry = unwrapOne(sub.race_entries as { boats?: unknown } | null);
    const boat = unwrapOne(
      entry?.boats as { default_sail_number?: string | null; label?: string | null } | null,
    );
    const sail = boat?.default_sail_number?.trim() || boat?.label?.trim() || sub.activity_name || "Boat";
    return {
      label: sail,
      subtitle: sub.activity_started_at
        ? new Date(sub.activity_started_at).toLocaleString("en-GB", {
            dateStyle: "medium",
            timeStyle: "short",
          })
        : "",
      stats: (analysis?.stats ?? {}) as Record<string, unknown>,
      legSummary: Array.isArray(analysis?.leg_summary)
        ? (analysis.leg_summary as Record<string, unknown>[])
        : [],
      windDirection: analysis?.wind_direction ?? null,
    };
  }

  return { left: toInput(left), right: toInput(right) };
}
