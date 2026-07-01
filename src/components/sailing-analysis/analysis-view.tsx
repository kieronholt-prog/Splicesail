"use client";

import { useMemo, useState } from "react";
import {
  AnalysisLegsTable,
  AnalysisResultsSummary,
} from "@/components/sailing-analysis/analysis-results-summary";
import { SpeedTimelineChart, VmgOverlayChart } from "@/components/sailing-analysis/analysis-charts";
import { CourseAnalysisMap } from "@/components/sailing-analysis/course-analysis-map";
import { ManeuverNavigator } from "@/components/sailing-analysis/maneuver-navigator";
import { UpwindByTackPanel } from "@/components/sailing-analysis/upwind-by-tack-panel";
import { WindRose } from "@/components/sailing-analysis/wind-rose";
import type { AnalysisSnapshot, StartFinishLineEnds } from "@/lib/sailing-analysis/analysis-types";
import type { MapMarkDisplay } from "@/lib/sailing-analysis/map-display";

type Tab = "overview" | "map" | "manoeuvres" | "legs" | "speed";

export function AnalysisView({
  snapshot,
  stats,
  windDirection,
  mapMarks,
  courseLine = [],
  startFinishLine,
  legGatesFC,
  showMarkGates = false,
  windOverride,
  onWindOverrideChange,
  editableWind = false,
}: {
  snapshot: AnalysisSnapshot;
  stats: Record<string, unknown>;
  windDirection?: number | null;
  mapMarks?: Record<string, MapMarkDisplay>;
  courseLine?: { lat: number; lon: number }[];
  startFinishLine?: StartFinishLineEnds | null;
  legGatesFC?: GeoJSON.FeatureCollection | { type: string; features: unknown[] } | null;
  showMarkGates?: boolean;
  windOverride?: number | null;
  onWindOverrideChange?: (deg: number) => void;
  editableWind?: boolean;
}) {
  const [tab, setTab] = useState<Tab>("map");

  const legs = (snapshot.legs ?? []) as Record<string, unknown>[];
  const tacks = snapshot.tacks ?? [];
  const gybes = snapshot.gybes ?? [];
  const points = snapshot.points ?? [];
  const effWind = windOverride ?? windDirection ?? snapshot.windDir ?? 0;

  const speedTL = (snapshot.speedTL ?? []) as { time: number; speed: number; cog?: number }[];
  const windTrace = (snapshot.windTrace ?? []) as { time: number; dir: number }[];
  const t0 = points[0]?.time ?? 0;

  const tabs: { id: Tab; label: string }[] = [
    { id: "map", label: "Map" },
    { id: "manoeuvres", label: "Manoeuvres" },
    { id: "legs", label: "Legs" },
    { id: "speed", label: "Speed" },
    { id: "overview", label: "Overview" },
  ];

  const racingTacks = useMemo(() => tacks.filter((t) => !t.excludeFromStatsAndVMG), [tacks]);
  const racingGybes = useMemo(() => gybes.filter((g) => !g.excludeFromStatsAndVMG), [gybes]);

  return (
    <div className="flex flex-col gap-6">
      <nav className="flex flex-wrap gap-2 border-b border-splice-sky pb-3 dark:border-splice-ocean">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              tab === t.id
                ? "bg-splice-navy text-white dark:bg-splice-foam dark:text-splice-navy"
                : "text-splice-ocean hover:bg-splice-surface dark:text-splice-water dark:hover:bg-splice-navy-light"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "overview" ? (
        <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
          <div className="flex flex-col gap-6">
            <AnalysisResultsSummary
              stats={stats as never}
              windDirection={effWind}
              startLine={snapshot.startLine ?? (stats.startLine as never) ?? null}
            />
            {snapshot.upwindByTack ? (
              <UpwindByTackPanel upwindByTack={snapshot.upwindByTack as Record<string, unknown>} windDeg={effWind} />
            ) : null}
          </div>
          <WindRose
            windDeg={Math.round(effWind)}
            onChange={editableWind && onWindOverrideChange ? onWindOverrideChange : undefined}
            compact
            hint={
              editableWind
                ? "Adjust wind for VMG overlays. Re-run analysis to apply to scoring."
                : undefined
            }
          />
        </div>
      ) : null}

      {tab === "map" ? (
        <CourseAnalysisMap
          marks={mapMarks ?? {}}
          trackPoints={points}
          courseLine={courseLine}
          draggableAllMarks={false}
          startFinishLine={startFinishLine ?? null}
          trackSegmentFC={snapshot.trackSegmentFC ?? null}
          legGatesFC={legGatesFC ?? null}
          showMarkGates={showMarkGates}
          manoeuvres={{ tacks, gybes }}
          showLegend
        />
      ) : null}

      {tab === "manoeuvres" ? (
        <div className="flex flex-col gap-8">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-splice-sky p-3 dark:border-splice-ocean">
              <p className="text-xs uppercase text-splice-ocean">Avg tack quality</p>
              <p className="font-mono text-2xl font-bold text-[#ff6b4a]">
                {racingTacks.length
                  ? `${Math.round(racingTacks.reduce((s, t) => s + Number(t.q ?? 0), 0) / racingTacks.length)}%`
                  : "—"}
              </p>
            </div>
            <div className="rounded-lg border border-splice-sky p-3 dark:border-splice-ocean">
              <p className="text-xs uppercase text-splice-ocean">Avg gybe quality</p>
              <p className="font-mono text-2xl font-bold text-[#4adfff]">
                {racingGybes.length
                  ? `${Math.round(racingGybes.reduce((s, g) => s + Number(g.q ?? 0), 0) / racingGybes.length)}%`
                  : "—"}
              </p>
            </div>
          </div>
          <VmgOverlayChart points={points} manoeuvres={tacks} windDeg={effWind} title="All tacks — VMG overlay" />
          <VmgOverlayChart points={points} manoeuvres={gybes} windDeg={effWind} title="All gybes — VMG overlay" />
          <ManeuverNavigator title="Tack navigator" items={tacks} kind="tack" />
          <ManeuverNavigator title="Gybe navigator" items={gybes} kind="gybe" />
        </div>
      ) : null}

      {tab === "legs" ? (
        <section>
          <h3 className="mb-3 text-base font-semibold text-splice-navy dark:text-splice-foam">Leg analysis</h3>
          <AnalysisLegsTable legs={legs} detailed />
        </section>
      ) : null}

      {tab === "speed" ? (
        <SpeedTimelineChart speedTL={speedTL} windTrace={windTrace} t0={t0 ?? undefined} windDir={effWind} />
      ) : null}
    </div>
  );
}
