"use client";

import { useMemo } from "react";
import { TACK_COLOR } from "@/components/sailing-area-courses-section";
import {
  courseToEntries,
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
  const kindByName = useMemo(
    () => new Map(clubMarks.map((m) => [m.name, m.mark_kind])),
    [clubMarks],
  );

  const analysisSteps = useMemo(
    () => expandAnalysisRoundingSequence(course, laps, kindByName),
    [course, laps, kindByName],
  );

  const displayEntries = useMemo(
    () => (course ? courseToEntries(course, kindByName) : []),
    [course, kindByName],
  );

  if (!course) {
    return (
      <p className="text-xs text-splice-ocean dark:text-splice-water">
        Choose a course letter to see the rounding order.
      </p>
    );
  }

  const nLaps = Math.max(1, Math.round(laps) || 1);
  const prefixSteps = analysisSteps.filter((s) => s.lap === 0);
  const suffixSteps = analysisSteps.filter((s) => s.lap === nLaps + 1);

  function markColor(name: string, tack: "P" | "S"): string {
    const kind = kindByName.get(name);
    if (kind && isLineMark(kind)) return "#3b82f6";
    return TACK_COLOR[tack];
  }

  const stepsByLap = new Map<number, typeof analysisSteps>();
  for (const step of analysisSteps) {
    if (step.lap === 0 || step.lap === nLaps + 1) continue;
    let list = stepsByLap.get(step.lap);
    if (!list) {
      list = [];
      stepsByLap.set(step.lap, list);
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
        Prefix and finish marks run once; marks with &ldquo;Part of lap&rdquo; repeat each lap.
        Port = red, starboard = green, lines = blue.
      </p>

      <div className="mt-3 space-y-3">
        {prefixSteps.length > 0 ? (
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-splice-ocean dark:text-splice-water">
              Start sequence (once)
            </p>
            <MarkFlow steps={prefixSteps} markColor={markColor} />
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
              <MarkFlow steps={steps} markColor={markColor} />
            </div>
          );
        })}

        {suffixSteps.length > 0 ? (
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-splice-ocean dark:text-splice-water">
              Finish (once)
            </p>
            <MarkFlow steps={suffixSteps} markColor={markColor} />
          </div>
        ) : null}
      </div>

      {displayEntries.length > 0 ? (
        <div className="mt-4 border-t border-splice-sky/50 pt-3 dark:border-splice-ocean">
          <p className="text-xs font-medium text-splice-ocean dark:text-splice-water">
            Course builder order
          </p>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-1 gap-y-0.5">
            {displayEntries.map((e, i) => (
              <span
                key={`${e.name}-${i}`}
                className="whitespace-nowrap text-xs font-medium"
                style={{ color: markColor(e.name, e.tack), opacity: e.partOfLap ? 1 : 0.75 }}
                title={e.partOfLap ? "Part of each lap" : "Once per race"}
              >
                {e.name}
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
}: {
  steps: { name: string; tack: "P" | "S" }[];
  markColor: (name: string, tack: "P" | "S") => string;
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
          {step.name}
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
