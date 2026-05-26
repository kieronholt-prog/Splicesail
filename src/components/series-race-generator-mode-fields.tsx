"use client";

import { useState } from "react";

import type { ScheduleGenerationMode } from "@/lib/schedule-generation-mode";
import { InfoHint } from "@/components/ui/info-hint";

type Props = {
  defaultMode: ScheduleGenerationMode;
  defaultStartsOn: string;
  defaultEndsOn: string;
  defaultFirstStartTimeHm: string;
  defaultRacePeriodicity: string;
  defaultRacesPerPeriod: number | "";
  defaultMinutesBetweenRaces: number | "";
  defaultStartSequence: string;
  /** Handicap / level rated only */
  showStartSequence?: boolean;
  /** Pursuit only */
  showPursuitFinishTime?: boolean;
  defaultPursuitFinishTimeHm?: string;
  showPursuitStartInterval?: boolean;
  defaultPursuitStartIncrementSeconds?: number | "";
  /** Pursuit: "Time between races" instead of "Minutes between" */
  minutesBetweenRacesLabel?: string;
  firstStartLabel?: string;
};

export function SeriesRaceGeneratorModeFields({
  defaultMode,
  defaultStartsOn,
  defaultEndsOn,
  defaultFirstStartTimeHm,
  defaultRacePeriodicity,
  defaultRacesPerPeriod,
  defaultMinutesBetweenRaces,
  defaultStartSequence,
  showStartSequence = true,
  showPursuitFinishTime = false,
  defaultPursuitFinishTimeHm = "",
  showPursuitStartInterval = false,
  defaultPursuitStartIncrementSeconds = 60,
  minutesBetweenRacesLabel = "Minutes between",
  firstStartLabel = "First start time",
}: Props) {
  const [mode, setMode] = useState<ScheduleGenerationMode>(defaultMode);

  const btnBase =
    "rounded-md px-2.5 py-1.5 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-splice-blue";
  const btnInactive =
    "border border-splice-water bg-white text-splice-navy-light hover:bg-splice-surface dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-foam dark:hover:bg-splice-navy";
  const btnActive = "bg-splice-navy text-white dark:bg-splice-foam dark:text-splice-navy";

  const fieldLabel = "text-[11px] font-medium uppercase tracking-wide text-splice-ocean dark:text-splice-water";
  const inputCls =
    "rounded-lg border border-splice-water bg-white px-2.5 py-1.5 text-sm text-splice-navy dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-foam";
  const narrowInput =
    "min-w-0 w-full max-w-[5.5rem] rounded-lg border border-splice-water bg-white px-1.5 py-1.5 text-sm text-splice-navy dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-foam";
  const narrowSelect =
    "min-w-0 w-full max-w-[6.75rem] rounded-lg border border-splice-water bg-white px-1.5 py-1.5 text-sm text-splice-navy dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-foam";
  const sequenceSelect =
    "min-w-0 w-full max-w-[9.5rem] rounded-lg border border-splice-water bg-white px-1.5 py-1.5 text-sm text-splice-navy dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-foam";

  const isDateRange = mode === "date_range";

  return (
    <div className="flex flex-col gap-3">
      <input type="hidden" name="schedule_generation_mode" value={mode} />

      <div className="flex flex-wrap items-center gap-2">
        <span className={fieldLabel}>Schedule</span>
        <InfoHint label="About schedule type">
          <p>
            <strong className="text-splice-navy-light dark:text-splice-sky">Single day</strong> uses season start only (no end
            date). Use <strong className="text-splice-navy-light dark:text-splice-sky">races on day</strong> and{" "}
            <strong className="text-splice-navy-light dark:text-splice-sky">minutes between</strong> for more than one start on that
            date. <strong className="text-splice-navy-light dark:text-splice-sky">Date range</strong> adds periodicity and repeats
            race days through season end.
          </p>
        </InfoHint>
        <div className="ml-auto flex flex-wrap gap-2 sm:ml-2">
          <button
            type="button"
            className={`${btnBase} ${mode === "single_day" ? btnActive : btnInactive}`}
            aria-pressed={mode === "single_day"}
            onClick={() => setMode("single_day")}
          >
            Single day
          </button>
          <button
            type="button"
            className={`${btnBase} ${isDateRange ? btnActive : btnInactive}`}
            aria-pressed={isDateRange}
            onClick={() => setMode("date_range")}
          >
            Date range
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:items-end">
        <label className="flex min-w-0 flex-col gap-1 sm:col-span-1">
          <span className="flex items-center gap-1.5">
            <span className={fieldLabel}>Season start</span>
            <InfoHint label="About dates and start time">
              <p>
                Season boundaries are date-only. <strong className="text-splice-navy-light dark:text-splice-sky">Start time</strong>{" "}
                uses the club&apos;s local wall clock (Club admin settings), including daylight saving when it applies.
                On <strong className="text-splice-navy-light dark:text-splice-sky">date range</strong>, the same start time applies
                on each generated race day.
              </p>
            </InfoHint>
          </span>
          <input name="starts_on" type="date" defaultValue={defaultStartsOn} className={inputCls} />
        </label>
        {isDateRange ? (
          <label className="flex min-w-0 flex-col gap-1">
            <span className={fieldLabel}>Season end</span>
            <input name="ends_on" type="date" defaultValue={defaultEndsOn} className={inputCls} />
          </label>
        ) : (
          <div className="hidden min-h-[2.75rem] sm:block" aria-hidden="true" />
        )}
        <label className="flex min-w-0 flex-col gap-1">
          <span className={fieldLabel}>{firstStartLabel}</span>
          <input
            name="schedule_first_start_time"
            type="time"
            defaultValue={defaultFirstStartTimeHm}
            required
            className={`${inputCls} sm:max-w-[9rem]`}
          />
        </label>
        {showPursuitFinishTime ? (
          <label className="flex min-w-0 flex-col gap-1 sm:col-span-1">
            <span className="flex items-center gap-1.5">
              <span className={fieldLabel}>Finish time</span>
              <InfoHint label="About pursuit finish time">
                <p>
                  Target line time on each race day (club wall clock). Used with first boat start to calculate class
                  stagger when races are created.
                </p>
              </InfoHint>
            </span>
            <input
              name="pursuit_finish_time"
              type="time"
              defaultValue={defaultPursuitFinishTimeHm}
              required
              className={`${inputCls} sm:max-w-[9rem]`}
            />
          </label>
        ) : null}
      </div>

      <div
        className={`grid gap-2 min-[520px]:items-end ${
          isDateRange
            ? showStartSequence
              ? "grid-cols-2 min-[520px]:grid-cols-4"
              : showPursuitStartInterval
                ? "grid-cols-2 min-[520px]:grid-cols-4"
                : "grid-cols-2 min-[520px]:grid-cols-3"
            : showStartSequence
              ? "grid-cols-1 min-[520px]:grid-cols-3"
              : showPursuitStartInterval
                ? "grid-cols-1 min-[520px]:grid-cols-3"
                : "grid-cols-1 min-[520px]:grid-cols-2"
        }`}
      >
        {isDateRange ? (
          <label className="flex min-w-0 flex-col gap-1">
            <span className="flex items-center gap-1.5">
              <span className={fieldLabel}>Periodicity</span>
              <InfoHint label="About periodicity and races per period">
                <p className="mb-2">
                  How often race days repeat (daily / weekly / monthly from the first anchor date).
                </p>
                <p className="mb-2">
                  <strong className="text-splice-navy-light dark:text-splice-sky">Races / period</strong> is how many races on each
                  of those days (1–20).
                </p>
                <p>
                  <strong className="text-splice-navy-light dark:text-splice-sky">Minutes between races</strong> applies when there
                  is more than one race on the same day.
                </p>
              </InfoHint>
            </span>
            <select name="race_periodicity" defaultValue={defaultRacePeriodicity} className={narrowSelect}>
              <option value="">Choose…</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </label>
        ) : null}
        <label className="flex min-w-0 flex-col gap-1">
          <span className="flex items-center gap-1.5">
            <span className={fieldLabel}>{isDateRange ? "Races / period" : "Races on day"}</span>
            <InfoHint
              label={isDateRange ? "About races per period" : "About multiple starts on one day"}
            >
              {isDateRange ? (
                <p>How many races on each scheduled race day (1–20). Minutes between applies when this is more than 1.</p>
              ) : (
                <p>
                  How many races on the season start date (1–20). Use <strong className="text-splice-navy-light dark:text-splice-sky">
                    minutes between
                  </strong>{" "}
                  when this is more than 1.
                </p>
              )}
            </InfoHint>
          </span>
          <input
            name="races_per_period"
            type="number"
            min={1}
            max={20}
            defaultValue={defaultRacesPerPeriod}
            placeholder="1–20"
            className={narrowInput}
          />
        </label>
        <label className="flex min-w-0 flex-col gap-1">
          <span className="flex items-center gap-1.5">
            <span className={fieldLabel}>{minutesBetweenRacesLabel}</span>
            {minutesBetweenRacesLabel === "Time between races" ? (
              <InfoHint label="About time between races">
                <p>
                  When there is more than one race on the same day, this is the gap from the{" "}
                  <strong className="text-splice-navy-light dark:text-splice-sky">start</strong> of one race to the{" "}
                  <strong className="text-splice-navy-light dark:text-splice-sky">start</strong> of the next — not
                  class stagger within a pursuit race.
                </p>
              </InfoHint>
            ) : null}
          </span>
          <input
            name="minutes_between_races"
            type="number"
            min={1}
            max={1440}
            defaultValue={defaultMinutesBetweenRaces}
            placeholder="e.g. 30"
            className={narrowInput}
          />
        </label>
        {showPursuitStartInterval ? (
          <label className="flex min-w-0 flex-col gap-1">
            <span className="flex items-center gap-1.5">
              <span className={fieldLabel}>Pursuit start interval</span>
              <InfoHint label="About pursuit start interval">
                <p>
                  Class start times within each pursuit race are rounded to this grid (from PY and finish time).
                  This is separate from <strong className="text-splice-navy-light dark:text-splice-sky">time between races</strong>{" "}
                  when you schedule more than one pursuit on the same day.
                </p>
              </InfoHint>
            </span>
            <select
              name="pursuit_template_start_increment_seconds"
              required
              defaultValue={String(defaultPursuitStartIncrementSeconds || 60)}
              className={narrowSelect}
            >
              <option value="30">30 seconds</option>
              <option value="60">1 minute</option>
              <option value="120">2 minutes</option>
            </select>
          </label>
        ) : (
          <input type="hidden" name="pursuit_template_start_increment_seconds" value="" />
        )}
        {showStartSequence ? (
          <label className="flex min-w-0 flex-col gap-1">
            <span className="flex items-center gap-1.5">
              <span className={fieldLabel}>Start sequence</span>
              <InfoHint label="About start sequence">
                <p>Horn sequence ends at the scheduled start time. Applies to all races in this series.</p>
              </InfoHint>
            </span>
            <select name="start_sequence" defaultValue={defaultStartSequence} className={sequenceSelect}>
              <option value="10_5_1_go">10, 5, 1, Go</option>
              <option value="5_4_1_go">5, 4, 1, Go</option>
              <option value="3_2_1_go">3, 2, 1, Go</option>
            </select>
          </label>
        ) : (
          <input type="hidden" name="start_sequence" value={defaultStartSequence} />
        )}
      </div>
    </div>
  );
}
