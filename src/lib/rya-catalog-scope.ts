import type { SupabaseClient } from "@supabase/supabase-js";
import { boatPyFromEmbeddedPnRelation } from "@/lib/boat-class-pn-from-embed";

export type RyaCatalogOption = {
  class_key: string;
  display_name: string;
  py: number;
  crew_count: number | null;
};

function mapCrew(v: unknown): number | null {
  if (v == null || String(v).trim() === "") return null;
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) ? n : null;
}

type BoatClassRow = {
  class_key: string;
  display_name: string;
  crew_count?: unknown;
  boat_class_pn?: { py?: number | null } | { py?: number | null }[] | null;
};

function pyFromRow(r: BoatClassRow): number | null {
  const embed = Array.isArray(r.boat_class_pn) ? r.boat_class_pn[0] : r.boat_class_pn;
  return boatPyFromEmbeddedPnRelation(embed);
}

function mapRows(rows: BoatClassRow[]): RyaCatalogOption[] {
  const out: RyaCatalogOption[] = [];
  for (const r of rows) {
    const py = pyFromRow(r);
    if (py == null) continue;
    out.push({
      class_key: r.class_key,
      display_name: r.display_name,
      py,
      crew_count: mapCrew(r.crew_count),
    });
  }
  return out;
}

const BOAT_CLASS_PN_SELECT = "class_key, display_name, crew_count, boat_class_pn(py)";

/** National RYA table only (no club-defined hull rows). */
export async function fetchNationalRyaCatalogOptions(
  supabase: SupabaseClient,
): Promise<RyaCatalogOption[]> {
  const { data, error } = await supabase
    .from("boat_classes")
    .select(BOAT_CLASS_PN_SELECT)
    .is("created_for_group_id", null)
    .order("display_name");
  if (error || !data) return [];
  return mapRows(data as BoatClassRow[]);
}

/** Classes visible when picking hulls / PN for one club (national + that club’s hull rows). */
export async function fetchRyaCatalogOptionsForGroup(
  supabase: SupabaseClient,
  groupId: string,
): Promise<RyaCatalogOption[]> {
  const { data, error } = await supabase
    .from("boat_classes")
    .select(BOAT_CLASS_PN_SELECT)
    .or(`created_for_group_id.is.null,created_for_group_id.eq.${groupId}`)
    .order("display_name");
  if (error || !data) return [];
  return mapRows(data as BoatClassRow[]);
}

/** Boat picker: national catalogue plus hull rows owned by any club the sailor belongs to. */
export async function fetchRyaCatalogOptionsForBoatPicker(
  supabase: SupabaseClient,
  userId: string,
): Promise<RyaCatalogOption[]> {
  const { data: mems } = await supabase
    .from("group_memberships")
    .select("group_id")
    .eq("user_id", userId);

  const groupIds = [...new Set((mems ?? []).map((r) => r.group_id).filter(Boolean))];

  let q = supabase.from("boat_classes").select(BOAT_CLASS_PN_SELECT);

  if (!groupIds.length) {
    q = q.is("created_for_group_id", null);
  } else if (groupIds.length === 1) {
    q = q.or(`created_for_group_id.is.null,created_for_group_id.eq.${groupIds[0]}`);
  } else {
    q = q.or(`created_for_group_id.is.null,created_for_group_id.in.(${groupIds.join(",")})`);
  }

  const { data, error } = await q.order("display_name");
  if (error || !data) return [];
  return mapRows(data as BoatClassRow[]);
}
