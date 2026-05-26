import type { SupabaseClient } from "@supabase/supabase-js";
import { formatBoatEntryLabel } from "@/lib/format-boat-entry-label";

export function normalizeSailForMatch(sail: string | null | undefined): string {
  return String(sail ?? "")
    .trim()
    .toLowerCase();
}

export type PendingAdhocLinkRowVm = {
  guestEntryId: string;
  raceId: string;
  raceName: string;
  raceScheduledAt: string | null;
  seriesId: string;
  seriesName: string;
  adhocSailNumber: string;
  adhocClassKey: string;
  adhocClassLabel: string;
  matchedUserId: string;
  matchedBoatId: string;
  sailorDisplayName: string;
  boatLabel: string;
  finishAt: string | null;
};

function unwrapOne<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

export async function countPendingAdhocLinksForGroups(
  supabase: SupabaseClient,
  groupIds: string[],
): Promise<number> {
  if (groupIds.length === 0) return 0;

  const { data: seriesRows } = await supabase.from("series").select("id").in("group_id", groupIds);
  const seriesIds = [...new Set((seriesRows ?? []).map((r) => r.id).filter(Boolean))];
  if (seriesIds.length === 0) return 0;

  const { data: raceRows } = await supabase.from("races").select("id").in("series_id", seriesIds);
  const raceIds = [...new Set((raceRows ?? []).map((r) => r.id).filter(Boolean))];
  if (raceIds.length === 0) return 0;

  const { count } = await supabase
    .from("race_guest_entries")
    .select("*", { count: "exact", head: true })
    .in("race_id", raceIds)
    .eq("link_status", "pending_admin");

  return count ?? 0;
}

export async function loadPendingAdhocLinkRowsForGroup(
  supabase: SupabaseClient,
  groupId: string,
): Promise<PendingAdhocLinkRowVm[]> {
  const { data: seriesRows } = await supabase.from("series").select("id").eq("group_id", groupId);
  const seriesIds = (seriesRows ?? []).map((r) => r.id).filter(Boolean);
  if (seriesIds.length === 0) return [];

  const { data: raceRows } = await supabase.from("races").select("id").in("series_id", seriesIds);
  const raceIds = (raceRows ?? []).map((r) => r.id).filter(Boolean);
  if (raceIds.length === 0) return [];

  const { data: guestRows } = await supabase
    .from("race_guest_entries")
    .select(
      `
      id,
      race_id,
      adhoc_sail_number,
      adhoc_rya_class_key,
      pending_matched_user_id,
      pending_matched_boat_id,
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
      race_guest_finishes (
        ro_finish_at,
        official_finish_at
      )
    `,
    )
    .in("race_id", raceIds)
    .eq("link_status", "pending_admin")
    .order("race_id");

  type GuestSel = {
    id: string;
    race_id: string;
    adhoc_sail_number: string | null;
    adhoc_rya_class_key: string | null;
    pending_matched_user_id: string | null;
    pending_matched_boat_id: string | null;
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
    race_guest_finishes?:
      | { ro_finish_at: string | null; official_finish_at: string | null }
      | { ro_finish_at: string | null; official_finish_at: string | null }[]
      | null;
  };

  const filtered = ((guestRows ?? []) as GuestSel[]).filter((row) => {
    const race = unwrapOne(row.races);
    const series = race ? unwrapOne(race.series) : null;
    return series?.group_id === groupId;
  });

  const userIds = [
    ...new Set(filtered.map((r) => r.pending_matched_user_id).filter(Boolean) as string[]),
  ];
  const boatIds = [
    ...new Set(filtered.map((r) => r.pending_matched_boat_id).filter(Boolean) as string[]),
  ];
  const classKeys = [
    ...new Set(filtered.map((r) => r.adhoc_rya_class_key?.trim()).filter(Boolean) as string[]),
  ];

  const [{ data: profiles }, { data: boats }, { data: classRows }] = await Promise.all([
    userIds.length > 0
      ? supabase.from("profiles").select("id, display_name").in("id", userIds)
      : Promise.resolve({ data: [] as { id: string; display_name: string | null }[] }),
    boatIds.length > 0
      ? supabase
          .from("boats")
          .select("id, label, class_name, default_sail_number, rya_class_key")
          .in("id", boatIds)
      : Promise.resolve({
          data: [] as {
            id: string;
            label: string | null;
            class_name: string | null;
            default_sail_number: string | null;
            rya_class_key: string | null;
          }[],
        }),
    classKeys.length > 0
      ? supabase.from("boat_classes").select("class_key, display_name").in("class_key", classKeys)
      : Promise.resolve({ data: [] as { class_key: string; display_name: string | null }[] }),
  ]);

  const nameByUser = new Map((profiles ?? []).map((p) => [p.id, p.display_name]));
  const boatById = new Map((boats ?? []).map((b) => [b.id, b]));
  const classLabelByKey = new Map(
    (classRows ?? []).map((c) => [c.class_key, String(c.display_name ?? c.class_key).trim() || c.class_key]),
  );

  return filtered
    .filter((row) => row.pending_matched_user_id && row.pending_matched_boat_id)
    .map((row) => {
      const race = unwrapOne(row.races)!;
      const series = unwrapOne(race.series)!;
      const finish = unwrapOne(row.race_guest_finishes);
      const classKey = row.adhoc_rya_class_key?.trim() ?? "—";
      const boat = boatById.get(row.pending_matched_boat_id!);
      return {
        guestEntryId: row.id,
        raceId: row.race_id,
        raceName: race.name,
        raceScheduledAt: race.scheduled_at,
        seriesId: series.id,
        seriesName: series.name,
        adhocSailNumber: (row.adhoc_sail_number ?? "").trim() || "—",
        adhocClassKey: classKey,
        adhocClassLabel: classLabelByKey.get(classKey) ?? classKey,
        matchedUserId: row.pending_matched_user_id!,
        matchedBoatId: row.pending_matched_boat_id!,
        sailorDisplayName: nameByUser.get(row.pending_matched_user_id!)?.trim() || "—",
        boatLabel: boat
          ? formatBoatEntryLabel({
              defaultSailNumber: boat.default_sail_number,
              className: boat.class_name ?? classLabelByKey.get(boat.rya_class_key ?? "") ?? boat.rya_class_key,
              label: boat.label ?? "",
            })
          : "—",
        finishAt: finish?.official_finish_at ?? finish?.ro_finish_at ?? null,
      };
    })
    .sort((a, b) => {
      const s = a.seriesName.localeCompare(b.seriesName, undefined, { sensitivity: "base" });
      if (s !== 0) return s;
      const r = a.raceName.localeCompare(b.raceName, undefined, { sensitivity: "base" });
      if (r !== 0) return r;
      return a.adhocSailNumber.localeCompare(b.adhocSailNumber, undefined, { sensitivity: "base" });
    });
}
