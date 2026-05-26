"use server";

import { getServerAuth } from "@/lib/supabase/auth-cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";

function seriesDetailPath(groupId: string, seriesId: string, qs?: string) {
  const q = qs ? `?${qs}` : "";
  return `/groups/${groupId}/series/${seriesId}${q}`;
}

async function requireClubAdmin(
  supabase: SupabaseClient,
  groupId: string,
  seriesId: string,
  userId: string,
) {
  const { data: m } = await supabase
    .from("group_memberships")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", userId)
    .maybeSingle();

  if (m?.role !== "club_admin") {
    redirect(
      seriesDetailPath(
        groupId,
        seriesId,
        `error=${encodeURIComponent("Only club admins can mark results final.")}`,
      ),
    );
  }
}

export async function updateRaceSignalsAction(formData: FormData) {
  const groupId = String(formData.get("group_id") ?? "").trim();
  const seriesId = String(formData.get("series_id") ?? "").trim();
  const raceId = String(formData.get("race_id") ?? "").trim();
  const results_final_raw = String(formData.get("results_final") ?? "").trim();
  const nextRaw = String(formData.get("next") ?? "").trim();

  if (!groupId || !seriesId || !raceId) {
    redirect("/groups?error=" + encodeURIComponent("Missing race context."));
  }

  const results_final = results_final_raw === "1" || results_final_raw === "true";

  const { supabase, user } = await getServerAuth();

  if (!user) redirect("/login");

  await requireClubAdmin(supabase, groupId, seriesId, user.id);

  const { data: race } = await supabase
    .from("races")
    .select("id, series_id")
    .eq("id", raceId)
    .maybeSingle();

  if (!race || race.series_id !== seriesId) {
    redirect(
      seriesDetailPath(groupId, seriesId, `error=${encodeURIComponent("Race not found.")}`),
    );
  }

  const { data: series } = await supabase
    .from("series")
    .select("group_id")
    .eq("id", seriesId)
    .maybeSingle();

  if (!series || series.group_id !== groupId) {
    redirect(
      seriesDetailPath(groupId, seriesId, `error=${encodeURIComponent("Race not in this club.")}`),
    );
  }

  const { error } = await supabase.from("races").update({ results_final }).eq("id", raceId);

  if (error) {
    redirect(seriesDetailPath(groupId, seriesId, `error=${encodeURIComponent(error.message)}`));
  }

  const seriesPath = `/groups/${groupId}/series/${seriesId}`;
  const allowedNext = new Set([seriesPath]);
  const dest = nextRaw.length && allowedNext.has(nextRaw) ? nextRaw : seriesPath;
  redirect(`${dest}?signals_saved=1`);
}
