"use server";

import { selectGroupIanaTimeZone } from "@/lib/club-time-server";
import { zonedDatetimeLocalToUtcIso } from "@/lib/club-time";
import {
  FINISH_NON_FINISHER_CODES,
  FINISH_STATUS_FIN,
  finishStatusToEntryOutcome,
  isNonFinisherStatus,
} from "@/lib/finish-outcome-labels";
import { recomputeFleetIdForRaceEntry } from "@/lib/recompute-race-entry-fleet";
import {
  applyFinishPositionInFleet,
  removeFinishPositionInFleet,
} from "@/lib/apply-finish-position-in-fleet";
import { nextFinishPositionInFleet } from "@/lib/finish-position";
import { raceTypeUsesPositionalScoring, normalizeRaceType } from "@/lib/race-type";
import { resolveFleetIdForAdhocRaceGuest } from "@/lib/resolve-guest-adhoc-fleet";
import { getServerAuth } from "@/lib/supabase/auth-cache";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";

function raceManagePath(groupId: string, seriesId: string, raceId: string, qs?: string) {
  const q = qs ? `?${qs}` : "";
  return `/groups/${groupId}/series/${seriesId}/races/${raceId}/manage${q}`;
}

function raceFinishesPath(groupId: string, seriesId: string, raceId: string) {
  return `/groups/${groupId}/series/${seriesId}/races/${raceId}/finishes`;
}

function revalidateRaceFinishes(groupId: string, seriesId: string, raceId: string) {
  revalidatePath(raceFinishesPath(groupId, seriesId, raceId));
}

function parseFinishPosition(raw: string | number | null | undefined): number | null {
  const n = typeof raw === "number" ? raw : parseInt(String(raw ?? "").trim(), 10);
  if (!Number.isFinite(n) || n < 1) return null;
  return n;
}

async function loadRaceTypeForRace(supabase: SupabaseClient, raceId: string) {
  const { data } = await supabase.from("races").select("race_type").eq("id", raceId).maybeSingle();
  return normalizeRaceType(data?.race_type);
}

function staffRedirect(
  formData: FormData,
  groupId: string,
  seriesId: string,
  raceId: string,
  qs?: string,
): never {
  const returnTo = String(formData.get("return_to") ?? "").trim();
  const q = qs ? `?${qs}` : "";
  if (returnTo === "manage") {
    redirect(`/groups/${groupId}/series/${seriesId}/races/${raceId}/manage${q}`);
  }
  if (returnTo === "finishes") {
    redirect(`/groups/${groupId}/series/${seriesId}/races/${raceId}/finishes${q}`);
  }
  redirect(raceManagePath(groupId, seriesId, raceId, qs));
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

async function assertRaceInGroupStaffContext(
  supabase: SupabaseClient,
  formData: FormData,
  groupId: string,
  seriesId: string,
  raceId: string,
): Promise<void | never> {
  const { data: race, error: raceErr } = await supabase
    .from("races")
    .select("id, series_id")
    .eq("id", raceId)
    .maybeSingle();

  if (raceErr || !race || race.series_id !== seriesId) {
    staffRedirect(formData, groupId, seriesId, raceId, `error=${encodeURIComponent("Race not found for this club.")}`);
  }

  const { data: series, error: sErr } = await supabase
    .from("series")
    .select("group_id")
    .eq("id", seriesId)
    .maybeSingle();

  if (sErr || !series || series.group_id !== groupId) {
    staffRedirect(formData, groupId, seriesId, raceId, `error=${encodeURIComponent("Series not found for this club.")}`);
  }
}

function isAdhocRaceGuestEntry(ge: { boat_id: string | null; adhoc_sail_number: string | null }) {
  return ge.boat_id == null && Boolean(ge.adhoc_sail_number?.trim());
}

/** Race-only (adhoc) boats are on the course already — treat as RO-started for finish recording. */
async function ensureAdhocGuestMarkedStarted(
  supabase: SupabaseClient,
  raceGuestEntryId: string,
): Promise<{ error?: string }> {
  const { data: ge, error } = await supabase
    .from("race_guest_entries")
    .select("id, started_marked_at, boat_id, adhoc_sail_number")
    .eq("id", raceGuestEntryId)
    .maybeSingle();

  if (error || !ge) return { error: "Guest race entry not found." };
  if (ge.started_marked_at || !isAdhocRaceGuestEntry(ge)) return {};
  const { error: upErr } = await supabase
    .from("race_guest_entries")
    .update({ started_marked_at: new Date().toISOString() })
    .eq("id", raceGuestEntryId);
  if (upErr) return { error: upErr.message };
  return {};
}

/** Race-only row: sail number + catalogue class (no club_guest boat). */
export async function addAdhocRaceGuestEntryAction(formData: FormData) {
  const groupId = String(formData.get("group_id") ?? "").trim();
  const seriesId = String(formData.get("series_id") ?? "").trim();
  const raceId = String(formData.get("race_id") ?? "").trim();
  const sailRaw = String(formData.get("adhoc_sail_number") ?? "").trim();
  const classKey = String(formData.get("adhoc_rya_class_key") ?? "").trim();

  if (!groupId || !seriesId || !raceId || !sailRaw || !classKey) {
    redirect("/groups?error=" + encodeURIComponent("Sail number and class are required."));
  }

  const { supabase, user } = await getServerAuth();
  if (!user) redirect("/login");

  await requireRaceStaff(supabase, groupId, user.id);
  await assertRaceInGroupStaffContext(supabase, formData, groupId, seriesId, raceId);

  const { data: bc, error: bcErr } = await supabase
    .from("boat_classes")
    .select("class_key, created_for_group_id")
    .eq("class_key", classKey)
    .maybeSingle();

  if (bcErr || !bc) {
    staffRedirect(formData, groupId, seriesId, raceId, `error=${encodeURIComponent("Unknown boat class.")}`);
  }
  const scoped = bc.created_for_group_id;
  if (scoped != null && scoped !== groupId) {
    staffRedirect(
      formData,
      groupId,
      seriesId,
      raceId,
      `error=${encodeURIComponent("That boat class is not available for this club.")}`,
    );
  }

  const fleetId = await resolveFleetIdForAdhocRaceGuest(supabase, { groupId, seriesId, raceId }, classKey);

  const { error } = await supabase.from("race_guest_entries").insert({
    race_id: raceId,
    boat_id: null,
    sail_number_override: null,
    adhoc_sail_number: sailRaw,
    adhoc_rya_class_key: classKey,
    fleet_id: fleetId,
    started_marked_at: new Date().toISOString(),
  });

  if (error) {
    staffRedirect(formData, groupId, seriesId, raceId, `error=${encodeURIComponent(error.message)}`);
  }

  staffRedirect(formData, groupId, seriesId, raceId, `guest_entry_added=1`);
}

export async function removeRaceGuestEntryAction(formData: FormData) {
  const groupId = String(formData.get("group_id") ?? "").trim();
  const seriesId = String(formData.get("series_id") ?? "").trim();
  const raceId = String(formData.get("race_id") ?? "").trim();
  const raceGuestEntryId = String(formData.get("race_guest_entry_id") ?? "").trim();

  if (!groupId || !seriesId || !raceId || !raceGuestEntryId) {
    redirect("/groups?error=" + encodeURIComponent("Missing race context."));
  }

  const { supabase, user } = await getServerAuth();
  if (!user) redirect("/login");

  await requireRaceStaff(supabase, groupId, user.id);

  const { data: ge, error: geErr } = await supabase
    .from("race_guest_entries")
    .select("id, race_id, link_status")
    .eq("id", raceGuestEntryId)
    .maybeSingle();

  if (geErr || !ge || ge.race_id !== raceId) {
    staffRedirect(formData, groupId, seriesId, raceId, `error=${encodeURIComponent("Guest race entry not found.")}`);
  }

  if ((ge as { link_status?: string }).link_status === "confirmed") {
    staffRedirect(
      formData,
      groupId,
      seriesId,
      raceId,
      `error=${encodeURIComponent("Linked guest rows are kept for the record — remove the link in the database if you truly need to delete.")}`,
    );
  }

  const { error } = await supabase.from("race_guest_entries").delete().eq("id", raceGuestEntryId);
  if (error) staffRedirect(formData, groupId, seriesId, raceId, `error=${encodeURIComponent(error.message)}`);

  staffRedirect(formData, groupId, seriesId, raceId, `guest_entry_removed=1`);
}

/** Remove a race-only (+ADDED) guest row from the finish edit dialog. */
export async function removeAdhocRaceGuestEntryManageAction(input: {
  group_id: string;
  series_id: string;
  race_id: string;
  race_guest_entry_id: string;
}): Promise<{ ok: true } | { error: string }> {
  const groupId = String(input.group_id ?? "").trim();
  const seriesId = String(input.series_id ?? "").trim();
  const raceId = String(input.race_id ?? "").trim();
  const raceGuestEntryId = String(input.race_guest_entry_id ?? "").trim();

  if (!groupId || !seriesId || !raceId || !raceGuestEntryId) {
    return { error: "Missing race context." };
  }

  const { supabase, user } = await getServerAuth();
  if (!user) return { error: "Not signed in." };

  const { data: staff } = await supabase
    .from("group_memberships")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (staff?.role !== "club_admin" && staff?.role !== "race_officer") {
    return { error: "Only club admins and race officers can remove race entries." };
  }

  const { data: ge, error: geErr } = await supabase
    .from("race_guest_entries")
    .select("id, race_id, link_status, boat_id, adhoc_sail_number")
    .eq("id", raceGuestEntryId)
    .maybeSingle();

  if (geErr || !ge || ge.race_id !== raceId) {
    return { error: "Guest race entry not found." };
  }

  if (!isAdhocRaceGuestEntry(ge)) {
    return { error: "Only race-only (+ADDED) boats can be removed here." };
  }

  if ((ge as { link_status?: string }).link_status === "confirmed") {
    return {
      error:
        "Linked guest rows are kept for the record — remove the link in the database if you truly need to delete.",
    };
  }

  const { error } = await supabase.from("race_guest_entries").delete().eq("id", raceGuestEntryId);
  if (error) return { error: error.message };

  revalidateRaceFinishes(groupId, seriesId, raceId);
  revalidatePath(`/groups/${groupId}/series/${seriesId}/races/${raceId}/manage`);
  return { ok: true };
}

export async function markRaceGuestEntryStartedAction(formData: FormData) {
  const groupId = String(formData.get("group_id") ?? "").trim();
  const seriesId = String(formData.get("series_id") ?? "").trim();
  const raceId = String(formData.get("race_id") ?? "").trim();
  const raceGuestEntryId = String(formData.get("race_guest_entry_id") ?? "").trim();

  if (!groupId || !seriesId || !raceId || !raceGuestEntryId) {
    redirect("/groups?error=" + encodeURIComponent("Missing race context."));
  }

  const { supabase, user } = await getServerAuth();
  if (!user) redirect("/login");

  await requireRaceStaff(supabase, groupId, user.id);

  const { data: ge, error: fetchErr } = await supabase
    .from("race_guest_entries")
    .select("id, race_id, link_status")
    .eq("id", raceGuestEntryId)
    .maybeSingle();

  if (fetchErr || !ge || ge.race_id !== raceId) {
    staffRedirect(formData, groupId, seriesId, raceId, `error=${encodeURIComponent("Guest race entry not found.")}`);
  }

  if ((ge as { link_status?: string }).link_status === "confirmed") {
    staffRedirect(
      formData,
      groupId,
      seriesId,
      raceId,
      `error=${encodeURIComponent("This guest row is linked — use the official entry on the start line.")}`,
    );
  }

  const { error } = await supabase
    .from("race_guest_entries")
    .update({ started_marked_at: new Date().toISOString() })
    .eq("id", raceGuestEntryId);

  if (error) {
    staffRedirect(formData, groupId, seriesId, raceId, `error=${encodeURIComponent(error.message)}`);
  }

  staffRedirect(formData, groupId, seriesId, raceId, "guest_mark_started=1");
}

export async function upsertRaceGuestRoFinishAction(formData: FormData) {
  const groupId = String(formData.get("group_id") ?? "").trim();
  const seriesId = String(formData.get("series_id") ?? "").trim();
  const raceId = String(formData.get("race_id") ?? "").trim();
  const raceGuestEntryId = String(formData.get("race_guest_entry_id") ?? "").trim();
  const rawWhen = String(formData.get("ro_finish_at") ?? "").trim();

  if (!groupId || !seriesId || !raceId || !raceGuestEntryId) {
    redirect("/groups?error=" + encodeURIComponent("Missing race context."));
  }

  const { supabase, user } = await getServerAuth();
  if (!user) redirect("/login");

  await requireRaceStaff(supabase, groupId, user.id);

  const tz = await selectGroupIanaTimeZone(supabase, groupId);
  const roIso = zonedDatetimeLocalToUtcIso(rawWhen, tz);
  if (!roIso) {
    staffRedirect(
      formData,
      groupId,
      seriesId,
      raceId,
      `error=${encodeURIComponent(
        rawWhen.trim()
          ? "Finish time is invalid or falls in a non-existent clock-change window."
          : "Finish time is required (club local date and time).",
      )}`,
    );
  }

  const { data: ge, error: fetchErr } = await supabase
    .from("race_guest_entries")
    .select("id, race_id, link_status")
    .eq("id", raceGuestEntryId)
    .maybeSingle();

  if (fetchErr || !ge || ge.race_id !== raceId) {
    staffRedirect(formData, groupId, seriesId, raceId, `error=${encodeURIComponent("Guest race entry not found.")}`);
  }

  if ((ge as { link_status?: string }).link_status === "confirmed") {
    staffRedirect(
      formData,
      groupId,
      seriesId,
      raceId,
      `error=${encodeURIComponent("This guest row is linked — edit finishes on the official entry.")}`,
    );
  }

  const started = await ensureAdhocGuestMarkedStarted(supabase, raceGuestEntryId);
  if (started.error) {
    staffRedirect(formData, groupId, seriesId, raceId, `error=${encodeURIComponent(started.error)}`);
  }

  const { error } = await supabase.from("race_guest_finishes").upsert(
    {
      race_guest_entry_id: raceGuestEntryId,
      ro_finish_at: roIso,
      official_finish_at: roIso,
    },
    { onConflict: "race_guest_entry_id" },
  );

  if (error) {
    staffRedirect(formData, groupId, seriesId, raceId, `error=${encodeURIComponent(error.message)}`);
  }

  staffRedirect(formData, groupId, seriesId, raceId, "guest_ro_finish=1");
}

export async function updateRaceGuestOfficialFinishAction(formData: FormData) {
  const groupId = String(formData.get("group_id") ?? "").trim();
  const seriesId = String(formData.get("series_id") ?? "").trim();
  const raceId = String(formData.get("race_id") ?? "").trim();
  const raceGuestEntryId = String(formData.get("race_guest_entry_id") ?? "").trim();
  const rawOfficial = String(formData.get("official_finish_at") ?? "").trim();

  if (!groupId || !seriesId || !raceId || !raceGuestEntryId) {
    redirect("/groups?error=" + encodeURIComponent("Missing race context."));
  }

  const { supabase, user } = await getServerAuth();
  if (!user) redirect("/login");

  await requireRaceStaff(supabase, groupId, user.id);

  const tz = await selectGroupIanaTimeZone(supabase, groupId);
  const officialIso = zonedDatetimeLocalToUtcIso(rawOfficial, tz);
  if (!officialIso) {
    staffRedirect(
      formData,
      groupId,
      seriesId,
      raceId,
      `error=${encodeURIComponent(
        rawOfficial.trim()
          ? "Official finish time is invalid or falls in a non-existent clock-change window."
          : "Official finish time is required (club local date and time).",
      )}`,
    );
  }

  const { data: ge, error: fetchErr } = await supabase
    .from("race_guest_entries")
    .select("id, race_id, link_status")
    .eq("id", raceGuestEntryId)
    .maybeSingle();

  if (fetchErr || !ge || ge.race_id !== raceId) {
    staffRedirect(formData, groupId, seriesId, raceId, `error=${encodeURIComponent("Guest race entry not found.")}`);
  }

  if ((ge as { link_status?: string }).link_status === "confirmed") {
    staffRedirect(
      formData,
      groupId,
      seriesId,
      raceId,
      `error=${encodeURIComponent("This guest row is linked — edit official finish on the official entry.")}`,
    );
  }

  const { data: finishRow, error: finishFetchErr } = await supabase
    .from("race_guest_finishes")
    .select("id")
    .eq("race_guest_entry_id", raceGuestEntryId)
    .maybeSingle();

  if (finishFetchErr || !finishRow) {
    staffRedirect(
      formData,
      groupId,
      seriesId,
      raceId,
      `error=${encodeURIComponent("Record an RO finish before adjusting official time.")}`,
    );
  }

  const { error } = await supabase
    .from("race_guest_finishes")
    .update({ official_finish_at: officialIso })
    .eq("race_guest_entry_id", raceGuestEntryId);

  if (error) {
    staffRedirect(formData, groupId, seriesId, raceId, `error=${encodeURIComponent(error.message)}`);
  }

  staffRedirect(formData, groupId, seriesId, raceId, "guest_official_saved=1");
}

export async function confirmRaceGuestEntryLinkAction(formData: FormData) {
  const groupId = String(formData.get("group_id") ?? "").trim();
  const seriesId = String(formData.get("series_id") ?? "").trim();
  const raceId = String(formData.get("race_id") ?? "").trim();
  const raceGuestEntryId = String(formData.get("race_guest_entry_id") ?? "").trim();
  const raceEntryId = String(formData.get("race_entry_id") ?? "").trim();

  if (!groupId || !seriesId || !raceId || !raceGuestEntryId || !raceEntryId) {
    redirect("/groups?error=" + encodeURIComponent("Missing race context."));
  }

  const { supabase, user } = await getServerAuth();
  if (!user) redirect("/login");

  await requireRaceStaff(supabase, groupId, user.id);

  const { error } = await supabase.rpc("confirm_race_guest_entry_link", {
    p_guest_entry_id: raceGuestEntryId,
    p_race_entry_id: raceEntryId,
  });

  if (error) {
    staffRedirect(formData, groupId, seriesId, raceId, `error=${encodeURIComponent(error.message)}`);
  }

  const { data: linkedEnt } = await supabase.from("race_entries").select("user_id").eq("id", raceEntryId).maybeSingle();

  if (linkedEnt?.user_id) {
    await recomputeFleetIdForRaceEntry(supabase, { groupId, seriesId }, raceId, linkedEnt.user_id);
  }

  staffRedirect(formData, groupId, seriesId, raceId, "guest_link_confirmed=1");
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Series signup hull with no race_entries row: staff inserts the row and marks started (start-line green).
 */
export async function staffCreateRaceEntryFromSeriesSignupAction(formData: FormData) {
  const groupId = String(formData.get("group_id") ?? "").trim();
  const seriesId = String(formData.get("series_id") ?? "").trim();
  const raceId = String(formData.get("race_id") ?? "").trim();
  const entrantUserId = String(formData.get("entrant_user_id") ?? "").trim();
  const boatId = String(formData.get("boat_id") ?? "").trim();

  if (!groupId || !seriesId || !raceId || !entrantUserId || !boatId) {
    redirect("/groups?error=" + encodeURIComponent("Missing race or entrant."));
  }

  if (!UUID_RE.test(entrantUserId) || !UUID_RE.test(boatId)) {
    staffRedirect(
      formData,
      groupId,
      seriesId,
      raceId,
      `error=${encodeURIComponent("Invalid entrant or boat.")}`,
    );
  }

  const { supabase, user } = await getServerAuth();
  if (!user) redirect("/login");

  await requireRaceStaff(supabase, groupId, user.id);
  await assertRaceInGroupStaffContext(supabase, formData, groupId, seriesId, raceId);

  const { data: signup } = await supabase
    .from("series_registration_boats")
    .select("user_id")
    .eq("series_id", seriesId)
    .eq("user_id", entrantUserId)
    .eq("boat_id", boatId)
    .maybeSingle();

  if (!signup) {
    staffRedirect(
      formData,
      groupId,
      seriesId,
      raceId,
      `error=${encodeURIComponent("That hull is not on this sailor's series signup.")}`,
    );
  }

  const { data: existing } = await supabase
    .from("race_entries")
    .select("id, outcome")
    .eq("race_id", raceId)
    .eq("user_id", entrantUserId)
    .eq("boat_id", boatId)
    .maybeSingle();

  const nowIso = new Date().toISOString();

  if (existing?.id) {
    const patch: { started_marked_at: string; outcome?: string | null } = {
      started_marked_at: nowIso,
    };
    if (String(existing.outcome ?? "").toLowerCase() === "ocs") {
      patch.outcome = null;
    }
    const { error: upErr } = await supabase.from("race_entries").update(patch).eq("id", existing.id);

    if (upErr) {
      staffRedirect(
        formData,
        groupId,
        seriesId,
        raceId,
        `error=${encodeURIComponent(upErr.message)}`,
      );
    }
  } else {
    const { error: insErr } = await supabase.from("race_entries").insert({
      race_id: raceId,
      user_id: entrantUserId,
      boat_id: boatId,
      started_marked_at: nowIso,
    });

    if (insErr) {
      staffRedirect(
        formData,
        groupId,
        seriesId,
        raceId,
        `error=${encodeURIComponent(insErr.message)}`,
      );
    }
  }

  await recomputeFleetIdForRaceEntry(supabase, { groupId, seriesId }, raceId, entrantUserId);

  staffRedirect(formData, groupId, seriesId, raceId, "mark_started=1");
}

export async function markRaceEntryOcsAction(formData: FormData) {
  const groupId = String(formData.get("group_id") ?? "").trim();
  const seriesId = String(formData.get("series_id") ?? "").trim();
  const raceId = String(formData.get("race_id") ?? "").trim();
  const raceEntryId = String(formData.get("race_entry_id") ?? "").trim();

  if (!groupId || !seriesId || !raceId || !raceEntryId) {
    redirect("/groups?error=" + encodeURIComponent("Missing race context."));
  }

  const { supabase, user } = await getServerAuth();

  if (!user) redirect("/login");

  await requireRaceStaff(supabase, groupId, user.id);

  const { data: entry, error: fetchErr } = await supabase
    .from("race_entries")
    .select("id, race_id")
    .eq("id", raceEntryId)
    .maybeSingle();

  if (fetchErr || !entry || entry.race_id !== raceId) {
    staffRedirect(
      formData,
      groupId,
      seriesId,
      raceId,
      `error=${encodeURIComponent("Entry not found for this race.")}`,
    );
  }

  const { error } = await supabase
    .from("race_entries")
    .update({ outcome: "ocs", started_marked_at: null })
    .eq("id", raceEntryId);

  if (error) {
    staffRedirect(formData, groupId, seriesId, raceId, `error=${encodeURIComponent(error.message)}`);
  }

  staffRedirect(formData, groupId, seriesId, raceId, "mark_ocs=1");
}

function revalidateRaceManage(groupId: string, seriesId: string, raceId: string) {
  revalidatePath(raceManagePath(groupId, seriesId, raceId));
}

/** Start line (manage): no redirect — client updates tiles in place. */
export async function markRaceEntryStartedManageAction(input: {
  group_id: string;
  series_id: string;
  race_id: string;
  race_entry_id: string;
}): Promise<
  | { ok: true; startedMarkedAt: string; outcome: null; fleetId: string | null }
  | { error: string }
> {
  const groupId = String(input.group_id ?? "").trim();
  const seriesId = String(input.series_id ?? "").trim();
  const raceId = String(input.race_id ?? "").trim();
  const raceEntryId = String(input.race_entry_id ?? "").trim();

  if (!groupId || !seriesId || !raceId || !raceEntryId) {
    return { error: "Missing race context." };
  }

  const { supabase, user } = await getServerAuth();
  if (!user) return { error: "Not signed in." };

  const { data: staff } = await supabase
    .from("group_memberships")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (staff?.role !== "club_admin" && staff?.role !== "race_officer") {
    return { error: "Only club admins and race officers can update the start line." };
  }

  const { data: entry, error: fetchErr } = await supabase
    .from("race_entries")
    .select("id, race_id, outcome, fleet_id")
    .eq("id", raceEntryId)
    .maybeSingle();

  if (fetchErr || !entry || entry.race_id !== raceId) {
    return { error: "Entry not found for this race." };
  }

  const startedMarkedAt = new Date().toISOString();
  const patch: { started_marked_at: string; outcome?: string | null } = {
    started_marked_at: startedMarkedAt,
  };
  if (entry.outcome === "ocs") {
    patch.outcome = null;
  }

  const { error } = await supabase.from("race_entries").update(patch).eq("id", raceEntryId);

  if (error) {
    return { error: error.message };
  }

  revalidateRaceManage(groupId, seriesId, raceId);
  return {
    ok: true,
    startedMarkedAt,
    outcome: null,
    fleetId: entry.fleet_id ?? null,
  };
}

export async function markRaceEntryOcsManageAction(input: {
  group_id: string;
  series_id: string;
  race_id: string;
  race_entry_id: string;
}): Promise<{ ok: true; outcome: "ocs"; startedMarkedAt: null } | { error: string }> {
  const groupId = String(input.group_id ?? "").trim();
  const seriesId = String(input.series_id ?? "").trim();
  const raceId = String(input.race_id ?? "").trim();
  const raceEntryId = String(input.race_entry_id ?? "").trim();

  if (!groupId || !seriesId || !raceId || !raceEntryId) {
    return { error: "Missing race context." };
  }

  const { supabase, user } = await getServerAuth();
  if (!user) return { error: "Not signed in." };

  const { data: staffOcs } = await supabase
    .from("group_memberships")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (staffOcs?.role !== "club_admin" && staffOcs?.role !== "race_officer") {
    return { error: "Only club admins and race officers can update the start line." };
  }

  const { data: entry, error: fetchErr } = await supabase
    .from("race_entries")
    .select("id, race_id")
    .eq("id", raceEntryId)
    .maybeSingle();

  if (fetchErr || !entry || entry.race_id !== raceId) {
    return { error: "Entry not found for this race." };
  }

  const { error } = await supabase
    .from("race_entries")
    .update({ outcome: "ocs", started_marked_at: null })
    .eq("id", raceEntryId);

  if (error) {
    return { error: error.message };
  }

  revalidateRaceManage(groupId, seriesId, raceId);
  return { ok: true, outcome: "ocs", startedMarkedAt: null };
}

export async function clearRaceEntryStartedManageAction(input: {
  group_id: string;
  series_id: string;
  race_id: string;
  race_entry_id: string;
}): Promise<{ ok: true; startedMarkedAt: null; outcome: null } | { error: string }> {
  const groupId = String(input.group_id ?? "").trim();
  const seriesId = String(input.series_id ?? "").trim();
  const raceId = String(input.race_id ?? "").trim();
  const raceEntryId = String(input.race_entry_id ?? "").trim();

  if (!groupId || !seriesId || !raceId || !raceEntryId) {
    return { error: "Missing race context." };
  }

  const { supabase, user } = await getServerAuth();
  if (!user) return { error: "Not signed in." };

  const { data: staff } = await supabase
    .from("group_memberships")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (staff?.role !== "club_admin" && staff?.role !== "race_officer") {
    return { error: "Only club admins and race officers can update the start line." };
  }

  const { data: entry, error: fetchErr } = await supabase
    .from("race_entries")
    .select("id, race_id")
    .eq("id", raceEntryId)
    .maybeSingle();

  if (fetchErr || !entry || entry.race_id !== raceId) {
    return { error: "Entry not found for this race." };
  }

  const { error } = await supabase
    .from("race_entries")
    .update({ started_marked_at: null, outcome: null })
    .eq("id", raceEntryId);

  if (error) {
    return { error: error.message };
  }

  revalidateRaceManage(groupId, seriesId, raceId);
  return { ok: true, startedMarkedAt: null, outcome: null };
}

export async function staffCreateRaceEntryFromSeriesSignupManageAction(input: {
  group_id: string;
  series_id: string;
  race_id: string;
  entrant_user_id: string;
  boat_id: string;
}): Promise<
  | {
      ok: true;
      raceEntryId: string;
      startedMarkedAt: string;
      fleetId: string | null;
      outcome: string | null;
    }
  | { error: string }
> {
  const groupId = String(input.group_id ?? "").trim();
  const seriesId = String(input.series_id ?? "").trim();
  const raceId = String(input.race_id ?? "").trim();
  const entrantUserId = String(input.entrant_user_id ?? "").trim();
  const boatId = String(input.boat_id ?? "").trim();

  if (!groupId || !seriesId || !raceId || !entrantUserId || !boatId) {
    return { error: "Missing race or entrant." };
  }

  if (!UUID_RE.test(entrantUserId) || !UUID_RE.test(boatId)) {
    return { error: "Invalid entrant or boat." };
  }

  const { supabase, user } = await getServerAuth();
  if (!user) return { error: "Not signed in." };

  const { data: staffSignup } = await supabase
    .from("group_memberships")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (staffSignup?.role !== "club_admin" && staffSignup?.role !== "race_officer") {
    return { error: "Only club admins and race officers can update the start line." };
  }

  const { data: race } = await supabase
    .from("races")
    .select("id, series_id")
    .eq("id", raceId)
    .maybeSingle();

  if (!race || race.series_id !== seriesId) {
    return { error: "Race not found for this club." };
  }

  const { data: series } = await supabase
    .from("series")
    .select("group_id")
    .eq("id", seriesId)
    .maybeSingle();

  if (!series || series.group_id !== groupId) {
    return { error: "Series not found for this club." };
  }

  const { data: signup } = await supabase
    .from("series_registration_boats")
    .select("user_id")
    .eq("series_id", seriesId)
    .eq("user_id", entrantUserId)
    .eq("boat_id", boatId)
    .maybeSingle();

  if (!signup) {
    return { error: "That hull is not on this sailor's series signup." };
  }

  const { data: existing } = await supabase
    .from("race_entries")
    .select("id, outcome")
    .eq("race_id", raceId)
    .eq("user_id", entrantUserId)
    .eq("boat_id", boatId)
    .maybeSingle();

  const nowIso = new Date().toISOString();
  let raceEntryId: string;

  if (existing?.id) {
    raceEntryId = existing.id;
    const patch: { started_marked_at: string; outcome?: string | null } = {
      started_marked_at: nowIso,
    };
    if (String(existing.outcome ?? "").toLowerCase() === "ocs") {
      patch.outcome = null;
    }
    const { error: upErr } = await supabase.from("race_entries").update(patch).eq("id", existing.id);

    if (upErr) {
      return { error: upErr.message };
    }
  } else {
    const { data: inserted, error: insErr } = await supabase
      .from("race_entries")
      .insert({
        race_id: raceId,
        user_id: entrantUserId,
        boat_id: boatId,
        started_marked_at: nowIso,
      })
      .select("id")
      .single();

    if (insErr || !inserted?.id) {
      return { error: insErr?.message ?? "Could not create race entry." };
    }
    raceEntryId = inserted.id;
  }

  await recomputeFleetIdForRaceEntry(supabase, { groupId, seriesId }, raceId, entrantUserId);

  const { data: row, error: rowErr } = await supabase
    .from("race_entries")
    .select("fleet_id, started_marked_at, outcome")
    .eq("id", raceEntryId)
    .maybeSingle();

  if (rowErr || !row) {
    return { error: rowErr?.message ?? "Race entry not found after save." };
  }

  revalidateRaceManage(groupId, seriesId, raceId);
  return {
    ok: true,
    raceEntryId,
    startedMarkedAt: row.started_marked_at ?? nowIso,
    fleetId: row.fleet_id ?? null,
    outcome: row.outcome ?? null,
  };
}

/** Prior-series RO-added hull: create adhoc guest row for this race and mark started (start line). */
export async function createAdhocRaceGuestFromSeriesRoAddedManageAction(input: {
  group_id: string;
  series_id: string;
  race_id: string;
  adhoc_sail_number: string;
  adhoc_rya_class_key: string;
}): Promise<
  | {
      ok: true;
      guestRaceEntryId: string;
      startedMarkedAt: string;
      fleetId: string | null;
    }
  | { error: string }
> {
  const groupId = String(input.group_id ?? "").trim();
  const seriesId = String(input.series_id ?? "").trim();
  const raceId = String(input.race_id ?? "").trim();
  const sailRaw = String(input.adhoc_sail_number ?? "").trim();
  const classKey = String(input.adhoc_rya_class_key ?? "").trim();

  if (!groupId || !seriesId || !raceId || !sailRaw || !classKey) {
    return { error: "Sail number and class are required." };
  }

  const { supabase, user } = await getServerAuth();
  if (!user) return { error: "Not signed in." };

  const { data: staff } = await supabase
    .from("group_memberships")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (staff?.role !== "club_admin" && staff?.role !== "race_officer") {
    return { error: "Only club admins and race officers can update the start line." };
  }

  const { data: group } = await supabase
    .from("groups")
    .select("ro_added_boats_series_start_line")
    .eq("id", groupId)
    .maybeSingle();

  if (!(group as { ro_added_boats_series_start_line?: boolean } | null)?.ro_added_boats_series_start_line) {
    return { error: "This club has not enabled RO-added boats on later series start lines." };
  }

  const { data: race } = await supabase
    .from("races")
    .select("id, series_id")
    .eq("id", raceId)
    .maybeSingle();

  if (!race || race.series_id !== seriesId) {
    return { error: "Race not found for this club." };
  }

  const { data: series } = await supabase
    .from("series")
    .select("group_id")
    .eq("id", seriesId)
    .maybeSingle();

  if (!series || series.group_id !== groupId) {
    return { error: "Series not found for this club." };
  }

  const { data: bc, error: bcErr } = await supabase
    .from("boat_classes")
    .select("class_key, created_for_group_id")
    .eq("class_key", classKey)
    .maybeSingle();

  if (bcErr || !bc) {
    return { error: "Unknown boat class." };
  }
  const scoped = bc.created_for_group_id;
  if (scoped != null && scoped !== groupId) {
    return { error: "That boat class is not available for this club." };
  }

  const fleetId = await resolveFleetIdForAdhocRaceGuest(supabase, { groupId, seriesId, raceId }, classKey);

  const { data: existing } = await supabase
    .from("race_guest_entries")
    .select("id, started_marked_at, fleet_id")
    .eq("race_id", raceId)
    .is("boat_id", null)
    .eq("adhoc_sail_number", sailRaw)
    .eq("adhoc_rya_class_key", classKey)
    .maybeSingle();

  const nowIso = new Date().toISOString();
  let guestRaceEntryId: string;

  if (existing?.id) {
    guestRaceEntryId = existing.id;
    const { error: upErr } = await supabase
      .from("race_guest_entries")
      .update({ started_marked_at: nowIso, fleet_id: fleetId })
      .eq("id", existing.id);

    if (upErr) {
      return { error: upErr.message };
    }
  } else {
    const { data: inserted, error: insErr } = await supabase
      .from("race_guest_entries")
      .insert({
        race_id: raceId,
        boat_id: null,
        adhoc_sail_number: sailRaw,
        adhoc_rya_class_key: classKey,
        fleet_id: fleetId,
        started_marked_at: nowIso,
      })
      .select("id")
      .single();

    if (insErr || !inserted?.id) {
      return { error: insErr?.message ?? "Could not add boat for this race." };
    }
    guestRaceEntryId = inserted.id;
  }

  const { data: row, error: rowErr } = await supabase
    .from("race_guest_entries")
    .select("fleet_id, started_marked_at")
    .eq("id", guestRaceEntryId)
    .maybeSingle();

  if (rowErr || !row) {
    return { error: rowErr?.message ?? "Guest entry not found after save." };
  }

  revalidateRaceManage(groupId, seriesId, raceId);
  return {
    ok: true,
    guestRaceEntryId,
    startedMarkedAt: row.started_marked_at ?? nowIso,
    fleetId: row.fleet_id ?? fleetId,
  };
}

export async function markRaceGuestEntryStartedManageAction(input: {
  group_id: string;
  series_id: string;
  race_id: string;
  race_guest_entry_id: string;
}): Promise<
  | { ok: true; startedMarkedAt: string; fleetId: string | null }
  | { error: string }
> {
  const groupId = String(input.group_id ?? "").trim();
  const seriesId = String(input.series_id ?? "").trim();
  const raceId = String(input.race_id ?? "").trim();
  const raceGuestEntryId = String(input.race_guest_entry_id ?? "").trim();

  if (!groupId || !seriesId || !raceId || !raceGuestEntryId) {
    return { error: "Missing race context." };
  }

  const { supabase, user } = await getServerAuth();
  if (!user) return { error: "Not signed in." };

  const { data: staffGuest } = await supabase
    .from("group_memberships")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (staffGuest?.role !== "club_admin" && staffGuest?.role !== "race_officer") {
    return { error: "Only club admins and race officers can update the start line." };
  }

  const { data: ge, error: fetchErr } = await supabase
    .from("race_guest_entries")
    .select("id, race_id, link_status, fleet_id")
    .eq("id", raceGuestEntryId)
    .maybeSingle();

  if (fetchErr || !ge || ge.race_id !== raceId) {
    return { error: "Guest race entry not found." };
  }

  if (ge.link_status === "confirmed") {
    return {
      error: "This guest row is linked — use the official entry on the start line.",
    };
  }

  const startedMarkedAt = new Date().toISOString();
  const { error } = await supabase
    .from("race_guest_entries")
    .update({ started_marked_at: startedMarkedAt })
    .eq("id", raceGuestEntryId);

  if (error) {
    return { error: error.message };
  }

  revalidateRaceManage(groupId, seriesId, raceId);
  return { ok: true, startedMarkedAt, fleetId: ge.fleet_id ?? null };
}

async function parseClubLocalFinishTime(
  supabase: SupabaseClient,
  groupId: string,
  rawWhen: string,
): Promise<{ ok: true; roIso: string } | { error: string }> {
  const tz = await selectGroupIanaTimeZone(supabase, groupId);
  const roIso = zonedDatetimeLocalToUtcIso(rawWhen, tz);
  if (!roIso) {
    return {
      error: rawWhen.trim()
        ? "Finish time is invalid or falls in a non-existent clock-change window."
        : "Finish time is required (club local date and time).",
    };
  }
  return { ok: true, roIso };
}

async function assertFinishStatusAllowedForSeries(
  supabase: SupabaseClient,
  seriesId: string,
  status: string,
): Promise<{ ok: true } | { error: string }> {
  const s = status.trim().toLowerCase();
  if (!s || s === FINISH_STATUS_FIN || s === "finished") return { ok: true };
  if (!FINISH_NON_FINISHER_CODES.includes(s)) {
    return { error: "Invalid finish status." };
  }
  const { data: rule } = await supabase
    .from("series_penalty_rules")
    .select("outcome_code")
    .eq("series_id", seriesId)
    .eq("outcome_code", s)
    .maybeSingle();
  if (!rule) {
    return {
      error: `${s.toUpperCase()} is not configured for this series — add it in Club admin → Scoring settings.`,
    };
  }
  return { ok: true };
}

/** Manual finishes UI: persist finish time and/or non-finisher status (no redirect). */
export async function saveRoFinishManualAction(input: {
  group_id: string;
  series_id: string;
  race_id: string;
  race_entry_id: string;
  finish_status: string;
  finish_at_local?: string;
  finish_position?: string | number;
  allow_equal_position?: boolean;
}): Promise<{ ok: true; savedLocal: string | null } | { error: string }> {
  const groupId = String(input.group_id ?? "").trim();
  const seriesId = String(input.series_id ?? "").trim();
  const raceId = String(input.race_id ?? "").trim();
  const raceEntryId = String(input.race_entry_id ?? "").trim();
  const finishStatus = String(input.finish_status ?? FINISH_STATUS_FIN).trim();
  const rawWhen = String(input.finish_at_local ?? "").trim();

  if (!groupId || !seriesId || !raceId || !raceEntryId) {
    return { error: "Missing race context." };
  }

  const { supabase, user } = await getServerAuth();
  if (!user) return { error: "Not signed in." };

  const { data: staff } = await supabase
    .from("group_memberships")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (staff?.role !== "club_admin" && staff?.role !== "race_officer") {
    return { error: "Only club admins and race officers can record finishes." };
  }

  const statusOk = await assertFinishStatusAllowedForSeries(supabase, seriesId, finishStatus);
  if ("error" in statusOk) return statusOk;

  const { data: entry, error: fetchErr } = await supabase
    .from("race_entries")
    .select("id, race_id, fleet_id")
    .eq("id", raceEntryId)
    .maybeSingle();

  if (fetchErr || !entry || entry.race_id !== raceId) {
    return { error: "Entry not found for this race." };
  }

  const raceType = await loadRaceTypeForRace(supabase, raceId);
  const positional = raceTypeUsesPositionalScoring(raceType);

  const entryOutcome = finishStatusToEntryOutcome(finishStatus);
  if (entryOutcome == null) {
    return { error: "Invalid finish status." };
  }

  if (isNonFinisherStatus(finishStatus)) {
    const { error: outcomeErr } = await supabase
      .from("race_entries")
      .update({ outcome: entryOutcome })
      .eq("id", raceEntryId);
    if (outcomeErr) return { error: outcomeErr.message };

    await supabase.from("race_finishes").delete().eq("race_entry_id", raceEntryId);

    revalidateRaceFinishes(groupId, seriesId, raceId);
    revalidatePath("/");
    return { ok: true, savedLocal: null };
  }

  if (positional) {
    const finishPosition = parseFinishPosition(input.finish_position);
    if (finishPosition == null) {
      return { error: "Enter a finish position of at least 1." };
    }

    const nowIso = new Date().toISOString();
    const applyRes = await applyFinishPositionInFleet(supabase, {
      raceId,
      fleetId: entry.fleet_id ?? null,
      target: { kind: "official", raceEntryId },
      newPosition: finishPosition,
      allowEqualPosition: Boolean(input.allow_equal_position),
      nowIso,
    });
    if (applyRes.error) {
      return { error: applyRes.error };
    }

    const { error: outcomeErr } = await supabase
      .from("race_entries")
      .update({ outcome: "finished" })
      .eq("id", raceEntryId);

    if (outcomeErr) {
      return { error: outcomeErr.message };
    }

    revalidateRaceFinishes(groupId, seriesId, raceId);
    revalidatePath("/");
    return { ok: true, savedLocal: String(finishPosition) };
  }

  const parsed = await parseClubLocalFinishTime(supabase, groupId, rawWhen);
  if ("error" in parsed) return parsed;

  const { error: finishErr } = await supabase.from("race_finishes").upsert(
    {
      race_entry_id: raceEntryId,
      ro_finish_at: parsed.roIso,
      official_finish_at: parsed.roIso,
    },
    { onConflict: "race_entry_id" },
  );

  if (finishErr) {
    return { error: finishErr.message };
  }

  const { error: outcomeErr } = await supabase
    .from("race_entries")
    .update({ outcome: "finished" })
    .eq("id", raceEntryId);

  if (outcomeErr) {
    return { error: outcomeErr.message };
  }

  revalidateRaceFinishes(groupId, seriesId, raceId);
  revalidatePath("/");
  return { ok: true, savedLocal: rawWhen };
}

export async function saveRaceGuestRoFinishManualAction(input: {
  group_id: string;
  series_id: string;
  race_id: string;
  race_guest_entry_id: string;
  ro_finish_at_local?: string;
  finish_position?: string | number;
  allow_equal_position?: boolean;
}): Promise<{ ok: true; savedLocal: string } | { error: string }> {
  const groupId = String(input.group_id ?? "").trim();
  const seriesId = String(input.series_id ?? "").trim();
  const raceId = String(input.race_id ?? "").trim();
  const raceGuestEntryId = String(input.race_guest_entry_id ?? "").trim();
  const rawWhen = String(input.ro_finish_at_local ?? "").trim();

  if (!groupId || !seriesId || !raceId || !raceGuestEntryId) {
    return { error: "Missing race context." };
  }

  const { supabase, user } = await getServerAuth();
  if (!user) return { error: "Not signed in." };

  const { data: staff } = await supabase
    .from("group_memberships")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (staff?.role !== "club_admin" && staff?.role !== "race_officer") {
    return { error: "Only club admins and race officers can record finishes." };
  }

  const raceType = await loadRaceTypeForRace(supabase, raceId);
  const positional = raceTypeUsesPositionalScoring(raceType);

  const { data: ge, error: fetchErr } = await supabase
    .from("race_guest_entries")
    .select("id, race_id, link_status, fleet_id")
    .eq("id", raceGuestEntryId)
    .maybeSingle();

  if (fetchErr || !ge || ge.race_id !== raceId) {
    return { error: "Guest race entry not found." };
  }

  if ((ge as { link_status?: string }).link_status === "confirmed") {
    return { error: "This guest row is linked — edit finishes on the official entry." };
  }

  const started = await ensureAdhocGuestMarkedStarted(supabase, raceGuestEntryId);
  if (started.error) return { error: started.error };

  if (positional) {
    const finishPosition = parseFinishPosition(input.finish_position);
    if (finishPosition == null) {
      return { error: "Enter a finish position of at least 1." };
    }

    const nowIso = new Date().toISOString();
    const applyRes = await applyFinishPositionInFleet(supabase, {
      raceId,
      fleetId: (ge as { fleet_id?: string | null }).fleet_id ?? null,
      target: { kind: "guest", raceGuestEntryId },
      newPosition: finishPosition,
      allowEqualPosition: Boolean(input.allow_equal_position),
      nowIso,
    });
    if (applyRes.error) {
      return { error: applyRes.error };
    }

    revalidateRaceFinishes(groupId, seriesId, raceId);
    return { ok: true, savedLocal: String(finishPosition) };
  }

  if (!rawWhen) {
    return { error: "Enter a finish time." };
  }

  const parsed = await parseClubLocalFinishTime(supabase, groupId, rawWhen);
  if ("error" in parsed) return parsed;

  const { error } = await supabase.from("race_guest_finishes").upsert(
    {
      race_guest_entry_id: raceGuestEntryId,
      ro_finish_at: parsed.roIso,
      official_finish_at: parsed.roIso,
    },
    { onConflict: "race_guest_entry_id" },
  );

  if (error) {
    return { error: error.message };
  }

  revalidateRaceFinishes(groupId, seriesId, raceId);
  return { ok: true, savedLocal: rawWhen };
}

/** Manual finishes UI: remove finish time, position, or non-finisher status (no redirect). */
export async function deleteRoFinishManualAction(input: {
  group_id: string;
  series_id: string;
  race_id: string;
  race_entry_id: string;
}): Promise<{ ok: true } | { error: string }> {
  const groupId = String(input.group_id ?? "").trim();
  const seriesId = String(input.series_id ?? "").trim();
  const raceId = String(input.race_id ?? "").trim();
  const raceEntryId = String(input.race_entry_id ?? "").trim();

  if (!groupId || !seriesId || !raceId || !raceEntryId) {
    return { error: "Missing race context." };
  }

  const { supabase, user } = await getServerAuth();
  if (!user) return { error: "Not signed in." };

  const { data: staff } = await supabase
    .from("group_memberships")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (staff?.role !== "club_admin" && staff?.role !== "race_officer") {
    return { error: "Only club admins and race officers can record finishes." };
  }

  const { data: entry, error: fetchErr } = await supabase
    .from("race_entries")
    .select("id, race_id, fleet_id")
    .eq("id", raceEntryId)
    .maybeSingle();

  if (fetchErr || !entry || entry.race_id !== raceId) {
    return { error: "Entry not found for this race." };
  }

  const raceType = await loadRaceTypeForRace(supabase, raceId);
  const positional = raceTypeUsesPositionalScoring(raceType);

  if (positional) {
    const { data: finishRow } = await supabase
      .from("race_finishes")
      .select("finish_position")
      .eq("race_entry_id", raceEntryId)
      .maybeSingle();

    if (finishRow?.finish_position != null && finishRow.finish_position >= 1) {
      const removeRes = await removeFinishPositionInFleet(supabase, {
        raceId,
        fleetId: entry.fleet_id ?? null,
        target: { kind: "official", raceEntryId },
      });
      if (removeRes.error) return { error: removeRes.error };
    } else {
      const { error: delErr } = await supabase.from("race_finishes").delete().eq("race_entry_id", raceEntryId);
      if (delErr) return { error: delErr.message };
    }
  } else {
    const { error: delErr } = await supabase.from("race_finishes").delete().eq("race_entry_id", raceEntryId);
    if (delErr) return { error: delErr.message };
  }

  const { error: outcomeErr } = await supabase
    .from("race_entries")
    .update({ outcome: null })
    .eq("id", raceEntryId);

  if (outcomeErr) return { error: outcomeErr.message };

  revalidateRaceFinishes(groupId, seriesId, raceId);
  revalidatePath("/");
  return { ok: true };
}

/** Manual finishes UI: remove guest finish time or position (no redirect). */
export async function deleteRaceGuestRoFinishManualAction(input: {
  group_id: string;
  series_id: string;
  race_id: string;
  race_guest_entry_id: string;
}): Promise<{ ok: true } | { error: string }> {
  const groupId = String(input.group_id ?? "").trim();
  const seriesId = String(input.series_id ?? "").trim();
  const raceId = String(input.race_id ?? "").trim();
  const raceGuestEntryId = String(input.race_guest_entry_id ?? "").trim();

  if (!groupId || !seriesId || !raceId || !raceGuestEntryId) {
    return { error: "Missing race context." };
  }

  const { supabase, user } = await getServerAuth();
  if (!user) return { error: "Not signed in." };

  const { data: staff } = await supabase
    .from("group_memberships")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (staff?.role !== "club_admin" && staff?.role !== "race_officer") {
    return { error: "Only club admins and race officers can record finishes." };
  }

  const { data: ge, error: fetchErr } = await supabase
    .from("race_guest_entries")
    .select("id, race_id, link_status, fleet_id")
    .eq("id", raceGuestEntryId)
    .maybeSingle();

  if (fetchErr || !ge || ge.race_id !== raceId) {
    return { error: "Guest race entry not found." };
  }

  if ((ge as { link_status?: string }).link_status === "confirmed") {
    return { error: "This guest row is linked — edit finishes on the official entry." };
  }

  const raceType = await loadRaceTypeForRace(supabase, raceId);
  const positional = raceTypeUsesPositionalScoring(raceType);

  if (positional) {
    const { data: finishRow } = await supabase
      .from("race_guest_finishes")
      .select("finish_position")
      .eq("race_guest_entry_id", raceGuestEntryId)
      .maybeSingle();

    if (finishRow?.finish_position != null && finishRow.finish_position >= 1) {
      const removeRes = await removeFinishPositionInFleet(supabase, {
        raceId,
        fleetId: (ge as { fleet_id?: string | null }).fleet_id ?? null,
        target: { kind: "guest", raceGuestEntryId },
      });
      if (removeRes.error) return { error: removeRes.error };
    } else {
      const { error: delErr } = await supabase
        .from("race_guest_finishes")
        .delete()
        .eq("race_guest_entry_id", raceGuestEntryId);
      if (delErr) return { error: delErr.message };
    }
  } else {
    const { error: delErr } = await supabase
      .from("race_guest_finishes")
      .delete()
      .eq("race_guest_entry_id", raceGuestEntryId);
    if (delErr) return { error: delErr.message };
  }

  revalidateRaceFinishes(groupId, seriesId, raceId);
  revalidatePath("/");
  return { ok: true };
}

export async function upsertRoFinishAction(formData: FormData) {
  const groupId = String(formData.get("group_id") ?? "").trim();
  const seriesId = String(formData.get("series_id") ?? "").trim();
  const raceId = String(formData.get("race_id") ?? "").trim();
  const raceEntryId = String(formData.get("race_entry_id") ?? "").trim();
  const rawWhen = String(formData.get("ro_finish_at") ?? "").trim();

  if (!groupId || !seriesId || !raceId || !raceEntryId) {
    redirect("/groups?error=" + encodeURIComponent("Missing race context."));
  }

  const { supabase, user } = await getServerAuth();

  if (!user) redirect("/login");

  await requireRaceStaff(supabase, groupId, user.id);

  const parsed = await parseClubLocalFinishTime(supabase, groupId, rawWhen);
  if ("error" in parsed) {
    staffRedirect(
      formData,
      groupId,
      seriesId,
      raceId,
      `error=${encodeURIComponent(parsed.error)}`,
    );
  }

  const { data: entry, error: fetchErr } = await supabase
    .from("race_entries")
    .select("id, race_id")
    .eq("id", raceEntryId)
    .maybeSingle();

  if (fetchErr || !entry || entry.race_id !== raceId) {
    staffRedirect(
      formData,
      groupId,
      seriesId,
      raceId,
      `error=${encodeURIComponent("Entry not found for this race.")}`,
    );
  }

  const { error } = await supabase.from("race_finishes").upsert(
    {
      race_entry_id: raceEntryId,
      ro_finish_at: parsed.roIso,
      official_finish_at: parsed.roIso,
    },
    { onConflict: "race_entry_id" },
  );

  if (error) {
    staffRedirect(
      formData,
      groupId,
      seriesId,
      raceId,
      `error=${encodeURIComponent(error.message)}`,
    );
  }

  staffRedirect(formData, groupId, seriesId, raceId, "ro_finish=1");
}

export async function recordRoFinishNowAction(input: {
  group_id: string;
  series_id: string;
  race_id: string;
  race_entry_id: string;
}): Promise<{ ok?: true; error?: string }> {
  const groupId = String(input.group_id ?? "").trim();
  const seriesId = String(input.series_id ?? "").trim();
  const raceId = String(input.race_id ?? "").trim();
  const raceEntryId = String(input.race_entry_id ?? "").trim();

  if (!groupId || !seriesId || !raceId || !raceEntryId) {
    return { error: "Missing race context." };
  }

  const { supabase, user } = await getServerAuth();

  if (!user) return { error: "Not signed in." };

  const { data: m } = await supabase
    .from("group_memberships")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (m?.role !== "club_admin" && m?.role !== "race_officer") {
    return { error: "Only club admins and race officers can record finishes." };
  }

  const { data: entry, error: fetchErr } = await supabase
    .from("race_entries")
    .select("id, race_id, fleet_id")
    .eq("id", raceEntryId)
    .maybeSingle();

  if (fetchErr || !entry || entry.race_id !== raceId) {
    return { error: "Entry not found for this race." };
  }

  const { data: raceRow } = await supabase.from("races").select("race_type").eq("id", raceId).maybeSingle();
  const raceType = normalizeRaceType(raceRow?.race_type);
  const positional = raceTypeUsesPositionalScoring(raceType);

  const nowIso = new Date().toISOString();
  const finishPayload: {
    race_entry_id: string;
    ro_finish_at: string;
    official_finish_at: string;
    finish_position?: number;
  } = {
    race_entry_id: raceEntryId,
    ro_finish_at: nowIso,
    official_finish_at: nowIso,
  };

  if (positional) {
    finishPayload.finish_position = await nextFinishPositionInFleet(
      supabase,
      raceId,
      entry.fleet_id ?? null,
    );
  }

  const { error: finishErr } = await supabase.from("race_finishes").upsert(finishPayload, {
    onConflict: "race_entry_id",
  });

  if (finishErr) {
    return { error: finishErr.message };
  }

  const { error: outcomeErr } = await supabase
    .from("race_entries")
    .update({ outcome: "finished" })
    .eq("id", raceEntryId);

  if (outcomeErr) {
    return { error: outcomeErr.message };
  }

  revalidatePath(`/groups/${groupId}/series/${seriesId}/races/${raceId}/finishes`);
  revalidatePath("/");
  return { ok: true };
}

export async function recordRaceGuestRoFinishNowAction(input: {
  group_id: string;
  series_id: string;
  race_id: string;
  race_guest_entry_id: string;
}): Promise<{ ok?: true; error?: string }> {
  const groupId = String(input.group_id ?? "").trim();
  const seriesId = String(input.series_id ?? "").trim();
  const raceId = String(input.race_id ?? "").trim();
  const raceGuestEntryId = String(input.race_guest_entry_id ?? "").trim();

  if (!groupId || !seriesId || !raceId || !raceGuestEntryId) {
    return { error: "Missing race context." };
  }

  const { supabase, user } = await getServerAuth();
  if (!user) return { error: "Not signed in." };

  const { data: m } = await supabase
    .from("group_memberships")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (m?.role !== "club_admin" && m?.role !== "race_officer") {
    return { error: "Only club admins and race officers can record finishes." };
  }

  const raceType = await loadRaceTypeForRace(supabase, raceId);
  const positional = raceTypeUsesPositionalScoring(raceType);

  const { data: ge, error: fetchErr } = await supabase
    .from("race_guest_entries")
    .select("id, race_id, link_status, fleet_id")
    .eq("id", raceGuestEntryId)
    .maybeSingle();

  if (fetchErr || !ge || ge.race_id !== raceId) {
    return { error: "Guest race entry not found." };
  }

  if ((ge as { link_status?: string }).link_status === "confirmed") {
    return { error: "This guest row is linked — edit finishes on the official entry." };
  }

  const started = await ensureAdhocGuestMarkedStarted(supabase, raceGuestEntryId);
  if (started.error) return { error: started.error };

  const nowIso = new Date().toISOString();
  const guestFinishPayload: {
    race_guest_entry_id: string;
    ro_finish_at: string;
    official_finish_at: string;
    finish_position?: number;
  } = {
    race_guest_entry_id: raceGuestEntryId,
    ro_finish_at: nowIso,
    official_finish_at: nowIso,
  };

  if (positional) {
    guestFinishPayload.finish_position = await nextFinishPositionInFleet(
      supabase,
      raceId,
      (ge as { fleet_id?: string | null }).fleet_id ?? null,
    );
  }

  const { error } = await supabase.from("race_guest_finishes").upsert(guestFinishPayload, {
    onConflict: "race_guest_entry_id",
  });

  if (error) return { error: error.message };

  revalidateRaceFinishes(groupId, seriesId, raceId);
  revalidatePath("/");
  return { ok: true };
}

export async function updateOfficialFinishAction(formData: FormData) {
  const groupId = String(formData.get("group_id") ?? "").trim();
  const seriesId = String(formData.get("series_id") ?? "").trim();
  const raceId = String(formData.get("race_id") ?? "").trim();
  const raceEntryId = String(formData.get("race_entry_id") ?? "").trim();
  const rawOfficial = String(formData.get("official_finish_at") ?? "").trim();

  if (!groupId || !seriesId || !raceId || !raceEntryId) {
    redirect("/groups?error=" + encodeURIComponent("Missing race context."));
  }

  const { supabase, user } = await getServerAuth();

  if (!user) redirect("/login");

  await requireRaceStaff(supabase, groupId, user.id);

  const tz = await selectGroupIanaTimeZone(supabase, groupId);
  const officialIso = zonedDatetimeLocalToUtcIso(rawOfficial, tz);
  if (!officialIso) {
    staffRedirect(
      formData,
      groupId,
      seriesId,
      raceId,
      `error=${encodeURIComponent(
        rawOfficial.trim()
          ? "Official finish time is invalid or falls in a non-existent clock-change window."
          : "Official finish time is required (club local date and time).",
      )}`,
    );
  }

  const { data: entry, error: fetchErr } = await supabase
    .from("race_entries")
    .select("id, race_id")
    .eq("id", raceEntryId)
    .maybeSingle();

  if (fetchErr || !entry || entry.race_id !== raceId) {
    staffRedirect(
      formData,
      groupId,
      seriesId,
      raceId,
      `error=${encodeURIComponent("Entry not found for this race.")}`,
    );
  }

  const { data: finishRow, error: finishFetchErr } = await supabase
    .from("race_finishes")
    .select("id")
    .eq("race_entry_id", raceEntryId)
    .maybeSingle();

  if (finishFetchErr || !finishRow) {
    staffRedirect(
      formData,
      groupId,
      seriesId,
      raceId,
      `error=${encodeURIComponent("Record an RO finish before adjusting official time.")}`,
    );
  }

  const { error } = await supabase
    .from("race_finishes")
    .update({ official_finish_at: officialIso })
    .eq("race_entry_id", raceEntryId);

  if (error) {
    staffRedirect(
      formData,
      groupId,
      seriesId,
      raceId,
      `error=${encodeURIComponent(error.message)}`,
    );
  }

  staffRedirect(formData, groupId, seriesId, raceId, "official_saved=1");
}
