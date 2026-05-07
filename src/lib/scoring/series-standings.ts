export interface DiscardBandInput {
  races_from: number;
  races_to: number | null;
  discards: number;
}

/** Pick the tightest matching band (largest races_from that still applies). */
export function discardsForCompletedCount(
  bands: DiscardBandInput[],
  completedFinalRaceCount: number,
): number {
  let best: DiscardBandInput | null = null;
  for (const b of bands) {
    if (completedFinalRaceCount < b.races_from) continue;
    if (b.races_to != null && completedFinalRaceCount > b.races_to) continue;
    if (!best || b.races_from > best.races_from) best = b;
  }
  return best?.discards ?? 0;
}

/** Drop worst (highest) scores first — low-point system. */
export function netScoreAfterDiscards(
  racePoints: number[],
  discardCount: number,
): number {
  if (racePoints.length === 0) return 0;
  const dMax = Math.max(0, racePoints.length - 1);
  const d = Math.min(Math.max(0, discardCount), dMax);
  const asc = [...racePoints].sort((x, y) => x - y);
  const kept = asc.slice(0, asc.length - d);
  return kept.reduce((s, x) => s + x, 0);
}

/**
 * Appendix A8.1 style: compare full lists of race scores best→worst (ascending
 * numeric order for low-point). Lower at first differing position wins.
 */
export function compareAppendixA8Lex(
  scoresA: number[],
  scoresB: number[],
): number {
  const aa = [...scoresA].sort((x, y) => x - y);
  const bb = [...scoresB].sort((x, y) => x - y);
  const len = Math.max(aa.length, bb.length);
  for (let i = 0; i < len; i++) {
    const va = aa[i];
    const vb = bb[i];
    if (va === undefined && vb === undefined) return 0;
    if (va === undefined) return 1;
    if (vb === undefined) return -1;
    if (va !== vb) return va - vb;
  }
  return 0;
}

export interface SeriesStandingRow {
  userId: string;
  netScore: number;
  allScores: number[];
  discardCount: number;
}

export function computeSeriesStandings(args: {
  sailorIds: string[];
  raceResults: { raceId: string; pointsByUserId: Map<string, number> }[];
  discardBands: DiscardBandInput[];
}): SeriesStandingRow[] {
  const completedFinal = args.raceResults.length;
  const discardCount = discardsForCompletedCount(
    args.discardBands,
    completedFinal,
  );

  const rows: SeriesStandingRow[] = [];

  for (const userId of args.sailorIds) {
    const allScores: number[] = [];
    for (const rr of args.raceResults) {
      const p = rr.pointsByUserId.get(userId);
      if (p !== undefined) allScores.push(p);
    }

    const netScore = netScoreAfterDiscards(allScores, discardCount);

    rows.push({
      userId,
      netScore,
      allScores,
      discardCount,
    });
  }

  rows.sort((a, b) => {
    if (a.netScore !== b.netScore) return a.netScore - b.netScore;
    return compareAppendixA8Lex(a.allScores, b.allScores);
  });

  return rows;
}

export function assignStandingPlaces(
  sortedRows: SeriesStandingRow[],
): { row: SeriesStandingRow; rank: number }[] {
  const out: { row: SeriesStandingRow; rank: number }[] = [];
  let rank = 1;
  let i = 0;
  while (i < sortedRows.length) {
    let j = i + 1;
    while (j < sortedRows.length) {
      const a = sortedRows[i];
      const b = sortedRows[j];
      if (
        a.netScore !== b.netScore ||
        compareAppendixA8Lex(a.allScores, b.allScores) !== 0
      ) {
        break;
      }
      j++;
    }
    for (let k = i; k < j; k++) {
      out.push({ row: sortedRows[k], rank });
    }
    rank += j - i;
    i = j;
  }
  return out;
}
