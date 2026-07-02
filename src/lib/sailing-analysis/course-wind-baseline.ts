import type { ResolvedCourseMark } from "./course-resolve";
import { expandEntriesForLaps } from "./course-mark-entries";

const D = Math.PI / 180;

export type CourseWindTuning = {
  windward: { lat: number; lon: number };
  /** Meteorological wind FROM (°), from course axis: windward → previous mark. */
  baselineWindFromDeg: number;
};

export function acuteBearingDiffDeg(a: number, b: number): number {
  let d = Math.abs(a - b) % 360;
  if (d > 180) d = 360 - d;
  return d;
}

/**
 * When automatic wind may be 180° off symmetric tracks, prefer the hemisphere
 * aligned with the course baseline (windward → previous mark axis).
 */
export function preferWindHemisphereFromCourse(
  windFromDeg: number,
  baselineWindFromDeg: number | null | undefined,
  marginDeg = 20,
): number {
  if (baselineWindFromDeg == null || !Number.isFinite(Number(baselineWindFromDeg))) {
    return ((windFromDeg % 360) + 360) % 360;
  }
  const w = ((windFromDeg % 360) + 360) % 360;
  const b = ((Number(baselineWindFromDeg) % 360) + 360) % 360;
  const flipped = (w + 180) % 360;
  const dCurrent = acuteBearingDiffDeg(w, b);
  const dFlipped = acuteBearingDiffDeg(flipped, b);
  if (dFlipped + marginDeg < dCurrent) return flipped;
  return w;
}

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

export function expandResolvedCourseMarks(
  resolved: ResolvedCourseMark[],
  laps: number,
): ResolvedCourseMark[] {
  const entries = resolved.map((m) => ({
    name: m.name,
    tack: (m.roundTack ?? "S") as "P" | "S",
    partOfLap: m.partOfLap,
  }));
  return expandEntriesForLaps(entries, laps, (i) => resolved[i] ?? null);
}

/**
 * Baseline true-wind FROM from the course: bearing windward → previous mark is downwind;
 * wind blows from the opposite direction (upwind along the leg).
 */
export function buildWindTuningFromCourse(
  resolvedMarks: ResolvedCourseMark[],
  windwardMarkName: string | null,
  laps: number,
): CourseWindTuning | null {
  const name = windwardMarkName?.trim();
  if (!name || resolvedMarks.length === 0) return null;

  const seq = expandResolvedCourseMarks(resolvedMarks, laps);
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
