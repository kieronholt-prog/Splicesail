"use server";

import { getServerAuth } from "@/lib/supabase/auth-cache";
import { recomputeFleetIdForRaceEntry } from "@/lib/recompute-race-entry-fleet";
import type { SupabaseClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function clubAdminRedirect(groupId: string, qs: string): never {
  redirect(`/groups/${groupId}/club-admin?${qs}`);
}

async function requireClubAdmin(supabase: SupabaseClient, groupId: string, userId: string) {
  const { data: row } = await supabase
    .from("group_memberships")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", userId)
    .maybeSingle();

  if (row?.role !== "club_admin") {
    clubAdminRedirect(groupId, `error=${encodeURIComponent("Only club admins can manage ad-hoc result links.")}`);
  }
}

async function resolveOfficialRaceEntryId(
  supabase: SupabaseClient,
  raceId: string,
  userId: string,
  boatId: string,
): Promise<string> {
  const { data: existing } = await supabase
    .from("race_entries")
    .select("id")
    .eq("race_id", raceId)
    .eq("user_id", userId)
    .eq("boat_id", boatId)
    .maybeSingle();

  if (existing?.id) return existing.id;

  const { data: inserted, error } = await supabase
    .from("race_entries")
    .insert({
      race_id: raceId,
      user_id: userId,
      boat_id: boatId,
    })
    .select("id")
    .single();

  if (error || !inserted?.id) {
    throw new Error(error?.message ?? "Could not create the official race entry for linking.");
  }

  return inserted.id;
}

export async function confirmPendingAdhocLinkAction(formData: FormData) {
  const groupId = String(formData.get("group_id") ?? "").trim();
  const seriesId = String(formData.get("series_id") ?? "").trim();
  const raceId = String(formData.get("race_id") ?? "").trim();
  const guestEntryId = String(formData.get("race_guest_entry_id") ?? "").trim();
  const userId = String(formData.get("matched_user_id") ?? "").trim();
  const boatId = String(formData.get("matched_boat_id") ?? "").trim();

  if (
    !groupId ||
    !seriesId ||
    !raceId ||
    !guestEntryId ||
    !userId ||
    !boatId ||
    !UUID_RE.test(seriesId) ||
    !UUID_RE.test(raceId) ||
    !UUID_RE.test(guestEntryId) ||
    !UUID_RE.test(userId) ||
    !UUID_RE.test(boatId)
  ) {
    redirect("/groups?error=" + encodeURIComponent("Missing or invalid link context."));
  }

  const { supabase, user } = await getServerAuth();
  if (!user) redirect("/login");

  await requireClubAdmin(supabase, groupId, user.id);

  const { data: guestRow } = await supabase
    .from("race_guest_entries")
    .select("id, race_id, link_status, pending_matched_user_id, pending_matched_boat_id")
    .eq("id", guestEntryId)
    .maybeSingle();

  if (!guestRow || guestRow.race_id !== raceId) {
    clubAdminRedirect(groupId, `error=${encodeURIComponent("Ad-hoc race entry not found.")}`);
  }

  if (guestRow.link_status !== "pending_admin") {
    clubAdminRedirect(groupId, `error=${encodeURIComponent("That ad-hoc result is no longer pending review.")}`);
  }

  if (guestRow.pending_matched_user_id !== userId || guestRow.pending_matched_boat_id !== boatId) {
    clubAdminRedirect(groupId, `error=${encodeURIComponent("Signup details no longer match this pending link.")}`);
  }

  const { data: raceRow } = await supabase
    .from("races")
    .select("id, series_id, series!inner ( id, group_id )")
    .eq("id", raceId)
    .maybeSingle();

  const seriesRaw = raceRow?.series;
  const series = Array.isArray(seriesRaw) ? seriesRaw[0] : seriesRaw;
  if (!raceRow || raceRow.series_id !== seriesId || series?.group_id !== groupId) {
    clubAdminRedirect(groupId, `error=${encodeURIComponent("Race does not belong to this club.")}`);
  }

  const { data: signup } = await supabase
    .from("series_registration_boats")
    .select("boat_id")
    .eq("series_id", seriesId)
    .eq("user_id", userId)
    .eq("boat_id", boatId)
    .maybeSingle();

  if (!signup) {
    clubAdminRedirect(
      groupId,
      `error=${encodeURIComponent("That hull is no longer on the sailor's series signup.")}`,
    );
  }

  let raceEntryId: string;
  try {
    raceEntryId = await resolveOfficialRaceEntryId(supabase, raceId, userId, boatId);
  } catch (e) {
    clubAdminRedirect(
      groupId,
      `error=${encodeURIComponent(e instanceof Error ? e.message : "Could not prepare official entry.")}`,
    );
  }

  const { error: rpcErr } = await supabase.rpc("confirm_race_guest_entry_link", {
    p_guest_entry_id: guestEntryId,
    p_race_entry_id: raceEntryId,
  });

  if (rpcErr) {
    clubAdminRedirect(groupId, `error=${encodeURIComponent(rpcErr.message)}`);
  }

  await supabase
    .from("race_guest_entries")
    .update({
      pending_matched_user_id: null,
      pending_matched_boat_id: null,
    })
    .eq("id", guestEntryId);

  await recomputeFleetIdForRaceEntry(supabase, { groupId, seriesId }, raceId, userId);

  clubAdminRedirect(groupId, "adhoc_link_confirmed=1");
}

export async function dismissPendingAdhocLinkAction(formData: FormData) {
  const groupId = String(formData.get("group_id") ?? "").trim();
  const guestEntryId = String(formData.get("race_guest_entry_id") ?? "").trim();

  if (!groupId || !guestEntryId || !UUID_RE.test(guestEntryId)) {
    redirect("/groups?error=" + encodeURIComponent("Missing or invalid link context."));
  }

  const { supabase, user } = await getServerAuth();
  if (!user) redirect("/login");

  await requireClubAdmin(supabase, groupId, user.id);

  const { data: guestRow } = await supabase
    .from("race_guest_entries")
    .select(
      `
      id,
      link_status,
      races!inner (
        series!inner ( group_id )
      )
    `,
    )
    .eq("id", guestEntryId)
    .maybeSingle();

  const raceRaw = guestRow?.races;
  const race = Array.isArray(raceRaw) ? raceRaw[0] : raceRaw;
  const seriesRaw = race?.series;
  const series = Array.isArray(seriesRaw) ? seriesRaw[0] : seriesRaw;

  if (!guestRow || series?.group_id !== groupId) {
    clubAdminRedirect(groupId, `error=${encodeURIComponent("Ad-hoc race entry not found.")}`);
  }

  if (guestRow.link_status !== "pending_admin") {
    clubAdminRedirect(groupId, `error=${encodeURIComponent("That ad-hoc result is no longer pending review.")}`);
  }

  const { error } = await supabase
    .from("race_guest_entries")
    .update({
      link_status: "unlinked",
      pending_matched_user_id: null,
      pending_matched_boat_id: null,
    })
    .eq("id", guestEntryId)
    .eq("link_status", "pending_admin");

  if (error) {
    clubAdminRedirect(groupId, `error=${encodeURIComponent(error.message)}`);
  }

  clubAdminRedirect(groupId, "adhoc_link_dismissed=1");
}
