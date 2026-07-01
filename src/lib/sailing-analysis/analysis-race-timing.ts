import {
  cropTrackPoints,
  findFinishLineCrossingUnix,
  runAnalysis,
} from "./engine-core";
import type { StartFinishLineEnds } from "./analysis-types";

const PRE_START_BUFFER_SEC = 60;
const POST_FINISH_BUFFER_SEC = 30;

export type RaceCropPlan = {
  applied: boolean;
  cropStartSec: number;
  cropDurationSec: number;
  finishUnix: number | null;
};

export function resolveGunUnixSec(
  courseSetup: Record<string, unknown>,
  firstGpsTimeSec: number | null | undefined,
): number | null {
  const unix = courseSetup.raceStartUnixSec;
  if (unix != null && Number.isFinite(Number(unix))) return Number(unix);
  const raceStartSec = courseSetup.raceStartSec;
  if (
    firstGpsTimeSec != null &&
    Number.isFinite(firstGpsTimeSec) &&
    raceStartSec != null &&
    Number.isFinite(Number(raceStartSec))
  ) {
    return firstGpsTimeSec + Number(raceStartSec);
  }
  return null;
}

export function planRaceCrop(
  pts: { time: number }[],
  finishUnix: number | null,
  gunUnix: number | null,
): RaceCropPlan {
  const empty: RaceCropPlan = {
    applied: false,
    cropStartSec: 0,
    cropDurationSec: 0,
    finishUnix,
  };
  if (!pts.length || finishUnix == null || !Number.isFinite(finishUnix)) return empty;

  const firstT = pts[0]!.time;
  const cropStartSec =
    gunUnix != null && Number.isFinite(gunUnix)
      ? Math.max(0, gunUnix - firstT - PRE_START_BUFFER_SEC)
      : 0;
  const cropEndSec = finishUnix - firstT + POST_FINISH_BUFFER_SEC;
  const cropDurationSec = cropEndSec - cropStartSec;
  if (cropDurationSec < 15) return empty;

  return {
    applied: true,
    cropStartSec,
    cropDurationSec,
    finishUnix,
  };
}

type AnalysisResult = NonNullable<ReturnType<typeof runAnalysis>>;

export type RunAnalysisOptions = {
  userWind?: number | null;
  markPositions?: Parameters<typeof runAnalysis>[2];
  laps?: number;
  preamble?: Parameters<typeof runAnalysis>[4];
  detSettings?: Parameters<typeof runAnalysis>[5];
  startFinishLine?: StartFinishLineEnds | null;
  windTuning?: Parameters<typeof runAnalysis>[7];
  gpsToBowM?: number;
  windwardMarkName?: string | null;
  committeeLineInject?: Parameters<typeof runAnalysis>[10];
  resolvedCourseMarks?: Parameters<typeof runAnalysis>[11];
  courseSetup?: Record<string, unknown>;
  courseLetter?: string | null;
  effectiveMarks?: Record<string, { lat: number; lon: number }>;
};

export function runAnalysisWithRaceCrop(
  rawPts: Parameters<typeof runAnalysis>[0],
  opts: RunAnalysisOptions,
): {
  results: AnalysisResult;
  fullResults: AnalysisResult;
  gunUnix: number | null;
  finishUnix: number | null;
  raceElapsedSec: number | null;
  crop: RaceCropPlan;
} | null {
  const {
    userWind = null,
    markPositions = null,
    laps = 1,
    preamble = null,
    detSettings,
    startFinishLine = null,
    windTuning = null,
    gpsToBowM = 2,
    windwardMarkName = null,
    committeeLineInject = null,
    resolvedCourseMarks = null,
    courseSetup = {},
    courseLetter = null,
    effectiveMarks = {},
  } = opts;

  const fullResults = runAnalysis(
    rawPts,
    userWind as never,
    markPositions as never,
    laps,
    preamble as never,
    detSettings as never,
    startFinishLine as never,
    windTuning as never,
    gpsToBowM,
    windwardMarkName as never,
    committeeLineInject as never,
    resolvedCourseMarks as never,
  );
  if (!fullResults) return null;

  const sorted = [...rawPts].sort((a, b) => a.time - b.time);
  const firstT = sorted[0]?.time ?? null;
  const gunUnix = resolveGunUnixSec(courseSetup, firstT);
  const finishUnix = findFinishLineCrossingUnix(
    fullResults.points as { time: number }[],
    startFinishLine,
    fullResults.legs as { to?: string; endIdx?: number }[],
  );

  const crop = planRaceCrop(sorted, finishUnix, gunUnix);
  let results: AnalysisResult = fullResults;
  if (crop.applied) {
    const cropped = cropTrackPoints(sorted, crop.cropStartSec, crop.cropDurationSec);
    if (cropped.length >= 20) {
      const croppedResults = runAnalysis(
        cropped as typeof rawPts,
        userWind as never,
        markPositions as never,
        laps,
        preamble as never,
        detSettings as never,
        startFinishLine as never,
        windTuning as never,
        gpsToBowM,
        windwardMarkName as never,
        committeeLineInject as never,
        resolvedCourseMarks as never,
      );
      if (croppedResults) results = croppedResults;
    }
  }

  const raceElapsedSec =
    gunUnix != null && finishUnix != null && Number.isFinite(finishUnix - gunUnix)
      ? finishUnix - gunUnix
      : null;

  void courseLetter;
  void effectiveMarks;

  return { results, fullResults, gunUnix, finishUnix, raceElapsedSec, crop };
}

export type StartLineBadges = {
  hasLine?: boolean;
  distM?: number | null;
  timeDeltaSec?: number | null;
  speedPct?: number | null;
};

export function formatStartLineDistance(distM: number | null | undefined): string {
  if (distM == null || !Number.isFinite(distM)) return "—";
  const abs = Math.abs(distM);
  const side = distM < 0 ? "over (course side)" : "behind";
  return `${abs.toFixed(1)} m ${side}`;
}

export function formatRaceElapsed(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec) || sec < 0) return "—";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}
