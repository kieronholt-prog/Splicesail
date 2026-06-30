import type { ResolvedMarkPosition } from "./course-resolve";

const D = Math.PI / 180;

export type CourseWindTuning = {
  windward: { lat: number; lon: number };
  /** Meteorological wind FROM (°), from course axis: windward → previous mark. */
  baselineWindFromDeg: number;
};

export function bearingDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dl = (lon2 - lon1) * D;
  return (
    (Math.atan2(
      Math.sin(dl) * Math.cos(lat2 * D),
      Math.cos(lat1 * D) * Math.sin(lat2 * D) -
        Math.sin(lat1 * D) * Math.cos(lat2 * D) * Math.cos(dl),
    ) /
      D +
      360) %
    360
  );
}

export function expandCourseMarkSequence(
  preamble: ResolvedMarkPosition[],
  lapMarks: ResolvedMarkPosition[],
  laps: number,
): ResolvedMarkPosition[] {
  const full: ResolvedMarkPosition[] = [...preamble];
  const nLaps = Math.max(1, laps);
  for (let i = 0; i < nLaps; i++) full.push(...lapMarks);
  return full;
}

/**
 * Baseline true-wind FROM from the course: bearing windward → previous mark is downwind;
 * wind blows from the opposite direction (upwind along the leg).
 */
export function buildWindTuningFromCourse(
  preamble: ResolvedMarkPosition[],
  markPositions: ResolvedMarkPosition[],
  windwardMarkName: string | null,
  laps: number,
): CourseWindTuning | null {
  const name = windwardMarkName?.trim();
  if (!name || markPositions.length === 0) return null;

  const seq = expandCourseMarkSequence(preamble, markPositions, laps);
  const idx = seq.findIndex((m) => m.name.trim() === name);
  if (idx < 0) return null;

  const windward = seq[idx]!;
  if (!Number.isFinite(windward.lat) || !Number.isFinite(windward.lon)) return null;

  if (idx === 0) return null;

  const prev = seq[idx - 1]!;
  const downwindBearing = bearingDeg(windward.lat, windward.lon, prev.lat, prev.lon);
  const baselineWindFromDeg = (downwindBearing + 180) % 360;

  return {
    windward: { lat: windward.lat, lon: windward.lon },
    baselineWindFromDeg,
  };
}
