import type { SupabaseClient } from "@supabase/supabase-js";
import {
  resolvePenaltyPoints,
  type PenaltyRuleInput,
  type RacePenaltyCounts,
} from "@/lib/scoring/penalty-points";
import {
  computeAppendixARaceScores,
  type HandicapSystem,
  type RaceEntryScoringInput,
  type RaceScoringMode,
} from "@/lib/scoring/race-low-point";
import { raceTypeUsesPositionalScoring, normalizeRaceType } from "@/lib/race-type";
import {
  assignStandingPlaces,
  computeSeriesStandings,
  type DiscardBandInput,
  type SeriesStandingRow,
} from "@/lib/scoring/series-standings";
import { boatEffectivePyByIdMap } from "@/lib/resolve-class-py";
import { raceIdsWithRecordedScoringInputs } from "@/lib/series-recorded-results";
import { fetchRaceGuestScoringInputs, loadFinishedOfficialUserBoatKeysForRace, SCORABLE_GUEST_LINK_STATUSES, shouldSkipGuestRowForLinkedOfficial } from "@/lib/scoring/race-guest-scoring";
import {
  isRaceOnlyAdhocGuestRow,
  seriesRoAddedBoatId,
} from "@/lib/ro-added-boat-series";
import {
  fleetStartSignalUtcMs,
  fleetStartSignalUtcMsByFleetId,
  primaryRaceFleet,
} from "@/lib/resolve-fleet-start-signal";
import { seriesFleetKeyFromRaceFleet } from "@/lib/series-fleet-key";

export type PlacedStanding = { row: SeriesStandingRow; rank: number };

export type SeriesStandingsFleet = {
  id: string;
  name: string;
  sortOrder: number;
};

export type SeriesStandingsBoatDisplay = {
  boatLabel: string;
  sailorName: string;
};

export type StandingsTableRow = {
  rank: number;
  boatId: string;
  boatLabel: string;
  sailorName: string;
  netScore: number;
  discardCount: number;
  /** Points per race column (null when boat did not race that fleet in that race). */
  racePoints: (number | null)[];
};

type RaceStandingsSnapshot = {
  raceId: string;
  pointsByBoatId: Map<string, number>;
  fleetIdByBoatId: Map<string, string | null>;
  ownerUserIdByBoatId: Map<string, string>;
};

export type BuiltSeriesStandings = {
  placedByFleetId: Record<string, PlacedStanding[]>;
  tableRowsByFleetId: Record<string, StandingsTableRow[]>;
  fleets: SeriesStandingsFleet[];
  /** Races with recorded results (provisional or results-final), schedule order. */
  standingsRaces: { id: string; name: string; scheduled_at: string }[];
  boatDisplayById: Record<string, SeriesStandingsBoatDisplay>;
  handicapSystem: HandicapSystem;
};

function buildTableRowsForFleet(
  fleetId: string,
  placed: PlacedStanding[],
  snapshots: RaceStandingsSnapshot[],
  standingsRaces: { id: string }[],
  boatDisplayById: Record<string, SeriesStandingsBoatDisplay>,
): StandingsTableRow[] {
  const snapByRaceId = new Map(snapshots.map((s) => [s.raceId, s] as const));

  return placed.map(({ rank, row }) => {
    const display = boatDisplayById[row.boatId];
    const racePoints = standingsRaces.map((r) => {
      const snap = snapByRaceId.get(r.id);
      if (!snap) return null;
      if (snap.fleetIdByBoatId.get(row.boatId) !== fleetId) return null;
      const p = snap.pointsByBoatId.get(row.boatId);
      return p !== undefined ? p : null;
    });

    return {
      rank,
      boatId: row.boatId,
      boatLabel: display?.boatLabel ?? "—",
      sailorName: display?.sailorName ?? "—",
      netScore: row.netScore,
      discardCount: row.discardCount,
      racePoints,
    };
  });
}

function mergeFleetCatalog(
  catalog: Map<string, SeriesStandingsFleet>,
  rows: { id: string; name: string; sort_order: number; group_fleet_id?: string | null }[],
) {
  for (const f of rows) {
    const key = seriesFleetKeyFromRaceFleet(f);
    const existing = catalog.get(key);
    if (!existing || f.sort_order < existing.sortOrder) {
      catalog.set(key, { id: key, name: f.name, sortOrder: f.sort_order });
    }
  }
}

/** After admin link confirm, drop synthetic RO-added boat points in favour of the official hull. */
async function mergeConfirmedLinkedRoAddedSnapshots(
  supabase: SupabaseClient,
  raceSnapshots: RaceStandingsSnapshot[],
  raceIds: string[],
): Promise<void> {
  if (!raceIds.length) return;

  const { data: links } = await supabase
    .from("race_guest_entries")
    .select("race_id, adhoc_sail_number, adhoc_rya_class_key, linked_race_entry_id")
    .in("race_id", raceIds)
    .eq("link_status", "confirmed")
    .is("boat_id", null)
    .not("linked_race_entry_id", "is", null);

  if (!links?.length) return;

  const linkedEntryIds = [
    ...new Set(
      links
        .map((l) => l.linked_race_entry_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  if (!linkedEntryIds.length) return;

  const { data: officialEntries } = await supabase
    .from("race_entries")
    .select("id, boat_id")
    .in("id", linkedEntryIds);

  const boatIdByEntryId = new Map(
    (officialEntries ?? [])
      .filter((e) => e.boat_id)
      .map((e) => [e.id, e.boat_id as string] as const),
  );

  const snapByRaceId = new Map(raceSnapshots.map((s) => [s.raceId, s] as const));

  for (const link of links) {
    const sail = link.adhoc_sail_number?.trim();
    const cls = link.adhoc_rya_class_key?.trim();
    const linkedEntryId = link.linked_race_entry_id;
    if (!sail || !cls || !linkedEntryId) continue;

    const syntheticId = seriesRoAddedBoatId(sail, cls);
    const realBoatId = boatIdByEntryId.get(linkedEntryId);
    if (!realBoatId) continue;

    const snap = snapByRaceId.get(link.race_id);
    if (!snap) continue;

    const syntheticPts = snap.pointsByBoatId.get(syntheticId);
    if (syntheticPts == null) continue;

    snap.pointsByBoatId.delete(syntheticId);
    snap.fleetIdByBoatId.delete(syntheticId);
    snap.ownerUserIdByBoatId.delete(syntheticId);

    const existingReal = snap.pointsByBoatId.get(realBoatId);
    if (existingReal == null || syntheticPts < existingReal) {
      snap.pointsByBoatId.set(realBoatId, syntheticPts);
    }
  }
}

function filterRaceResultsForFleet(
  snapshots: RaceStandingsSnapshot[],
  fleetId: string,
): { raceId: string; pointsByBoatId: Map<string, number> }[] {
  return snapshots.map((snap) => {
    const pointsByBoatId = new Map<string, number>();
    for (const [boatId, pts] of snap.pointsByBoatId) {
      if (snap.fleetIdByBoatId.get(boatId) === fleetId) {
        pointsByBoatId.set(boatId, pts);
      }
    }
    return { raceId: snap.raceId, pointsByBoatId };
  });
}

function buildPlacedForFleet(
  fleetId: string,
  snapshots: RaceStandingsSnapshot[],
  discardBands: DiscardBandInput[],
): PlacedStanding[] {
  const boatIds = new Set<string>();
  for (const snap of snapshots) {
    for (const [boatId, fid] of snap.fleetIdByBoatId) {
      if (fid === fleetId && snap.pointsByBoatId.has(boatId)) boatIds.add(boatId);
    }
  }

  if (!boatIds.size) return [];

  const ownerUserIdByBoatId = new Map<string, string>();
  for (const snap of snapshots) {
    for (const boatId of boatIds) {
      const owner = snap.ownerUserIdByBoatId.get(boatId);
      if (owner) ownerUserIdByBoatId.set(boatId, owner);
    }
  }

  const filteredRaceResults = filterRaceResultsForFleet(snapshots, fleetId);
  const completedRaceCount = filteredRaceResults.filter((rr) => rr.pointsByBoatId.size > 0).length;
  if (!completedRaceCount) return [];

  const standingsSorted = computeSeriesStandings({
    boatIds: [...boatIds],
    raceResults: filteredRaceResults,
    discardBands,
  });

  for (const row of standingsSorted) {
    row.userId = ownerUserIdByBoatId.get(row.boatId) ?? "";
  }

  return assignStandingPlaces(standingsSorted);
}

/**
 * Reusable series standings (same rules as the standings page): races with recorded
 * scoring activity, including provisional; `results_final` does not gate inclusion.
 * Rows are boats with results, ranked per fleet.
 */
export async function buildSeriesStandingsPlaced(
  supabase: SupabaseClient,
  args: { groupId: string; seriesId: string },
): Promise<BuiltSeriesStandings> {
  const { groupId, seriesId } = args;

  const { data: groupRow } = await supabase
    .from("groups")
    .select("ro_added_boats_series_standings")
    .eq("id", groupId)
    .maybeSingle();

  const includeRoAddedInStandings = Boolean(
    (groupRow as { ro_added_boats_series_standings?: boolean | null } | null)
      ?.ro_added_boats_series_standings,
  );

  const { data: scoringCfg } = await supabase
    .from("series_scoring_config")
    .select("handicap_system")
    .eq("series_id", seriesId)
    .maybeSingle();

  const { data: penaltyRows } = await supabase
    .from("series_penalty_rules")
    .select("outcome_code, basis, plus, fixed_points")
    .eq("series_id", seriesId);

  const { data: discardRows } = await supabase
    .from("series_discard_rules")
    .select("races_from, races_to, discards")
    .eq("series_id", seriesId)
    .order("races_from", { ascending: true });

  const discardBands: DiscardBandInput[] = (discardRows ?? []).map((r) => ({
    races_from: r.races_from,
    races_to: r.races_to,
    discards: r.discards,
  }));

  const penaltyRulesByOutcome = new Map<string, PenaltyRuleInput>();
  const basesOk = new Set([
    "series_entrants",
    "race_starters",
    "race_finishers",
    "fixed",
  ]);
  for (const r of penaltyRows ?? []) {
    if (!basesOk.has(r.basis)) continue;
    penaltyRulesByOutcome.set(r.outcome_code, {
      outcome_code: r.outcome_code,
      basis: r.basis as PenaltyRuleInput["basis"],
      plus: r.plus,
      fixed_points:
        r.fixed_points != null && String(r.fixed_points).length
          ? Number(r.fixed_points)
          : null,
    });
  }

  const { data: registrations } = await supabase
    .from("series_registrations")
    .select("user_id")
    .eq("series_id", seriesId);

  const seriesEntrantCount = registrations?.length ?? 0;

  const { data: seriesRaces } = await supabase
    .from("races")
    .select("id, name, scheduled_at, race_type")
    .eq("series_id", seriesId)
    .order("scheduled_at", { ascending: true });

  const handicapSystem: HandicapSystem =
    scoringCfg?.handicap_system === "none" ? "none" : "portsmouth";

  const ordered = seriesRaces ?? [];
  const eligibleIds = await raceIdsWithRecordedScoringInputs(
    supabase,
    ordered.map((r) => r.id),
  );
  const standingsRaceList = ordered.filter((r) => eligibleIds.has(r.id));
  const raceIds = standingsRaceList.map((r) => r.id);

  const fleetCatalog = new Map<string, SeriesStandingsFleet>();

  let globalBoatPyById = new Map<string, number | null>();
  const boatMetaById = new Map<
    string,
    { label: string; owner_user_id: string | null; default_sail_number: string | null }
  >();

  if (raceIds.length) {
    const { data: eb } = await supabase.from("race_entries").select("boat_id").in("race_id", raceIds);
    const boatIdSet = new Set<string>();
    for (const e of eb ?? []) {
      if (e.boat_id) boatIdSet.add(e.boat_id);
    }
    const { data: guestBoatLinks } = await supabase
      .from("race_guest_entries")
      .select("boats!boat_id ( id, linked_boat_id )")
      .in("race_id", raceIds)
      .in("link_status", [...SCORABLE_GUEST_LINK_STATUSES]);
    type GbNest = { id?: string; linked_boat_id?: string | null };
    for (const row of guestBoatLinks ?? []) {
      const raw = row as { boats?: GbNest | GbNest[] | null };
      const rel = raw.boats;
      const gb = rel == null ? null : Array.isArray(rel) ? rel[0] ?? null : rel;
      const lb = gb?.linked_boat_id ?? null;
      if (lb) boatIdSet.add(lb);
      else if (gb?.id) boatIdSet.add(gb.id);
    }
    const bid = [...boatIdSet];
    if (bid.length) {
      const { data: bts } = await supabase
        .from("boats")
        .select("id, label, owner_user_id, default_sail_number, class_name, py_rating, rya_class_key")
        .in("id", bid);
      for (const b of bts ?? []) {
        boatMetaById.set(b.id, {
          label: b.label,
          owner_user_id: b.owner_user_id,
          default_sail_number: b.default_sail_number,
        });
      }
      globalBoatPyById = await boatEffectivePyByIdMap(
        supabase,
        { groupId, seriesId },
        (bts ?? []).map((b) => ({
          id: b.id,
          class_name: b.class_name,
          py_rating: b.py_rating,
          rya_class_key: (b as { rya_class_key?: string | null }).rya_class_key ?? null,
        })),
      );
    }
  }

  const raceSnapshots: RaceStandingsSnapshot[] = [];

  for (const race of standingsRaceList) {
    const raceType = normalizeRaceType((race as { race_type?: string }).race_type);
    const scoringMode: RaceScoringMode = raceTypeUsesPositionalScoring(raceType) ? "positional" : "handicap";

    const { data: raceFleets } = await supabase
      .from("race_fleets")
      .select("id, name, sort_order, start_signal_at, start_offset_minutes, group_fleet_id")
      .eq("race_id", race.id);

    mergeFleetCatalog(fleetCatalog, raceFleets ?? []);

    const fleetRows = raceFleets ?? [];
    const raceFleetToSeriesKey = new Map(
      fleetRows.map((f) => [f.id, seriesFleetKeyFromRaceFleet(f)] as const),
    );
    const startByFleetId = fleetStartSignalUtcMsByFleetId(race.scheduled_at, fleetRows);
    const primary = primaryRaceFleet(fleetRows);
    const raceDefaultStartMs = primary
      ? fleetStartSignalUtcMs(race.scheduled_at, primary)
      : race.scheduled_at != null
        ? new Date(race.scheduled_at).getTime()
        : null;
    const raceDefaultStartNorm =
      raceDefaultStartMs != null && Number.isFinite(raceDefaultStartMs) ? raceDefaultStartMs : null;

    const { data: entries } = await supabase
      .from("race_entries")
      .select(
        "id, user_id, boat_id, fleet_id, sail_number_override, outcome, started_marked_at, py_override",
      )
      .eq("race_id", race.id);

    const entryIdToBoatId = new Map<string, string>();
    const entryOwnerByEntryId = new Map<string, string>();
    for (const e of entries ?? []) {
      if (e.boat_id) {
        entryIdToBoatId.set(e.id, e.boat_id);
        entryOwnerByEntryId.set(e.id, e.user_id);
      }
    }

    const finishedOfficialUserBoatKeys = await loadFinishedOfficialUserBoatKeysForRace(
      supabase,
      race.id,
    );

    const { data: guestEntryRows } = await supabase
      .from("race_guest_entries")
      .select(
        `
        id,
        link_status,
        linked_race_entry_id,
        pending_matched_user_id,
        pending_matched_boat_id,
        adhoc_sail_number,
        adhoc_rya_class_key,
        boats!boat_id (
          id,
          label,
          linked_boat_id,
          default_sail_number,
          club_guest_sailors ( linked_user_id )
        )
      `,
      )
      .eq("race_id", race.id)
      .in("link_status", [...SCORABLE_GUEST_LINK_STATUSES]);

    type GuestBoatNest = {
      id: string;
      label: string;
      linked_boat_id: string | null;
      default_sail_number: string | null;
      club_guest_sailors?: { linked_user_id: string | null } | { linked_user_id: string | null }[] | null;
    };

    for (const raw of guestEntryRows ?? []) {
      const row = raw as {
        id: string;
        link_status?: string | null;
        linked_race_entry_id?: string | null;
        pending_matched_user_id?: string | null;
        pending_matched_boat_id?: string | null;
        adhoc_sail_number?: string | null;
        adhoc_rya_class_key?: string | null;
        boats?: GuestBoatNest | GuestBoatNest[] | null;
      };

      if (shouldSkipGuestRowForLinkedOfficial(row, finishedOfficialUserBoatKeys)) {
        continue;
      }

      if (includeRoAddedInStandings && isRaceOnlyAdhocGuestRow(row)) {
        const sail = row.adhoc_sail_number!.trim();
        const cls = row.adhoc_rya_class_key!.trim();
        const boatId = seriesRoAddedBoatId(sail, cls);
        entryIdToBoatId.set(`guest:${row.id}`, boatId);
        if (!boatMetaById.has(boatId)) {
          boatMetaById.set(boatId, {
            label: sail,
            owner_user_id: null,
            default_sail_number: sail,
          });
        }
        continue;
      }

      const gb = Array.isArray(row.boats)
        ? (row.boats[0] as GuestBoatNest | undefined)
        : (row.boats as GuestBoatNest | null);
      if (!gb) continue;
      const boatId = gb.linked_boat_id ?? gb.id;
      entryIdToBoatId.set(`guest:${row.id}`, boatId);
      const gs = Array.isArray(gb.club_guest_sailors)
        ? gb.club_guest_sailors[0]
        : gb.club_guest_sailors;
      if (gs?.linked_user_id) entryOwnerByEntryId.set(`guest:${row.id}`, gs.linked_user_id);
      if (!boatMetaById.has(boatId)) {
        boatMetaById.set(boatId, {
          label: gb.label,
          owner_user_id: gs?.linked_user_id ?? null,
          default_sail_number: gb.default_sail_number,
        });
      }
    }

    const entryIds = (entries ?? []).map((e) => e.id).filter(Boolean);
    const finishByEntryId = new Map<
      string,
      {
        official_finish_at: string | null;
        elapsed_seconds: number | null;
        corrected_seconds: number | null;
        finish_position: number | null;
      }
    >();

    if (entryIds.length) {
      const { data: finishes } = await supabase
        .from("race_finishes")
        .select("race_entry_id, official_finish_at, elapsed_seconds, corrected_seconds, finish_position")
        .in("race_entry_id", entryIds);
      for (const f of finishes ?? []) {
        finishByEntryId.set(f.race_entry_id, {
          official_finish_at: f.official_finish_at,
          elapsed_seconds: f.elapsed_seconds ?? null,
          corrected_seconds: f.corrected_seconds ?? null,
          finish_position: f.finish_position ?? null,
        });
      }
    }

    const boatPyById = globalBoatPyById;
    const startSignalMsNorm = raceDefaultStartNorm;
    const normalEntryUserIds = new Set((entries ?? []).map((e) => e.user_id));

    const scoringInputsNormal: RaceEntryScoringInput[] = (entries ?? []).map((e) => {
      const fleetMs = e.fleet_id ? startByFleetId.get(e.fleet_id) : null;
      const entryStart =
        fleetMs != null && Number.isFinite(fleetMs) ? fleetMs : raceDefaultStartNorm;
      const fin = finishByEntryId.get(e.id);
      return {
        entryId: e.id,
        userId: e.user_id,
        fleetId: e.fleet_id,
        outcome: e.outcome,
        startedMarkedAt: e.started_marked_at,
        startSignalMs: entryStart,
        boatPy: e.boat_id ? (boatPyById.get(e.boat_id) ?? null) : null,
        pyOverride: e.py_override,
        officialFinishAt: fin?.official_finish_at ?? null,
        finishPosition: fin?.finish_position ?? null,
        storedElapsedSeconds: fin != null ? fin.elapsed_seconds : undefined,
        storedCorrectedSeconds: fin != null ? fin.corrected_seconds : undefined,
      };
    });

    const { inputs: guestScoringInputs } = await fetchRaceGuestScoringInputs(
      supabase,
      { groupId, seriesId },
      race.id,
      normalEntryUserIds,
      boatPyById,
      startByFleetId,
      raceDefaultStartNorm,
      scoringMode,
      { includeRaceOnlyAdhoc: includeRoAddedInStandings },
    );

    const scoringInputs: RaceEntryScoringInput[] = [...scoringInputsNormal, ...guestScoringInputs];

    const scores = computeAppendixARaceScores({
      scoringMode,
      handicapSystem,
      startSignalMs: startSignalMsNorm,
      seriesEntrantCount,
      entries: scoringInputs,
      penaltyRulesByOutcome,
    });

    const pointsByBoatId = new Map<string, number>();
    const fleetIdByBoatId = new Map<string, string | null>();
    const ownerUserIdByBoatId = new Map<string, string>();

    for (const sr of scores) {
      const boatId = entryIdToBoatId.get(sr.entryId);
      if (!boatId) continue;
      const prev = pointsByBoatId.get(boatId);
      if (prev == null || sr.points < prev) {
        pointsByBoatId.set(boatId, sr.points);
      }
      const raceFleetId = sr.fleetId ?? null;
      fleetIdByBoatId.set(
        boatId,
        raceFleetId ? (raceFleetToSeriesKey.get(raceFleetId) ?? raceFleetId) : null,
      );
      const owner = entryOwnerByEntryId.get(sr.entryId);
      if (owner) ownerUserIdByBoatId.set(boatId, owner);
    }

    raceSnapshots.push({
      raceId: race.id,
      pointsByBoatId,
      fleetIdByBoatId,
      ownerUserIdByBoatId,
    });
  }

  await mergeConfirmedLinkedRoAddedSnapshots(supabase, raceSnapshots, raceIds);

  const fleets = [...fleetCatalog.values()].sort((a, b) => a.sortOrder - b.sortOrder);

  const standingsRaces = standingsRaceList.map((r) => ({
    id: r.id,
    name: r.name,
    scheduled_at: r.scheduled_at,
  }));

  const ownerIds = new Set<string>();
  for (const snap of raceSnapshots) {
    for (const uid of snap.ownerUserIdByBoatId.values()) ownerIds.add(uid);
  }

  const nameByUser = new Map<string, string | null>();
  if (ownerIds.size) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", [...ownerIds]);
    for (const p of profs ?? []) nameByUser.set(p.id, p.display_name);
  }

  const boatDisplayById: Record<string, SeriesStandingsBoatDisplay> = {};
  const boatIdsSeen = new Set<string>();
  for (const snap of raceSnapshots) {
    for (const boatId of snap.pointsByBoatId.keys()) boatIdsSeen.add(boatId);
  }
  for (const boatId of boatIdsSeen) {
    const meta = boatMetaById.get(boatId);
    let ownerId: string | null = meta?.owner_user_id ?? null;
    if (!ownerId) {
      for (const snap of raceSnapshots) {
        const o = snap.ownerUserIdByBoatId.get(boatId);
        if (o) {
          ownerId = o;
          break;
        }
      }
    }
    boatDisplayById[boatId] = {
      boatLabel: meta?.label?.trim() || "—",
      sailorName: (ownerId ? nameByUser.get(ownerId) : null)?.trim() || "—",
    };
  }

  const placedByFleetId: Record<string, PlacedStanding[]> = {};
  const tableRowsByFleetId: Record<string, StandingsTableRow[]> = {};
  for (const fleet of fleets) {
    const placed = buildPlacedForFleet(fleet.id, raceSnapshots, discardBands);
    placedByFleetId[fleet.id] = placed;
    tableRowsByFleetId[fleet.id] = buildTableRowsForFleet(
      fleet.id,
      placed,
      raceSnapshots,
      standingsRaces,
      boatDisplayById,
    );
  }

  return {
    placedByFleetId,
    tableRowsByFleetId,
    fleets,
    standingsRaces,
    boatDisplayById,
    handicapSystem,
  };
}

export type SeriesStandingPlace = { rank: number; of: number };

/** Best fleet rank per boat from an already-built standings snapshot. */
export function boatSeriesPositionsFromBuilt(
  built: BuiltSeriesStandings,
  boatIds: string[],
): Map<string, SeriesStandingPlace | null> {
  const out = new Map<string, SeriesStandingPlace | null>();
  if (!built.standingsRaces.length) {
    for (const boatId of boatIds) out.set(boatId, null);
    return out;
  }

  for (const boatId of boatIds) {
    let best: SeriesStandingPlace | null = null;
    for (const placed of Object.values(built.placedByFleetId)) {
      const match = placed.find((p) => p.row.boatId === boatId);
      if (!match) continue;
      const candidate = { rank: match.rank, of: placed.length };
      if (!best || candidate.rank < best.rank) best = candidate;
    }
    out.set(boatId, best);
  }
  return out;
}

export async function getUserSeriesPosition(
  supabase: SupabaseClient,
  userId: string,
  groupId: string,
  seriesId: string,
): Promise<SeriesStandingPlace | null> {
  const built = await buildSeriesStandingsPlaced(supabase, { groupId, seriesId });
  if (!built?.standingsRaces.length) return null;

  let best: SeriesStandingPlace | null = null;
  for (const placed of Object.values(built.placedByFleetId)) {
    const match = placed.find((p) => p.row.userId === userId);
    if (!match) continue;
    const candidate = { rank: match.rank, of: placed.length };
    if (!best || candidate.rank < best.rank) best = candidate;
  }
  return best;
}
