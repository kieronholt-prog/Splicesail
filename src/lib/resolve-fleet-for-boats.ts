import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeBoatClassKey } from "@/lib/normalize-class";
import { boatEffectivePyByIdMap } from "@/lib/resolve-class-py";
import { matchFleetId, type RaceFleetRuleRow } from "@/lib/resolve-entry-fleet";

/**
 * Resolves race_fleets.id per boat for start-line / signup display (same rules as
 * {@link recomputeFleetIdForRaceEntry}) without requiring a race_entries row yet.
 */
export async function resolveFleetIdByBoatIdMap(
  supabase: SupabaseClient,
  ctx: { groupId: string; seriesId: string },
  raceId: string,
  boatIds: string[],
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  const unique = [...new Set(boatIds.filter(Boolean))];
  if (!unique.length) return out;

  const { data: fleetsRaw } = await supabase
    .from("race_fleets")
    .select("id, sort_order, filter_mode, class_keys, py_min, py_max")
    .eq("race_id", raceId);

  const fleets = (fleetsRaw ?? []) as RaceFleetRuleRow[];
  if (!fleets.length) {
    for (const id of unique) out.set(id, null);
    return out;
  }

  const { data: boatsRaw } = await supabase
    .from("boats")
    .select("id, class_name, py_rating, rya_class_key")
    .in("id", unique);

  const boats = boatsRaw ?? [];
  const pyMap = await boatEffectivePyByIdMap(
    supabase,
    ctx,
    boats.map((b) => ({
      id: b.id,
      class_name: b.class_name,
      py_rating: b.py_rating,
      rya_class_key: b.rya_class_key,
    })),
  );

  for (const boat of boats) {
    const boatClassKey =
      (boat.rya_class_key && boat.rya_class_key.trim()) ||
      normalizeBoatClassKey(boat.class_name) ||
      null;
    const effectivePy = pyMap.get(boat.id) ?? null;
    out.set(boat.id, matchFleetId(fleets, { boatClassKey, effectivePy }));
  }

  for (const id of unique) {
    if (!out.has(id)) out.set(id, null);
  }

  return out;
}
