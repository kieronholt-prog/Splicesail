"use client";

import { useMemo, useState } from "react";
import { AnalysisView } from "@/components/sailing-analysis/analysis-view";
import { SetupCourseMapSection } from "@/components/sailing-analysis/setup-course-map-section";
import { initialSfLineEnds } from "@/components/sailing-analysis/setup-course-map-section";
import { buildCourseSetupJson } from "@/components/sailing-analysis/course-setup-fields";
import { rerunTrackAnalysisAction } from "@/app/actions/track-submissions";
import { DETECTION_DEFAULTS } from "@/lib/sailing-analysis";
import type { AnalysisSnapshot, StartFinishLineEnds } from "@/lib/sailing-analysis/analysis-types";
import type { FleetWindGrid } from "@/lib/sailing-analysis/fleet-wind-grid";
import type { MarkOverride, SailingCourseRow, SailingMarkRow } from "@/lib/sailing-analysis/types";
import { buildMapMarksWithSfEnds, buildCourseLinePoints } from "@/lib/sailing-analysis/map-display";
import { buildGateOverlayFC } from "@/lib/sailing-analysis/gate-overlay";
import { WindRose } from "@/components/sailing-analysis/wind-rose";
import {
  spliceFieldClass,
  spliceFieldHintClass,
  spliceFieldLabelClass,
} from "@/components/sailing-analysis/form-field-classes";
export function AnalysisInteractive({
  submissionId,
  snapshot,
  stats,
  windDirection,
  clubMarks,
  course,
  laps,
  initialMarkOverrides,
  initialCourseSetup,
  trackPoints,
  collatedPreset = false,
  fleetWindGrid = null,
  raceStartUnixSec = null,
}: {
  submissionId: string;
  snapshot: AnalysisSnapshot;
  stats: Record<string, unknown>;
  windDirection?: number | null;
  clubMarks: SailingMarkRow[];
  course: SailingCourseRow | null;
  laps: number;
  initialMarkOverrides: Record<string, MarkOverride>;
  initialCourseSetup: Record<string, unknown> | null;
  trackPoints: { lat: number; lon: number; time?: number | null }[];
  /** RO has set course/wind — read-only for sailors. */
  collatedPreset?: boolean;
  fleetWindGrid?: FleetWindGrid | null;
  raceStartUnixSec?: number | null;
}) {
  const [showAdjustments, setShowAdjustments] = useState(false);
  const [markOverrides, setMarkOverrides] = useState(initialMarkOverrides);
  const [sfEnds, setSfEnds] = useState<StartFinishLineEnds>(() =>
    initialSfLineEnds(initialCourseSetup),
  );
  const [windOverride, setWindOverride] = useState<number | null>(windDirection ?? snapshot.windDir ?? null);
  const [gpsToBowM, setGpsToBowM] = useState(
    String(
      initialCourseSetup?.gpsToBowM ??
        snapshot.gpsToBowM ??
        2,
    ),
  );

  const roSfEnds = useMemo(() => initialSfLineEnds(initialCourseSetup), [initialCourseSetup]);
  const roMapMarks = useMemo(
    () => buildMapMarksWithSfEnds(clubMarks, course, initialMarkOverrides, roSfEnds),
    [clubMarks, course, initialMarkOverrides, roSfEnds],
  );

  const courseSetup = useMemo(
    () => ({
      ...(initialCourseSetup ?? {}),
      ...buildCourseSetupJson("", "", sfEnds, {
        raceStartUnixSec:
          initialCourseSetup?.raceStartUnixSec != null
            ? Number(initialCourseSetup.raceStartUnixSec)
            : null,
        raceStartSec:
          initialCourseSetup?.raceStartSec != null
            ? Number(initialCourseSetup.raceStartSec)
            : null,
      }),
      gpsToBowM: Number(gpsToBowM) > 0 ? Number(gpsToBowM) : 2,
    }),
    [initialCourseSetup, sfEnds, gpsToBowM],
  );

  const mapMarks = useMemo(
    () => buildMapMarksWithSfEnds(clubMarks, course, markOverrides, sfEnds),
    [clubMarks, course, markOverrides, sfEnds],
  );

  const effWind = collatedPreset
    ? (windDirection ?? snapshot.windDir ?? 0)
    : (windOverride ?? windDirection ?? snapshot.windDir ?? 0);

  if (collatedPreset) {
    return (
      <div className="flex flex-col gap-4">
        <p className="rounded-lg border border-splice-sky/80 bg-splice-sky/10 px-3 py-2 text-sm text-splice-navy dark:border-splice-ocean dark:bg-splice-navy-light/30 dark:text-splice-foam">
          Course, wind, and laps were set by the race officer. This analysis view is read-only.
        </p>

        <AnalysisView
          snapshot={snapshot}
          stats={stats}
          windDirection={effWind}
          mapMarks={roMapMarks}
          courseLine={buildCourseLinePoints(clubMarks, course, initialMarkOverrides)}
          startFinishLine={roSfEnds}
          legGatesFC={buildGateOverlayFC(clubMarks, course, laps, initialMarkOverrides, initialCourseSetup)}
          showMarkGates
          fleetWindGrid={fleetWindGrid}
          raceStartUnixSec={raceStartUnixSec}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-splice-sky p-4 dark:border-splice-ocean">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-splice-navy dark:text-splice-foam">Your adjustments</p>
            <p className="mt-1 text-xs text-splice-ocean dark:text-splice-water">
              Wind changes VMG overlays immediately; re-run to update legs and race timing.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowAdjustments((v) => !v)}
            className="rounded-lg border border-splice-navy px-3 py-1.5 text-sm font-medium text-splice-navy dark:border-splice-foam dark:text-splice-foam"
          >
            {showAdjustments ? "Hide map" : "Adjust course & wind"}
          </button>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,1fr)_140px]">
          <WindRose
            windDeg={Math.round(effWind)}
            onChange={setWindOverride}
            compact
          />
          <label className="flex flex-col gap-1">
            <span className={spliceFieldLabelClass}>GPS to bow (m)</span>
            <input
              type="number"
              min={0}
              max={20}
              step={0.5}
              value={gpsToBowM}
              onChange={(e) => setGpsToBowM(e.target.value)}
              className={spliceFieldClass}
            />
            <span className={spliceFieldHintClass}>Antenna offset for start-line position</span>
          </label>
        </div>

        <form action={rerunTrackAnalysisAction} className="mt-4 flex flex-wrap items-center gap-3">
          <input type="hidden" name="submission_id" value={submissionId} />
          <input type="hidden" name="mark_overrides" value={JSON.stringify(markOverrides)} />
          <input type="hidden" name="course_setup" value={JSON.stringify(courseSetup)} />
          <input type="hidden" name="wind_direction" value={windOverride ?? ""} />
          <input type="hidden" name="det_settings" value={JSON.stringify(DETECTION_DEFAULTS)} />
          <button
            type="submit"
            className="rounded-lg bg-splice-navy px-4 py-2 text-sm font-medium text-white dark:bg-splice-foam dark:text-splice-navy"
          >
            Re-run analysis
          </button>
        </form>
      </div>

      {showAdjustments ? (
        <SetupCourseMapSection
          clubMarks={clubMarks}
          course={course}
          trackPoints={trackPoints}
          laps={laps}
          markOverrides={markOverrides}
          onMarkOverridesChange={setMarkOverrides}
          courseSetup={courseSetup}
          onSfLineChange={setSfEnds}
          userWind={windOverride}
        />
      ) : null}

      <AnalysisView
        snapshot={snapshot}
        stats={stats}
        windDirection={effWind}
        mapMarks={mapMarks}
        courseLine={buildCourseLinePoints(clubMarks, course, markOverrides)}
        startFinishLine={sfEnds}
        legGatesFC={buildGateOverlayFC(clubMarks, course, laps, markOverrides, courseSetup)}
        showMarkGates
        windOverride={windOverride}
        onWindOverrideChange={setWindOverride}
        editableWind
        fleetWindGrid={fleetWindGrid}
        raceStartUnixSec={raceStartUnixSec}
      />
    </div>
  );
}
