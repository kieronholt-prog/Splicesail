"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";

function raceUrl(
  groupId: string,
  seriesId: string,
  raceId: string,
  qs?: string,
) {
  const q = qs ? `?${qs}` : "";
  return `/groups/${groupId}/series/${seriesId}/races/${raceId}${q}`;
}

function datetimeLocalToUtcIso(raw: string): string | null {
  const s = raw.trim();
  if (!s || !s.includes("T")) return null;
  return `${s}:00Z`;
}

async function requireRaceStaff(
  supabase: SupabaseClient,
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
    redirect(
      `/groups/${groupId}?error=` +
        encodeURIComponent("Only club admins and race officers can update race signals."),
    );
  }
}

export async function updateRaceSignalsAction(formData: FormData) {
  const groupId = String(formData.get("group_id") ?? "").trim();
  const seriesId = String(formData.get("series_id") ?? "").trim();
  const raceId = String(formData.get("race_id") ?? "").trim();
  const rawStart = String(formData.get("start_signal_at") ?? "").trim();
  const results_final_raw = String(formData.get("results_final") ?? "").trim();

  if (!groupId || !seriesId || !raceId) {
    redirect("/groups?error=" + encodeURIComponent("Missing race context."));
  }

  const start_signal_at = rawStart.length ? datetimeLocalToUtcIso(rawStart) : null;
  if (rawStart.length && !start_signal_at) {
    redirect(
      raceUrl(groupId, seriesId, raceId, `error=${encodeURIComponent("Invalid start signal datetime.")}`),
    );
  }

  const results_final = results_final_raw === "1" || results_final_raw === "true";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  await requireRaceStaff(supabase, groupId, user.id);

  const { data: race } = await supabase
    .from("races")
    .select("id, series_id")
    .eq("id", raceId)
    .maybeSingle();

  if (!race || race.series_id !== seriesId) {
    redirect(
      raceUrl(groupId, seriesId, raceId, `error=${encodeURIComponent("Race not found.")}`),
    );
  }

  const { data: series } = await supabase
    .from("series")
    .select("group_id")
    .eq("id", seriesId)
    .maybeSingle();

  if (!series || series.group_id !== groupId) {
    redirect(
      raceUrl(groupId, seriesId, raceId, `error=${encodeURIComponent("Race not in this club.")}`),
    );
  }

  const { error } = await supabase
    .from("races")
    .update({ start_signal_at, results_final })
    .eq("id", raceId);

  if (error) {
    redirect(
      raceUrl(groupId, seriesId, raceId, `error=${encodeURIComponent(error.message)}`),
    );
  }

  redirect(raceUrl(groupId, seriesId, raceId, "signals_saved=1"));
}
