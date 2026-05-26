"use client";

import { useState } from "react";

import { ApplicableClubFleetsFields } from "@/components/applicable-club-fleets-fields";
import { SeriesRaceGeneratorModeFields } from "@/components/series-race-generator-mode-fields";
import { InfoHint } from "@/components/ui/info-hint";
import type { ScheduleGenerationMode } from "@/lib/schedule-generation-mode";
import { raceTypeLabel, type RaceType } from "@/lib/race-type";

type FleetOption = { id: string; name: string };

type Props = {
  defaultMode: ScheduleGenerationMode;
  defaultStartsOn: string;
  defaultEndsOn: string;
  defaultFirstStartTimeHm: string;
  defaultPursuitFinishTimeHm: string;
  defaultPursuitStartIncrementSeconds: number | "";
  defaultRacePeriodicity: string;
  defaultRacesPerPeriod: number | "";
  defaultMinutesBetweenRaces: number | "";
  defaultStartSequence: string;
  defaultRaceType: RaceType;
  defaultPursuitFleetId: string;
  fleets: FleetOption[];
  groupId: string;
  defaultFleetSelections?: { fleetId: string; startOffsetMinutes: number }[];
};

export function SeriesRaceGeneratorFields({
  defaultMode,
  defaultStartsOn,
  defaultEndsOn,
  defaultFirstStartTimeHm,
  defaultPursuitFinishTimeHm,
  defaultPursuitStartIncrementSeconds,
  defaultRacePeriodicity,
  defaultRacesPerPeriod,
  defaultMinutesBetweenRaces,
  defaultStartSequence,
  defaultRaceType,
  defaultPursuitFleetId,
  fleets,
  groupId,
  defaultFleetSelections,
}: Props) {
  const [raceType, setRaceType] = useState<RaceType>(defaultRaceType);
  const isPursuit = raceType === "pursuit";

  const fieldLabel = "text-[11px] font-medium uppercase tracking-wide text-splice-ocean dark:text-splice-water";
  const selectCls =
    "min-w-0 w-full max-w-xs rounded-lg border border-splice-water bg-white px-2.5 py-1.5 text-sm text-splice-navy dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-foam";
  const btnBase =
    "rounded-md px-2.5 py-1.5 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-splice-blue";
  const btnInactive =
    "border border-splice-water bg-white text-splice-navy-light hover:bg-splice-surface dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-foam dark:hover:bg-splice-navy";
  const btnActive = "bg-splice-navy text-white dark:bg-splice-foam dark:text-splice-navy";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className={fieldLabel}>Race type</span>
          <InfoHint label="About race types">
            <p className="mb-2">
              Choose the race type first — it controls which generator fields you need below.
            </p>
            <p className="mb-2">
              <strong className="text-splice-navy-light dark:text-splice-sky">Handicap</strong> — Portsmouth corrected time;
              applicable fleets and start sequence.
            </p>
            <p className="mb-2">
              <strong className="text-splice-navy-light dark:text-splice-sky">Level rated</strong> — finish position; applicable
              fleets and start sequence.
            </p>
            <p>
              <strong className="text-splice-navy-light dark:text-splice-sky">Pursuit</strong> — class stagger from PY; one
              pursuit fleet, first start, finish time, and start interval (no start sequence or multi-fleet list). Use{" "}
              <strong className="text-splice-navy-light dark:text-splice-sky">time between races</strong> when scheduling
              more than one pursuit on the same day.
            </p>
          </InfoHint>
        </div>

        <input type="hidden" name="default_race_type" value={raceType} />

        <div className="flex flex-wrap gap-2">
          {(["handicap", "level_rated", "pursuit"] as const).map((t) => (
            <button
              key={t}
              type="button"
              className={`${btnBase} ${raceType === t ? btnActive : btnInactive}`}
              aria-pressed={raceType === t}
              onClick={() => setRaceType(t)}
            >
              {raceTypeLabel(t)}
            </button>
          ))}
        </div>
      </div>

      <SeriesRaceGeneratorModeFields
        defaultMode={defaultMode}
        defaultStartsOn={defaultStartsOn}
        defaultEndsOn={defaultEndsOn}
        defaultFirstStartTimeHm={defaultFirstStartTimeHm}
        defaultRacePeriodicity={defaultRacePeriodicity}
        defaultRacesPerPeriod={defaultRacesPerPeriod}
        defaultMinutesBetweenRaces={defaultMinutesBetweenRaces}
        defaultStartSequence={defaultStartSequence}
        showStartSequence={!isPursuit}
        showPursuitFinishTime={isPursuit}
        defaultPursuitFinishTimeHm={defaultPursuitFinishTimeHm}
        showPursuitStartInterval={isPursuit}
        defaultPursuitStartIncrementSeconds={defaultPursuitStartIncrementSeconds}
        minutesBetweenRacesLabel={isPursuit ? "Time between races" : "Minutes between"}
        firstStartLabel={isPursuit ? "First boat start" : "First start time"}
      />

      {isPursuit ? (
        <>
          <label className="flex min-w-0 max-w-xs flex-col gap-1">
            <span className={fieldLabel}>Pursuit fleet</span>
            <select
              name="pursuit_template_fleet_id"
              defaultValue={defaultPursuitFleetId}
              required
              className={selectCls}
            >
              <option value="">Choose fleet…</option>
              {fleets.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
          {!fleets.length ? (
            <p className="text-sm text-amber-900 dark:text-amber-100">
              Define at least one club fleet before saving a pursuit generator.
            </p>
          ) : null}
        </>
      ) : (
        <>
          <input type="hidden" name="pursuit_template_fleet_id" value="" />
          <input type="hidden" name="pursuit_finish_time" value="" />
          <ApplicableClubFleetsFields
            fleets={fleets}
            groupId={groupId}
            defaultSelections={defaultFleetSelections}
          />
        </>
      )}
    </div>
  );
}
