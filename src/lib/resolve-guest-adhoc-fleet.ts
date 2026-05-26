import type { SupabaseClient } from "@supabase/supabase-js";
import { boatEffectivePyByIdMap } from "@/lib/resolve-class-py";
import { matchFleetId, type RaceFleetRuleRow } from "@/lib/resolve-entry-fleet";

/**
 * Picks {@link race_fleets} for a race-only (`adhoc_rya_class_key`) guest row,
 * using the same class-key / PY rules as {@link recomputeFleetIdForRaceEntry}.
 */
export async function resolveFleetIdForAdhocRaceGuest(
  supabase: SupabaseClient,
  ctx: { groupId: string; seriesId: string; raceId: string },
  adhocClassKey: string,
): Promise<string | null> {
  const trimmedKey = adhocClassKey.trim();
  if (!trimmedKey) return null;

  const { data: fleetsRaw } = await supabase
    .from("race_fleets")
    .select("id, sort_order, filter_mode, class_keys, py_min, py_max")
    .eq("race_id", ctx.raceId);

  const fleets = (fleetsRaw ?? []) as RaceFleetRuleRow[];
  if (!fleets.length) return null;

  const pyMap = await boatEffectivePyByIdMap(
    supabase,
    ctx,
    [{ id: "__adhoc__", class_name: null, py_rating: null, rya_class_key: trimmedKey }],
  );
  const effectivePy = pyMap.get("__adhoc__") ?? null;

  return matchFleetId(fleets, {
    boatClassKey: trimmedKey,
    effectivePy,
  });
}
