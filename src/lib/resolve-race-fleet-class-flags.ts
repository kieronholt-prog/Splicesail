import type { SupabaseClient } from "@supabase/supabase-js";

export type RaceFleetFlagSource = {
  id: string;
  name: string;
  group_fleet_id: string | null;
};

/** Resolve `group_fleets.class_flag` for each race fleet (by link or name match within the club). */
export async function resolveClubClassFlagsForRaceFleets(
  supabase: SupabaseClient,
  groupId: string,
  rows: RaceFleetFlagSource[],
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  const { data: gfRows } = await supabase
    .from("group_fleets")
    .select("id, name, class_flag")
    .eq("group_id", groupId);

  const byId = new Map((gfRows ?? []).map((g) => [g.id, (g.class_flag as string | null) ?? null]));
  const byName = new Map(
    (gfRows ?? []).map((g) => [String(g.name ?? "").trim().toLowerCase(), (g.class_flag as string | null) ?? null]),
  );

  for (const r of rows) {
    let cf: string | null = null;
    if (r.group_fleet_id) {
      const raw = byId.get(r.group_fleet_id);
      cf = raw != null && String(raw).trim().length ? String(raw).trim() : null;
    }
    if (cf == null) {
      const raw = byName.get(String(r.name ?? "").trim().toLowerCase());
      cf = raw != null && String(raw).trim().length ? String(raw).trim() : null;
    }
    out.set(r.id, cf);
  }
  return out;
}
