"use client";

import { useMemo } from "react";
import {
  defaultCourseLetterValue,
  spliceFieldClass,
  spliceFieldClassMono,
  spliceFieldClassNarrow,
  spliceFieldHintClass,
  spliceFieldLabelClass,
} from "@/components/sailing-analysis/form-field-classes";
import { formatHMS, parseHMS } from "@/lib/sailing-analysis";
import { markNamesForCourse } from "@/lib/sailing-analysis/course-mark-names";
import type { SailingCourseRow } from "@/lib/sailing-analysis/types";

import type { StartFinishLineEnds } from "@/lib/sailing-analysis/analysis-types";

export type CourseSetupFormState = {
  cropStartSec: number;
  cropDurationSec: number;
  raceStartSec: number;
  windwardMark: string | null;
  sfLineEndA?: { lat: number; lon: number };
  sfLineEndB?: { lat: number; lon: number };
  raceStartUnixSec?: number;
};

export function buildCourseSetupJson(
  raceStartText: string,
  windwardMark: string,
  sfEnds?: StartFinishLineEnds,
  opts?: { raceStartUnixSec?: number | null; raceStartSec?: number | null },
): CourseSetupFormState {
  const fromSchedule =
    opts?.raceStartSec != null && Number.isFinite(opts.raceStartSec) ? opts.raceStartSec : null;
  return {
    cropStartSec: 0,
    cropDurationSec: 0,
    raceStartSec: fromSchedule ?? parseHMS(raceStartText) ?? 0,
    windwardMark: windwardMark.trim() || null,
    sfLineEndA: sfEnds?.endA,
    sfLineEndB: sfEnds?.endB,
    ...(opts?.raceStartUnixSec != null
      ? { raceStartUnixSec: Math.round(opts.raceStartUnixSec) }
      : {}),
  };
}

export function initialRaceStartText(courseSetup: Record<string, unknown> | null | undefined): string {
  const sec = courseSetup?.raceStartSec;
  if (sec != null && Number.isFinite(Number(sec))) {
    return formatHMS(Number(sec));
  }
  return "00:00:00";
}

export function initialWindwardMark(courseSetup: Record<string, unknown> | null | undefined): string {
  const raw = courseSetup?.windwardMark;
  return typeof raw === "string" ? raw : "";
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className={spliceFieldLabelClass}>{children}</span>;
}

export function CourseSetupFields({
  courses,
  courseLetter,
  onCourseLetterChange,
  laps,
  onLapsChange,
  raceStartText,
  onRaceStartTextChange,
  onRaceStartBlur,
  windwardMark,
  onWindwardMarkChange,
  showRaceStartField = true,
  courseLetterName = "course_letter",
  lapsName = "laps",
  windwardInline = false,
}: {
  courses: SailingCourseRow[];
  courseLetter: string;
  onCourseLetterChange: (value: string) => void;
  laps: number;
  onLapsChange: (value: number) => void;
  raceStartText: string;
  onRaceStartTextChange: (value: string) => void;
  onRaceStartBlur?: () => void;
  windwardMark: string;
  onWindwardMarkChange: (value: string) => void;
  showRaceStartField?: boolean;
  courseLetterName?: string;
  lapsName?: string;
  windwardInline?: boolean;
}) {
  const selectedCourse = useMemo(
    () => courses.find((c) => c.course_letter === courseLetter) ?? null,
    [courses, courseLetter],
  );
  const windwardOptions = useMemo(() => markNamesForCourse(selectedCourse), [selectedCourse]);

  const windwardSelect = (
    <>
      <FieldLabel>Windward mark (optional)</FieldLabel>
      <select
        name="windward_mark"
        value={windwardMark}
        onChange={(e) => onWindwardMarkChange(e.target.value)}
        disabled={!courseLetter}
        className={`${spliceFieldClass} max-w-md disabled:opacity-50`}
      >
        <option value="">— None —</option>
        {windwardOptions.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
    </>
  );

  return (
    <div className="flex flex-col gap-4">
      <div
        className={`grid gap-4 ${
          showRaceStartField ? "sm:grid-cols-3" : windwardInline ? "sm:grid-cols-3" : "sm:grid-cols-2"
        }`}
      >
        <label className="flex min-w-0 flex-col gap-1 sm:col-span-1">
          <FieldLabel>Course</FieldLabel>
          <select
            name={courseLetterName}
            value={courseLetter}
            onChange={(e) => onCourseLetterChange(e.target.value)}
            className={spliceFieldClass}
            required
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

        <label className="flex min-w-0 flex-col gap-1">
          <FieldLabel>Laps</FieldLabel>
          <input
            type="number"
            name={lapsName}
            min={1}
            max={10}
            value={laps}
            onChange={(e) => onLapsChange(Number(e.target.value))}
            className={spliceFieldClassNarrow}
          />
        </label>

        {showRaceStartField ? (
          <label className="flex min-w-0 flex-col gap-1">
            <FieldLabel>Start time</FieldLabel>
            <input
              type="text"
              name="race_start_time"
              value={raceStartText}
              onChange={(e) => onRaceStartTextChange(e.target.value)}
              onBlur={onRaceStartBlur}
              placeholder="00:00:00"
              className={spliceFieldClassMono}
              autoComplete="off"
            />
            <span className={spliceFieldHintClass}>Seconds after first GPS point (HH:MM:SS)</span>
          </label>
        ) : windwardInline ? (
          <label className="flex min-w-0 flex-col gap-1">{windwardSelect}</label>
        ) : null}
      </div>

      {!windwardInline ? (
        <label className="flex min-w-0 flex-col gap-1">
          {windwardSelect}
          <span className={spliceFieldHintClass}>
            Wind estimate favours segments heading toward this mark. List is lap 1 marks in order.
          </span>
        </label>
      ) : (
        <span className={spliceFieldHintClass}>
          Wind estimate favours segments heading toward the windward mark. List is lap 1 marks in order.
        </span>
      )}
    </div>
  );
}

export { defaultCourseLetterValue };
