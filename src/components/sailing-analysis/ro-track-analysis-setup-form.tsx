"use client";

import { useEffect, useState } from "react";
import {
  RoTrackAnalysisFleetPanel,
  type RaceFleetVm,
} from "@/components/sailing-analysis/ro-track-analysis-fleet-panel";
import {
  loadRaceFleetTracksAction,
} from "@/app/actions/race-track-analysis";
import type { SailingCourseRow, SailingMarkRow } from "@/lib/sailing-analysis/types";
import type { FleetCollatedCounts, FleetTrackOverlay } from "@/lib/sailing-analysis/load-race-fleet-tracks";
import type { RaceFleetAnalysisSettingsRow } from "@/lib/sailing-analysis/race-fleet-analysis-settings";
import {
  fleetAnalysisTone,
  fleetHasCourseSettings,
  fleetPillClass,
  fleetPillSuffix,
} from "@/lib/sailing-analysis/ro-fleet-analysis-status";

export function RoTrackAnalysisSetupForm({
  groupId,
  raceId,
  seriesId,
  courses,
  clubMarks,
  raceFleets,
  settingsByFleetId,
  fleetTracksByFleetId: initialFleetTracksByFleetId,
  collatedCountsByFleetId,
  raceStartByFleetId,
  initialFleetId,
}: {
  groupId: string;
  raceId: string;
  seriesId: string;
  courses: SailingCourseRow[];
  clubMarks: SailingMarkRow[];
  raceFleets: RaceFleetVm[];
  settingsByFleetId: Record<string, RaceFleetAnalysisSettingsRow | null>;
  fleetTracksByFleetId: Record<string, FleetTrackOverlay[]>;
  collatedCountsByFleetId: Record<string, FleetCollatedCounts>;
  raceStartByFleetId: Record<string, { unixSec: number | null; sec: number }>;
  initialFleetId?: string;
}) {

  const defaultFleetId =
    initialFleetId && raceFleets.some((f) => f.id === initialFleetId)
      ? initialFleetId
      : raceFleets[0]?.id ?? null;

  const [selectedFleetId, setSelectedFleetId] = useState<string | null>(defaultFleetId);
  const [fleetTracksByFleetId, setFleetTracksByFleetId] = useState(initialFleetTracksByFleetId);
  const [loadingFleetTracks, setLoadingFleetTracks] = useState(false);

  useEffect(() => {
    if (!selectedFleetId) return;

    let cancelled = false;
    setLoadingFleetTracks(true);
    void loadRaceFleetTracksAction(groupId, raceId, selectedFleetId)
      .then((tracks) => {
        if (cancelled) return;
        setFleetTracksByFleetId((prev) => ({ ...prev, [selectedFleetId]: tracks }));
        setLoadingFleetTracks(false);
      })
      .catch(() => {
        if (!cancelled) setLoadingFleetTracks(false);
      });

    return () => {
      cancelled = true;
    };
  }, [groupId, raceId, selectedFleetId]);

  const selectedFleet = raceFleets.find((f) => f.id === selectedFleetId) ?? null;

  if (raceFleets.length === 0) {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
        This race has no fleets configured. Add fleets on the race manage page before setting up collated track
        analysis.
      </p>
    );
  }

  const start = selectedFleetId ? raceStartByFleetId[selectedFleetId] : null;

  return (
    <div className="flex flex-col gap-8">
      <p className="text-sm text-splice-ocean dark:text-splice-water">
        Fleet pills show status: <span className="text-amber-700 dark:text-amber-300">amber</span> = no settings or
        tracks yet, <span className="text-red-700 dark:text-red-300">red</span> = tracks waiting for course settings,{" "}
        <span className="text-emerald-700 dark:text-emerald-300">green</span> = course saved (new uploads analyse
        automatically). Select a fleet, set course and laps, then click{" "}
        <strong className="font-medium text-splice-navy dark:text-splice-foam">Save &amp; analyse</strong> to refresh
        analysis on existing tracks.
      </p>

      <div className="flex flex-wrap gap-2">
        {raceFleets.map((f) => {
          const counts = collatedCountsByFleetId[f.id] ?? { pending: 0, ready: 0 };
          const hasSettings = fleetHasCourseSettings(settingsByFleetId[f.id]);
          const tone = fleetAnalysisTone(counts, hasSettings);
          const selected = selectedFleetId === f.id;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setSelectedFleetId(f.id)}
              className={fleetPillClass(tone, selected)}
            >
              {f.name}
              {fleetPillSuffix(counts, hasSettings)}
            </button>
          );
        })}
      </div>

      {selectedFleet && selectedFleetId ? (
        loadingFleetTracks ? (
          <p className="text-sm text-splice-ocean dark:text-splice-water">Loading fleet tracks…</p>
        ) : (
        <RoTrackAnalysisFleetPanel
          key={selectedFleetId}
          fleet={selectedFleet}
          groupId={groupId}
          raceId={raceId}
          seriesId={seriesId}
          courses={courses}
          clubMarks={clubMarks}
          fleetTracks={fleetTracksByFleetId[selectedFleetId] ?? []}
          raceStartUnixSec={start?.unixSec ?? null}
          raceStartSec={start?.sec ?? 0}
          savedSettings={settingsByFleetId[selectedFleetId] ?? null}
          collatedCounts={collatedCountsByFleetId[selectedFleetId] ?? { pending: 0, ready: 0 }}
        />
        )
      ) : null}
    </div>
  );
}
