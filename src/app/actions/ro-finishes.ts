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
        encodeURIComponent("Only club admins and race officers can do that."),
    );
  }
}

export async function markRaceEntryStartedAction(formData: FormData) {
  const groupId = String(formData.get("group_id") ?? "").trim();
  const seriesId = String(formData.get("series_id") ?? "").trim();
  const raceId = String(formData.get("race_id") ?? "").trim();
  const raceEntryId = String(formData.get("race_entry_id") ?? "").trim();

  if (!groupId || !seriesId || !raceId || !raceEntryId) {
    redirect("/groups?error=" + encodeURIComponent("Missing race context."));
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  await requireRaceStaff(supabase, groupId, user.id);

  const { data: entry, error: fetchErr } = await supabase
    .from("race_entries")
    .select("id, race_id")
    .eq("id", raceEntryId)
    .maybeSingle();

  if (fetchErr || !entry || entry.race_id !== raceId) {
    redirect(
      raceUrl(groupId, seriesId, raceId, `error=${encodeURIComponent("Entry not found for this race.")}`),
    );
  }

  const { error } = await supabase
    .from("race_entries")
    .update({ started_marked_at: new Date().toISOString() })
    .eq("id", raceEntryId);

  if (error) {
    redirect(
      raceUrl(groupId, seriesId, raceId, `error=${encodeURIComponent(error.message)}`),
    );
  }

  redirect(raceUrl(groupId, seriesId, raceId, "mark_started=1"));
}

export async function upsertRoFinishAction(formData: FormData) {
  const groupId = String(formData.get("group_id") ?? "").trim();
  const seriesId = String(formData.get("series_id") ?? "").trim();
  const raceId = String(formData.get("race_id") ?? "").trim();
  const raceEntryId = String(formData.get("race_entry_id") ?? "").trim();
  const rawWhen = String(formData.get("ro_finish_at") ?? "").trim();

  const roIso = datetimeLocalToUtcIso(rawWhen);

  if (!groupId || !seriesId || !raceId || !raceEntryId || !roIso) {
    redirect(
      raceUrl(
        groupId,
        seriesId,
        raceId,
        `error=${encodeURIComponent("Finish time (UTC local input) is required.")}`,
      ),
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  await requireRaceStaff(supabase, groupId, user.id);

  const { data: entry, error: fetchErr } = await supabase
    .from("race_entries")
    .select("id, race_id")
    .eq("id", raceEntryId)
    .maybeSingle();

  if (fetchErr || !entry || entry.race_id !== raceId) {
    redirect(
      raceUrl(groupId, seriesId, raceId, `error=${encodeURIComponent("Entry not found for this race.")}`),
    );
  }

  const { error } = await supabase.from("race_finishes").upsert(
    {
      race_entry_id: raceEntryId,
      ro_finish_at: roIso,
      official_finish_at: roIso,
    },
    { onConflict: "race_entry_id" },
  );

  if (error) {
    redirect(
      raceUrl(groupId, seriesId, raceId, `error=${encodeURIComponent(error.message)}`),
    );
  }

  redirect(raceUrl(groupId, seriesId, raceId, "ro_finish=1"));
}

export async function updateOfficialFinishAction(formData: FormData) {
  const groupId = String(formData.get("group_id") ?? "").trim();
  const seriesId = String(formData.get("series_id") ?? "").trim();
  const raceId = String(formData.get("race_id") ?? "").trim();
  const raceEntryId = String(formData.get("race_entry_id") ?? "").trim();
  const rawOfficial = String(formData.get("official_finish_at") ?? "").trim();

  const officialIso = datetimeLocalToUtcIso(rawOfficial);

  if (!groupId || !seriesId || !raceId || !raceEntryId || !officialIso) {
    redirect(
      raceUrl(
        groupId,
        seriesId,
        raceId,
        `error=${encodeURIComponent("Official finish time (UTC) is required.")}`,
      ),
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  await requireRaceStaff(supabase, groupId, user.id);

  const { data: entry, error: fetchErr } = await supabase
    .from("race_entries")
    .select("id, race_id")
    .eq("id", raceEntryId)
    .maybeSingle();

  if (fetchErr || !entry || entry.race_id !== raceId) {
    redirect(
      raceUrl(groupId, seriesId, raceId, `error=${encodeURIComponent("Entry not found for this race.")}`),
    );
  }

  const { data: finishRow, error: finishFetchErr } = await supabase
    .from("race_finishes")
    .select("id")
    .eq("race_entry_id", raceEntryId)
    .maybeSingle();

  if (finishFetchErr || !finishRow) {
    redirect(
      raceUrl(
        groupId,
        seriesId,
        raceId,
        `error=${encodeURIComponent("Record an RO finish before adjusting official time.")}`,
      ),
    );
  }

  const { error } = await supabase
    .from("race_finishes")
    .update({ official_finish_at: officialIso })
    .eq("race_entry_id", raceEntryId);

  if (error) {
    redirect(
      raceUrl(groupId, seriesId, raceId, `error=${encodeURIComponent(error.message)}`),
    );
  }

  redirect(raceUrl(groupId, seriesId, raceId, "official_saved=1"));
}
