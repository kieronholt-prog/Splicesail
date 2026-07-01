"use client";

import {
  MAP_RND_BISECTOR_LINE,
  TRACK_LEG_SEGMENT_PALETTE,
  TRACK_LEG_SKIP_COLOR,
} from "@/lib/sailing-analysis";

const TRK = "#00d4aa";
const TRK_ROUND = "#ff9500";

export function MapSetupLegend() {
  return (
    <div className="rounded-xl border border-splice-sky bg-white p-3 dark:border-splice-ocean dark:bg-splice-navy">
      <p className="text-[10px] font-medium uppercase tracking-wide text-splice-ocean dark:text-splice-water">
        Map key
      </p>
      <div className="mt-2 space-y-1.5 text-xs text-splice-ocean dark:text-splice-water">
        <LegendLine color={TRK} label="GPS track (default leg window)" />
        <p className="pt-1 text-[10px] uppercase text-splice-blue/80">Leg segment colours (0–15)</p>
        <div className="flex flex-wrap gap-1">
          {TRACK_LEG_SEGMENT_PALETTE.map((col, i) => (
            <span key={i} className="inline-flex flex-col items-center gap-0.5" title={`Leg ${i}`}>
              <span className="h-1 w-5 rounded-sm" style={{ background: col }} />
              <span className="font-mono text-[7px] opacity-70">{i}</span>
            </span>
          ))}
        </div>
        <LegendLine color={TRACK_LEG_SKIP_COLOR} label="Skipped leg" dashed />
        <LegendLine color={TRK_ROUND} label="Mark-rounding band" />
        <LegendLine color="#94a3b8" label="Course connector" dashed />
        <LegendLine color="#ffffff" label="Start / finish line" />
        <LegendLine color={MAP_RND_BISECTOR_LINE} label="Rounding bisectors (when shown)" dashed />
        <p className="pt-1">
          <span className="inline-block h-2 w-4 rounded-sm bg-cyan-400/40 align-middle" /> Fleet wind grid (50 m · 5 min) ·{" "}
          <span className="text-white">↓</span> wind flow
        </p>
        <p className="pt-1">
          <span className="font-bold text-[#ff6b4a]">T</span> tack ·{" "}
          <span className="font-bold text-[#4adfff]">G</span> gybe ·{" "}
          <span className="text-[#ff4a6a]">P→S</span> / <span className="text-[#4aff8a]">S→P</span> crossing ·{" "}
          <span className="text-[#ff9500]">*</span> excluded at mark
        </p>
      </div>
    </div>
  );
}

function LegendLine({
  color,
  label,
  dashed,
}: {
  color: string;
  label: string;
  dashed?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="inline-block w-7 shrink-0 border-t-[3px]"
        style={{ borderColor: color, borderStyle: dashed ? "dashed" : "solid" }}
      />
      <span>{label}</span>
    </div>
  );
}
