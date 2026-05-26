import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeSailForMatch } from "@/lib/adhoc-link-pending";
import { formatBoatEntryLabel } from "@/lib/format-boat-entry-label";

export function delinkSailorResultsPath(groupId: string): string {
  return `/groups/${groupId}/club-admin/delink-results`;
}

export type DelinkableResultRowVm = {
  raceEntryId: string;
  raceId: string;
  raceName: string;
  raceScheduledAt: string | null;
  seriesId: string;
  seriesName: string;
  sailorDisplayName: string;
  boatLabel: string;
  sailNumber: string;
  classKey: string;
  classLabel: string;
  finishPosition: number | null;
  finishAt: string | null;
  hasConfirmedLink: boolean;
};

export type DelinkBoatClassOption = {
  classKey: string;
  displayName: string;
};

function unwrapOne<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

export async function loadDelinkBoatClassOptionsForGroup(
  supabase: SupabaseClient,
  groupId: string,
): Promise<DelinkBoatClassOption[]> {
  const { data } = await supabase
    .from("boat_classes")
    .select("class_key, display_name, created_for_group_id")
    .or(`created_for_group_id.is.null,created_for_group_id.eq.${groupId}`)
    .order("display_name");

  return (data ?? [])
    .map((row) => ({
      classKey: row.class_key,
      displayName: String(row.display_name ?? row.class_key).trim() || row.class_key,
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" }));
}

export async function searchDelinkableSailorResults(
  supabase: SupabaseClient,
  groupId: string,
  sailNumber: string,
  classKey: string,
): Promise<DelinkableResultRowVm[]> {
  const sailNorm = normalizeSailForMatch(sailNumber);
  const classNorm = classKey.trim();
  if (!sailNorm || !classNorm) return [];

  const { data: seriesRows } = await supabase.from("series").select("id").eq("group_id", groupId);
  const seriesIds = (seriesRows ?? []).map((r) => r.id).filter(Boolean);
  if (seriesIds.length === 0) return [];

  const { data: raceRows } = await supabase.from("races").select("id").in("series_id", seriesIds);
  const raceIds = (raceRows ?? []).map((r) => r.id).filter(Boolean);
  if (raceIds.length === 0) return [];

  const { data: entryRows } = await supabase
    .from("race_entries")
    .select(
      `
      id,
      race_id,
      user_id,
      boat_id,
      sail_number_override,
      races!inner (
        id,
        name,
        scheduled_at,
        series_id,
        series!inner (
          id,
          name,
          group_id
        )
      ),
      boats!inner (
        id,
        label,
        class_name,
        default_sail_number,
        rya_class_key
      ),
      race_finishes (
        ro_finish_at,
        official_finish_at,
        finish_position
      )
    `,
    )
    .in("race_id", raceIds);

  type EntrySel = {
    id: string;
    race_id: string;
    user_id: string;
    boat_id: string | null;
    sail_number_override: string | null;
    races?: {
      id: string;
      name: string;
      scheduled_at: string | null;
      series_id: string;
      series?: { id: string; name: string; group_id: string } | { id: string; name: string; group_id: string }[] | null;
    } | {
      id: string;
      name: string;
      scheduled_at: string | null;
      series_id: string;
      series?: { id: string; name: string; group_id: string } | { id: string; name: string; group_id: string }[] | null;
    }[] | null;
    boats?: {
      id: string;
      label: string | null;
      class_name: string | null;
      default_sail_number: string | null;
      rya_class_key: string | null;
    } | {
      id: string;
      label: string | null;
      class_name: string | null;
      default_sail_number: string | null;
      rya_class_key: string | null;
    }[] | null;
    race_finishes?:
      | { ro_finish_at: string | null; official_finish_at: string | null; finish_position: number | null }
      | { ro_finish_at: string | null; official_finish_at: string | null; finish_position: number | null }[]
      | null;
  };

  const filtered = ((entryRows ?? []) as EntrySel[]).filter((row) => {
    const race = unwrapOne(row.races);
    const series = race ? unwrapOne(race.series) : null;
    if (series?.group_id !== groupId) return false;

    const boat = unwrapOne(row.boats);
    const sailDisplay = (row.sail_number_override?.trim() || boat?.default_sail_number?.trim() || "").trim();
    if ((boat?.rya_class_key?.trim() ?? "").toLowerCase() !== classNorm.toLowerCase()) return false;
    if (normalizeSailForMatch(sailDisplay) !== sailNorm) return false;

    const finish = unwrapOne(row.race_finishes);
    return Boolean(finish?.official_finish_at ?? finish?.ro_finish_at);
  });

  if (filtered.length === 0) return [];

  const entryIds = filtered.map((r) => r.id);
  const userIds = [...new Set(filtered.map((r) => r.user_id).filter(Boolean))];
  const classKeys = [...new Set(filtered.map((r) => unwrapOne(r.boats)?.rya_class_key?.trim()).filter(Boolean) as string[])];

  const [{ data: profiles }, { data: classRows }, { data: linkRows }] = await Promise.all([
    userIds.length > 0
      ? supabase.from("profiles").select("id, display_name").in("id", userIds)
      : Promise.resolve({ data: [] as { id: string; display_name: string | null }[] }),
    classKeys.length > 0
      ? supabase.from("boat_classes").select("class_key, display_name").in("class_key", classKeys)
      : Promise.resolve({ data: [] as { class_key: string; display_name: string | null }[] }),
    supabase
      .from("race_guest_entries")
      .select("linked_race_entry_id")
      .in("linked_race_entry_id", entryIds)
      .eq("link_status", "confirmed"),
  ]);

  const nameByUser = new Map((profiles ?? []).map((p) => [p.id, p.display_name]));
  const classLabelByKey = new Map(
    (classRows ?? []).map((c) => [c.class_key, String(c.display_name ?? c.class_key).trim() || c.class_key]),
  );
  const confirmedLinkEntryIds = new Set(
    (linkRows ?? []).map((l) => l.linked_race_entry_id).filter(Boolean) as string[],
  );

  return filtered
    .map((row) => {
      const race = unwrapOne(row.races)!;
      const series = unwrapOne(race.series)!;
      const boat = unwrapOne(row.boats)!;
      const finish = unwrapOne(row.race_finishes);
      const sailDisplay = (row.sail_number_override?.trim() || boat.default_sail_number?.trim() || "").trim() || "—";
      const classKeyResolved = boat.rya_class_key?.trim() ?? classNorm;

      return {
        raceEntryId: row.id,
        raceId: row.race_id,
        raceName: race.name,
        raceScheduledAt: race.scheduled_at,
        seriesId: series.id,
        seriesName: series.name,
        sailorDisplayName: nameByUser.get(row.user_id)?.trim() || "—",
        boatLabel: formatBoatEntryLabel({
          defaultSailNumber: boat.default_sail_number,
          className: boat.class_name ?? classLabelByKey.get(classKeyResolved) ?? classKeyResolved,
          label: boat.label ?? "",
        }),
        sailNumber: sailDisplay,
        classKey: classKeyResolved,
        classLabel: classLabelByKey.get(classKeyResolved) ?? classKeyResolved,
        finishPosition: finish?.finish_position ?? null,
        finishAt: finish?.official_finish_at ?? finish?.ro_finish_at ?? null,
        hasConfirmedLink: confirmedLinkEntryIds.has(row.id),
      };
    })
    .sort((a, b) => {
      const s = a.seriesName.localeCompare(b.seriesName, undefined, { sensitivity: "base" });
      if (s !== 0) return s;
      const r = a.raceName.localeCompare(b.raceName, undefined, { sensitivity: "base" });
      if (r !== 0) return r;
      const ta = a.raceScheduledAt ? new Date(a.raceScheduledAt).getTime() : 0;
      const tb = b.raceScheduledAt ? new Date(b.raceScheduledAt).getTime() : 0;
      return ta - tb;
    });
}
