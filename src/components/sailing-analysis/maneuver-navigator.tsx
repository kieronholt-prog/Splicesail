"use client";

import { useRef } from "react";
import type { AnalysisManoeuvre } from "@/lib/sailing-analysis/analysis-types";
import { ManeuverCard } from "@/components/sailing-analysis/maneuver-card";

const NAV_VIEWPORT_PX = 340;

export function ManeuverNavigator({
  title,
  items,
  kind,
}: {
  title: string;
  items: AnalysisManoeuvre[];
  kind: "tack" | "gybe";
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  if (!items.length) {
    return (
      <p className="text-sm text-splice-ocean dark:text-splice-water">
        No {kind === "tack" ? "tacks" : "gybes"} detected on this track.
      </p>
    );
  }

  const racing = items.filter((m) => !m.excludeFromStatsAndVMG);
  const avgQ =
    racing.length > 0
      ? Math.round(racing.reduce((s, m) => s + Number(m.q ?? 0), 0) / racing.length)
      : null;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-semibold text-splice-navy dark:text-splice-foam">{title}</h3>
        <p className="text-sm text-splice-ocean dark:text-splice-water">
          {items.length} total · {racing.length} racing
          {avgQ != null ? ` · avg quality ${avgQ}%` : ""}
        </p>
      </div>
      <div
        ref={scrollerRef}
        className="snap-y snap-mandatory overflow-y-auto rounded-xl border border-splice-sky dark:border-splice-ocean"
        style={{ maxHeight: NAV_VIEWPORT_PX }}
      >
        {items.map((m, i) => (
          <div key={`${kind}-${i}`} className="snap-start border-b border-splice-sky/60 last:border-b-0 dark:border-splice-ocean/60">
            <ManeuverCard m={m} index={i} embed />
          </div>
        ))}
      </div>
    </section>
  );
}
