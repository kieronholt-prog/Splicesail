import { buildMarkPositionsFromClubData } from "./course-resolve";
import { markNamesForCourse } from "./course-mark-names";
import type { MarkOverride, SailingCourseRow, SailingMarkRow } from "./types";
import type { StartFinishLineEnds } from "./analysis-types";

export type MapMarkDisplay = {
  name: string;
  lat: number;
  lon: number;
  fixed: boolean;
  roundTack?: "P" | "S";
  description?: string | null;
};

export function buildMapMarksDisplay(
  clubMarks: SailingMarkRow[],
  course: SailingCourseRow | null,
  markOverrides: Record<string, MarkOverride> = {},
): Record<string, MapMarkDisplay> {
  if (!course) return {};

  const { markPositions, preamble } = buildMarkPositionsFromClubData(clubMarks, course, markOverrides);
  const courseNames = new Set(markNamesForCourse(course));
  const roundByName = new Map<string, "P" | "S">();
  for (const m of [...preamble, ...markPositions]) {
    if (m.roundTack) roundByName.set(m.name, m.roundTack);
  }

  const byName = new Map(clubMarks.map((m) => [m.name, m]));
  const out: Record<string, MapMarkDisplay> = {};
  for (const name of courseNames) {
    const row = byName.get(name);
    if (!row) continue;
    const ovr = markOverrides[name];
    out[name] = {
      name,
      lat: ovr?.lat ?? row.lat,
      lon: ovr?.lon ?? row.lon,
      fixed: row.mark_kind === "fixed",
      roundTack: roundByName.get(name),
      description: row.description,
    };
  }
  return out;
}

export function buildCourseLinePoints(
  clubMarks: SailingMarkRow[],
  course: SailingCourseRow | null,
  markOverrides: Record<string, MarkOverride> = {},
): { lat: number; lon: number }[] {
  const { markPositions, preamble } = buildMarkPositionsFromClubData(clubMarks, course, markOverrides);
  return [...preamble, ...markPositions].map((m) => ({ lat: m.lat, lon: m.lon }));
}

export function markBadgeLabel(name: string): string {
  if (name === "START/FINISH") return "S/F";
  if (name.startsWith("LAID MK ")) return name.replace("LAID MK ", "L");
  if (name.length <= 4) return name;
  return name.slice(0, 3);
}

/** WSC chart centre when no track to fit. */
export const DEFAULT_MAP_CENTER: [number, number] = [-1.305, 50.842];

export function buildMapMarksWithSfEnds(
  clubMarks: SailingMarkRow[],
  course: SailingCourseRow | null,
  markOverrides: Record<string, MarkOverride> = {},
  sfEnds: StartFinishLineEnds,
): Record<string, MapMarkDisplay> {
  const base = buildMapMarksDisplay(clubMarks, course, markOverrides);
  return {
    ...base,
    SFA: {
      name: "SFA",
      lat: sfEnds.endA.lat,
      lon: sfEnds.endA.lon,
      fixed: false,
      description: "Committee line end A (drag)",
    },
    SFB: {
      name: "SFB",
      lat: sfEnds.endB.lat,
      lon: sfEnds.endB.lon,
      fixed: false,
      description: "Committee line end B (drag)",
    },
  };
}
