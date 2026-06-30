"use client";

import { useMemo } from "react";
import { TACK_COLOR } from "@/components/sailing-area-courses-section";
import {
  courseToDisplayEntries,
  expandAnalysisRoundingSequence,
} from "@/lib/sailing-analysis/course-rounding-sequence";
import { isLineMark, type SailingCourseRow, type SailingMarkRow } from "@/lib/sailing-analysis/types";

export function CourseRoundingSequenceSummary({
  course,
  laps,
  clubMarks,
}: {
  course: SailingCourseRow | null;
  laps: number;
  clubMarks: SailingMarkRow[];
}) {
  const byName = useMemo(() => new Map(clubMarks.map((m) => [m.name, m])), [clubMarks]);

  const analysisSteps = useMemo(
    () => expandAnalysisRoundingSequence(course, laps),
    [course, laps],
  );

  const displayEntries = useMemo(
    () => (course ? courseToDisplayEntries(course) : []),
    [course],
  );

  if (!course) {
    return (
      <p className="text-xs text-splice-ocean dark:text-splice-water">
        Choose a course letter to see the rounding order.
      </p>
    );
  }

  const nLaps = Math.max(1, Math.round(laps) || 1);
  const hasPreamble = analysisSteps.some((s) => s.firstLapOnly);

  function markColor(name: string, tack: "P" | "S"): string {
    const kind = byName.get(name)?.mark_kind;
    if (kind && isLineMark(kind)) return "#3b82f6";
    return TACK_COLOR[tack];
  }

  function markLabel(name: string, firstLapOnly: boolean): string {
    const kind = byName.get(name)?.mark_kind;
    const isLine = kind ? isLineMark(kind) : false;
    if (firstLapOnly && !isLine) return name.toLowerCase();
    return name;
  }

  const stepsByLap = new Map<number, typeof analysisSteps>();
  for (const step of analysisSteps) {
    const key = step.firstLapOnly ? 0 : step.lap;
    let list = stepsByLap.get(key);
    if (!list) {
      list = [];
      stepsByLap.set(key, list);
    }
    list.push(step);
  }

  return (
    <div className="rounded-lg border border-splice-sky/80 bg-splice-sky/10 px-3 py-3 dark:border-splice-ocean dark:bg-splice-navy-light/30">
      <p className="text-sm font-medium text-splice-navy dark:text-splice-foam">
        Rounding order for analysis
        {nLaps > 1 ? ` · ${nLaps} laps` : ""}
      </p>
      <p className="mt-1 text-xs text-splice-ocean dark:text-splice-water">
        Leg detection uses this sequence: preamble once, then the full course mark list each lap.
        Port = red, starboard = green, lines = blue. Lowercase = first lap only (course builder view).
      </p>

      <div className="mt-3 space-y-3">
        {hasPreamble && stepsByLap.get(0)?.length ? (
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-splice-ocean dark:text-splice-water">
              First lap only
            </p>
            <MarkFlow
              steps={stepsByLap.get(0)!}
              markColor={markColor}
              markLabel={(name) => markLabel(name, true)}
            />
          </div>
        ) : null}

        {Array.from({ length: nLaps }, (_, i) => i + 1).map((lapN) => {
          const steps = stepsByLap.get(lapN);
          if (!steps?.length) return null;
          return (
            <div key={lapN}>
              <p className="text-xs font-medium uppercase tracking-wide text-splice-ocean dark:text-splice-water">
                Lap {lapN}
                {nLaps > 1 ? ` of ${nLaps}` : ""}
              </p>
              <MarkFlow
                steps={steps}
                markColor={markColor}
                markLabel={(name) => markLabel(name, false)}
              />
            </div>
          );
        })}
      </div>

      {displayEntries.length > 0 ? (
        <div className="mt-4 border-t border-splice-sky/50 pt-3 dark:border-splice-ocean">
          <p className="text-xs font-medium text-splice-ocean dark:text-splice-water">
            Course builder order (single lap)
          </p>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-1 gap-y-0.5">
            {displayEntries.map((e, i) => (
              <span
                key={`${e.name}-${i}`}
                className="whitespace-nowrap text-xs font-medium"
                style={{ color: markColor(e.name, e.tack) }}
                title={e.firstLapOnly ? "1st lap only" : undefined}
              >
                {markLabel(e.name, e.firstLapOnly)}
                {i < displayEntries.length - 1 ? (
                  <span className="mx-0.5 text-splice-water dark:text-splice-ocean"> →</span>
                ) : null}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MarkFlow({
  steps,
  markColor,
  markLabel,
}: {
  steps: { name: string; tack: "P" | "S" }[];
  markColor: (name: string, tack: "P" | "S") => string;
  markLabel: (name: string) => string;
}) {
  return (
    <div className="mt-1 flex flex-wrap items-baseline gap-x-1 gap-y-0.5">
      {steps.map((step, i) => (
        <span
          key={`${step.name}-${step.tack}-${i}`}
          className="whitespace-nowrap text-xs font-medium"
          style={{ color: markColor(step.name, step.tack) }}
          title={step.tack === "P" ? "Port rounding" : "Starboard rounding"}
        >
          {markLabel(step.name)}
          <span className="ml-0.5 text-[10px] font-normal opacity-70">
            ({step.tack === "P" ? "P" : "S"})
          </span>
          {i < steps.length - 1 ? (
            <span className="mx-0.5 text-splice-water dark:text-splice-ocean"> →</span>
          ) : null}
        </span>
      ))}
    </div>
  );
}
