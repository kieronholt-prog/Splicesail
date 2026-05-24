"use client";

import { useMemo, useState } from "react";
import {
  buildCourseSetupJson,
  CourseSetupFields,
  defaultCourseLetterValue,
  initialRaceStartText,
  initialWindwardMark,
} from "@/components/sailing-analysis/course-setup-fields";
import {
  spliceFieldClassWind,
  spliceFieldHintClass,
  spliceFieldLabelClass,
} from "@/components/sailing-analysis/form-field-classes";
import {
  confirmRaceAnalysisCompleteAction,
  saveRaceAnalysisSettingsAction,
} from "@/app/actions/race-track-analysis";
import { formatHMS, parseHMS, DETECTION_DEFAULTS } from "@/lib/sailing-analysis";
import type { SailingCourseRow } from "@/lib/sailing-analysis/types";
import { markNamesForCourse } from "@/lib/sailing-analysis/course-mark-names";

export function RoTrackAnalysisSetupForm({
  groupId,
  raceId,
  seriesId,
  courses,
  defaultCourseLetter,
  defaultLaps,
  defaultWind,
  defaultCourseSetup,
  pendingCount,
  hasSavedCourse,
}: {
  groupId: string;
  raceId: string;
  seriesId: string;
  courses: SailingCourseRow[];
  defaultCourseLetter?: string | null;
  defaultLaps?: number;
  defaultWind?: number | null;
  defaultCourseSetup?: Record<string, unknown> | null;
  pendingCount: number;
  hasSavedCourse: boolean;
}) {
  const [courseLetter, setCourseLetter] = useState(() =>
    defaultCourseLetterValue(defaultCourseLetter, courses),
  );
  const [laps, setLaps] = useState(defaultLaps ?? 1);
  const [raceStartText, setRaceStartText] = useState(() => initialRaceStartText(defaultCourseSetup));
  const [windwardMark, setWindwardMark] = useState(() => initialWindwardMark(defaultCourseSetup));
  const [wind, setWind] = useState(
    defaultWind != null && Number.isFinite(defaultWind) ? String(defaultWind) : "",
  );

  const courseSetup = useMemo(
    () => buildCourseSetupJson(raceStartText, windwardMark),
    [raceStartText, windwardMark],
  );

  function onCourseLetterChange(next: string) {
    setCourseLetter(next);
    const course = courses.find((c) => c.course_letter === next);
    const options = markNamesForCourse(course);
    if (windwardMark && !options.includes(windwardMark)) {
      setWindwardMark("");
    }
  }

  function normalizeRaceStartText() {
    const parsed = parseHMS(raceStartText);
    setRaceStartText(formatHMS(parsed ?? 0));
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-splice-ocean dark:text-splice-water">
        {pendingCount} sailor track{pendingCount === 1 ? "" : "s"} waiting for course setup. Confirm mark positions
        and course letter, then mark settings complete to run fleet analysis.
      </p>

      <form action={saveRaceAnalysisSettingsAction} className="flex flex-col gap-4 rounded-xl border border-splice-sky p-4 dark:border-splice-ocean">
        <input type="hidden" name="group_id" value={groupId} />
        <input type="hidden" name="race_id" value={raceId} />
        <input type="hidden" name="series_id" value={seriesId} />
        <input type="hidden" name="mark_overrides" value="{}" />
        <input type="hidden" name="course_setup" value={JSON.stringify(courseSetup)} />
        <input type="hidden" name="det_settings" value={JSON.stringify(DETECTION_DEFAULTS)} />

        <CourseSetupFields
          courses={courses}
          courseLetter={courseLetter}
          onCourseLetterChange={onCourseLetterChange}
          laps={laps}
          onLapsChange={setLaps}
          raceStartText={raceStartText}
          onRaceStartTextChange={setRaceStartText}
          onRaceStartBlur={normalizeRaceStartText}
          windwardMark={windwardMark}
          onWindwardMarkChange={setWindwardMark}
        />

        <label className="flex min-w-0 max-w-xs flex-col gap-1">
          <span className={spliceFieldLabelClass}>Wind direction (optional)</span>
          <input
            type="number"
            name="wind_direction"
            min={0}
            max={360}
            value={wind}
            onChange={(e) => setWind(e.target.value)}
            placeholder="Auto from track"
            className={spliceFieldClassWind}
          />
          <span className={spliceFieldHintClass}>Degrees from (met). Leave blank to estimate from GPS.</span>
        </label>

        <button
          type="submit"
          className="self-start rounded-lg border border-splice-navy px-4 py-2 text-sm font-medium text-splice-navy dark:border-splice-foam dark:text-splice-foam"
        >
          Save draft settings
        </button>
      </form>

      <form action={confirmRaceAnalysisCompleteAction}>
        <input type="hidden" name="group_id" value={groupId} />
        <input type="hidden" name="race_id" value={raceId} />
        <input type="hidden" name="series_id" value={seriesId} />
        <button
          type="submit"
          disabled={!hasSavedCourse && !courseLetter}
          className="rounded-lg bg-splice-navy px-4 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 dark:bg-splice-foam dark:text-splice-navy"
        >
          Settings complete — analyse all submitted tracks
        </button>
        {!hasSavedCourse ? (
          <p className="mt-2 text-xs text-splice-ocean dark:text-splice-water">
            Save draft settings with a course letter first — the confirm button uses your saved course, not just the
            dropdown selection.
          </p>
        ) : null}
      </form>
    </div>
  );
}
