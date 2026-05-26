import type { SupabaseClient } from "@supabase/supabase-js";
import { isRaceOnlyAdhocGuestRow, seriesRoAddedBoatKey } from "@/lib/ro-added-boat-series";
import { SCORABLE_GUEST_LINK_STATUSES } from "@/lib/scoring/race-guest-scoring";

export type SeriesRoAddedStartLineHull = {
  sailNumber: string;
  classKey: string;
  classLabel: string;
  fleetId: string | null;
};

type AdhocGuestRow = {
  race_id: string;
  adhoc_sail_number: string | null;
  adhoc_rya_class_key: string | null;
  fleet_id: string | null;
};

/**
 * Adhoc RO-added hulls from earlier races in the series that are not yet on this race's start line.
 */
export async function loadSeriesRoAddedStartLineHulls(
  supabase: SupabaseClient,
  args: {
    seriesId: string;
    raceId: string;
    enabled: boolean;
    currentRaceAdhocRows: {
      adhoc_sail_number?: string | null;
      adhoc_rya_class_key?: string | null;
    }[];
  },
): Promise<SeriesRoAddedStartLineHull[]> {
  if (!args.enabled) return [];

  const { data: seriesRaces } = await supabase
    .from("races")
    .select("id, scheduled_at")
    .eq("series_id", args.seriesId)
    .order("scheduled_at", { ascending: true });

  const ordered = seriesRaces ?? [];
  const currentIdx = ordered.findIndex((r) => r.id === args.raceId);
  const priorRaceIds =
    currentIdx < 0
      ? ordered.filter((r) => r.id !== args.raceId).map((r) => r.id)
      : ordered.slice(0, currentIdx).map((r) => r.id);

  if (!priorRaceIds.length) return [];

  const presentKeys = new Set<string>();
  for (const row of args.currentRaceAdhocRows) {
    if (!isRaceOnlyAdhocGuestRow(row)) continue;
    presentKeys.add(
      seriesRoAddedBoatKey(row.adhoc_sail_number!.trim(), row.adhoc_rya_class_key!.trim()),
    );
  }

  const { data: priorRows } = await supabase
    .from("race_guest_entries")
    .select("race_id, adhoc_sail_number, adhoc_rya_class_key, fleet_id")
    .in("race_id", priorRaceIds)
    .is("boat_id", null)
    .in("link_status", [...SCORABLE_GUEST_LINK_STATUSES]);

  const raceOrder = new Map(priorRaceIds.map((id, i) => [id, i] as const));
  const sorted = [...(priorRows ?? [])].sort(
    (a, b) => (raceOrder.get(b.race_id) ?? 0) - (raceOrder.get(a.race_id) ?? 0),
  );

  const latestByKey = new Map<string, AdhocGuestRow>();
  for (const raw of sorted) {
    const row = raw as AdhocGuestRow;
    if (!isRaceOnlyAdhocGuestRow(row)) continue;
    const sail = row.adhoc_sail_number!.trim();
    const cls = row.adhoc_rya_class_key!.trim();
    const key = seriesRoAddedBoatKey(sail, cls);
    if (presentKeys.has(key) || latestByKey.has(key)) continue;
    latestByKey.set(key, row);
  }

  const classKeys = [...new Set([...latestByKey.values()].map((r) => r.adhoc_rya_class_key!.trim()))];
  const classLabelByKey = new Map<string, string>();
  if (classKeys.length) {
    const { data: catRows } = await supabase
      .from("boat_classes")
      .select("class_key, display_name")
      .in("class_key", classKeys);
    for (const cr of catRows ?? []) {
      classLabelByKey.set(cr.class_key, cr.display_name ?? cr.class_key);
    }
  }

  return [...latestByKey.entries()].map(([, row]) => {
    const sail = row.adhoc_sail_number!.trim();
    const cls = row.adhoc_rya_class_key!.trim();
    return {
      sailNumber: sail,
      classKey: cls,
      classLabel: (classLabelByKey.get(cls) ?? cls).trim() || cls,
      fleetId: row.fleet_id ?? null,
    };
  });
}
