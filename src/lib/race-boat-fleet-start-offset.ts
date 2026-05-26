import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeBoatClassKey } from "@/lib/normalize-class";
import { boatEffectivePyByIdMap, type BoatPyRow } from "@/lib/resolve-class-py";
import { matchFleetId, type RaceFleetRuleRow } from "@/lib/resolve-entry-fleet";

export type RaceBoatFleetRequest = {
  raceId: string;
  boatId: string;
  groupId: string;
  seriesId: string;
};

export type RaceBoatFleetMatch = {
  offsetMinutes: number;
  fleetId: string | null;
  fleetName: string | null;
};

/**
 * Matches each boat to a race fleet (offset, id, name) using the same rules as `recomputeFleetIdForRaceEntry`.
 */
export async function fleetMatchByRaceBoat(
  supabase: SupabaseClient,
  requests: RaceBoatFleetRequest[],
): Promise<Map<string, RaceBoatFleetMatch>> {
  const out = new Map<string, RaceBoatFleetMatch>();
  if (!requests.length) return out;

  const raceIds = [...new Set(requests.map((r) => r.raceId))];
  const allBoatIds = [...new Set(requests.map((r) => r.boatId))];

  type FleetDbRow = {
    id: string;
    race_id: string;
    name: string | null;
    sort_order: number;
    filter_mode: "class_keys" | "py_range";
    class_keys: string[] | null;
    py_min: number | null;
    py_max: number | null;
    start_offset_minutes: unknown;
  };

  const [{ data: fleetsRaw }, { data: boatsRaw }] = await Promise.all([
    supabase
      .from("race_fleets")
      .select(
        "id, race_id, name, sort_order, filter_mode, class_keys, py_min, py_max, start_offset_minutes",
      )
      .in("race_id", raceIds),
    supabase.from("boats").select("id, class_name, py_rating, rya_class_key").in("id", allBoatIds),
  ]);

  const boatsList = ((boatsRaw ?? []) as BoatPyRow[]).slice();
  const boatById = new Map(boatsList.map((b) => [b.id, b] as const));

  const fleetsByRace = new Map<string, RaceFleetRuleRow[]>();
  const metaByRaceFleetKey = new Map<string, { offsetMinutes: number; fleetName: string | null }>();
  for (const f of (fleetsRaw ?? []) as FleetDbRow[]) {
    let list = fleetsByRace.get(f.race_id);
    if (!list) {
      list = [];
      fleetsByRace.set(f.race_id, list);
    }
    list.push({
      id: f.id,
      sort_order: f.sort_order,
      filter_mode: f.filter_mode,
      class_keys: f.class_keys,
      py_min: f.py_min,
      py_max: f.py_max,
    });
    const off =
      f.start_offset_minutes != null && Number.isFinite(Number(f.start_offset_minutes))
        ? Number(f.start_offset_minutes)
        : 0;
    const fleetName = f.name != null && String(f.name).trim() ? String(f.name).trim() : null;
    metaByRaceFleetKey.set(`${f.race_id}\u0000${f.id}`, { offsetMinutes: off, fleetName });
  }

  const bySeriesCtx = new Map<string, RaceBoatFleetRequest[]>();
  for (const req of requests) {
    const ck = `${req.groupId}\u0000${req.seriesId}`;
    let list = bySeriesCtx.get(ck);
    if (!list) {
      list = [];
      bySeriesCtx.set(ck, list);
    }
    list.push(req);
  }

  const pyMapsBySeriesCtx = new Map<string, Map<string, number | null>>();
  for (const [ck, group] of bySeriesCtx) {
    const sep = ck.indexOf("\u0000");
    const groupId = ck.slice(0, sep);
    const seriesId = ck.slice(sep + 1);
    const boatIdsHere = [...new Set(group.map((g) => g.boatId))];
    const boatRowsForPy = boatIdsHere
      .map((id) => boatById.get(id))
      .filter((b): b is BoatPyRow => !!b);
    const pmap =
      boatRowsForPy.length > 0
        ? await boatEffectivePyByIdMap(supabase, { groupId, seriesId }, boatRowsForPy)
        : new Map<string, number | null>();
    pyMapsBySeriesCtx.set(ck, pmap);
  }

  function effectivePy(req: RaceBoatFleetRequest): number | null {
    const pmap = pyMapsBySeriesCtx.get(`${req.groupId}\u0000${req.seriesId}`);
    return pmap?.get(req.boatId) ?? null;
  }

  for (const req of requests) {
    const mapKey = `${req.raceId}\u0000${req.boatId}`;
    const boat = boatById.get(req.boatId);
    const fleets = fleetsByRace.get(req.raceId) ?? [];
    if (!boat) {
      out.set(mapKey, { offsetMinutes: 0, fleetId: null, fleetName: null });
      continue;
    }
    const boatClassKey =
      (boat.rya_class_key && boat.rya_class_key.trim()) ||
      normalizeBoatClassKey(boat.class_name) ||
      null;
    const fleetId = fleets.length
      ? matchFleetId(fleets, {
          boatClassKey,
          effectivePy: effectivePy(req),
        })
      : null;
    const meta = fleetId ? metaByRaceFleetKey.get(`${req.raceId}\u0000${fleetId}`) : null;
    out.set(mapKey, {
      offsetMinutes: meta?.offsetMinutes ?? 0,
      fleetId,
      fleetName: meta?.fleetName ?? null,
    });
  }

  return out;
}

/**
 * Computes each boat's fleet start offset (minutes after race scheduled signal) using the same
 * matching rules as `recomputeFleetIdForRaceEntry`, batched across many (race × boat × series) tuples.
 */
export async function fleetStartOffsetMinutesByRaceBoat(
  supabase: SupabaseClient,
  requests: RaceBoatFleetRequest[],
): Promise<Map<string, number>> {
  const matches = await fleetMatchByRaceBoat(supabase, requests);
  const out = new Map<string, number>();
  for (const [k, v] of matches) {
    out.set(k, v.offsetMinutes);
  }
  return out;
}

export async function fleetStartOffsetMinutesForRaceBoat(
  supabase: SupabaseClient,
  req: RaceBoatFleetRequest,
): Promise<number> {
  const m = await fleetMatchByRaceBoat(supabase, [req]);
  return m.get(`${req.raceId}\u0000${req.boatId}`)?.offsetMinutes ?? 0;
}
