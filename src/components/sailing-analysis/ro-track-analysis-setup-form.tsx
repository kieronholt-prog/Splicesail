"use client";

import { useEffect, useMemo, useState } from "react";
import {
  RoTrackAnalysisFleetPanel,
  type RaceFleetVm,
} from "@/components/sailing-analysis/ro-track-analysis-fleet-panel";
import {
  confirmAllRaceFleetAnalysisAction,
  loadRaceFleetTracksAction,
} from "@/app/actions/race-track-analysis";
import type { SailingCourseRow, SailingMarkRow } from "@/lib/sailing-analysis/types";
import type { FleetTrackOverlay } from "@/lib/sailing-analysis/load-race-fleet-tracks";
import type { RaceFleetAnalysisSettingsRow } from "@/lib/sailing-analysis/race-fleet-analysis-settings";

export function RoTrackAnalysisSetupForm({
  groupId,
  raceId,
  seriesId,
  courses,
  clubMarks,
  raceFleets,
  settingsByFleetId,
  fleetTracksByFleetId: initialFleetTracksByFleetId,
  pendingByFleetId,
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
  pendingByFleetId: Record<string, number>;
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

  const totalPending = useMemo(
    () => Object.values(pendingByFleetId).reduce((a, b) => a + b, 0),
    [pendingByFleetId],
  );

  const fleetsReadyForBulk = useMemo(() => {
    return raceFleets.filter((f) => {
      const pending = pendingByFleetId[f.id] ?? 0;
      if (pending === 0) return true;
      return Boolean(settingsByFleetId[f.id]?.course_letter);
    });
  }, [raceFleets, pendingByFleetId, settingsByFleetId]);

  const canAnalyseAll =
    totalPending > 0 &&
    raceFleets.every((f) => {
      const pending = pendingByFleetId[f.id] ?? 0;
      return pending === 0 || settingsByFleetId[f.id]?.course_letter;
    });

  const pillBase =
    "rounded-full px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap";
  const pillActive =
    "bg-splice-navy text-white dark:bg-splice-foam dark:text-splice-navy";
  const pillInactive =
    "border border-splice-water text-splice-navy hover:bg-splice-sky/30 dark:border-splice-ocean dark:text-splice-foam";

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
        Select a fleet below, set <strong className="font-medium text-splice-navy dark:text-splice-foam">course and laps</strong>
        , drag marks if needed, and <strong className="font-medium text-splice-navy dark:text-splice-foam">save</strong>{" "}
        — tracks are not required for saving. When collated uploads arrive, analyse each fleet (or all at once).
      </p>

      <div className="flex flex-wrap gap-2">
        {raceFleets.map((f) => {
          const pending = pendingByFleetId[f.id] ?? 0;
          const saved = Boolean(settingsByFleetId[f.id]?.course_letter);
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setSelectedFleetId(f.id)}
              className={`${pillBase} ${selectedFleetId === f.id ? pillActive : pillInactive}`}
            >
              {f.name}
              {pending > 0 ? ` (${pending})` : ""}
              {saved ? " ✓" : ""}
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
          pendingCount={pendingByFleetId[selectedFleetId] ?? 0}
        />
        )
      ) : null}

      {totalPending > 0 ? (
        <div className="border-t border-splice-sky pt-6 dark:border-splice-navy-light">
          <form action={confirmAllRaceFleetAnalysisAction}>
            <input type="hidden" name="group_id" value={groupId} />
            <input type="hidden" name="race_id" value={raceId} />
            <input type="hidden" name="series_id" value={seriesId} />
            <button
              type="submit"
              disabled={!canAnalyseAll}
              className="rounded-lg bg-splice-navy px-4 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 dark:bg-splice-foam dark:text-splice-navy"
            >
              Analyse all fleets ({totalPending} pending)
            </button>
            {!canAnalyseAll ? (
              <p className="mt-2 text-xs text-splice-ocean dark:text-splice-water">
                Save course settings for each fleet with pending tracks (
                {fleetsReadyForBulk.length}/{raceFleets.length} ready).
              </p>
            ) : null}
          </form>
        </div>
      ) : null}
    </div>
  );
}
