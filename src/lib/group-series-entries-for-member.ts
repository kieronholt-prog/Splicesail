import { formatClubHmFromIso, formatPostgresDateDdMmmYyyy } from "@/lib/club-display-format";
import { formatBoatEntryLabel } from "@/lib/format-boat-entry-label";
import type { SupabaseServerClient } from "@/lib/supabase/server";
import { boatEffectivePyByIdMap } from "@/lib/resolve-class-py";
import { clubFleetNameForBoatClass } from "@/lib/club-fleet-display";
import { normalizeBoatClassKey } from "@/lib/normalize-class";
import { matchFleetId, type RaceFleetRuleRow } from "@/lib/resolve-entry-fleet";

export type MemberSeriesBoatEntry = {
  boatId: string;
  boatLabel: string;
  clubFleetName?: string | null;
  nextFleetStartLine?: string | null;
};

export type MemberClubSeriesRow = {
  id: string;
  name: string;
  dateLabel: string;
  isRegistered: boolean;
  boatEntries: MemberSeriesBoatEntry[];
  enteredBoatIds: string[];
};

/** Builds per-series registration + hull signup rows for the signed-in sailor at one club (same shapes as legacy club hub Series list). */
export async function loadMemberClubSeriesEntryRows(
  supabase: SupabaseServerClient,
  opts: { groupId: string; userId: string; clubIanaTz: string },
): Promise<MemberClubSeriesRow[]> {
  const { groupId, userId, clubIanaTz: clubTz } = opts;

  const [{ data: seriesRows }, { data: fleetRows }] = await Promise.all([
    supabase
      .from("series")
      .select("id, name, starts_on, ends_on")
      .eq("group_id", groupId)
      .order("starts_on", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("group_fleets")
      .select("id, name, sort_order, class_flag")
      .eq("group_id", groupId)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
  ]);

  const seriesIdList = (seriesRows ?? []).map((s) => s.id);

  const registeredSeriesIds = new Set<string>();
  if (seriesIdList.length > 0) {
    const { data: regRows } = await supabase
      .from("series_registrations")
      .select("series_id")
      .eq("user_id", userId)
      .in("series_id", seriesIdList);
    for (const r of regRows ?? []) registeredSeriesIds.add(r.series_id);
  }

  const fleetIdList = (fleetRows ?? []).map((f) => f.id);
  let fleetClassLinks: { fleet_id: string; class_key: string }[] = [];
  if (fleetIdList.length > 0) {
    const { data: linkRows } = await supabase
      .from("group_fleet_classes")
      .select("fleet_id, class_key")
      .in("fleet_id", fleetIdList);
    fleetClassLinks = linkRows ?? [];
  }

  type SailorHullEntryRow = {
    boatId: string;
    boatLabel: string;
    clubFleetName: string | null;
    nextFleetStartLine: string | null;
  };

  const boatEntriesBySeriesId = new Map<string, SailorHullEntryRow[]>();
  const boatIdsAttachedBySeriesId = new Map<string, Set<string>>();

  const regSeriesIdList = [...registeredSeriesIds];
  if (regSeriesIdList.length > 0) {
    type BoatMini = {
      id: string;
      label: string;
      rya_class_key: string | null;
      class_name: string | null;
      default_sail_number: string | null;
      py_rating: number | null;
    };

    const { data: srbRows } = await supabase
      .from("series_registration_boats")
      .select("series_id, boat_id")
      .eq("user_id", userId)
      .in("series_id", regSeriesIdList);

    for (const raw of srbRows ?? []) {
      const sid = raw.series_id;
      if (!sid || !raw.boat_id) continue;
      let setId = boatIdsAttachedBySeriesId.get(sid);
      if (!setId) {
        setId = new Set();
        boatIdsAttachedBySeriesId.set(sid, setId);
      }
      setId.add(raw.boat_id);
    }

    const boatRegIds = [...new Set((srbRows ?? []).map((r) => r.boat_id).filter(Boolean))] as string[];
    const boatById = new Map<string, BoatMini>();
    if (boatRegIds.length > 0) {
      const { data: boatPick } = await supabase
        .from("boats")
        .select("id, label, rya_class_key, class_name, default_sail_number, py_rating")
        .in("id", boatRegIds);
      for (const b of boatPick ?? []) {
        boatById.set(b.id, {
          id: b.id,
          label: b.label,
          rya_class_key: b.rya_class_key,
          class_name: b.class_name,
          default_sail_number: b.default_sail_number,
          py_rating: b.py_rating != null ? Number(b.py_rating) : null,
        });
      }
    }

    const sortedClubFleetsForMatch = (fleetRows ?? []).map((f) => ({
      id: f.id,
      name: f.name,
      sort_order: typeof f.sort_order === "number" ? f.sort_order : 0,
    }));

    const nowIso = new Date().toISOString();
    const { data: upcomingRaces } = await supabase
      .from("races")
      .select("id, series_id, scheduled_at")
      .in("series_id", regSeriesIdList)
      .gte("scheduled_at", nowIso)
      .order("scheduled_at", { ascending: true });

    const nextRaceBySeriesId = new Map<string, { id: string; scheduled_at: string }>();
    for (const r of upcomingRaces ?? []) {
      if (!nextRaceBySeriesId.has(r.series_id))
        nextRaceBySeriesId.set(r.series_id, { id: r.id, scheduled_at: r.scheduled_at });
    }

    const nextRaceIds = [...nextRaceBySeriesId.values()].map((x) => x.id);
    const fleetsByRaceId = new Map<string, Array<RaceFleetRuleRow & { name: string; start_offset_minutes: number }>>();
    if (nextRaceIds.length > 0) {
      const { data: rf } = await supabase
        .from("race_fleets")
        .select("id, race_id, name, start_offset_minutes, sort_order, filter_mode, class_keys, py_min, py_max")
        .in("race_id", nextRaceIds);
      for (const row of rf ?? []) {
        const list = fleetsByRaceId.get(row.race_id) ?? [];
        list.push(row as RaceFleetRuleRow & { name: string; start_offset_minutes: number });
        fleetsByRaceId.set(row.race_id, list);
      }
    }

    for (const seriesIdReg of regSeriesIdList) {
      const ids = [...(boatIdsAttachedBySeriesId.get(seriesIdReg) ?? [])];
      const hullsSorted = ids
        .map((bid) => boatById.get(bid))
        .filter((x): x is BoatMini => !!x)
        .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));

      if (hullsSorted.length === 0) {
        boatEntriesBySeriesId.set(seriesIdReg, []);
        continue;
      }

      const nextRace = nextRaceBySeriesId.get(seriesIdReg);
      const rulesFull = nextRace ? (fleetsByRaceId.get(nextRace.id) ?? []) : [];
      const forMatch: RaceFleetRuleRow[] = rulesFull.map(
        ({ id: rid, sort_order, filter_mode, class_keys, py_min, py_max }) => ({
          id: rid,
          sort_order,
          filter_mode,
          class_keys,
          py_min,
          py_max,
        }),
      );

      let pyMapForSeries = new Map<string, number | null>();
      if (nextRace && forMatch.length > 0) {
        pyMapForSeries = await boatEffectivePyByIdMap(
          supabase,
          { groupId, seriesId: seriesIdReg },
          hullsSorted.map((boat) => ({
            id: boat.id,
            class_name: boat.class_name ?? "",
            py_rating: boat.py_rating,
            rya_class_key: boat.rya_class_key,
          })),
        );
      }

      const hullRows: SailorHullEntryRow[] = [];

      for (const boat of hullsSorted) {
        const boatClassKey =
          (boat.rya_class_key && boat.rya_class_key.trim()) ||
          normalizeBoatClassKey(boat.class_name ?? null) ||
          null;

        const clubFleetRaw = clubFleetNameForBoatClass(sortedClubFleetsForMatch, fleetClassLinks, boatClassKey);
        let clubFleetUi: string | null = clubFleetRaw;
        if (!clubFleetUi) {
          clubFleetUi = boatClassKey
            ? "No club fleet lists this boat class — club admins maintain fleets under Club admin."
            : "Set RYA class on your boat (My boats)";
        }

        let nextFleetLine: string | null = null;
        if (!nextRace) {
          nextFleetLine = "No upcoming races scheduled";
        } else {
          let fleetIdFound: string | null = null;
          if (forMatch.length > 0) {
            const effectivePy = pyMapForSeries.get(boat.id) ?? null;
            fleetIdFound = matchFleetId(forMatch, { boatClassKey, effectivePy });
          }

          if (fleetIdFound) {
            const row = rulesFull.find((rfRow) => rfRow.id === fleetIdFound);
            if (row) {
              const firstStartMs = new Date(nextRace.scheduled_at).getTime();
              const fleetStartMs = firstStartMs + row.start_offset_minutes * 60_000;
              const fleetWall = formatClubHmFromIso(new Date(fleetStartMs).toISOString(), clubTz);
              const firstWall = formatClubHmFromIso(nextRace.scheduled_at, clubTz);
              if (row.start_offset_minutes <= 0) {
                nextFleetLine = `${row.name}: ${fleetWall} (same time as first start ${firstWall})`;
              } else {
                nextFleetLine = `${row.name}: ${fleetWall} (first start ${firstWall} + ${row.start_offset_minutes} min)`;
              }
            }
          }

          if (nextFleetLine == null) {
            if (rulesFull.length === 0) {
              nextFleetLine = `First start ${formatClubHmFromIso(nextRace.scheduled_at, clubTz)} — race fleets not set yet`;
            } else {
              nextFleetLine = "No fleet matches this boat at the next race — contact the club.";
            }
          }
        }

        hullRows.push({
          boatId: boat.id,
          boatLabel: formatBoatEntryLabel({
            defaultSailNumber: boat.default_sail_number,
            className: boat.class_name,
            ryaClassKey: boat.rya_class_key,
            label: boat.label,
          }),
          clubFleetName: clubFleetUi,
          nextFleetStartLine: nextFleetLine,
        });
      }

      boatEntriesBySeriesId.set(seriesIdReg, hullRows);
    }
  }

  return (seriesRows ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    dateLabel: `From ${formatPostgresDateDdMmmYyyy(s.starts_on)} To ${formatPostgresDateDdMmmYyyy(s.ends_on)}`,
    isRegistered: registeredSeriesIds.has(s.id),
    boatEntries: boatEntriesBySeriesId.get(s.id) ?? [],
    enteredBoatIds: [...(boatIdsAttachedBySeriesId.get(s.id) ?? [])],
  }));
}
