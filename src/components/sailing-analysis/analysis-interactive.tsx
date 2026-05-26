"use client";

import { useMemo, useState } from "react";
import { AnalysisView } from "@/components/sailing-analysis/analysis-view";
import { SetupCourseMapSection } from "@/components/sailing-analysis/setup-course-map-section";
import { initialSfLineEnds } from "@/components/sailing-analysis/setup-course-map-section";
import { buildCourseSetupJson } from "@/components/sailing-analysis/course-setup-fields";
import { rerunTrackAnalysisAction } from "@/app/actions/track-submissions";
import { DETECTION_DEFAULTS } from "@/lib/sailing-analysis";
import type { AnalysisSnapshot, StartFinishLineEnds } from "@/lib/sailing-analysis/analysis-types";
import type { MarkOverride, SailingCourseRow, SailingMarkRow } from "@/lib/sailing-analysis/types";
import { buildMapMarksWithSfEnds, buildCourseLinePoints } from "@/lib/sailing-analysis/map-display";
import { buildGateOverlayFC } from "@/lib/sailing-analysis/gate-overlay";

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
}) {
  const [editMarks, setEditMarks] = useState(false);
  const [markOverrides, setMarkOverrides] = useState(initialMarkOverrides);
  const [sfEnds, setSfEnds] = useState<StartFinishLineEnds>(() =>
    initialSfLineEnds(initialCourseSetup),
  );
  const [windOverride, setWindOverride] = useState<number | null>(windDirection ?? snapshot.windDir ?? null);

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
    }),
    [initialCourseSetup, sfEnds],
  );

  const mapMarks = useMemo(
    () => buildMapMarksWithSfEnds(clubMarks, course, markOverrides, sfEnds),
    [clubMarks, course, markOverrides, sfEnds],
  );

  const effWind = windOverride ?? windDirection ?? snapshot.windDir ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setEditMarks((v) => !v)}
          className="rounded-lg border border-splice-navy px-3 py-1.5 text-sm font-medium text-splice-navy dark:border-splice-foam dark:text-splice-foam"
        >
          {editMarks ? "Done adjusting marks" : "Adjust marks & re-run"}
        </button>
        {editMarks ? (
          <form action={rerunTrackAnalysisAction} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="submission_id" value={submissionId} />
            <input type="hidden" name="mark_overrides" value={JSON.stringify(markOverrides)} />
            <input type="hidden" name="course_setup" value={JSON.stringify(courseSetup)} />
            <input type="hidden" name="wind_direction" value={windOverride ?? ""} />
            <input type="hidden" name="det_settings" value={JSON.stringify(DETECTION_DEFAULTS)} />
            <button
              type="submit"
              className="rounded-lg bg-splice-navy px-4 py-1.5 text-sm font-medium text-white dark:bg-splice-foam dark:text-splice-navy"
            >
              Re-run analysis
            </button>
          </form>
        ) : null}
      </div>

      {editMarks ? (
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
      />
    </div>
  );
}
