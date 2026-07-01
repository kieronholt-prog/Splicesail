"use client";

import { useMemo } from "react";
import type { FleetWindGrid } from "@/lib/sailing-analysis/fleet-wind-grid";
import { fleetWindGridTimeBuckets } from "@/lib/sailing-analysis/fleet-wind-grid";

function formatMinSec(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function formatWindGridBucketLabel(
  bucket: number,
  bucketSec: number,
  raceStartUnixSec?: number | null,
): string {
  if (raceStartUnixSec != null && Number.isFinite(raceStartUnixSec)) {
    const elapsed = bucket - raceStartUnixSec;
    const end = elapsed + bucketSec;
    return `T+${formatMinSec(elapsed)} – T+${formatMinSec(end)}`;
  }
  const start = new Date(bucket * 1000);
  const end = new Date((bucket + bucketSec) * 1000);
  const fmt = (d: Date) =>
    d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return `${fmt(start)} – ${fmt(end)}`;
}

export function WindGridTimeSlider({
  grid,
  value,
  onChange,
  raceStartUnixSec,
}: {
  grid: FleetWindGrid;
  value: number;
  onChange: (bucket: number) => void;
  raceStartUnixSec?: number | null;
}) {
  const buckets = useMemo(() => fleetWindGridTimeBuckets(grid), [grid]);
  const bucketSec = grid.timeBucketSec ?? 300;
  const sliderIdx = Math.max(0, buckets.indexOf(value));

  if (buckets.length <= 1) {
    if (buckets.length === 1) {
      return (
        <p className="text-xs text-splice-ocean dark:text-splice-water">
          Wind period: {formatWindGridBucketLabel(buckets[0]!, bucketSec, raceStartUnixSec)}
        </p>
      );
    }
    return null;
  }

  return (
    <div className="flex min-w-[200px] flex-1 flex-col gap-1">
      <label className="text-sm text-splice-ocean dark:text-splice-water">
        Wind period:{" "}
        <span className="font-medium text-splice-navy dark:text-splice-foam">
          {formatWindGridBucketLabel(buckets[sliderIdx]!, bucketSec, raceStartUnixSec)}
        </span>
      </label>
      <input
        type="range"
        min={0}
        max={buckets.length - 1}
        step={1}
        value={sliderIdx}
        onChange={(e) => onChange(buckets[Number(e.target.value)]!)}
        className="w-full accent-splice-navy dark:accent-splice-foam"
        aria-label="Wind grid time period"
      />
      <div className="flex justify-between text-[10px] uppercase tracking-wide text-splice-ocean dark:text-splice-water">
        <span>Race start</span>
        <span>Later</span>
      </div>
    </div>
  );
}
