import {
  ClubAdminPyHullModalsClient,
  type BoatClassAttrOptions,
  type ClassListCatalogRowVm,
  type ClubHullVm,
  type NationalDropdownOptionVm,
  type PortsmouthOverrideVm,
} from "@/components/club-admin-py-hull-modals";
import { getServerAuth } from "@/lib/supabase/auth-cache";
import type { SupabaseServerClient } from "@/lib/supabase/server";
import { boatPyFromEmbeddedPnRelation } from "@/lib/boat-class-pn-from-embed";
import { fetchNationalRyaCatalogOptions } from "@/lib/rya-catalog-scope";

type ClubPyHullAdminTriggersProps = {
  groupId: string;
  openClassListOnLoad?: boolean;
};

function sortedUniqueStrings(values: Iterable<string | null | undefined>): string[] {
  const s = new Set<string>();
  for (const v of values) {
    const t = typeof v === "string" ? v.trim() : "";
    if (t.length) s.add(t);
  }
  return [...s].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

function sortedUniqueCrew(values: Iterable<number | null | undefined>): number[] {
  const s = new Set<number>();
  for (const v of values) {
    if (v == null || !Number.isFinite(Number(v))) continue;
    const n = Math.trunc(Number(v));
    if (n >= 1 && n <= 20) s.add(n);
  }
  return [...s].sort((a, b) => a - b);
}

async function fetchBoatClassAttributeOptions(supabase: SupabaseServerClient): Promise<BoatClassAttrOptions> {
  const { data } = await supabase
    .from("boat_classes")
    .select("category, crew_count, rig, spinnaker, keel, engine")
    .is("created_for_group_id", null);

  const rows = data ?? [];
  return {
    categories: sortedUniqueStrings(rows.map((r) => r.category)),
    crewCounts: sortedUniqueCrew(rows.map((r) => r.crew_count)),
    rigs: sortedUniqueStrings(rows.map((r) => r.rig)),
    spinnakers: sortedUniqueStrings(rows.map((r) => r.spinnaker)),
    keels: sortedUniqueStrings(rows.map((r) => r.keel)),
    engines: sortedUniqueStrings(rows.map((r) => r.engine)),
  };
}

function mapBoatClassesListRow(
  groupId: string,
  row: {
    class_key: string;
    display_name: string;
    category?: string | null;
    crew_count?: number | null;
    rig?: string | null;
    spinnaker?: string | null;
    keel?: string | null;
    engine?: string | null;
    created_for_group_id?: string | null;
    boat_class_pn?: { py?: number | null } | { py?: number | null }[] | null;
  },
): ClassListCatalogRowVm {
  const embed = Array.isArray(row.boat_class_pn) ? row.boat_class_pn[0] : row.boat_class_pn;
  const baselinePy = boatPyFromEmbeddedPnRelation(embed);
  const gid = row.created_for_group_id;
  const isClubDefined = typeof gid === "string" && gid === groupId;
  let crewCount: number | null = null;
  if (row.crew_count != null && String(row.crew_count).trim() !== "") {
    const n = Math.trunc(Number(row.crew_count));
    if (Number.isFinite(n)) crewCount = n;
  }
  return {
    classKey: row.class_key,
    displayName: row.display_name,
    baselinePy,
    category: row.category ?? null,
    crewCount,
    rig: row.rig ?? null,
    spinnaker: row.spinnaker ?? null,
    keel: row.keel ?? null,
    engine: row.engine ?? null,
    isClubDefined,
  };
}

export async function ClubPyHullAdminTriggers({ groupId, openClassListOnLoad }: ClubPyHullAdminTriggersProps) {
  const { supabase } = await getServerAuth();

  const [
    nationalCatalog,
    attrOptions,
    hullRowsRaw,
    catalogForListRaw,
    clubPyRows,
  ] = await Promise.all([
    fetchNationalRyaCatalogOptions(supabase),
    fetchBoatClassAttributeOptions(supabase),
    supabase
      .from("boat_classes")
      .select("class_key, display_name, boat_class_pn(py)")
      .eq("created_for_group_id", groupId)
      .order("display_name"),
    supabase
      .from("boat_classes")
      .select(
        "class_key, display_name, category, crew_count, rig, spinnaker, keel, engine, created_for_group_id, boat_class_pn(py)",
      )
      .or(`created_for_group_id.is.null,created_for_group_id.eq.${groupId}`)
      .order("display_name"),
    supabase.from("group_class_py").select("class_key, py").eq("group_id", groupId),
  ]);

  const nationalMap = new Map(nationalCatalog.map((r) => [r.class_key, r]));

  const hullRowsEmbed = hullRowsRaw.data ?? [];
  const hullRowsVm: ClubHullVm[] = hullRowsEmbed.map((row) => {
    const embed = Array.isArray(row.boat_class_pn) ? row.boat_class_pn[0] : row.boat_class_pn;
    const py = boatPyFromEmbeddedPnRelation(embed);
    return {
      classKey: row.class_key,
      displayName: row.display_name,
      baselinePy: py,
    };
  });

  const classListCatalog: ClassListCatalogRowVm[] = (catalogForListRaw.data ?? []).map((row) =>
    mapBoatClassesListRow(groupId, row),
  );

  const overrideRowsSorted = [...(clubPyRows.data ?? [])].sort((a, b) =>
    String(nationalMap.get(a.class_key)?.display_name ?? a.class_key).localeCompare(
      String(nationalMap.get(b.class_key)?.display_name ?? b.class_key),
      undefined,
      { sensitivity: "base" },
    ),
  );

  const nationalDropdown: NationalDropdownOptionVm[] = nationalCatalog.map((r) => ({
    key: r.class_key,
    label: `${r.display_name} (${r.py})`,
  }));

  const overrideRows: PortsmouthOverrideVm[] = overrideRowsSorted.map((row) => {
    const nat = nationalMap.get(row.class_key);
    return {
      classKey: row.class_key,
      displayName: nat?.display_name ?? row.class_key,
      clubPy: row.py,
      ryaPy: nat?.py ?? null,
    };
  });

  return (
    <ClubAdminPyHullModalsClient
      groupId={groupId}
      openClassListOnLoad={openClassListOnLoad}
      nationalDropdown={nationalDropdown}
      overrideRows={overrideRows}
      hullRows={hullRowsVm}
      attributeOptions={attrOptions}
      classListCatalog={classListCatalog}
    />
  );
}
