"use client";

import { raceStartSecAfterFirstGps } from "@/lib/sailing-analysis/race-start-from-schedule";
import type { FleetTrackOverlay } from "@/lib/sailing-analysis/load-race-fleet-tracks";
import type { StartFinishLineEnds } from "@/lib/sailing-analysis/analysis-types";
import { formatClubHmFromIso } from "@/lib/club-display-format";

export function useRoCourseSetup(
  raceStartUtcMs: number | null,
  fleetTracks: FleetTrackOverlay[],
  clubTz: string,
) {
  const raceStartUnixSec =
    raceStartUtcMs != null ? Math.round(raceStartUtcMs / 1000) : null;
  const previewTrack = fleetTracks[0]?.points ?? [];
  const firstGps = previewTrack.find((p) => p.time != null)?.time ?? previewTrack[0]?.time;
  const raceStartSec =
    raceStartUtcMs != null ? raceStartSecAfterFirstGps(raceStartUtcMs, firstGps ?? null) : 0;
  const raceStartLabel =
    raceStartUtcMs != null
      ? formatClubHmFromIso(new Date(raceStartUtcMs).toISOString(), clubTz)
      : null;

  return { raceStartUnixSec, raceStartSec, raceStartLabel, previewTrack };
}

export function buildRoCourseSetupJson(
  windwardMark: string,
  sfEnds: StartFinishLineEnds,
  raceStartUnixSec: number | null,
  raceStartSec: number,
) {
  return {
    cropStartSec: 0,
    cropDurationSec: 0,
    raceStartSec,
    windwardMark: windwardMark.trim() || null,
    sfLineEndA: sfEnds.endA,
    sfLineEndB: sfEnds.endB,
    ...(raceStartUnixSec != null ? { raceStartUnixSec } : {}),
  };
}
