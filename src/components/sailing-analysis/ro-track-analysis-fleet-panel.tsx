"use client";

import { useMemo, useState } from "react";
import {
  CourseSetupFields,
  defaultCourseLetterValue,
  initialWindwardMark,
} from "@/components/sailing-analysis/course-setup-fields";
import {
  spliceFieldClassWind,
  spliceFieldHintClass,
  spliceFieldLabelClass,
} from "@/components/sailing-analysis/form-field-classes";
import {
  initialSfLineEnds,
  SetupCourseMapSection,
} from "@/components/sailing-analysis/setup-course-map-section";
import { buildRoCourseSetupJson } from "@/components/sailing-analysis/ro-course-setup-helpers";
import {
  confirmRaceFleetAnalysisAction,
  saveRaceFleetAnalysisSettingsAction,
} from "@/app/actions/race-track-analysis";
import { DETECTION_DEFAULTS } from "@/lib/sailing-analysis";
import type { MarkOverride, SailingCourseRow, SailingMarkRow } from "@/lib/sailing-analysis/types";
import { markNamesForCourse } from "@/lib/sailing-analysis/course-mark-names";
import type { StartFinishLineEnds } from "@/lib/sailing-analysis/analysis-types";
import type { FleetTrackOverlay } from "@/lib/sailing-analysis/load-race-fleet-tracks";
import type { RaceFleetAnalysisSettingsRow } from "@/lib/sailing-analysis/race-fleet-analysis-settings";

export type RaceFleetVm = {
  id: string;
  name: string;
  startSignalLabel: string | null;
};

export function RoTrackAnalysisFleetPanel({
  fleet,
  groupId,
  raceId,
  seriesId,
  courses,
  clubMarks,
  fleetTracks,
  raceStartUnixSec,
  raceStartSec,
  savedSettings,
  pendingCount,
}: {
  fleet: RaceFleetVm;
  groupId: string;
  raceId: string;
  seriesId: string;
  courses: SailingCourseRow[];
  clubMarks: SailingMarkRow[];
  fleetTracks: FleetTrackOverlay[];
  raceStartUnixSec: number | null;
  raceStartSec: number;
  savedSettings: RaceFleetAnalysisSettingsRow | null;
  pendingCount: number;
}) {
  const [courseLetter, setCourseLetter] = useState(() =>
    defaultCourseLetterValue(savedSettings?.course_letter, courses),
  );
  const [laps, setLaps] = useState(savedSettings?.laps ?? 1);
  const [windwardMark, setWindwardMark] = useState(() =>
    initialWindwardMark(savedSettings?.course_setup ?? null),
  );
  const [wind, setWind] = useState(
    savedSettings?.wind_direction != null && Number.isFinite(savedSettings.wind_direction)
      ? String(savedSettings.wind_direction)
      : "",
  );
  const [markOverrides, setMarkOverrides] = useState<Record<string, MarkOverride>>(
    () => savedSettings?.mark_overrides ?? {},
  );
  const [sfEnds, setSfEnds] = useState<StartFinishLineEnds>(() =>
    initialSfLineEnds(savedSettings?.course_setup ?? null),
  );

  const selectedCourse = useMemo(
    () => courses.find((c) => c.course_letter === courseLetter) ?? null,
    [courses, courseLetter],
  );

  const courseSetup = useMemo(
    () => buildRoCourseSetupJson(windwardMark, sfEnds, raceStartUnixSec, raceStartSec),
    [windwardMark, sfEnds, raceStartUnixSec, raceStartSec],
  );

  const previewTrack = fleetTracks[0]?.points ?? [];
  const previewWind = wind.trim() ? Number(wind) : null;
  const hasSavedCourse = Boolean(savedSettings?.course_letter);

  function onCourseLetterChange(next: string) {
    setCourseLetter(next);
    const course = courses.find((c) => c.course_letter === next);
    const options = markNamesForCourse(course);
    if (windwardMark && !options.includes(windwardMark)) {
      setWindwardMark("");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {fleet.startSignalLabel ? (
        <p className="text-sm text-splice-ocean dark:text-splice-water">
          Fleet start signal: {fleet.startSignalLabel}
        </p>
      ) : null}

      {pendingCount > 0 ? (
        <p className="rounded-lg border border-splice-sky/60 bg-splice-sky/10 px-3 py-2 text-sm text-splice-navy dark:text-splice-foam">
          {pendingCount} collated track{pendingCount !== 1 ? "s" : ""} awaiting analysis in this fleet.
        </p>
      ) : (
        <p className="text-sm text-splice-ocean dark:text-splice-water">
          No pending tracks in this fleet. Adjust marks here if you need to re-run analysis later.
        </p>
      )}

      <form action={saveRaceFleetAnalysisSettingsAction} className="flex flex-col gap-6">
        <input type="hidden" name="group_id" value={groupId} />
        <input type="hidden" name="race_id" value={raceId} />
        <input type="hidden" name="series_id" value={seriesId} />
        <input type="hidden" name="race_fleet_id" value={fleet.id} />
        <input type="hidden" name="mark_overrides" value={JSON.stringify(markOverrides)} />
        <input type="hidden" name="course_setup" value={JSON.stringify(courseSetup)} />
        <input type="hidden" name="det_settings" value={JSON.stringify(DETECTION_DEFAULTS)} />

        <CourseSetupFields
          courses={courses}
          courseLetter={courseLetter}
          onCourseLetterChange={onCourseLetterChange}
          laps={laps}
          onLapsChange={setLaps}
          raceStartText=""
          onRaceStartTextChange={() => {}}
          windwardMark={windwardMark}
          onWindwardMarkChange={setWindwardMark}
          showRaceStartField={false}
          windwardInline
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

        {pendingCount > 0 && fleetTracks.length === 0 ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
            Tracks are queued but GPS is not available yet. Ask sailors to re-open their track and confirm
            collated mode (Strava), or apply migration{" "}
            <code className="text-xs">20261705120000_track_points_cache</code> and refresh.
          </p>
        ) : null}

        <SetupCourseMapSection
          clubMarks={clubMarks}
          course={selectedCourse}
          trackPoints={previewTrack}
          fleetTracks={fleetTracks}
          laps={laps}
          markOverrides={markOverrides}
          onMarkOverridesChange={setMarkOverrides}
          courseSetup={courseSetup}
          onSfLineChange={setSfEnds}
          previewEnabled={previewTrack.length >= 20}
          userWind={previewWind}
          onWindChange={(deg) => setWind(String(deg))}
        />

        <button
          type="submit"
          className="self-start rounded-lg border border-splice-navy px-4 py-2 text-sm font-medium text-splice-navy dark:border-splice-foam dark:text-splice-foam"
        >
          Save {fleet.name} settings
        </button>
      </form>

      <form action={confirmRaceFleetAnalysisAction}>
        <input type="hidden" name="group_id" value={groupId} />
        <input type="hidden" name="race_id" value={raceId} />
        <input type="hidden" name="series_id" value={seriesId} />
        <input type="hidden" name="race_fleet_id" value={fleet.id} />
        <button
          type="submit"
          disabled={!hasSavedCourse && !courseLetter}
          className="rounded-lg bg-splice-navy px-4 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 dark:bg-splice-foam dark:text-splice-navy"
        >
          Analyse {fleet.name} tracks
        </button>
        {!hasSavedCourse ? (
          <p className="mt-2 text-xs text-splice-ocean dark:text-splice-water">
            Save course and laps for this fleet first.
          </p>
        ) : null}
      </form>
    </div>
  );
}
