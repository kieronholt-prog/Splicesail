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
  saveAndAnalyseRaceFleetAnalysisAction,
} from "@/app/actions/race-track-analysis";
import { DETECTION_DEFAULTS } from "@/lib/sailing-analysis";
import type { MarkOverride, SailingCourseRow, SailingMarkRow } from "@/lib/sailing-analysis/types";
import { CourseRoundingSequenceSummary } from "@/components/sailing-analysis/course-rounding-sequence-summary";
import { markNamesForCourse } from "@/lib/sailing-analysis/course-mark-names";
import type { StartFinishLineEnds } from "@/lib/sailing-analysis/analysis-types";
import type { FleetCollatedCounts, FleetTrackOverlay } from "@/lib/sailing-analysis/load-race-fleet-tracks";
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
  collatedCounts,
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
  collatedCounts: FleetCollatedCounts;
}) {
  const pendingCount = collatedCounts.pending;
  const readyCount = collatedCounts.ready;
  const totalCollated = pendingCount + readyCount;
  const tracksOnMap = fleetTracks.length;
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
  const hasCollatedTracks = totalCollated > 0;

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

      {tracksOnMap > 0 && tracksOnMap < totalCollated ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
          {tracksOnMap} of {totalCollated} tracks have GPS on the map — sailors may need to re-open their upload to
          cache points (Strava) or refresh this page (GPX/FIT).
        </p>
      ) : null}

      <form action={saveAndAnalyseRaceFleetAnalysisAction} className="flex flex-col gap-6">
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

        {courseLetter ? (
          <CourseRoundingSequenceSummary
            course={selectedCourse}
            laps={laps}
            clubMarks={clubMarks}
          />
        ) : null}

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
            Tracks are queued but GPS is not on the map yet. For Strava activities, ask the sailor to
            re-open their track and confirm collated mode (this caches GPS for race staff). Uploaded GPX/FIT
            files should appear automatically — try refreshing this page.
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
          disabled={!courseLetter}
          className="self-start rounded-lg bg-splice-navy px-4 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 dark:bg-splice-foam dark:text-splice-navy"
        >
          {hasCollatedTracks
            ? `Save & analyse ${fleet.name}`
            : `Save ${fleet.name} settings`}
        </button>
        {!courseLetter ? (
          <p className="text-xs text-splice-ocean dark:text-splice-water">
            Select a course letter first.
          </p>
        ) : hasCollatedTracks ? (
          <p className="text-xs text-splice-ocean dark:text-splice-water">
            Saves your settings and runs analysis on all collated tracks in this fleet
            {readyCount > 0 ? " (including re-analysis of tracks already processed)" : ""}.
          </p>
        ) : (
          <p className="text-xs text-splice-ocean dark:text-splice-water">
            Preset course and mark positions — analysis runs automatically when you click this after tracks arrive.
          </p>
        )}
      </form>
    </div>
  );
}
