import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeBoatClassKey } from "@/lib/normalize-class";

export type BoatPyRow = {
  id: string;
  class_name: string | null;
  py_rating: number | null;
  /** Stable catalogue key; preferred over deriving from class label. */
  rya_class_key?: string | null;
};

/**
 * Portsmouth number for handicap in a series context:
 * series override → club override → baseline (boat_class_pn) → boat-stored PN.
 */
export async function boatEffectivePyByIdMap(
  supabase: SupabaseClient,
  ctx: { groupId: string; seriesId: string },
  boats: BoatPyRow[],
): Promise<Map<string, number | null>> {
  const keys = [
    ...new Set(
      boats.flatMap((b) => {
        const rk = (b.rya_class_key ?? "").trim();
        const fromLabel = normalizeBoatClassKey(b.class_name);
        const k = rk || fromLabel || null;
        return k ? [k] : [];
      }),
    ),
  ];

  let seriesRows: { class_key: string; py: number }[] = [];
  let groupRows: { class_key: string; py: number }[] = [];
  let basePnRows: { class_key: string; py: number }[] = [];

  if (keys.length > 0) {
    const [sr, gr, bp] = await Promise.all([
      supabase.from("series_class_py").select("class_key, py").eq("series_id", ctx.seriesId).in("class_key", keys),
      supabase.from("group_class_py").select("class_key, py").eq("group_id", ctx.groupId).in("class_key", keys),
      supabase.from("boat_class_pn").select("class_key, py").in("class_key", keys),
    ]);
    seriesRows = sr.data ?? [];
    groupRows = gr.data ?? [];
    basePnRows = bp.data ?? [];
  }

  const seriesMap = new Map(seriesRows.map((r) => [r.class_key, r.py]));
  const groupMap = new Map(groupRows.map((r) => [r.class_key, r.py]));
  const basePnMap = new Map(basePnRows.map((r) => [r.class_key, r.py]));

  const out = new Map<string, number | null>();
  for (const b of boats) {
    const key =
      ((b.rya_class_key ?? "").trim() || normalizeBoatClassKey(b.class_name)) ?? null;
    let py: number | null =
      key != null
        ? (seriesMap.get(key) ?? groupMap.get(key) ?? basePnMap.get(key) ?? null)
        : null;
    if (py == null) py = b.py_rating;
    out.set(b.id, py);
  }
  return out;
}
