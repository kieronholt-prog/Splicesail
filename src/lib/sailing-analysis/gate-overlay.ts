import { buildOneSidedGateFC, DEFAULT_SF_LINE_ENDS } from "./engine-core";
import { buildResolvedCourseMarks, startFinishLineFromSetup } from "./course-resolve";
import { expandResolvedCourseMarks } from "./course-wind-baseline";
import type { MarkOverride, SailingCourseRow, SailingMarkRow } from "./types";
import type { StartFinishLineEnds } from "./analysis-types";

function seqRows(
  rows: { name: string; lat: number; lon: number; roundTack?: "P" | "S" }[],
) {
  return rows.map((m) => ({
    name: m.name,
    lat: m.lat,
    lon: m.lon,
    tack: m.roundTack ?? null,
  }));
}

export function sfLineFromCourseSetup(
  courseSetup: Record<string, unknown> | null | undefined,
): StartFinishLineEnds {
  return startFinishLineFromSetup(courseSetup ?? {}, DEFAULT_SF_LINE_ENDS);
}

export function buildGateOverlayFC(
  clubMarks: SailingMarkRow[],
  course: SailingCourseRow | null,
  laps: number,
  markOverrides: Record<string, MarkOverride> = {},
  courseSetup: Record<string, unknown> | null = null,
): GeoJSON.FeatureCollection {
  const resolved = buildResolvedCourseMarks(clubMarks, course, markOverrides);
  const fullSeq = expandResolvedCourseMarks(resolved, laps);
  const sf = sfLineFromCourseSetup(courseSetup);
  return buildOneSidedGateFC(
    seqRows(fullSeq),
    120,
    sf as never,
  ) as GeoJSON.FeatureCollection;
}
