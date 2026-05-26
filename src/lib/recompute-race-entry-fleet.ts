import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeBoatClassKey } from "@/lib/normalize-class";
import { boatEffectivePyByIdMap } from "@/lib/resolve-class-py";
import { matchFleetId, type RaceFleetRuleRow } from "@/lib/resolve-entry-fleet";

export async function recomputeFleetIdForRaceEntry(
  supabase: SupabaseClient,
  ctx: { groupId: string; seriesId: string },
  raceId: string,
  userId: string,
): Promise<void> {
  const { data: entries } = await supabase
    .from("race_entries")
    .select("id, boat_id, py_override")
    .eq("race_id", raceId)
    .eq("user_id", userId);

  const list = entries ?? [];
  if (!list.length) return;

  const { data: fleetsRaw } = await supabase
    .from("race_fleets")
    .select("id, sort_order, filter_mode, class_keys, py_min, py_max")
    .eq("race_id", raceId);

  const fleets = (fleetsRaw ?? []) as RaceFleetRuleRow[];

  const boatIds = [...new Set(list.map((e) => e.boat_id).filter(Boolean) as string[])];
  if (!boatIds.length) {
    for (const entry of list) {
      await supabase.from("race_entries").update({ fleet_id: null }).eq("id", entry.id);
    }
    return;
  }

  const { data: boatsRaw } = await supabase
    .from("boats")
    .select("id, class_name, py_rating, rya_class_key")
    .in("id", boatIds);

  const boatsResolved = boatsRaw ?? [];
  const resolvedById = new Map(boatsResolved.map((b) => [b.id, b] as const));

  const pyMap = await boatEffectivePyByIdMap(
    supabase,
    ctx,
    boatsResolved.map((b) => ({
      id: b.id,
      class_name: b.class_name,
      py_rating: b.py_rating,
      rya_class_key: b.rya_class_key,
    })),
  );

  for (const entry of list) {
    if (!entry.boat_id) {
      await supabase.from("race_entries").update({ fleet_id: null }).eq("id", entry.id);
      continue;
    }

    const boat = resolvedById.get(entry.boat_id);
    if (!boat) {
      await supabase.from("race_entries").update({ fleet_id: null }).eq("id", entry.id);
      continue;
    }

    const effectivePy =
      entry.py_override != null && entry.py_override !== undefined
        ? entry.py_override
        : pyMap.get(boat.id) ?? null;

    const boatClassKey =
      (boat.rya_class_key && boat.rya_class_key.trim()) ||
      normalizeBoatClassKey(boat.class_name) ||
      null;

    const fleetId = fleets.length ? matchFleetId(fleets, { boatClassKey, effectivePy }) : null;

    await supabase.from("race_entries").update({ fleet_id: fleetId }).eq("id", entry.id);
  }
}
