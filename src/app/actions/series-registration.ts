"use server";

import { getServerAuth } from "@/lib/supabase/auth-cache";
import { redirect } from "next/navigation";

function groupsClubReturn(groupId: string, query: Record<string, string> = {}): string {
  const params = new URLSearchParams(query);
  const qs = params.toString();
  return qs ? `/groups?${qs}#club-${groupId}` : `/groups#club-${groupId}`;
}

export async function registerForSeriesAction(formData: FormData) {
  const groupId = String(formData.get("group_id") ?? "").trim();
  if (!groupId) {
    redirect("/groups");
  }
  redirect(groupsClubReturn(groupId));
}

export async function withdrawSeriesRegistrationAction(formData: FormData) {
  const groupId = String(formData.get("group_id") ?? "").trim();
  const seriesId = String(formData.get("series_id") ?? "").trim();

  if (!groupId || !seriesId) {
    redirect(
      "/groups?error=" +
        encodeURIComponent("Missing group or series — try again."),
    );
  }

  const { supabase, user } = await getServerAuth();

  if (!user) {
    redirect("/login");
  }

  const { data: racesInSeries } = await supabase.from("races").select("id").eq("series_id", seriesId);

  const ridList = (racesInSeries ?? []).map((r) => r.id).filter(Boolean);
  if (ridList.length > 0) {
    await supabase.from("race_entries").delete().eq("user_id", user.id).in("race_id", ridList);
  }

  const { error } = await supabase
    .from("series_registrations")
    .delete()
    .eq("series_id", seriesId)
    .eq("user_id", user.id);

  if (error) {
    redirect(groupsClubReturn(groupId, { error: error.message }));
  }

  redirect(groupsClubReturn(groupId, { withdrawn: "1" }));
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Remove one boat from a series signup. If it was your last boat, leaves the series (same cleanup as full withdraw). */
export async function withdrawSeriesHullAction(formData: FormData) {
  const groupId = String(formData.get("group_id") ?? "").trim();
  const seriesId = String(formData.get("series_id") ?? "").trim();
  const boatId = String(formData.get("boat_id") ?? "").trim();

  function bail(msg: string) {
    redirect(groupsClubReturn(groupId, { error: msg }));
  }

  if (!groupId || !seriesId || !boatId || !UUID_RE.test(seriesId) || !UUID_RE.test(boatId)) {
    bail("Missing or invalid boat or series.");
  }

  const { supabase, user } = await getServerAuth();

  if (!user) redirect("/login");

  const [{ data: m }, { data: seriesRow }] = await Promise.all([
    supabase.from("group_memberships").select("group_id").eq("group_id", groupId).eq("user_id", user.id).maybeSingle(),
    supabase.from("series").select("id, group_id").eq("id", seriesId).maybeSingle(),
  ]);

  if (!m) bail("You are not a member of this club.");
  if (!seriesRow || seriesRow.group_id !== groupId) bail("Series does not belong to this club.");

  const { data: linkRow } = await supabase
    .from("series_registration_boats")
    .select("boat_id")
    .eq("series_id", seriesId)
    .eq("user_id", user.id)
    .eq("boat_id", boatId)
    .maybeSingle();

  if (!linkRow) bail("That boat is not on your signup for this series.");

  const { count: hullCountBefore } = await supabase
    .from("series_registration_boats")
    .select("boat_id", { count: "exact", head: true })
    .eq("series_id", seriesId)
    .eq("user_id", user.id);

  const nBefore = hullCountBefore ?? 0;

  await supabase
    .from("series_registration_boats")
    .delete()
    .eq("series_id", seriesId)
    .eq("user_id", user.id)
    .eq("boat_id", boatId);

  const { data: racesInSeries } = await supabase.from("races").select("id").eq("series_id", seriesId);

  const ridList = (racesInSeries ?? []).map((r) => r.id).filter(Boolean);

  if (nBefore <= 1) {
    if (ridList.length > 0) {
      await supabase.from("race_entries").delete().eq("user_id", user.id).in("race_id", ridList);
    }
    const { error } = await supabase
      .from("series_registrations")
      .delete()
      .eq("series_id", seriesId)
      .eq("user_id", user.id);
    if (error) bail(error.message);
  } else if (ridList.length > 0) {
    await supabase
      .from("race_entries")
      .update({
        boat_id: null,
        fleet_id: null,
        tally_afloat_at: null,
        tally_ashore_at: null,
        outcome: null,
        sail_number_override: null,
        crew_template_override: null,
      })
      .eq("user_id", user.id)
      .eq("boat_id", boatId)
      .in("race_id", ridList);
  }

  redirect(groupsClubReturn(groupId));
}
