"use server";

import { applyRaceFleetStartSignal } from "@/lib/sync-race-fleet-start";
import { getServerAuth } from "@/lib/supabase/auth-cache";
import { revalidatePath } from "next/cache";

function managePath(groupId: string, seriesId: string, raceId: string) {
  return `/groups/${groupId}/series/${seriesId}/races/${raceId}/manage`;
}

function seriesPath(groupId: string, seriesId: string) {
  return `/groups/${groupId}/series/${seriesId}`;
}

function revalidateRaceStartViews(groupId: string, seriesId: string, raceId: string) {
  revalidatePath(seriesPath(groupId, seriesId));
  revalidatePath(managePath(groupId, seriesId, raceId));
  revalidatePath(`/groups/${groupId}/series/${seriesId}/races/${raceId}/finishes`);
  revalidatePath("/");
}

async function requireStaff(
  supabase: Awaited<ReturnType<typeof getServerAuth>>["supabase"],
  groupId: string,
  userId: string,
) {
  const { data: m } = await supabase
    .from("group_memberships")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", userId)
    .maybeSingle();
  if (m?.role !== "club_admin" && m?.role !== "race_officer") {
    return { error: "Only club admins and race officers can update start signals." as const };
  }
  return { ok: true as const };
}

/**
 * Persists a fleet start time from the RO start-signals panel.
 * Updates races.scheduled_at when the primary (first) fleet changes.
 */
export async function updateRaceFleetStartSignalAction(input: {
  group_id: string;
  series_id: string;
  race_id: string;
  fleet_id: string;
  start_at_iso: string;
}): Promise<{ ok: true } | { error: string }> {
  const groupId = String(input.group_id ?? "").trim();
  const seriesId = String(input.series_id ?? "").trim();
  const raceId = String(input.race_id ?? "").trim();
  const fleetId = String(input.fleet_id ?? "").trim();
  const startAtIso = String(input.start_at_iso ?? "").trim();

  if (!groupId || !seriesId || !raceId || !fleetId || !startAtIso) {
    return { error: "Missing race or fleet context." };
  }

  const startMs = new Date(startAtIso).getTime();
  if (!Number.isFinite(startMs)) {
    return { error: "Invalid start time." };
  }

  const { supabase, user } = await getServerAuth();
  if (!user) return { error: "Not signed in." };

  const staff = await requireStaff(supabase, groupId, user.id);
  if ("error" in staff) return staff;

  const { data: race } = await supabase
    .from("races")
    .select("id, series_id")
    .eq("id", raceId)
    .maybeSingle();

  if (!race || race.series_id !== seriesId) {
    return { error: "Race not found." };
  }

  const { data: series } = await supabase
    .from("series")
    .select("group_id")
    .eq("id", seriesId)
    .maybeSingle();

  if (!series || series.group_id !== groupId) {
    return { error: "Series not found for this club." };
  }

  const applied = await applyRaceFleetStartSignal(supabase, {
    raceId,
    fleetId,
    startAtIso,
  });
  if ("error" in applied) return applied;

  revalidateRaceStartViews(groupId, seriesId, raceId);

  return { ok: true };
}
