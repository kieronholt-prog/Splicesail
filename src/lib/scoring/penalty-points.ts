export type PenaltyBasis =
  | "series_entrants"
  | "race_starters"
  | "race_finishers"
  | "fixed";

export interface PenaltyRuleInput {
  outcome_code: string;
  basis: PenaltyBasis;
  plus: number;
  fixed_points: number | null;
}

export interface RacePenaltyCounts {
  seriesEntrants: number;
  raceStarters: number;
  raceFinishers: number;
}

export function resolvePenaltyPoints(
  rule: PenaltyRuleInput,
  counts: RacePenaltyCounts,
): number {
  if (rule.basis === "fixed") {
    if (rule.fixed_points == null) return NaN;
    return Number(rule.fixed_points);
  }
  const base =
    rule.basis === "series_entrants"
      ? counts.seriesEntrants
      : rule.basis === "race_starters"
        ? counts.raceStarters
        : counts.raceFinishers;
  return base + rule.plus;
}
