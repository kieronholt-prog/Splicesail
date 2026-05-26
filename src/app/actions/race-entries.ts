"use server";

import { crewTemplateFromForm } from "@/lib/boat-crew";
import { fleetMatchByRaceBoat } from "@/lib/race-boat-fleet-start-offset";
import { fleetStartUtcMs } from "@/lib/tally-window";
import { createClient } from "@/lib/supabase/server";
import { getServerAuth } from "@/lib/supabase/auth-cache";
import { boatLinkedToSeriesSignup } from "@/lib/series-registration-boats";
import {
  isRoOnlyFinishOutcome,
  isSailorDeclarationOutcome,
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

type TallyFleetContext = { offsetMinutes: number; fleetId: string | null };

async function resolveTallyFleetContext(
  supabase: Awaited<ReturnType<typeof createClient>>,
  raceId: string,
  boatId: string,
  ctx: { groupId: string; seriesId: string },
  existingFleetId: string | null,
): Promise<TallyFleetContext> {
  const matchKey = `${raceId}\u0000${boatId}`;
  const matchPromise = fleetMatchByRaceBoat(supabase, [
    { raceId, boatId, groupId: ctx.groupId, seriesId: ctx.seriesId },
  ]);

  if (existingFleetId) {
    const [{ data: rf }, matches] = await Promise.all([
      supabase
        .from("race_fleets")
        .select("start_offset_minutes")
        .eq("id", existingFleetId)
        .eq("race_id", raceId)
        .maybeSingle(),
      matchPromise,
    ]);
    const match = matches.get(matchKey);
    const offsetMinutes =
      rf?.start_offset_minutes != null && Number.isFinite(Number(rf.start_offset_minutes))
        ? Number(rf.start_offset_minutes)
        : (match?.offsetMinutes ?? 0);
    return { offsetMinutes, fleetId: match?.fleetId ?? existingFleetId };
  }

  const matches = await matchPromise;
  const match = matches.get(matchKey);
  return { offsetMinutes: match?.offsetMinutes ?? 0, fleetId: match?.fleetId ?? null };
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

  const [raceCtx, entryResult, entryGate] = await Promise.all([
    loadRaceGroupContext(supabase, raceId, seriesId, groupId),
    supabase
      .from("race_entries")
      .select("id, tally_afloat_at, tally_ashore_at, fleet_id, outcome")
      .eq("race_id", raceId)
      .eq("user_id", user.id)
      .eq("boat_id", boatIdForm)
      .maybeSingle(),
    requireOwnRaceEntry(supabase, raceId, user.id),
  ]);

  if (entryGate) return entryGate;
  if (!raceCtx.ok) return raceCtx;

  const entryRow = entryResult.data;
  if (!entryRow?.tally_afloat_at) {
    return { ok: false, error: "Nothing to undo for that hull." };
  }
  if (entryRow.tally_ashore_at) {
    return {
      ok: false,
      error: "Tally afloat can't be undone after tally ashore has been recorded for that hull.",
    };
  }

  const fleetCtx = await resolveTallyFleetContext(
    supabase,
    raceId,
    boatIdForm,
    { groupId, seriesId },
    entryRow.fleet_id,
  );

  const fleetStartMs = fleetStartUtcMs(raceCtx.scheduledAt, fleetCtx.offsetMinutes);
  if (Date.now() >= fleetStartMs) {
    return { ok: false, error: "Undo tally afloat is only available before your fleet start." };
  }

  const preserveOcs =
    entryRow.outcome != null && String(entryRow.outcome).toLowerCase() === "ocs";

  const { error } = await supabase
    .from("race_entries")
    .update({
      tally_afloat_at: null,
      tally_ashore_at: null,
      outcome: preserveOcs ? "ocs" : null,
      fleet_id: null,
    })
    .eq("id", entryRow.id);

  if (error) return { ok: false, error: error.message };

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

  if (!groupId || !seriesId || !raceId) {
    return { ok: false, error: "Missing race context." };
  }

  if (!boatIdForm) {
    return {
      ok: false,
      error:
        which === "afloat"
          ? "Choose which hull you are tallying — one button per boat on Home."
          : "Missing hull on tally — reload Home and try again.",
    };
  }

  const { supabase, user } = await getServerAuth();
  if (!user) redirect("/login");

  const outcomeRaw =
    which === "ashore" ? String(formData.get("outcome") ?? "").trim() : "";

  const ctx = { groupId, seriesId };

  const [raceCtx, existingEntryResult, linked] = await Promise.all([
    loadRaceGroupContext(supabase, raceId, seriesId, groupId),
    supabase
      .from("race_entries")
      .select("id, fleet_id, tally_afloat_at, tally_ashore_at, boat_id, outcome")
      .eq("race_id", raceId)
      .eq("user_id", user.id)
      .eq("boat_id", boatIdForm)
      .maybeSingle(),
    boatLinkedToSeriesSignup(supabase, {
      seriesId,
      userId: user.id,
      boatId: boatIdForm,
    }),
  ]);

  if (!raceCtx.ok) return raceCtx;
  if (!linked) {
    return { ok: false, error: "That hull is not on your series signup for this fixture." };
  }

  const existingEntryForBoat = existingEntryResult.data;

  const fleetCtx = await resolveTallyFleetContext(
    supabase,
    raceId,
    boatIdForm,
    ctx,
    existingEntryForBoat?.fleet_id ?? null,
  );

  const fleetStartMs = fleetStartUtcMs(raceCtx.scheduledAt, fleetCtx.offsetMinutes);
  const nowMs = Date.now();

  if (which === "afloat") {
    if (nowMs >= fleetStartMs) {
      return {
        ok: false,
        error: "Tally afloat is only available until your fleet start (race signal plus fleet offset).",
      };
    }
  } else if (nowMs < fleetStartMs) {
    return {
      ok: false,
      error: "Tally ashore and declaration open from your fleet start onward.",
    };
  }

  if (which === "ashore") {
    if (!outcomeRaw.length) {
      return { ok: false, error: "Choose a declaration." };
    }

    const priorOutcome =
      existingEntryForBoat?.outcome != null
        ? String(existingEntryForBoat.outcome).toLowerCase()
        : null;
    const priorRoOutcome =
      priorOutcome && isRoOnlyFinishOutcome(priorOutcome) ? priorOutcome : null;

    if (priorRoOutcome) {
      if (outcomeRaw !== priorRoOutcome) {
        return {
          ok: false,
          error: `The race officer recorded ${priorRoOutcome.toUpperCase()} for this entry — tally ashore only to confirm.`,
        };
      }
    } else if (isRoOnlyFinishOutcome(outcomeRaw)) {
      return {
        ok: false,
        error: `${outcomeRaw.toUpperCase()} is recorded by the race officer — you cannot declare it yourself here.`,
      };
    } else if (!isSailorDeclarationOutcome(outcomeRaw)) {
      return { ok: false, error: "Invalid finish status for tally ashore." };
    }
  }

  const nowIso = new Date().toISOString();

  if (which === "afloat") {
    if (existingEntryForBoat?.tally_afloat_at) {
      return {
        ok: false,
        error: "You have already tallied afloat for this hull — use undo on Home to change.",
      };
    }

    const fleetId = fleetCtx.fleetId;

    if (!existingEntryForBoat) {
      const { error } = await supabase.from("race_entries").insert({
        race_id: raceId,
        user_id: user.id,
        boat_id: boatIdForm,
        tally_afloat_at: nowIso,
        fleet_id: fleetId,
      });
      if (error) return { ok: false, error: error.message };
    } else {
      const { error } = await supabase
        .from("race_entries")
        .update({ tally_afloat_at: nowIso, fleet_id: fleetId })
        .eq("id", existingEntryForBoat.id);
      if (error) return { ok: false, error: error.message };
    }

    tallyRevalidateHome();
    return { ok: true };
  }

  const basePatch = {
    tally_ashore_at: nowIso,
    outcome: outcomeRaw.length ? outcomeRaw : null,
  };

  if (!existingEntryForBoat) {
    const fleetId = fleetCtx.fleetId;
    const { error: insErr } = await supabase.from("race_entries").insert({
      race_id: raceId,
      user_id: user.id,
      boat_id: boatIdForm,
      fleet_id: fleetId,
      ...basePatch,
    });

    if (insErr) return { ok: false, error: insErr.message };

    tallyRevalidateHome();
    return { ok: true };
  }

  const { error: ashErr } = await supabase
    .from("race_entries")
    .update(basePatch)
    .eq("id", existingEntryForBoat.id);

  if (ashErr) return { ok: false, error: ashErr.message };

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
