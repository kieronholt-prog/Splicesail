import "server-only";

import { normalizeBoatClassKey } from "@/lib/normalize-class";
import { formatPostgresDateDdMmmYyyy } from "@/lib/club-display-format";
import { boatEffectivePyByIdMap } from "@/lib/resolve-class-py";
import { matchFleetId, type RaceFleetRuleRow } from "@/lib/resolve-entry-fleet";
import { getUserSeriesPosition } from "@/lib/scoring/build-series-standings";
import { getServerAuth } from "@/lib/supabase/auth-cache";

export type SeriesEntriesTablePosition = { rank: number; of: number } | null;

export type SeriesEntriesTableRow = {
  /** Stable key for lists: series + hull. */
  rowKey: string;
  seriesId: string;
  boatId: string;
  groupId: string;
  seriesName: string;
  seriesDateRangeDisplay: string | null;
  /** UTC midnight ms for starts_on; null when unknown (sort last ascending). */
  seriesStartSort: number | null;
  sailNumber: string;
  boatTypeDisplay: string;
  fleetName: string;
  position: SeriesEntriesTablePosition;
  /** Standing rank when known; aids client sort. */
  standingRank: number | null;
};

type RaceFleetRowDb = RaceFleetRuleRow & {
  id: string;
  race_id: string;
  name: string;
};

type RaceEntrySlice = {
  race_id: string;
  boat_id: string | null;
  fleet_id: string | null;
  py_override: number | null;
};

/** @deprecated Prefer {@link formatPostgresDateDdMmmYyyy} from club-display-format. */
export function formatUkShortDate(raw: string | null): string | null {
  const s = formatPostgresDateDdMmmYyyy(raw);
  return s === "—" ? null : s;
}

function ukDateRange(start: string | null, end: string | null): string | null {
  const a = start ? formatPostgresDateDdMmmYyyy(start) : null;
  const b = end ? formatPostgresDateDdMmmYyyy(end) : null;
  if (a && b && a !== "—" && b !== "—") return `${a} - ${b}`;
  if (a && a !== "—") return `${a} -`;
  if (b && b !== "—") return `- ${b}`;
  return null;
}

function dateToUtcMidnightMs(isoDate: string | null): number | null {
  if (!isoDate) return null;
  const day = isoDate.split("T")[0]!;
  const t = Date.parse(`${day}T00:00:00.000Z`);
  return Number.isFinite(t) ? t : null;
}

function pickAnchorRace(races: { id: string; scheduled_at: string }[]): { id: string; scheduled_at: string } | null {
  if (!races.length) return null;
  const now = Date.now();
  const sorted = [...races].sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
  const upcoming = sorted.find((r) => new Date(r.scheduled_at).getTime() >= now);
  if (upcoming) return upcoming;
  return sorted[sorted.length - 1]!;
}

function fleetNameForBoatRace(
  opts: {
    fleets: RaceFleetRowDb[];
    boat: {
      id: string;
      class_name: string | null;
      py_rating: number | null;
      rya_class_key: string | null;
    };
    entry: RaceEntrySlice | undefined;
    effectivePyByBoatId: Map<string, number | null>;
  },
): string {
  if (!opts.fleets.length) return "—";

  const { boat } = opts;
  const entry = opts.entry;

  const effectivePy =
    entry?.py_override != null && entry.py_override !== undefined
      ? entry.py_override
      : opts.effectivePyByBoatId.get(boat.id) ?? null;

  const boatClassKey =
    (boat.rya_class_key && boat.rya_class_key.trim()) ||
    normalizeBoatClassKey(boat.class_name) ||
    null;

  const fleetsRules: RaceFleetRuleRow[] = opts.fleets.map((f) => ({
    id: f.id,
    sort_order: f.sort_order,
    filter_mode: f.filter_mode,
    class_keys: f.class_keys,
    py_min: f.py_min,
    py_max: f.py_max,
  }));

  let fleetId = entry?.fleet_id ?? null;
  if (fleetId && !opts.fleets.some((f) => f.id === fleetId)) fleetId = null;
  if (!fleetId) {
    fleetId = matchFleetId(fleetsRules, { boatClassKey, effectivePy });
  }

  if (fleetId) {
    const fl = opts.fleets.find((f) => f.id === fleetId);
    if (fl) return fl.name;
  }
  return "—";
}

export async function fetchSeriesEntriesTableRows(
  userId: string,
  opts?: { groupId?: string },
): Promise<SeriesEntriesTableRow[]> {
  const { supabase } = await getServerAuth();

  const { data: srbAll } = await supabase
    .from("series_registration_boats")
    .select("series_id, boat_id")
    .eq("user_id", userId);

  if (!srbAll?.length) {
    return [];
  }

  const seriesIdsDistinct = [...new Set(srbAll.map((r) => r.series_id).filter(Boolean))] as string[];

  const { data: seriesRows } = await supabase
    .from("series")
    .select("id, name, group_id, starts_on, ends_on")
    .in("id", seriesIdsDistinct);

  const seriesById = new Map((seriesRows ?? []).map((s) => [s.id, s] as const));

  type ExplodedSignup = {
    seriesId: string;
    seriesName: string;
    groupId: string;
    boatId: string;
    startsOn: string | null;
    endsOn: string | null;
  };

  const boatIdsAll = [...new Set(srbAll.map((r) => r.boat_id).filter(Boolean))] as string[];
  const boatById = new Map<
    string,
    {
      id: string;
      label: string;
      default_sail_number: string | null;
      class_name: string | null;
      rya_class_key: string | null;
      py_rating: number | null;
    }
  >();

  if (boatIdsAll.length > 0) {
    const { data: bows } = await supabase
      .from("boats")
      .select("id, label, default_sail_number, class_name, rya_class_key, py_rating")
      .eq("owner_user_id", userId)
      .in("id", boatIdsAll);
    for (const b of bows ?? []) {
      boatById.set(b.id, {
        id: b.id,
        label: b.label,
        default_sail_number: b.default_sail_number,
        class_name: b.class_name,
        rya_class_key: b.rya_class_key,
        py_rating: b.py_rating,
      });
    }
  }

  const ryaKeys = [...new Set([...boatById.values()].map((b) => (b.rya_class_key ?? "").trim()).filter(Boolean))];
  const ryaDisplayByKey = new Map<string, string>();
  if (ryaKeys.length > 0) {
    const { data: rya } = await supabase.from("boat_classes").select("class_key, display_name").in("class_key", ryaKeys);
    for (const r of rya ?? []) {
      ryaDisplayByKey.set(r.class_key, r.display_name);
    }
  }

  const exploded: ExplodedSignup[] = [];
  for (const row of srbAll) {
    if (!row.series_id || !row.boat_id) continue;
    const s = seriesById.get(row.series_id);
    if (!s) continue;
    const gid = s.group_id;
    if (opts?.groupId != null && gid !== opts.groupId) continue;
    exploded.push({
      seriesId: row.series_id,
      boatId: row.boat_id,
      seriesName: s.name,
      groupId: gid,
      startsOn: s.starts_on,
      endsOn: s.ends_on,
    });
  }

  if (!exploded.length) {
    return [];
  }

  const racesBySeries = new Map<string, { id: string; scheduled_at: string }[]>();
  if (seriesIdsDistinct.length) {
    const { data: allRaces } = await supabase
      .from("races")
      .select("id, series_id, scheduled_at")
      .in("series_id", seriesIdsDistinct);
    for (const r of allRaces ?? []) {
      const list = racesBySeries.get(r.series_id) ?? [];
      list.push({ id: r.id, scheduled_at: r.scheduled_at });
      racesBySeries.set(r.series_id, list);
    }
  }

  const anchorRaceBySeries = new Map<string, { id: string; scheduled_at: string }>();
  for (const [sid, list] of racesBySeries) {
    const anchor = pickAnchorRace(list);
    if (anchor) anchorRaceBySeries.set(sid, anchor);
  }

  const anchorRaceIds = [...new Set([...anchorRaceBySeries.values()].map((x) => x.id))];

  const [{ data: raceEntryRowsRaw }, { data: allAnchorFleets }] = await Promise.all([
    anchorRaceIds.length
      ? supabase
          .from("race_entries")
          .select("race_id, boat_id, fleet_id, py_override")
          .eq("user_id", userId)
          .in("race_id", anchorRaceIds)
      : Promise.resolve({ data: [] as RaceEntrySlice[] }),
    anchorRaceIds.length
      ? supabase
          .from("race_fleets")
          .select("id, race_id, name, sort_order, filter_mode, class_keys, py_min, py_max, start_offset_minutes")
          .in("race_id", anchorRaceIds)
      : Promise.resolve({ data: [] as RaceFleetRowDb[] }),
  ]);

  const raceEntryRows = raceEntryRowsRaw ?? [];

  const entryFleetByRaceAndBoatId = new Map<string, RaceEntrySlice>();
  for (const e of raceEntryRows) {
    if (e.boat_id != null && String(e.boat_id).trim() !== "") {
      entryFleetByRaceAndBoatId.set(`${e.race_id}\u0000${e.boat_id}`, e);
    }
  }

  const fleetsByRaceId = new Map<string, RaceFleetRowDb[]>();
  for (const f of allAnchorFleets ?? []) {
    const list = fleetsByRaceId.get(f.race_id) ?? [];
    list.push(f);
    fleetsByRaceId.set(f.race_id, list);
  }

  const positionBySeriesKey = new Map<string, SeriesEntriesTablePosition>();
  const uniqSeriesBySeriesId = [...new Map(exploded.map((row) => [row.seriesId, row])).values()];
  const positionResults =
    uniqSeriesBySeriesId.length > 0
      ? await Promise.all(
          uniqSeriesBySeriesId.map((row) => getUserSeriesPosition(supabase, userId, row.groupId, row.seriesId)),
        )
      : [];
  for (let i = 0; i < uniqSeriesBySeriesId.length; i++) {
    const u = uniqSeriesBySeriesId[i];
    positionBySeriesKey.set(u.seriesId, positionResults[i] ?? null);
  }

  const pyMaps = await Promise.all(
    uniqSeriesBySeriesId.map(async (u) => {
      const boatIdsInSeries = [...new Set(exploded.filter((e) => e.seriesId === u.seriesId).map((e) => e.boatId))];
      const boatPyRows = boatIdsInSeries
        .map((id) => boatById.get(id))
        .filter((b): b is NonNullable<typeof b> => b != null)
        .map((b) => ({
          id: b.id,
          class_name: b.class_name,
          py_rating: b.py_rating,
          rya_class_key: b.rya_class_key,
        }));
      if (boatPyRows.length === 0) return [u.seriesId, new Map<string, number | null>()] as const;
      const m = await boatEffectivePyByIdMap(supabase, { groupId: u.groupId, seriesId: u.seriesId }, boatPyRows);
      return [u.seriesId, m] as const;
    }),
  );
  const effectivePyBySeriesId = new Map(pyMaps);

  const rows: SeriesEntriesTableRow[] = [];
  for (const x of exploded) {
    const boat = boatById.get(x.boatId);
    const sailNumber = (boat?.default_sail_number ?? "").trim() || "—";
    let boatTypeDisplay = "—";
    if (boat) {
      const rk = (boat.rya_class_key ?? "").trim();
      if (rk && ryaDisplayByKey.has(rk)) {
        boatTypeDisplay = ryaDisplayByKey.get(rk)!;
      } else if ((boat.class_name ?? "").trim()) {
        boatTypeDisplay = boat.class_name!.trim();
      }
    }

    const anchor = anchorRaceBySeries.get(x.seriesId);
    const fleets = anchor ? fleetsByRaceId.get(anchor.id) ?? [] : [];
    const entry = anchor ? entryFleetByRaceAndBoatId.get(`${anchor.id}\u0000${x.boatId}`) : undefined;

    let fleetName = "—";
    if (anchor && boat) {
      fleetName = fleetNameForBoatRace({
        fleets,
        boat,
        entry,
        effectivePyByBoatId: effectivePyBySeriesId.get(x.seriesId) ?? new Map(),
      });
    }

    const pos = positionBySeriesKey.get(x.seriesId) ?? null;
    const standingRank = pos ? pos.rank : null;

    rows.push({
      rowKey: `${x.seriesId}:${x.boatId}`,
      seriesId: x.seriesId,
      boatId: x.boatId,
      groupId: x.groupId,
      seriesName: x.seriesName,
      seriesDateRangeDisplay: ukDateRange(x.startsOn, x.endsOn),
      seriesStartSort: dateToUtcMidnightMs(x.startsOn),
      sailNumber,
      boatTypeDisplay,
      fleetName,
      position: pos,
      standingRank,
    });
  }

  return rows;
}
