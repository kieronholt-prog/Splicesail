import type { SupabaseClient } from "@supabase/supabase-js";
import { helmAndCrewDisplayLabels, resolveEffectiveCrewTemplate } from "@/lib/boat-crew";
import { formatClubHmsFromIso, formatRaceElapsedOrCorrectedHms } from "@/lib/club-display-format";
import { resolveClubIanaTimeZone } from "@/lib/club-time";
import { boatEffectivePyByIdMap } from "@/lib/resolve-class-py";
import {
  fleetStartSignalUtcMs,
  fleetStartSignalUtcMsByFleetId,
  primaryRaceFleet,
} from "@/lib/resolve-fleet-start-signal";
import type { PenaltyRuleInput } from "@/lib/scoring/penalty-points";
import { fetchRaceGuestScoringInputs } from "@/lib/scoring/race-guest-scoring";
import {
  computeAppendixARaceScores,
  type HandicapSystem,
  type RaceEntryScoringInput,
  type RaceScoreRow,
  type RaceScoringMode,
} from "@/lib/scoring/race-low-point";
import { raceTypeUsesPositionalScoring, normalizeRaceType, type RaceType } from "@/lib/race-type";
import { seriesFleetKeyFromRaceFleet } from "@/lib/series-fleet-key";

export type RaceResultRow = {
  entryId: string;
  position: string;
  sailNumber: string;
  boatType: string;
  helmLine: string;
  crewLine: string;
  finishDisplay: string;
  elapsedDisplay: string;
  correctedDisplay: string;
  isHighlighted: boolean;
};

/** Helm label for race-only guest rows not yet on the series signup. */
export const RACE_ONLY_ADHOC_HELM_LINE = "Make Entry for Series Result";

export function isRaceOnlyAdhocResultRow(row: RaceResultRow): boolean {
  return row.helmLine === RACE_ONLY_ADHOC_HELM_LINE;
}

/**
 * Public results fleet filter: registered boats follow the selected fleet; RO-added
 * race-only rows stay visible when unassigned or keyed to another race fleet.
 */
export function filterPublicRaceResultSections(
  sections: RaceResultsFleetSection[],
  filterFleetId: string | null,
): RaceResultsFleetSection[] {
  if (!filterFleetId) return sections;

  if (filterFleetId === "__unassigned__") {
    return sections.filter((s) => s.fleetId == null && s.rows.length > 0);
  }

  const matched = sections.filter((s) => s.seriesFleetId === filterFleetId && s.rows.length > 0);
  const matchedEntryIds = new Set(matched.flatMap((s) => s.rows.map((r) => r.entryId)));

  const adhocElsewhere = sections
    .flatMap((s) => s.rows)
    .filter((r) => isRaceOnlyAdhocResultRow(r) && !matchedEntryIds.has(r.entryId));

  if (!matched.length && !adhocElsewhere.length) return [];

  if (!adhocElsewhere.length) return matched;

  return [
    ...matched,
    {
      fleetId: null,
      seriesFleetId: null,
      fleetName: "RO-added boats",
      rows: adhocElsewhere,
    },
  ];
}

export type RaceResultsFleetSection = {
  fleetId: string | null;
  /** Series-level fleet key (group_fleet_id when linked) for cross-race filtering. */
  seriesFleetId: string | null;
  fleetName: string;
  rows: RaceResultRow[];
};

export type RaceResultsDisplay = {
  raceId: string;
  raceName: string;
  seriesId: string;
  seriesName: string;
  groupId: string;
  clubName: string | null;
  clubSlug: string | null;
  clubTz: string;
  scheduledAt: string;
  raceType: RaceType;
  fleetSections: RaceResultsFleetSection[];
};

function unwrapOne<T>(rel: T | T[] | null | undefined): T | null {
  if (rel == null) return null;
  return Array.isArray(rel) ? rel[0] ?? null : rel;
}

function positionLabel(sr: RaceScoreRow): string {
  if (sr.placeLabel) return sr.placeLabel;
  const code = sr.penaltyOutcome?.trim().toUpperCase();
  return code && code.length ? code : "—";
}

function boatTypeLabel(
  className: string | null | undefined,
  ryaClassKey: string | null | undefined,
  classDisplayByKey: Map<string, string>,
): string {
  const cn = className?.trim();
  if (cn) return cn;
  const key = ryaClassKey?.trim();
  if (key) return classDisplayByKey.get(key) ?? key;
  return "—";
}

export function groupRaceRowsByFleet(
  rows: (RaceResultRow & { fleetId: string | null })[],
  raceFleets: { id: string; name: string; group_fleet_id?: string | null }[],
): RaceResultsFleetSection[] {
  const byKey = new Map<string, RaceResultRow[]>();
  for (const row of rows) {
    const key = row.fleetId ?? "";
    const list = byKey.get(key) ?? [];
    const { fleetId: _fleetId, ...displayRow } = row;
    list.push(displayRow);
    byKey.set(key, list);
  }

  const sections: RaceResultsFleetSection[] = [];
  for (const f of raceFleets) {
    const fleetRows = byKey.get(f.id);
    if (!fleetRows?.length) continue;
    sections.push({
      fleetId: f.id,
      seriesFleetId: seriesFleetKeyFromRaceFleet(f),
      fleetName: f.name,
      rows: fleetRows,
    });
    byKey.delete(f.id);
  }

  const unassigned = byKey.get("");
  if (unassigned?.length) {
    sections.push({ fleetId: null, seriesFleetId: null, fleetName: "Unassigned fleet", rows: unassigned });
    byKey.delete("");
  }

  for (const [key, fleetRows] of byKey) {
    if (!fleetRows.length) continue;
    sections.push({ fleetId: key, seriesFleetId: key, fleetName: "Fleet", rows: fleetRows });
  }

  return sections;
}

/** Race results table (per fleet), same shape as Home finish results. */
export async function fetchRaceResultsDisplay(
  supabase: SupabaseClient,
  args: {
    groupId: string;
    seriesId: string;
    raceId: string;
    raceName: string;
    seriesName: string;
    scheduledAt: string;
    clubName?: string | null;
    clubSlug?: string | null;
    clubTz?: string;
    highlightUserId?: string | null;
  },
): Promise<RaceResultsDisplay | null> {
  const {
    groupId,
    seriesId,
    raceId,
    raceName,
    seriesName,
    scheduledAt,
    clubName = null,
    highlightUserId = null,
  } = args;

  let clubTz = args.clubTz;
  let clubSlug = args.clubSlug?.trim() || null;
  if (!clubTz || clubSlug == null) {
    const { data: groupRow } = await supabase
      .from("groups")
      .select("iana_timezone, slug")
      .eq("id", groupId)
      .maybeSingle();
    if (!clubTz) clubTz = resolveClubIanaTimeZone(groupRow?.iana_timezone);
    if (clubSlug == null) clubSlug = groupRow?.slug?.trim() || null;
  }

  const { data: raceFleetRowsRaw } = await supabase
    .from("race_fleets")
    .select("id, name, sort_order, start_offset_minutes, start_signal_at, group_fleet_id")
    .eq("race_id", raceId)
    .order("sort_order", { ascending: true });

  const { data: raceMeta } = await supabase.from("races").select("race_type").eq("id", raceId).maybeSingle();
  const raceType = normalizeRaceType(raceMeta?.race_type);
  const scoringMode: RaceScoringMode = raceTypeUsesPositionalScoring(raceType) ? "positional" : "handicap";

  const raceFleets = raceFleetRowsRaw ?? [];

  const { data: allEntriesRaw } = await supabase
    .from("race_entries")
    .select(
      "id, user_id, boat_id, sail_number_override, crew_template_override, outcome, started_marked_at, py_override, fleet_id",
    )
    .eq("race_id", raceId)
    .order("created_at", { ascending: true });

  const allEntries = allEntriesRaw ?? [];
  const entryIds = allEntries.map((e) => e.id);
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

  const entryBoatIds = [...new Set(allEntries.map((e) => e.boat_id).filter(Boolean) as string[])];

  const { data: scoringCfg } = await supabase
    .from("series_scoring_config")
    .select("handicap_system")
    .eq("series_id", seriesId)
    .maybeSingle();

  const { data: penaltyRows } = await supabase
    .from("series_penalty_rules")
    .select("outcome_code, basis, plus, fixed_points")
    .eq("series_id", seriesId);

  const { count: seriesEntrantCount } = await supabase
    .from("series_registrations")
    .select("*", { count: "exact", head: true })
    .eq("series_id", seriesId);

  const penaltyRulesByOutcome = new Map<string, PenaltyRuleInput>();
  const basesOk = new Set(["series_entrants", "race_starters", "race_finishers", "fixed"]);
  for (const r of penaltyRows ?? []) {
    if (!basesOk.has(r.basis)) continue;
    penaltyRulesByOutcome.set(r.outcome_code, {
      outcome_code: r.outcome_code,
      basis: r.basis as PenaltyRuleInput["basis"],
      plus: r.plus,
      fixed_points:
        r.fixed_points != null && String(r.fixed_points).length ? Number(r.fixed_points) : null,
    });
  }

  const { data: classRows } = await supabase
    .from("boat_classes")
    .select("class_key, display_name")
    .or(`created_for_group_id.is.null,created_for_group_id.eq.${groupId}`);
  const classDisplayByKey = new Map(
    (classRows ?? []).map((r) => [r.class_key, r.display_name ?? r.class_key] as const),
  );

  const boatMetaById = new Map<
    string,
    {
      label: string;
      class_name: string | null;
      rya_class_key: string | null;
      default_sail_number: string | null;
      handedness: string | null;
      crew_template: unknown;
      owner_user_id: string | null;
    }
  >();

  let boatPyById = new Map<string, number | null>();
  if (entryBoatIds.length) {
    const { data: bts } = await supabase
      .from("boats")
      .select(
        "id, label, class_name, py_rating, rya_class_key, default_sail_number, handedness, crew_template, owner_user_id",
      )
      .in("id", entryBoatIds);
    for (const b of bts ?? []) {
      boatMetaById.set(b.id, {
        label: b.label,
        class_name: b.class_name,
        rya_class_key: b.rya_class_key,
        default_sail_number: b.default_sail_number,
        handedness: b.handedness,
        crew_template: b.crew_template,
        owner_user_id: b.owner_user_id,
      });
    }
    boatPyById = await boatEffectivePyByIdMap(
      supabase,
      { groupId, seriesId },
      (bts ?? []).map((b) => ({
        id: b.id,
        class_name: b.class_name,
        py_rating: b.py_rating,
        rya_class_key: b.rya_class_key,
      })),
    );
  }

  const handicapSystem: HandicapSystem =
    scoringCfg?.handicap_system === "none" ? "none" : "portsmouth";

  const fleetStartById = fleetStartSignalUtcMsByFleetId(
    scheduledAt,
    raceFleets.map((f) => ({
      id: f.id,
      start_signal_at: f.start_signal_at ?? null,
      start_offset_minutes: f.start_offset_minutes,
      sort_order: f.sort_order,
    })),
  );
  const primaryFleet = primaryRaceFleet(
    raceFleets.map((f) => ({
      id: f.id,
      start_signal_at: f.start_signal_at ?? null,
      start_offset_minutes: f.start_offset_minutes,
      sort_order: f.sort_order,
    })),
  );
  const raceDefaultStartMs = primaryFleet
    ? fleetStartSignalUtcMs(scheduledAt, primaryFleet)
    : scheduledAt != null
      ? new Date(scheduledAt).getTime()
      : null;
  const startSignalMsNorm =
    raceDefaultStartMs != null && Number.isFinite(raceDefaultStartMs) ? raceDefaultStartMs : null;

  const normalEntryUserIds = new Set(allEntries.map((e) => e.user_id));

  const scoringInputsNormal: RaceEntryScoringInput[] = allEntries.map((e) => {
    const fleetMs = e.fleet_id ? fleetStartById.get(e.fleet_id) : null;
    const entryStart =
      fleetMs != null && Number.isFinite(fleetMs) ? fleetMs : startSignalMsNorm;
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

  const { inputs: guestScoringInputs, appendixDisplayByEntryId } = await fetchRaceGuestScoringInputs(
    supabase,
    { groupId, seriesId },
    raceId,
    normalEntryUserIds,
    boatPyById,
    fleetStartById,
    startSignalMsNorm,
    scoringMode,
    { includeRaceOnlyAdhoc: true },
  );

  const scoringInputs: RaceEntryScoringInput[] = [...scoringInputsNormal, ...guestScoringInputs];

  const appendixScores = computeAppendixARaceScores({
    scoringMode,
    handicapSystem,
    startSignalMs: startSignalMsNorm,
    seriesEntrantCount: seriesEntrantCount ?? 0,
    entries: scoringInputs,
    penaltyRulesByOutcome,
  });

  const inputByEntryId = new Map(scoringInputs.map((i) => [i.entryId, i] as const));
  const entryById = new Map(allEntries.map((e) => [e.id, e] as const));

  const profileIds = [
    ...new Set(
      scoringInputs.map((s) => s.userId).filter((id) => !id.startsWith("race-only:")),
    ),
  ];
  const nameByUser = new Map<string, string | null>();
  if (profileIds.length) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", profileIds);
    for (const p of profs ?? []) nameByUser.set(p.id, p.display_name);
  }

  let myBoatIds = new Set<string>();
  if (highlightUserId) {
    const { data: myBoatLinks } = await supabase
      .from("series_registration_boats")
      .select("boat_id")
      .eq("series_id", seriesId)
      .eq("user_id", highlightUserId);
    myBoatIds = new Set((myBoatLinks ?? []).map((r) => r.boat_id).filter(Boolean) as string[]);
  }

  const rowsWithFleet: (RaceResultRow & { fleetId: string | null })[] = [];

  for (const sr of appendixScores) {
    const input = inputByEntryId.get(sr.entryId);
    if (!input) continue;

    const raced = Boolean(input.startedMarkedAt || input.officialFinishAt);
    if (!raced) continue;
    // Per-race table: hide series-scored DNC (did not compete this race); keep in series standings only.
    if (sr.penaltyOutcome === "dnc") continue;

    const isGuestKey = sr.entryId.startsWith("guest:");
    const guestDisp = appendixDisplayByEntryId.get(sr.entryId);
    const erow = isGuestKey ? null : entryById.get(sr.entryId);

    const highlightUser = highlightUserId != null && input.userId === highlightUserId;
    const highlightBoat =
      highlightUserId != null &&
      !isGuestKey &&
      erow?.boat_id != null &&
      myBoatIds.has(erow.boat_id);
    const isHighlighted = highlightUser || highlightBoat;

    let sailNumber = "—";
    let boatType = "—";
    let helmLine = "—";
    let crewLine = "—";

    if (guestDisp) {
      sailNumber = guestDisp.sailDisplay;
      boatType = guestDisp.boatLabel;
      if (guestDisp.isRaceOnlyAdhoc) {
        helmLine = RACE_ONLY_ADHOC_HELM_LINE;
        crewLine = "—";
      } else {
        const ownerName = nameByUser.get(input.userId) ?? null;
        helmLine = ownerName?.trim() || "—";
        crewLine = "—";
      }
    } else if (erow) {
      const boat = erow.boat_id ? boatMetaById.get(erow.boat_id) : undefined;
      sailNumber =
        (erow.sail_number_override?.trim() || boat?.default_sail_number?.trim() || "").trim() || "—";
      boatType = boatTypeLabel(boat?.class_name, boat?.rya_class_key, classDisplayByKey);
      const handedness = boat?.handedness ?? "single";
      const effective = resolveEffectiveCrewTemplate(
        erow.crew_template_override,
        boat?.crew_template ?? null,
      );
      const ownerName = nameByUser.get(erow.user_id) ?? null;
      const { helm, crew } = helmAndCrewDisplayLabels(effective, handedness, ownerName);
      helmLine = helm;
      crewLine = crew;
    }

    const finishIso = input.officialFinishAt;
    rowsWithFleet.push({
      entryId: sr.entryId,
      fleetId: input.fleetId ?? null,
      position: positionLabel(sr),
      sailNumber,
      boatType,
      helmLine,
      crewLine,
      finishDisplay: formatClubHmsFromIso(finishIso, clubTz),
      elapsedDisplay: formatRaceElapsedOrCorrectedHms(sr.elapsedSeconds),
      correctedDisplay: formatRaceElapsedOrCorrectedHms(sr.correctedSeconds),
      isHighlighted,
    });
  }

  const fleetSections = groupRaceRowsByFleet(
    rowsWithFleet,
    raceFleets.map((f) => ({
      id: f.id,
      name: f.name,
      group_fleet_id: (f as { group_fleet_id?: string | null }).group_fleet_id ?? null,
    })),
  );

  if (!fleetSections.length) return null;

  return {
    raceId,
    raceName,
    seriesId,
    seriesName,
    groupId,
    clubName,
    clubSlug,
    clubTz,
    scheduledAt,
    raceType,
    fleetSections,
  };
}
