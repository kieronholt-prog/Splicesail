import type { PenaltyRuleInput, RacePenaltyCounts } from "./penalty-points";
import { resolvePenaltyPoints } from "./penalty-points";
import { correctedSecondsFromElapsed } from "./portsmouth";

export type HandicapSystem = "none" | "portsmouth";

export type RaceScoringMode = "handicap" | "positional";

export interface RaceEntryScoringInput {
  entryId: string;
  userId: string;
  /** Race fleet for this entry; places and race_starters/finishers penalties are per fleet. */
  fleetId?: string | null;
  outcome: string | null;
  /** RO saw boat in start area (not the fleet start signal instant). */
  startedMarkedAt: string | null;
  /** Fleet start signal UTC ms; falls back to race-level startSignalMs when omitted. */
  startSignalMs?: number | null;
  boatPy: number | null;
  pyOverride: number | null;
  officialFinishAt: string | null;
  /** Explicit place for level_rated / pursuit races. */
  finishPosition?: number | null;
  /** From race_finishes / race_guest_finishes when loaded for results. */
  storedElapsedSeconds?: number | null;
  storedCorrectedSeconds?: number | null;
}

export interface RaceScoreRow {
  entryId: string;
  userId: string;
  fleetId: string | null;
  points: number;
  placeLabel: string | null;
  correctedSeconds: number | null;
  elapsedSeconds: number | null;
  effectivePy: number | null;
  /** Penalty outcome used for points (e.g. dnc when entered but not started). */
  penaltyOutcome: string | null;
  note: string | null;
}

export type RaceFleetScoreSection = {
  fleetId: string | null;
  fleetName: string;
  scores: RaceScoreRow[];
};

function averagePlacePoints(placeStart: number, placeEndInclusive: number): number {
  const n = placeEndInclusive - placeStart + 1;
  const sum = (n * (placeStart + placeEndInclusive)) / 2;
  return sum / n;
}

function nearlyEqual(a: number, b: number): boolean {
  const eps = 1e-6;
  return Math.abs(a - b) < eps;
}

function penaltyOutcomeCodes(): Set<string> {
  return new Set(["dns", "dnf", "dnc", "retired", "dsq", "ocs"]);
}

function fleetPartitionKey(fleetId: string | null | undefined): string {
  return fleetId ?? "";
}

function sortRaceScoreRows(rows: RaceScoreRow[]): RaceScoreRow[] {
  return [...rows].sort((a, b) => {
    const pa = a.placeLabel != null ? 0 : 1;
    const pb = b.placeLabel != null ? 0 : 1;
    if (pa !== pb) return pa - pb;
    if (a.points !== b.points) return a.points - b.points;
    return a.entryId.localeCompare(b.entryId);
  });
}

function scoreAppendixAEntriesInFleetGroup(options: {
  scoringMode: RaceScoringMode;
  handicapSystem: HandicapSystem;
  startSignalMs: number | null;
  seriesEntrantCount: number;
  entries: RaceEntryScoringInput[];
  penaltyRulesByOutcome: Map<string, PenaltyRuleInput>;
}): RaceScoreRow[] {
  const { scoringMode, handicapSystem, startSignalMs, seriesEntrantCount, entries } = options;

  const raceStarters = entries.filter((e) => !!e.startedMarkedAt).length;
  const raceFinishers = entries.filter((e) => {
    if (e.outcome !== "finished" || !e.startedMarkedAt) return false;
    if (scoringMode === "positional") {
      return e.finishPosition != null && e.finishPosition >= 1;
    }
    return !!e.officialFinishAt;
  }).length;

  const counts: RacePenaltyCounts = {
    seriesEntrants: seriesEntrantCount,
    raceStarters,
    raceFinishers,
  };

  const dnfRule =
    options.penaltyRulesByOutcome.get("dnf") ??
    ({
      outcome_code: "dnf",
      basis: "race_starters",
      plus: 0,
      fixed_points: null,
    } satisfies PenaltyRuleInput);

  const defaultDncRule =
    options.penaltyRulesByOutcome.get("dnc") ??
    ({
      outcome_code: "dnc",
      basis: "series_entrants",
      plus: 1,
      fixed_points: null,
    } satisfies PenaltyRuleInput);

  interface RankRow {
    entry: RaceEntryScoringInput;
    sortKey: number;
    elapsedSec: number | null;
    correctedSec: number | null;
    py: number | null;
  }

  const ranked: RankRow[] = [];
  const mapRowToRaceScore = new Map<string, RaceScoreRow>();

  for (const e of entries) {
    if (e.outcome !== "finished") continue;
    if (!e.startedMarkedAt) continue;

    if (scoringMode === "positional") {
      const pos = e.finishPosition;
      if (pos == null || pos < 1) continue;
      const fleetId = e.fleetId ?? null;
      const py = e.pyOverride ?? e.boatPy ?? null;
      ranked.push({
        entry: e,
        sortKey: pos,
        elapsedSec: null,
        correctedSec: null,
        py: py != null && py > 0 ? py : null,
      });
      continue;
    }

    if (!e.officialFinishAt) continue;

    const finishMs = new Date(e.officialFinishAt).getTime();
    const py = e.pyOverride ?? e.boatPy ?? null;
    const timingFromDb =
      e.storedElapsedSeconds !== undefined || e.storedCorrectedSeconds !== undefined;
    const fleetId = e.fleetId ?? null;

    const entryStartMs =
      e.startSignalMs != null && Number.isFinite(e.startSignalMs) ? e.startSignalMs : startSignalMs;

    let elapsedSec: number | null = null;
    if (entryStartMs != null && Number.isFinite(entryStartMs)) {
      const raw = (finishMs - entryStartMs) / 1000;
      elapsedSec = raw > 0 ? raw : null;
    }

    if (handicapSystem === "none" && timingFromDb) {
      const elapsedFromDb = e.storedElapsedSeconds ?? null;
      const sortKey =
        elapsedFromDb != null && elapsedFromDb > 0 ? elapsedFromDb : finishMs;
      ranked.push({
        entry: e,
        sortKey,
        elapsedSec: elapsedFromDb,
        correctedSec: null,
        py: py != null && py > 0 ? py : null,
      });
      continue;
    }

    if (handicapSystem === "portsmouth") {
      if (timingFromDb) {
        const elapsedFromDb = e.storedElapsedSeconds ?? null;
        const correctedFromDb = e.storedCorrectedSeconds ?? null;

        if (correctedFromDb == null || !Number.isFinite(correctedFromDb)) {
          if (elapsedFromDb == null) {
            mapRowToRaceScore.set(e.entryId, {
              entryId: e.entryId,
              userId: e.userId,
              fleetId,
              points: resolvePenaltyPoints(dnfRule, counts),
              placeLabel: null,
              correctedSeconds: null,
              elapsedSeconds: null,
              effectivePy: py,
              penaltyOutcome: "dnf",
              note:
                "No valid race start time for elapsed — Portsmouth needs scheduled start → finish; scored using DNF formula.",
            });
            continue;
          }
          mapRowToRaceScore.set(e.entryId, {
            entryId: e.entryId,
            userId: e.userId,
            fleetId,
            points: resolvePenaltyPoints(dnfRule, counts),
            placeLabel: null,
            correctedSeconds: null,
            elapsedSeconds: elapsedFromDb,
            effectivePy: null,
            penaltyOutcome: "dnf",
            note:
              "Missing Portsmouth Yardstick number — scored using DNF formula.",
          });
          continue;
        }

        ranked.push({
          entry: e,
          sortKey: correctedFromDb,
          elapsedSec: elapsedFromDb,
          correctedSec: correctedFromDb,
          py,
        });
        continue;
      }

      if (elapsedSec == null) {
        mapRowToRaceScore.set(e.entryId, {
          entryId: e.entryId,
          userId: e.userId,
          fleetId,
          points: resolvePenaltyPoints(dnfRule, counts),
          placeLabel: null,
          correctedSeconds: null,
          elapsedSeconds: null,
          effectivePy: py,
          penaltyOutcome: "dnf",
          note:
            "No valid race start time for elapsed — Portsmouth needs scheduled start → finish; scored using DNF formula.",
        });
        continue;
      }
      if (py == null || !(py > 0)) {
        mapRowToRaceScore.set(e.entryId, {
          entryId: e.entryId,
          userId: e.userId,
          fleetId,
          points: resolvePenaltyPoints(dnfRule, counts),
          placeLabel: null,
          correctedSeconds: null,
          elapsedSeconds: elapsedSec,
          effectivePy: null,
          penaltyOutcome: "dnf",
          note:
            "Missing Portsmouth Yardstick number — scored using DNF formula.",
        });
        continue;
      }
      const correctedSec = correctedSecondsFromElapsed(elapsedSec, py);
      ranked.push({
        entry: e,
        sortKey: correctedSec,
        elapsedSec,
        correctedSec,
        py,
      });
      continue;
    }

    const sortKey =
      elapsedSec != null && elapsedSec > 0 ? elapsedSec : finishMs;
    ranked.push({
      entry: e,
      sortKey,
      elapsedSec,
      correctedSec: null,
      py: py != null && py > 0 ? py : null,
    });
  }

  ranked.sort((a, b) => a.sortKey - b.sortKey);

  let i = 0;
  while (i < ranked.length) {
    let j = i + 1;
    while (
      j < ranked.length &&
      nearlyEqual(ranked[j].sortKey, ranked[i].sortKey)
    ) {
      j++;
    }
    const placeStart = i + 1;
    const placeEnd = j;
    const pts = averagePlacePoints(placeStart, placeEnd);
    const placeLabel =
      placeStart === placeEnd ? String(placeStart) : `T${placeStart}`;

    for (let k = i; k < j; k++) {
      const r = ranked[k];
      mapRowToRaceScore.set(r.entry.entryId, {
        entryId: r.entry.entryId,
        userId: r.entry.userId,
        fleetId: r.entry.fleetId ?? null,
        points: pts,
        placeLabel,
        correctedSeconds: r.correctedSec,
        elapsedSeconds: r.elapsedSec,
        effectivePy: r.py,
        penaltyOutcome: "finished",
        note: null,
      });
    }
    i = j;
  }

  const out: RaceScoreRow[] = [];

  for (const e of entries) {
    const existing = mapRowToRaceScore.get(e.entryId);
    if (existing) {
      out.push(existing);
      continue;
    }

    const fleetId = e.fleetId ?? null;
    const oRaw = e.outcome?.trim() ?? "";
    const o = oRaw.toLowerCase();
    let ruleKey = oRaw;
    let note: string | null = null;

    const noStartNoFinish = !e.startedMarkedAt && !e.officialFinishAt;
    if (noStartNoFinish && (!o || o === "finished")) {
      const points = resolvePenaltyPoints(defaultDncRule, counts);
      out.push({
        entryId: e.entryId,
        userId: e.userId,
        fleetId,
        points,
        placeLabel: null,
        correctedSeconds: null,
        elapsedSeconds: null,
        effectivePy: null,
        penaltyOutcome: "dnc",
        note:
          o === "finished"
            ? "Marked finished without start and finish time — scored as DNC (did not compete)."
            : "Entered but not seen in the start area — scored as DNC (did not compete).",
      });
      continue;
    }

    if (!oRaw) {
      ruleKey = "dnf";
      note = "Outcome not set — scored using DNF formula.";
    } else if (o === "finished") {
      ruleKey = "dnf";
      note = "Finished without full ranking inputs — scored using DNF formula.";
    } else if (!penaltyOutcomeCodes().has(o)) {
      ruleKey = "dnf";
      note = "Unknown outcome — scored using DNF formula.";
    } else {
      ruleKey = o;
    }

    const rule =
      options.penaltyRulesByOutcome.get(ruleKey) ??
      (ruleKey === "dnf" ? dnfRule : undefined);

    const points =
      rule != null ? resolvePenaltyPoints(rule, counts) : resolvePenaltyPoints(dnfRule, counts);

    out.push({
      entryId: e.entryId,
      userId: e.userId,
      fleetId,
      points,
      placeLabel: null,
      correctedSeconds: null,
      elapsedSeconds: null,
      effectivePy: null,
      penaltyOutcome: penaltyOutcomeCodes().has(ruleKey.toLowerCase()) ? ruleKey.toLowerCase() : "dnf",
      note,
    });
  }

  return sortRaceScoreRows(out);
}

/** Appendix A low-point scores; places and starter/finisher penalties are computed per race fleet. */
export function computeAppendixARaceScores(options: {
  scoringMode?: RaceScoringMode;
  handicapSystem: HandicapSystem;
  startSignalMs: number | null;
  seriesEntrantCount: number;
  entries: RaceEntryScoringInput[];
  penaltyRulesByOutcome: Map<string, PenaltyRuleInput>;
}): RaceScoreRow[] {
  const scoringMode = options.scoringMode ?? "handicap";
  const byFleet = new Map<string, RaceEntryScoringInput[]>();
  for (const e of options.entries) {
    const key = fleetPartitionKey(e.fleetId);
    const list = byFleet.get(key) ?? [];
    list.push(e);
    byFleet.set(key, list);
  }

  const all: RaceScoreRow[] = [];
  for (const group of byFleet.values()) {
    all.push(...scoreAppendixAEntriesInFleetGroup({ ...options, scoringMode, entries: group }));
  }

  return all;
}

/** Order race score rows into fleet sections (race_fleets sort_order, then unassigned). */
export function groupRaceScoresByFleet(
  scores: RaceScoreRow[],
  raceFleets: { id: string; name: string }[],
): RaceFleetScoreSection[] {
  const byFleetKey = new Map<string, RaceScoreRow[]>();
  for (const sr of scores) {
    const key = fleetPartitionKey(sr.fleetId);
    const list = byFleetKey.get(key) ?? [];
    list.push(sr);
    byFleetKey.set(key, list);
  }

  const sections: RaceFleetScoreSection[] = [];
  for (const f of raceFleets) {
    const fleetScores = byFleetKey.get(f.id);
    if (!fleetScores?.length) continue;
    sections.push({
      fleetId: f.id,
      fleetName: f.name,
      scores: sortRaceScoreRows(fleetScores),
    });
    byFleetKey.delete(f.id);
  }

  const unassigned = byFleetKey.get("");
  if (unassigned?.length) {
    sections.push({
      fleetId: null,
      fleetName: "Unassigned fleet",
      scores: sortRaceScoreRows(unassigned),
    });
    byFleetKey.delete("");
  }

  for (const [key, fleetScores] of byFleetKey) {
    if (!fleetScores.length) continue;
    sections.push({
      fleetId: key,
      fleetName: "Fleet",
      scores: sortRaceScoreRows(fleetScores),
    });
  }

  return sections;
}
