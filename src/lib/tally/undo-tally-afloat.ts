import type { SupabaseClient } from "@supabase/supabase-js";
import { fleetMatchByRaceBoat } from "@/lib/race-boat-fleet-start-offset";
import { fleetStartUtcMs } from "@/lib/tally-window";

export type TallyUndoResult = { ok: true } | { ok: false; error: string };

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

export type UndoTallyAfloatInput = {
  groupId: string;
  seriesId: string;
  raceId: string;
  boatId: string;
  userId: string;
};

export async function undoTallyAfloat(
  supabase: SupabaseClient,
  input: UndoTallyAfloatInput,
): Promise<TallyUndoResult> {
  const { groupId, seriesId, raceId, boatId, userId } = input;

  if (!groupId || !seriesId || !raceId || !boatId) {
    return { ok: false, error: "Missing race or hull." };
  }

  const [raceCtx, entryResult] = await Promise.all([
    loadRaceGroupContext(supabase, raceId, seriesId, groupId),
    supabase
      .from("race_entries")
      .select("id, tally_afloat_at, tally_ashore_at, fleet_id, outcome")
      .eq("race_id", raceId)
      .eq("user_id", userId)
      .eq("boat_id", boatId)
      .maybeSingle(),
  ]);

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
    boatId,
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
  return { ok: true };
}
