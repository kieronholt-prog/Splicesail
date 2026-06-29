"use server";

import { crewTemplateFromForm } from "@/lib/boat-crew";
import { bumpTally as bumpTallyCore } from "@/lib/tally/bump-tally";
import { undoTallyAfloat as undoTallyAfloatCore } from "@/lib/tally/undo-tally-afloat";
import { createClient } from "@/lib/supabase/server";
import { getServerAuth } from "@/lib/supabase/auth-cache";
import {
  isRoOnlyFinishOutcome,
} from "@/lib/finish-outcome-labels";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export type TallyActionResult = { ok: true } | { ok: false; error: string };

function tallyRevalidateHome() {
  revalidatePath("/");
}

async function requireOwnRaceEntry(
  supabase: Awaited<ReturnType<typeof createClient>>,
  raceId: string,
  userId: string,
): Promise<TallyActionResult | null> {
  const { data: row } = await supabase
    .from("race_entries")
    .select("id")
    .eq("race_id", raceId)
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (!row) {
    return {
      ok: false,
      error: "Tally afloat or ashore on Home first to create your race entry.",
    };
  }
  return null;
}

type RaceGroupContext =
  | { ok: true; scheduledAt: string; seriesId: string }
  | { ok: false; error: string };

async function loadRaceGroupContext(
  supabase: Awaited<ReturnType<typeof createClient>>,
  raceId: string,
  seriesId: string,
  groupId: string,
): Promise<RaceGroupContext> {
  const { data: race } = await supabase
    .from("races")
    .select("scheduled_at, series_id, series:series_id ( group_id )")
    .eq("id", raceId)
    .maybeSingle();

  if (!race) return { ok: false, error: "Race not found." };
  if (race.series_id !== seriesId) return { ok: false, error: "Race not in this series." };

  const seriesNest = race.series as { group_id?: string } | { group_id?: string }[] | null;
  const seriesRow = Array.isArray(seriesNest) ? seriesNest[0] : seriesNest;
  if (!seriesRow?.group_id || seriesRow.group_id !== groupId) {
    return { ok: false, error: "Race not in this series." };
  }

  return { ok: true, scheduledAt: race.scheduled_at, seriesId: race.series_id };
}

export async function tallyAfloatAction(formData: FormData): Promise<TallyActionResult> {
  return bumpTally(formData, "afloat");
}

export async function tallyAshoreAction(formData: FormData): Promise<TallyActionResult> {
  return bumpTally(formData, "ashore");
}

export async function undoTallyAfloatAction(formData: FormData): Promise<TallyActionResult> {
  const groupId = String(formData.get("group_id") ?? "").trim();
  const seriesId = String(formData.get("series_id") ?? "").trim();
  const raceId = String(formData.get("race_id") ?? "").trim();
  const boatIdForm = String(formData.get("boat_id") ?? "").trim();

  if (!groupId || !seriesId || !raceId || !boatIdForm) {
    return { ok: false, error: "Missing race or hull — reload Home." };
  }

  const { supabase, user } = await getServerAuth();
  if (!user) redirect("/login");

  const entryGate = await requireOwnRaceEntry(supabase, raceId, user.id);
  if (entryGate) return entryGate;

  const result = await undoTallyAfloatCore(supabase, {
    groupId,
    seriesId,
    raceId,
    boatId: boatIdForm,
    userId: user.id,
  });

  if (!result.ok) return result;

  tallyRevalidateHome();
  return { ok: true };
}

async function bumpTally(
  formData: FormData,
  which: "afloat" | "ashore",
): Promise<TallyActionResult> {
  const groupId = String(formData.get("group_id") ?? "").trim();
  const seriesId = String(formData.get("series_id") ?? "").trim();
  const raceId = String(formData.get("race_id") ?? "").trim();
  const boatIdForm = String(formData.get("boat_id") ?? "").trim();
  const outcomeRaw =
    which === "ashore" ? String(formData.get("outcome") ?? "").trim() : undefined;

  const { supabase, user } = await getServerAuth();
  if (!user) redirect("/login");

  const result = await bumpTallyCore(supabase, {
    groupId,
    seriesId,
    raceId,
    boatId: boatIdForm,
    userId: user.id,
    which,
    outcome: outcomeRaw,
  });

  if (!result.ok) return result;

  tallyRevalidateHome();
  return { ok: true };
}

async function assertRaceInGroup(
  supabase: Awaited<ReturnType<typeof createClient>>,
  raceId: string,
  seriesId: string,
  groupId: string,
): Promise<boolean> {
  const ctx = await loadRaceGroupContext(supabase, raceId, seriesId, groupId);
  return ctx.ok;
}

export async function updateRaceEntrySailNumberForHomeAction(formData: FormData) {
  const groupId = String(formData.get("group_id") ?? "").trim();
  const seriesId = String(formData.get("series_id") ?? "").trim();
  const raceId = String(formData.get("race_id") ?? "").trim();
  const raceEntryId = String(formData.get("race_entry_id") ?? "").trim();
  const sail_raw = String(formData.get("sail_number_override") ?? "").trim();

  if (!groupId || !seriesId || !raceId || !raceEntryId) {
    redirect(`/?error=${encodeURIComponent("Missing race context.")}`);
  }

  const { supabase, user } = await getServerAuth();

  if (!user) redirect("/login");

  if (!(await assertRaceInGroup(supabase, raceId, seriesId, groupId))) {
    redirect(`/?error=${encodeURIComponent("Race not in this series.")}`);
  }

  const entryGate = await requireOwnRaceEntry(supabase, raceId, user.id);
  if (entryGate && !entryGate.ok) redirect(`/?error=${encodeURIComponent(entryGate.error)}`);

  const { data: tgt } = await supabase
    .from("race_entries")
    .select("id")
    .eq("id", raceEntryId)
    .eq("race_id", raceId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!tgt?.id) {
    redirect(`/?error=${encodeURIComponent("Race entry not found.")}`);
  }

  const { error } = await supabase
    .from("race_entries")
    .update({
      sail_number_override: sail_raw.length ? sail_raw : null,
    })
    .eq("id", tgt.id);

  if (error) {
    redirect(`/?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/?details_saved=1");
}

export async function updateRaceEntryCrewOverrideForHomeAction(formData: FormData) {
  const groupId = String(formData.get("group_id") ?? "").trim();
  const seriesId = String(formData.get("series_id") ?? "").trim();
  const raceId = String(formData.get("race_id") ?? "").trim();
  const raceEntryId = String(formData.get("race_entry_id") ?? "").trim();
  const clear = String(formData.get("clear_crew_override") ?? "").trim() === "1";

  if (!groupId || !seriesId || !raceId || !raceEntryId) {
    redirect(`/?error=${encodeURIComponent("Missing race context.")}`);
  }

  const { supabase, user } = await getServerAuth();

  if (!user) redirect("/login");

  if (!(await assertRaceInGroup(supabase, raceId, seriesId, groupId))) {
    redirect(`/?error=${encodeURIComponent("Race not in this series.")}`);
  }

  const entryGate = await requireOwnRaceEntry(supabase, raceId, user.id);
  if (entryGate && !entryGate.ok) redirect(`/?error=${encodeURIComponent(entryGate.error)}`);

  if (clear) {
    const { data: tgt } = await supabase
      .from("race_entries")
      .select("id")
      .eq("id", raceEntryId)
      .eq("race_id", raceId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!tgt?.id) {
      redirect(`/?error=${encodeURIComponent("Race entry not found.")}`);
    }

    const { error } = await supabase
      .from("race_entries")
      .update({ crew_template_override: null })
      .eq("id", tgt.id);

    if (error) {
      redirect(`/?error=${encodeURIComponent(error.message)}`);
    }
    redirect("/?details_saved=1");
  }

  const { data: entry } = await supabase
    .from("race_entries")
    .select("boat_id")
    .eq("id", raceEntryId)
    .eq("race_id", raceId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!entry?.boat_id) {
    redirect(`/?error=${encodeURIComponent("Race entry needs a boat before crew overrides.")}`);
  }

  const { data: boat } = await supabase
    .from("boats")
    .select("handedness")
    .eq("id", entry.boat_id)
    .eq("owner_user_id", user.id)
    .maybeSingle();

  if (!boat?.handedness) {
    redirect(`/?error=${encodeURIComponent("Could not load hull handedness.")}`);
  }

  const tpl = crewTemplateFromForm(formData, boat.handedness);
  if (!tpl) {
    redirect(`/?error=${encodeURIComponent("Could not read crew configuration.")}`);
  }

  const { error } = await supabase.from("race_entries").update({ crew_template_override: tpl }).eq("id", raceEntryId);

  if (error) {
    redirect(`/?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/?details_saved=1");
}
