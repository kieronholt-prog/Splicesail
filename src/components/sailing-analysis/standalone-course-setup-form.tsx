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
  initialSfLineEnds,
  SetupCourseMapSection,
} from "@/components/sailing-analysis/setup-course-map-section";
import { DETECTION_DEFAULTS, formatHMS, parseHMS } from "@/lib/sailing-analysis";
import type { MarkOverride, SailingCourseRow, SailingMarkRow } from "@/lib/sailing-analysis/types";
import { markNamesForCourse } from "@/lib/sailing-analysis/course-mark-names";
import { saveStandaloneSetupAction } from "@/app/actions/track-submissions";
import type { StartFinishLineEnds } from "@/lib/sailing-analysis/analysis-types";

export function StandaloneCourseSetupForm({
  submissionId,
  courses,
  clubMarks,
  trackPoints,
  defaultCourseLetter,
  defaultLaps,
  defaultCourseSetup,
  defaultMarkOverrides,
}: {
  submissionId: string;
  courses: SailingCourseRow[];
  clubMarks: SailingMarkRow[];
  trackPoints: { lat: number; lon: number; time?: number | null }[];
  defaultCourseLetter?: string | null;
  defaultLaps?: number;
  defaultCourseSetup?: Record<string, unknown> | null;
  defaultMarkOverrides?: Record<string, MarkOverride> | null;
}) {
  const [courseLetter, setCourseLetter] = useState(() =>
    defaultCourseLetterValue(defaultCourseLetter, courses),
  );
  const [laps, setLaps] = useState(defaultLaps ?? 1);
  const [raceStartText, setRaceStartText] = useState(() => initialRaceStartText(defaultCourseSetup));
  const [windwardMark, setWindwardMark] = useState(() => initialWindwardMark(defaultCourseSetup));
  const [markOverrides, setMarkOverrides] = useState<Record<string, MarkOverride>>(
    () => defaultMarkOverrides ?? {},
  );
  const [sfEnds, setSfEnds] = useState<StartFinishLineEnds>(() => initialSfLineEnds(defaultCourseSetup));

  const selectedCourse = useMemo(
    () => courses.find((c) => c.course_letter === courseLetter) ?? null,
    [courses, courseLetter],
  );

  const courseSetup = useMemo(
    () => buildCourseSetupJson(raceStartText, windwardMark, sfEnds),
    [raceStartText, windwardMark, sfEnds],
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
    <form action={saveStandaloneSetupAction} className="flex flex-col gap-4">
      <input type="hidden" name="submission_id" value={submissionId} />
      <input type="hidden" name="mark_overrides" value={JSON.stringify(markOverrides)} />
      <input type="hidden" name="course_setup" value={JSON.stringify(courseSetup)} />
      <input type="hidden" name="det_settings" value={JSON.stringify(DETECTION_DEFAULTS)} />

      <SetupCourseMapSection
        clubMarks={clubMarks}
        course={selectedCourse}
        trackPoints={trackPoints}
        laps={laps}
        markOverrides={markOverrides}
        onMarkOverridesChange={setMarkOverrides}
        courseSetup={courseSetup}
        onSfLineChange={setSfEnds}
      />

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

      <p className="text-sm text-splice-ocean dark:text-splice-water">
        Leg colours, rounding gates, and tack/gybe badges update live as you adjust marks. Run analysis when course
        and laps match what you sailed.
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
