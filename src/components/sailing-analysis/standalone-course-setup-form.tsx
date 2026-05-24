"use client";

import { useMemo, useState } from "react";
import { defaultCourseLetterValue, spliceFieldClass, spliceFieldClassNarrow } from "@/components/sailing-analysis/form-field-classes";
import { DETECTION_DEFAULTS } from "@/lib/sailing-analysis";
import type { SailingCourseRow } from "@/lib/sailing-analysis/types";
import { saveStandaloneSetupAction } from "@/app/actions/track-submissions";

export function StandaloneCourseSetupForm({
  submissionId,
  courses,
  defaultCourseLetter,
  defaultLaps,
}: {
  submissionId: string;
  courses: SailingCourseRow[];
  defaultCourseLetter?: string | null;
  defaultLaps?: number;
}) {
  const [courseLetter, setCourseLetter] = useState(() =>
    defaultCourseLetterValue(defaultCourseLetter, courses),
  );
  const [laps, setLaps] = useState(defaultLaps ?? 1);
  const markOverrides = useMemo(() => ({}), []);
  const courseSetup = useMemo(
    () => ({ cropStartSec: 0, cropDurationSec: 0, raceStartSec: null }),
    [],
  );

  return (
    <form action={saveStandaloneSetupAction} className="flex flex-col gap-4">
      <input type="hidden" name="submission_id" value={submissionId} />
      <input type="hidden" name="mark_overrides" value={JSON.stringify(markOverrides)} />
      <input type="hidden" name="course_setup" value={JSON.stringify(courseSetup)} />
      <input type="hidden" name="det_settings" value={JSON.stringify(DETECTION_DEFAULTS)} />

      <label className="flex flex-col gap-1 text-sm font-medium">
        Course letter
        <select
          name="course_letter"
          value={courseLetter}
          onChange={(e) => setCourseLetter(e.target.value)}
          className={spliceFieldClass}
        >
          {courses.length === 0 ? (
            <option value="">No courses configured</option>
          ) : (
            courses.map((c) => (
              <option key={c.id} value={c.course_letter}>
                {c.display_name}
              </option>
            ))
          )}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm font-medium">
        Laps
        <input
          type="number"
          name="laps"
          min={1}
          max={10}
          value={laps}
          onChange={(e) => setLaps(Number(e.target.value))}
          className={spliceFieldClassNarrow}
        />
      </label>

      <p className="text-sm text-splice-ocean dark:text-splice-water">
        Map-based mark dragging and detection tuning will use your club&apos;s sailing area marks. Run analysis when
        course and laps match what you sailed.
      </p>

      <button
        type="submit"
        className="rounded-lg bg-splice-navy px-4 py-2.5 text-sm font-medium text-white dark:bg-splice-foam dark:text-splice-navy"
      >
        Run analysis
      </button>
    </form>
  );
}
