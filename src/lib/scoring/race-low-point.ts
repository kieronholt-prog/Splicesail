import type { PenaltyRuleInput, RacePenaltyCounts } from "./penalty-points";
import { resolvePenaltyPoints } from "./penalty-points";
import { correctedSecondsFromElapsed } from "./portsmouth";

export type HandicapSystem = "none" | "portsmouth";

export interface RaceEntryScoringInput {
  entryId: string;
  userId: string;
  outcome: string | null;
  startedMarkedAt: string | null;
  boatPy: number | null;
  pyOverride: number | null;
  officialFinishAt: string | null;
}

export interface RaceScoreRow {
  entryId: string;
  userId: string;
  points: number;
  placeLabel: string | null;
  correctedSeconds: number | null;
  elapsedSeconds: number | null;
  effectivePy: number | null;
  note: string | null;
}

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
  return new Set(["dns", "dnf", "retired", "dsq", "ocs"]);
}

export function computeAppendixARaceScores(options: {
  handicapSystem: HandicapSystem;
  startSignalMs: number | null;
  seriesEntrantCount: number;
  entries: RaceEntryScoringInput[];
  penaltyRulesByOutcome: Map<string, PenaltyRuleInput>;
}): RaceScoreRow[] {
  const { handicapSystem, startSignalMs, seriesEntrantCount, entries } = options;

  const raceStarters = entries.filter((e) => !!e.startedMarkedAt).length;
  const raceFinishers = entries.filter(
    (e) =>
      e.outcome === "finished" &&
      !!e.startedMarkedAt &&
      !!e.officialFinishAt,
  ).length;

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
    if (!e.startedMarkedAt || !e.officialFinishAt) continue;

    const finishMs = new Date(e.officialFinishAt).getTime();
    const py = e.pyOverride ?? e.boatPy ?? null;

    let elapsedSec: number | null = null;
    if (startSignalMs != null && Number.isFinite(startSignalMs)) {
      const raw = (finishMs - startSignalMs) / 1000;
      elapsedSec = raw > 0 ? raw : null;
    }

    if (handicapSystem === "portsmouth") {
      if (elapsedSec == null) {
        mapRowToRaceScore.set(e.entryId, {
          entryId: e.entryId,
          userId: e.userId,
          points: resolvePenaltyPoints(dnfRule, counts),
          placeLabel: null,
          correctedSeconds: null,
          elapsedSeconds: null,
          effectivePy: py,
          note:
            "Set race start signal to compute Portsmouth corrected time — scored using DNF formula.",
        });
        continue;
      }
      if (py == null || !(py > 0)) {
        mapRowToRaceScore.set(e.entryId, {
          entryId: e.entryId,
          userId: e.userId,
          points: resolvePenaltyPoints(dnfRule, counts),
          placeLabel: null,
          correctedSeconds: null,
          elapsedSeconds: elapsedSec,
          effectivePy: null,
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
        points: pts,
        placeLabel,
        correctedSeconds: r.correctedSec,
        elapsedSeconds: r.elapsedSec,
        effectivePy: r.py,
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

    const o = e.outcome?.trim() ?? "";
    let ruleKey = o;
    let note: string | null = null;

    if (!o) {
      ruleKey = "dnf";
      note = "Outcome not set — scored using DNF formula.";
    } else if (o === "finished") {
      ruleKey = "dnf";
      note = "Finished without full ranking inputs — scored using DNF formula.";
    } else if (!penaltyOutcomeCodes().has(o)) {
      ruleKey = "dnf";
      note = "Unknown outcome — scored using DNF formula.";
    }

    const rule =
      options.penaltyRulesByOutcome.get(ruleKey) ??
      (ruleKey === "dnf" ? dnfRule : undefined);

    const points =
      rule != null ? resolvePenaltyPoints(rule, counts) : resolvePenaltyPoints(dnfRule, counts);

    out.push({
      entryId: e.entryId,
      userId: e.userId,
      points,
      placeLabel: null,
      correctedSeconds: null,
      elapsedSeconds: null,
      effectivePy: null,
      note,
    });
  }

  out.sort((a, b) => {
    const pa = a.placeLabel != null ? 0 : 1;
    const pb = b.placeLabel != null ? 0 : 1;
    if (pa !== pb) return pa - pb;
    if (a.points !== b.points) return a.points - b.points;
    return a.entryId.localeCompare(b.entryId);
  });

  return out;
}
