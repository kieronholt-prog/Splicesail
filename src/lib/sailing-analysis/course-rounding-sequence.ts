import type { SailingCourseRow } from "./types";

export type RoundingStep = {
  name: string;
  tack: "P" | "S";
  /** 0 = preamble (first lap only); 1…N = lap number for repeating sequence marks. */
  lap: number;
  firstLapOnly: boolean;
};

/** Course-builder display order: S/F, preamble marks, then repeating sequence (one lap view). */
export function courseToDisplayEntries(c: SailingCourseRow): {
  name: string;
  tack: "P" | "S";
  firstLapOnly: boolean;
}[] {
  const pre = ((c.marks_preamble ?? []) as [string, "P" | "S"][]).map(([name, tack]) => ({
    name,
    tack,
    firstLapOnly: true,
  }));
  const seq = ((c.mark_sequence ?? []) as [string, "P" | "S"][]).map(([name, tack]) => ({
    name,
    tack,
    firstLapOnly: false,
  }));

  if (pre.length > 0 && seq.length > 0) {
    return [seq[0]!, ...pre, ...seq.slice(1)];
  }
  return pre.length > 0 ? [...pre, ...seq] : seq;
}

/**
 * Full rounding order used by leg detection (`expandCourseMarks` in engine-core):
 * preamble once, then entire `mark_sequence` repeated for each lap.
 */
export function expandAnalysisRoundingSequence(
  course: SailingCourseRow | null,
  laps: number,
): RoundingStep[] {
  if (!course) return [];

  const preamble = (course.marks_preamble ?? []) as [string, "P" | "S"][];
  const sequence = (course.mark_sequence ?? []) as [string, "P" | "S"][];
  const nLaps = Math.max(1, Math.round(Number(laps)) || 1);
  const out: RoundingStep[] = [];

  for (const [name, tack] of preamble) {
    out.push({ name, tack, lap: 0, firstLapOnly: true });
  }
  for (let lapN = 1; lapN <= nLaps; lapN++) {
    for (const [name, tack] of sequence) {
      out.push({ name, tack, lap: lapN, firstLapOnly: false });
    }
  }

  return out;
}
