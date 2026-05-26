"use server";

import { selectGroupIanaTimeZone } from "@/lib/club-time-server";
import { zonedDatetimeLocalToUtcIso } from "@/lib/club-time";
import { parsePursuitStartIncrementSeconds, normalizeRaceType } from "@/lib/race-type";
import { recomputeAndPersistPursuitSlots } from "@/lib/pursuit-slots-server";
import { getServerAuth } from "@/lib/supabase/auth-cache";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

function seriesPath(groupId: string, seriesId: string, qs?: string) {
  const q = qs ? `?${qs}` : "";
  return `/groups/${groupId}/series/${seriesId}${q}`;
}

function seriesRacePursuitPath(groupId: string, seriesId: string, raceId: string, qs?: string) {
  const q = qs ? `?${qs}` : "";
  return `/groups/${groupId}/series/${seriesId}${q}#race-pursuit-${raceId}`;
}

function managePath(groupId: string, seriesId: string, raceId: string, qs?: string) {
  const q = qs ? `?${qs}` : "";
  return `/groups/${groupId}/series/${seriesId}/races/${raceId}/manage${q}`;
}

export async function savePursuitRaceConfigAction(formData: FormData) {
  const groupId = String(formData.get("group_id") ?? "").trim();
  const seriesId = String(formData.get("series_id") ?? "").trim();
  const raceId = String(formData.get("race_id") ?? "").trim();
  const pursuitFleetId = String(formData.get("pursuit_group_fleet_id") ?? "").trim();
  const rawFirst = String(formData.get("pursuit_first_start_at") ?? "").trim();
  const rawFinish = String(formData.get("pursuit_finish_at") ?? "").trim();
  const increment = parsePursuitStartIncrementSeconds(
    String(formData.get("pursuit_start_increment_seconds") ?? ""),
  );

  const urlErr = (msg: string): never =>
    redirect(seriesRacePursuitPath(groupId, seriesId, raceId, `error=${encodeURIComponent(msg)}`));

  if (!groupId || !seriesId || !raceId) {
    redirect("/groups?error=" + encodeURIComponent("Missing race context."));
  }

  const { supabase, user } = await getServerAuth();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("group_memberships")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (membership?.role !== "club_admin") {
    urlErr("Only club admins can configure pursuit races.");
  }

  const { data: race } = await supabase
    .from("races")
    .select("id, series_id, race_type, results_final")
    .eq("id", raceId)
    .maybeSingle();

  if (!race || race.series_id !== seriesId) {
    redirect(seriesRacePursuitPath(groupId, seriesId, raceId, `error=${encodeURIComponent("Race not found.")}`));
  }

  if (normalizeRaceType(race.race_type) !== "pursuit") {
    urlErr("This race is not a pursuit race.");
  }
  if (race.results_final) {
    urlErr("Race is results-final — pursuit settings are locked.");
  }

  if (!pursuitFleetId) urlErr("Select a fleet for this pursuit race.");
  if (!increment) urlErr("Select a start increment (30 s, 1 min, or 2 min).");

  const tz = await selectGroupIanaTimeZone(supabase, groupId);
  const pursuit_first_start_at = zonedDatetimeLocalToUtcIso(rawFirst, tz);
  const pursuit_finish_at = zonedDatetimeLocalToUtcIso(rawFinish, tz);

  if (!pursuit_first_start_at || !pursuit_finish_at) {
    urlErr("First start and finish times are required (club local date and time).");
  }

  const { data: fleet } = await supabase
    .from("group_fleets")
    .select("id")
    .eq("id", pursuitFleetId)
    .eq("group_id", groupId)
    .maybeSingle();

  if (!fleet) urlErr("Selected fleet is not part of this club.");

  const { error: updErr } = await supabase
    .from("races")
    .update({
      pursuit_group_fleet_id: pursuitFleetId,
      pursuit_first_start_at,
      pursuit_finish_at,
      pursuit_start_increment_seconds: increment,
    })
    .eq("id", raceId);

  if (updErr) urlErr(updErr.message);

  const pyOverridesRaw = String(formData.get("pursuit_py_overrides_json") ?? "").trim();
  if (pyOverridesRaw) {
    try {
      const parsed = JSON.parse(pyOverridesRaw) as Record<string, number>;
      await supabase.from("race_pursuit_py_overrides").delete().eq("race_id", raceId);
      const rows = Object.entries(parsed)
        .filter(([k, v]) => k.trim() && Number.isFinite(v) && v >= 400 && v <= 2500)
        .map(([class_key, py]) => ({ race_id: raceId, class_key: class_key.trim(), py: Math.trunc(py) }));
      if (rows.length) {
        const { error: ovErr } = await supabase.from("race_pursuit_py_overrides").insert(rows);
        if (ovErr) urlErr(ovErr.message);
      }
    } catch {
      urlErr("Invalid PY override data.");
    }
  }

  const slotRes = await recomputeAndPersistPursuitSlots(supabase, { groupId, seriesId, raceId });
  if (slotRes.error) urlErr(slotRes.error);

  revalidatePath(managePath(groupId, seriesId, raceId));
  revalidatePath(seriesPath(groupId, seriesId));
  revalidatePath("/");
  redirect(seriesRacePursuitPath(groupId, seriesId, raceId, "pursuit_saved=1"));
}

export async function updateRaceTypeAction(formData: FormData) {
  const groupId = String(formData.get("group_id") ?? "").trim();
  const seriesId = String(formData.get("series_id") ?? "").trim();
  const raceId = String(formData.get("race_id") ?? "").trim();
  const raceType = normalizeRaceType(String(formData.get("race_type") ?? ""));

  if (!groupId || !seriesId || !raceId) {
    redirect("/groups?error=" + encodeURIComponent("Missing race context."));
  }

  const { supabase, user } = await getServerAuth();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("group_memberships")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (membership?.role !== "club_admin") {
    redirect(seriesPath(groupId, seriesId, `error=${encodeURIComponent("Only club admins can change race type.")}`));
  }

  const { data: race } = await supabase
    .from("races")
    .select("id, series_id, results_final")
    .eq("id", raceId)
    .maybeSingle();

  if (!race || race.series_id !== seriesId) {
    redirect(seriesPath(groupId, seriesId, `error=${encodeURIComponent("Race not found.")}`));
  }
  if (race.results_final) {
    redirect(seriesPath(groupId, seriesId, `error=${encodeURIComponent("Race type is locked (results final).")}`));
  }

  const { error } = await supabase.from("races").update({ race_type: raceType }).eq("id", raceId);
  if (error) {
    redirect(seriesPath(groupId, seriesId, `error=${encodeURIComponent(error.message)}`));
  }

  redirect(seriesPath(groupId, seriesId, "race_type_saved=1"));
}
