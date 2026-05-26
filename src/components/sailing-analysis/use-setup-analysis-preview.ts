"use client";

import { useMemo } from "react";
import { executeAnalysis } from "@/lib/sailing-analysis/run-analysis-wrapper";
import type { MarkOverride, SailingCourseRow, SailingMarkRow, TrackPoint } from "@/lib/sailing-analysis/types";

export function useSetupAnalysisPreview({
  trackPoints,
  clubMarks,
  course,
  laps,
  markOverrides,
  courseSetup,
  userWind,
  enabled = true,
}: {
  trackPoints: { lat: number; lon: number; time?: number | null }[];
  clubMarks: SailingMarkRow[];
  course: SailingCourseRow | null;
  laps: number;
  markOverrides: Record<string, MarkOverride>;
  courseSetup: Record<string, unknown>;
  userWind?: number | null;
  enabled?: boolean;
}) {
  return useMemo(() => {
    if (!enabled || trackPoints.length < 20 || !course) return null;
    try {
      return executeAnalysis({
        points: trackPoints.map((p) => ({ ...p, time: p.time ?? null })) as TrackPoint[],
        marks: clubMarks,
        course,
        laps,
        markOverrides,
        courseSetup,
        userWind: userWind ?? null,
      });
    } catch {
      return null;
    }
  }, [trackPoints, clubMarks, course, laps, markOverrides, courseSetup, userWind, enabled]);
}
