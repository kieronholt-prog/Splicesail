import type { SupabaseClient } from "@supabase/supabase-js";
import { fleetMatchByRaceBoat } from "@/lib/race-boat-fleet-start-offset";
import { fleetStartUtcMs } from "@/lib/tally-window";
import { boatLinkedToSeriesSignup } from "@/lib/series-registration-boats";
import {
  isRoOnlyFinishOutcome,
  isSailorDeclarationOutcome,
} from "@/lib/finish-outcome-labels";

export type TallyBumpResult =
  | { ok: true; raceEntryId: string }
  | { ok: false; error: string };

type RaceGroupContext =
  | { ok: true; scheduledAt: string; seriesId: string }
  | { ok: false; error: string };

async function loadRaceGroupContext(
  supabase: SupabaseClient,
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
  supabase: SupabaseClient,
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

export type TallyBumpInput = {
  groupId: string;
  seriesId: string;
  raceId: string;
  boatId: string;
  userId: string;
  which: "afloat" | "ashore";
  /** Required when which === "ashore" */
  outcome?: string;
};

export async function bumpTally(
  supabase: SupabaseClient,
  input: TallyBumpInput,
): Promise<TallyBumpResult> {
  const { groupId, seriesId, raceId, boatId, userId, which } = input;
  const outcomeRaw = which === "ashore" ? (input.outcome ?? "").trim() : "";

  if (!groupId || !seriesId || !raceId) {
    return { ok: false, error: "Missing race context." };
  }

  if (!boatId) {
    return {
      ok: false,
      error:
        which === "afloat"
          ? "Choose which hull you are tallying — one button per boat on Home."
          : "Missing hull on tally — reload Home and try again.",
    };
  }

  const ctx = { groupId, seriesId };

  const [raceCtx, existingEntryResult, linked] = await Promise.all([
    loadRaceGroupContext(supabase, raceId, seriesId, groupId),
    supabase
      .from("race_entries")
      .select("id, fleet_id, tally_afloat_at, tally_ashore_at, boat_id, outcome")
      .eq("race_id", raceId)
      .eq("user_id", userId)
      .eq("boat_id", boatId)
      .maybeSingle(),
    boatLinkedToSeriesSignup(supabase, {
      seriesId,
      userId,
      boatId,
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
    boatId,
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
      const { data: inserted, error } = await supabase
        .from("race_entries")
        .insert({
          race_id: raceId,
          user_id: userId,
          boat_id: boatId,
          tally_afloat_at: nowIso,
          fleet_id: fleetId,
        })
        .select("id")
        .single();
      if (error) return { ok: false, error: error.message };
      return { ok: true, raceEntryId: inserted.id };
    }

    const { error } = await supabase
      .from("race_entries")
      .update({ tally_afloat_at: nowIso, fleet_id: fleetCtx.fleetId })
      .eq("id", existingEntryForBoat.id);
    if (error) return { ok: false, error: error.message };
    return { ok: true, raceEntryId: existingEntryForBoat.id };
  }

  const basePatch = {
    tally_ashore_at: nowIso,
    outcome: outcomeRaw.length ? outcomeRaw : null,
  };

  if (!existingEntryForBoat) {
    const fleetId = fleetCtx.fleetId;
    const { data: inserted, error: insErr } = await supabase
      .from("race_entries")
      .insert({
        race_id: raceId,
        user_id: userId,
        boat_id: boatId,
        fleet_id: fleetId,
        ...basePatch,
      })
      .select("id")
      .single();

    if (insErr) return { ok: false, error: insErr.message };
    return { ok: true, raceEntryId: inserted.id };
  }

  const { error: ashErr } = await supabase
    .from("race_entries")
    .update(basePatch)
    .eq("id", existingEntryForBoat.id);

  if (ashErr) return { ok: false, error: ashErr.message };
  return { ok: true, raceEntryId: existingEntryForBoat.id };
}
