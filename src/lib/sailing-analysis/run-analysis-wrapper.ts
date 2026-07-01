import {
  computeStartLineOverviewBadges,
  DEFAULT_SF_LINE_ENDS,
} from "./engine-core";
import type { DetectionSettings } from "./types";
import { buildWindTuningFromCourse } from "./course-wind-baseline";
import {
  buildMarkPositionsFromClubData,
  buildResolvedCourseMarks,
  startFinishLineFromSetup,
} from "./course-resolve";
import type { MarkOverride, SailingCourseRow, SailingMarkRow, TrackPoint } from "./types";
import {
  runAnalysisWithRaceCrop,
  type StartLineBadges,
} from "./analysis-race-timing";

export type { StartLineBadges };
export { formatRaceElapsed, formatStartLineDistance } from "./analysis-race-timing";

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

function effectiveMarksMap(
  marks: SailingMarkRow[],
  course: SailingCourseRow | null,
  markOverrides: Record<string, MarkOverride>,
): Record<string, { lat: number; lon: number }> {
  const resolved = buildResolvedCourseMarks(marks, course, markOverrides);
  const out: Record<string, { lat: number; lon: number }> = {};
  for (const m of resolved) out[m.name] = { lat: m.lat, lon: m.lon };
  return out;
}

export function executeAnalysis(input: AnalysisRunInput) {
  let courseSetup = { ...(input.courseSetup ?? {}) };
  const pts = input.points;
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
  const resolvedMarks = buildResolvedCourseMarks(
    input.marks,
    input.course,
    input.markOverrides ?? {},
  );

  const sfLine = startFinishLineFromSetup(courseSetup, DEFAULT_SF_LINE_ENDS);
  const windward =
    (courseSetup.windwardMark as string | undefined) ??
    input.windwardMarkName ??
    null;

  const windTuning = buildWindTuningFromCourse(resolvedMarks, windward, input.laps ?? 1);
  const gpsToBowM =
    Number(courseSetup.gpsToBowM) > 0
      ? Number(courseSetup.gpsToBowM)
      : (input.gpsToBowM ?? 2);
  const effMarks = effectiveMarksMap(input.marks, input.course, input.markOverrides ?? {});

  const raced = runAnalysisWithRaceCrop(pts as never, {
    userWind: input.userWind ?? null,
    markPositions: markPositions as never,
    laps: input.laps ?? 1,
    preamble: preamble as never,
    detSettings: (input.detSettings) as never,
    startFinishLine: sfLine,
    windTuning: windTuning as never,
    gpsToBowM,
    windwardMarkName: windward,
    resolvedCourseMarks: resolvedMarks as never,
    courseSetup,
    courseLetter: input.course?.course_letter ?? null,
    effectiveMarks: effMarks,
  });
  if (!raced) return null;

  const { results, fullResults, gunUnix, finishUnix, raceElapsedSec, crop } = raced;

  let startLine: StartLineBadges | null = null;
  if (gunUnix != null && sfLine?.endA && sfLine?.endB) {
    startLine = computeStartLineOverviewBadges(
      results as never,
      fullResults as never,
      sfLine as never,
      gunUnix,
      input.course?.course_letter ?? null,
      effMarks as never,
      gpsToBowM,
      (courseSetup.raceStartSec != null ? Number(courseSetup.raceStartSec) : null) as never,
      (windward ?? null) as never,
    ) as StartLineBadges | null;
  }

  return {
    ...results,
    startLine,
    stats: {
      ...(results.stats ?? {}),
      raceElapsedSec,
      finishUnix,
      gunUnix,
      trackCropApplied: crop.applied,
      trackDurationSec: results.stats?.duration ?? null,
      duration: raceElapsedSec ?? results.stats?.duration ?? null,
    },
    gpsToBowM,
  };
}

export function serializeAnalysisForDb(results: NonNullable<ReturnType<typeof executeAnalysis>>) {
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
      startLineDistanceM: l.startLineDistanceM,
    })),
    wind_direction: results.windDir ?? null,
    analysis_snapshot: JSON.parse(JSON.stringify(results)),
  };
}
