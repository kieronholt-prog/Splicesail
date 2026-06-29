"use server";

import { applyRaceFleetStartSignal } from "@/lib/sync-race-fleet-start";
import { isPlausibleRaceInstantMs, plausibleRaceInstantError } from "@/lib/plausible-race-instant";
import { getServerAuth } from "@/lib/supabase/auth-cache";
import { revalidatePath } from "next/cache";
import { after } from "next/server";

function managePath(groupId: string, seriesId: string, raceId: string) {
  return `/groups/${groupId}/series/${seriesId}/races/${raceId}/manage`;
}

function seriesPath(groupId: string, seriesId: string) {
  return `/groups/${groupId}/series/${seriesId}`;
}

function revalidateRaceStartViews(groupId: string, seriesId: string, raceId: string) {
  // Defer all path invalidation so Apply returns before RSC revalidation work.
  after(() => {
    revalidatePath(managePath(groupId, seriesId, raceId));
    revalidatePath(seriesPath(groupId, seriesId));
    revalidatePath(`/groups/${groupId}/series/${seriesId}/races/${raceId}/finishes`);
    revalidatePath("/");
  });
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
  if (!isPlausibleRaceInstantMs(startMs)) {
    return { error: plausibleRaceInstantError() };
  }

  const { supabase, user } = await getServerAuth();
  if (!user) return { error: "Not signed in." };

  const staff = await requireStaff(supabase, groupId, user.id);
  if ("error" in staff) return staff;

  const { data: race } = await supabase
    .from("races")
    .select("id, series_id, series:series_id ( group_id )")
    .eq("id", raceId)
    .maybeSingle();

  if (!race || race.series_id !== seriesId) {
    return { error: "Race not found." };
  }

  const seriesNest = race.series as { group_id?: string } | { group_id?: string }[] | null;
  const seriesRow = Array.isArray(seriesNest) ? seriesNest[0] : seriesNest;
  if (!seriesRow?.group_id || seriesRow.group_id !== groupId) {
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

/** RO AP postponement — persisted so phone/watch can show start postponed. */
export async function setRaceFleetStartPostponedAction(input: {
  group_id: string;
  series_id: string;
  race_id: string;
  fleet_id: string;
  postponed: boolean;
}): Promise<{ ok: true; postponed_at_iso: string | null } | { error: string }> {
  const groupId = String(input.group_id ?? "").trim();
  const seriesId = String(input.series_id ?? "").trim();
  const raceId = String(input.race_id ?? "").trim();
  const fleetId = String(input.fleet_id ?? "").trim();

  if (!groupId || !seriesId || !raceId || !fleetId) {
    return { error: "Missing race or fleet context." };
  }

  const { supabase, user } = await getServerAuth();
  if (!user) return { error: "Not signed in." };

  const staff = await requireStaff(supabase, groupId, user.id);
  if ("error" in staff) return staff;

  const { data: race } = await supabase
    .from("races")
    .select("id, series_id, series:series_id ( group_id )")
    .eq("id", raceId)
    .maybeSingle();

  if (!race || race.series_id !== seriesId) {
    return { error: "Race not found." };
  }

  const seriesNest = race.series as { group_id?: string } | { group_id?: string }[] | null;
  const seriesRow = Array.isArray(seriesNest) ? seriesNest[0] : seriesNest;
  if (!seriesRow?.group_id || seriesRow.group_id !== groupId) {
    return { error: "Series not found for this club." };
  }

  const postponedAtIso = input.postponed ? new Date().toISOString() : null;

  const { error } = await supabase
    .from("race_fleets")
    .update({ start_postponed_at: postponedAtIso })
    .eq("id", fleetId)
    .eq("race_id", raceId);

  if (error) return { error: error.message };

  revalidateRaceStartViews(groupId, seriesId, raceId);

  return { ok: true, postponed_at_iso: postponedAtIso };
}
