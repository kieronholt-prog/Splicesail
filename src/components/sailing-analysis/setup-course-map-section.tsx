"use client";

import { useCallback, useMemo, useState } from "react";
import { DEFAULT_SF_LINE_ENDS } from "@/lib/sailing-analysis";
import { buildGateOverlayFC, sfLineFromCourseSetup } from "@/lib/sailing-analysis/gate-overlay";
import {
  buildCourseLinePoints,
  buildMapMarksWithSfEnds,
} from "@/lib/sailing-analysis/map-display";
import type { MarkOverride, SailingCourseRow, SailingMarkRow } from "@/lib/sailing-analysis/types";
import type { StartFinishLineEnds } from "@/lib/sailing-analysis/analysis-types";
import type { FleetTrackOverlay } from "@/lib/sailing-analysis/load-race-fleet-tracks";
import { CourseAnalysisMap } from "@/components/sailing-analysis/course-analysis-map";
import { WindRose } from "@/components/sailing-analysis/wind-rose";
import { useSetupAnalysisPreview } from "@/components/sailing-analysis/use-setup-analysis-preview";
import { useFleetWindGridDisplay } from "@/components/sailing-analysis/use-fleet-wind-grid-display";
import { WindGridTimeSlider } from "@/components/sailing-analysis/wind-grid-time-slider";
import type { FleetWindGrid } from "@/lib/sailing-analysis/fleet-wind-grid";

export function SetupCourseMapSection({
  clubMarks,
  course,
  trackPoints,
  laps,
  markOverrides,
  onMarkOverridesChange,
  courseSetup,
  onSfLineChange,
  previewEnabled = true,
  userWind,
  fleetTracks = [],
  fleetWindGrid = null,
  raceStartUnixSec = null,
  onWindChange,
}: {
  clubMarks: SailingMarkRow[];
  course: SailingCourseRow | null;
  trackPoints: { lat: number; lon: number; time?: number | null }[];
  laps: number;
  markOverrides: Record<string, MarkOverride>;
  onMarkOverridesChange: (next: Record<string, MarkOverride>) => void;
  courseSetup: Record<string, unknown>;
  onSfLineChange: (ends: StartFinishLineEnds) => void;
  previewEnabled?: boolean;
  userWind?: number | null;
  fleetTracks?: FleetTrackOverlay[];
  fleetWindGrid?: FleetWindGrid | null;
  raceStartUnixSec?: number | null;
  onWindChange?: (deg: number) => void;
}) {
  const [showMarkGates, setShowMarkGates] = useState(true);
  const [showWindGrid, setShowWindGrid] = useState(true);
  const { windGridFC, selectedBucket, setTimeBucket, showTimeSlider } =
    useFleetWindGridDisplay(fleetWindGrid);

  const sfEnds = useMemo(() => sfLineFromCourseSetup(courseSetup), [courseSetup]);

  const preview = useSetupAnalysisPreview({
    trackPoints,
    clubMarks,
    course,
    laps,
    markOverrides,
    courseSetup,
    userWind,
    enabled: previewEnabled && trackPoints.length >= 20,
  });

  const marks = useMemo(
    () => buildMapMarksWithSfEnds(clubMarks, course, markOverrides, sfEnds),
    [clubMarks, course, markOverrides, sfEnds],
  );

  const courseLine = useMemo(
    () => buildCourseLinePoints(clubMarks, course, markOverrides),
    [clubMarks, course, markOverrides],
  );

  const legGatesFC = useMemo(
    () => buildGateOverlayFC(clubMarks, course, laps, markOverrides, courseSetup),
    [clubMarks, course, laps, markOverrides, courseSetup],
  );

  const onMarkDrag = useCallback(
    (name: string, lat: number, lon: number) => {
      if (name === "SFA") {
        onSfLineChange({ endA: { lat, lon }, endB: sfEnds.endB });
        return;
      }
      if (name === "SFB") {
        onSfLineChange({ endA: sfEnds.endA, endB: { lat, lon } });
        return;
      }
      onMarkOverridesChange({ ...markOverrides, [name]: { lat, lon } });
    },
    [markOverrides, onMarkOverridesChange, onSfLineChange, sfEnds],
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start gap-4">
        <label className="flex items-center gap-2 text-sm text-splice-ocean dark:text-splice-water">
          <input
            type="checkbox"
            checked={showMarkGates}
            onChange={(e) => setShowMarkGates(e.target.checked)}
            className="rounded border-splice-sky"
          />
          Show mark rounding gate lines
        </label>
        {windGridFC?.features?.length ? (
          <>
            <label className="flex items-center gap-2 text-sm text-splice-ocean dark:text-splice-water">
              <input
                type="checkbox"
                checked={showWindGrid}
                onChange={(e) => setShowWindGrid(e.target.checked)}
                className="rounded border-splice-sky"
              />
              Show fleet wind grid (50 m · 5 min)
            </label>
            {showTimeSlider && fleetWindGrid && selectedBucket != null ? (
              <WindGridTimeSlider
                grid={fleetWindGrid}
                value={selectedBucket}
                onChange={setTimeBucket}
                raceStartUnixSec={raceStartUnixSec}
              />
            ) : null}
          </>
        ) : null}
        {onWindChange ? (
          <div className="w-[200px]">
            <WindRose
              windDeg={Math.round(userWind ?? preview?.windDir ?? 0)}
              onChange={onWindChange}
              compact
              hint="Override wind for live map preview"
            />
          </div>
        ) : null}
      </div>
      <CourseAnalysisMap
        marks={marks}
        trackPoints={trackPoints}
        courseLine={courseLine}
        onMarkDrag={onMarkDrag}
        draggableAllMarks
        startFinishLine={sfEnds}
        trackSegmentFC={preview?.trackSegmentFC ?? null}
        legGatesFC={legGatesFC}
        showMarkGates={showMarkGates}
        manoeuvres={
          preview
            ? { tacks: preview.tacks ?? [], gybes: preview.gybes ?? [] }
            : null
        }
        showLegend
        fleetTracks={fleetTracks}
        windGridFC={windGridFC}
        showWindGrid={showWindGrid}
      />
      {!preview && trackPoints.length >= 20 ? (
        <p className="text-xs text-amber-700 dark:text-amber-200">
          Select a course letter to preview leg colours and manoeuvre badges on the map.
        </p>
      ) : null}
      {!course ? (
        <p className="text-xs text-splice-ocean dark:text-splice-water">
          Choose a course letter to show only that course&apos;s marks on the map.
        </p>
      ) : null}
    </div>
  );
}

export function initialSfLineEnds(
  courseSetup: Record<string, unknown> | null | undefined,
): StartFinishLineEnds {
  return sfLineFromCourseSetup(courseSetup ?? {}) ?? DEFAULT_SF_LINE_ENDS;
}
