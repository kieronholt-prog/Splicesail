import { courseToEntries, type MarkEntry } from "./course-mark-entries";
import type { MarkOverride, SailingCourseRow, SailingMarkRow } from "./types";

export type ResolvedMarkPosition = {
  name: string;
  lat: number;
  lon: number;
  fixed: boolean;
  roundTack?: "P" | "S";
};

export type ResolvedCourseMark = ResolvedMarkPosition & { partOfLap: boolean };

function resolveMarkEntry(
  e: MarkEntry,
  byName: Map<string, SailingMarkRow>,
  markOverrides: Record<string, MarkOverride>,
): ResolvedCourseMark | null {
  const base = byName.get(e.name);
  if (!base) return null;
  const ovr = markOverrides[e.name];
  return {
    name: e.name,
    lat: ovr?.lat ?? base.lat,
    lon: ovr?.lon ?? base.lon,
    fixed: base.mark_kind === "fixed",
    roundTack: e.tack,
    partOfLap: e.partOfLap,
  };
}

export function buildResolvedCourseMarks(
  marks: SailingMarkRow[],
  course: SailingCourseRow | null,
  markOverrides: Record<string, MarkOverride> = {},
): ResolvedCourseMark[] {
  if (!course) return [];
  const byName = new Map(marks.map((m) => [m.name, m]));
  const kindByName = new Map(marks.map((m) => [m.name, m.mark_kind]));
  const entries = courseToEntries(course, kindByName);
  return entries
    .map((e) => resolveMarkEntry(e, byName, markOverrides))
    .filter((x): x is ResolvedCourseMark => x != null);
}

/** @deprecated Prefer buildResolvedCourseMarks — preamble/lap split cannot represent suffix marks. */
export function buildMarkPositionsFromClubData(
  marks: SailingMarkRow[],
  course: SailingCourseRow | null,
  markOverrides: Record<string, MarkOverride> = {},
): { markPositions: ResolvedMarkPosition[]; preamble: ResolvedMarkPosition[] } {
  const resolved = buildResolvedCourseMarks(marks, course, markOverrides);
  const preamble = resolved.filter((m) => !m.partOfLap);
  const markPositions = resolved.filter((m) => m.partOfLap);
  return { markPositions, preamble };
}

export function startFinishLineFromSetup(
  courseSetup: Record<string, unknown>,
  defaultEnds: { endA: { lat: number; lon: number }; endB: { lat: number; lon: number } },
) {
  const a = courseSetup.sfLineEndA as { lat?: number; lon?: number } | undefined;
  const b = courseSetup.sfLineEndB as { lat?: number; lon?: number } | undefined;
  if (a?.lat != null && a?.lon != null && b?.lat != null && b?.lon != null) {
    return { endA: { lat: a.lat, lon: a.lon }, endB: { lat: b.lat, lon: b.lon } };
  }
  return defaultEnds;
}
