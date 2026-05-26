import {
  cropTrackPoints,
  DEFAULT_SF_LINE_ENDS,
  DETECTION_DEFAULTS,
  runAnalysis,
} from "./engine-core";
import type { DetectionSettings } from "./types";
import {
  buildMarkPositionsFromClubData,
  startFinishLineFromSetup,
  type ResolvedMarkPosition,
} from "./course-resolve";
import type { MarkOverride, SailingCourseRow, SailingMarkRow, TrackPoint } from "./types";

export type AnalysisRunInput = {
  points: TrackPoint[];
  userWind?: number | null;
  marks: SailingMarkRow[];
  course: SailingCourseRow | null;
  laps?: number;
  markOverrides?: Record<string, MarkOverride>;
  courseSetup?: Record<string, unknown>;
  detSettings?: DetectionSettings;
  gpsToBowM?: number;
  windwardMarkName?: string | null;
};

export function executeAnalysis(input: AnalysisRunInput) {
  let courseSetup = { ...(input.courseSetup ?? {}) };
  const cropStartSec = Number(courseSetup.cropStartSec ?? 0);
  const cropDurationSec = Number(courseSetup.cropDurationSec ?? 0);
  let pts = input.points;
  if (cropDurationSec > 0) {
    pts = cropTrackPoints(pts, cropStartSec, cropDurationSec);
  }
  if (!pts || pts.length < 20) return null;

  const firstT = pts[0]?.time;
  const raceStartUnix = courseSetup.raceStartUnixSec;
  if (firstT != null && raceStartUnix != null && Number.isFinite(Number(raceStartUnix))) {
    courseSetup = {
      ...courseSetup,
      raceStartSec: Math.max(0, Math.round(Number(raceStartUnix) - firstT)),
    };
  }

  const { markPositions, preamble } = buildMarkPositionsFromClubData(
    input.marks,
    input.course,
    input.markOverrides ?? {},
  );

  const sfLine = startFinishLineFromSetup(courseSetup, DEFAULT_SF_LINE_ENDS);
  const windward =
    (courseSetup.windwardMark as string | undefined) ??
    input.windwardMarkName ??
    null;

  return runAnalysis(
    pts as never,
    (input.userWind ?? null) as never,
    markPositions as never,
    input.laps ?? 1,
    preamble as never,
    (input.detSettings ?? DETECTION_DEFAULTS) as never,
    sfLine as never,
    null,
    input.gpsToBowM ?? 2,
    windward as never,
    null,
  );
}

export function serializeAnalysisForDb(results: NonNullable<ReturnType<typeof runAnalysis>>) {
  return {
    stats: results.stats ?? {},
    tack_scores: (results.tacks ?? []).map((t: Record<string, unknown>) => ({
      q: t.q,
      ch: t.ch,
      preS: t.preS,
      minS: t.minS,
      rt: t.rt,
      crossing: t.crossing,
      excluded: !!t.excludeFromStatsAndVMG,
    })),
    gybe_scores: (results.gybes ?? []).map((g: Record<string, unknown>) => ({
      q: g.q,
      ch: g.ch,
      preS: g.preS,
      minS: g.minS,
      rt: g.rt,
      crossing: g.crossing,
      excluded: !!g.excludeFromStatsAndVMG,
    })),
    leg_summary: (results.legs ?? []).map((l: Record<string, unknown>, idx: number) => ({
      legNo: idx + 1,
      from: l.from,
      to: l.to,
      type: l.type,
      avgSpeed: l.avgSpeed,
      avgVmc: l.avgVmc,
      avgVmgToWind: l.avgVmgToWind,
      efficiency: l.efficiency,
      duration: l.duration,
    })),
    wind_direction: results.windDir ?? null,
    analysis_snapshot: JSON.parse(JSON.stringify(results)),
  };
}
