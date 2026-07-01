"use client";

import { useMemo, useState } from "react";
import {
  fleetWindGridTimeBuckets,
  fleetWindGridToGeoJSON,
  type FleetWindGrid,
} from "@/lib/sailing-analysis/fleet-wind-grid";

export function useFleetWindGridDisplay(grid: FleetWindGrid | null | undefined) {
  const buckets = useMemo(() => (grid ? fleetWindGridTimeBuckets(grid) : []), [grid]);
  const [timeBucket, setTimeBucket] = useState<number | null>(null);
  const selectedBucket = timeBucket ?? buckets[0] ?? null;

  const windGridFC = useMemo(() => {
    if (!grid) return null;
    if (selectedBucket == null) return fleetWindGridToGeoJSON(grid);
    return fleetWindGridToGeoJSON(grid, { timeBucket: selectedBucket });
  }, [grid, selectedBucket]);

  return {
    buckets,
    selectedBucket,
    setTimeBucket,
    windGridFC,
    showTimeSlider: buckets.length > 0,
  };
}
