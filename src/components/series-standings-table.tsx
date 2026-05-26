"use client";

import { useMemo, useState } from "react";
import type { StandingsTableRow } from "@/lib/scoring/build-series-standings";
import { FinishPositionDisplay } from "@/components/finish-position-display";
import { RaceResultsHelmCrewCell } from "@/components/race-results-helm-crew-cell";

export type SeriesStandingsDisplayRow = StandingsTableRow & {
  sailNumber: string;
  boatType: string;
  helm: string;
  crew: string;
};

export type SeriesStandingsFleetOption = {
  id: string;
  name: string;
};

function formatPts(n: number) {
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2);
}

export function SeriesStandingsTable({
  fleets,
  tableRowsByFleetId,
  standingsRaces,
}: {
  fleets: SeriesStandingsFleetOption[];
  tableRowsByFleetId: Record<string, SeriesStandingsDisplayRow[]>;
  standingsRaces: { id: string; name: string }[];
}) {
  const [fleetId, setFleetId] = useState(fleets[0]?.id ?? "");

  const rows = useMemo(
    () => (fleetId ? tableRowsByFleetId[fleetId] ?? [] : []),
    [fleetId, tableRowsByFleetId],
  );

  const selectedFleetName = fleets.find((f) => f.id === fleetId)?.name ?? "";

  if (!fleets.length) {
    return (
      <p className="mt-8 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
        No fleets are configured on races with recorded results yet.
      </p>
    );
  }

  return (
    <div className="mt-8 space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <label className="flex flex-col gap-1 text-sm font-medium text-splice-navy-light dark:text-splice-sky">
          Fleet
          <select
            value={fleetId}
            onChange={(e) => setFleetId(e.target.value)}
            className="min-w-[12rem] rounded-lg border border-splice-water bg-white px-3 py-2 text-sm font-normal text-splice-navy dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-foam"
          >
            {fleets.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
        {selectedFleetName ? (
          <p className="text-xs text-splice-blue dark:text-splice-water">
            Standings for <span className="font-medium text-splice-ocean dark:text-splice-water">{selectedFleetName}</span>{" "}
            — every boat with recorded results in this fleet.
          </p>
        ) : null}
      </div>

      {!rows.length ? (
        <p className="rounded-lg border border-splice-sky bg-white px-4 py-3 text-sm text-splice-ocean dark:border-splice-navy-light dark:bg-splice-navy dark:text-splice-water">
          No boats with recorded results in this fleet yet.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-splice-sky bg-white dark:border-splice-navy-light dark:bg-splice-navy">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-splice-sky bg-splice-surface dark:border-splice-navy-light dark:bg-splice-navy">
              <tr>
                <th className="w-10 px-3 py-2 text-center font-medium text-splice-ocean dark:text-splice-water">Rank</th>
                <th className="whitespace-nowrap px-3 py-2 font-medium text-splice-ocean dark:text-splice-water">
                  Sail
                </th>
                <th className="px-3 py-2 font-medium text-splice-ocean dark:text-splice-water">Boat</th>
                <th className="min-w-[120px] px-3 py-2 font-medium text-splice-ocean dark:text-splice-water">
                  Helm / crew
                </th>
                <th className="px-3 py-2 font-medium text-splice-ocean dark:text-splice-water">Net</th>
                <th className="px-3 py-2 font-medium text-splice-ocean dark:text-splice-water">Discards</th>
                {standingsRaces.map((r) => (
                  <th
                    key={r.id}
                    className="min-w-[72px] px-3 py-2 font-medium text-splice-ocean dark:text-splice-water"
                  >
                    <span className="block truncate" title={r.name}>
                      {r.name}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-splice-sky dark:divide-splice-navy-light">
              {rows.map((row) => (
                <tr key={row.boatId}>
                  <td className="w-10 px-3 py-2 text-center font-medium tabular-nums text-splice-navy dark:text-splice-foam">
                    <FinishPositionDisplay position={row.rank} />
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums text-splice-navy-light dark:text-splice-sky">
                    {row.sailNumber}
                  </td>
                  <td
                    className="max-w-[10rem] truncate px-3 py-2 text-splice-navy dark:text-splice-foam"
                    title={row.boatType}
                  >
                    {row.boatType}
                  </td>
                  <RaceResultsHelmCrewCell helmLine={row.helm} crewLine={row.crew} />
                  <td className="px-3 py-2 tabular-nums font-medium text-splice-navy dark:text-splice-foam">
                    {formatPts(row.netScore)}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-splice-ocean dark:text-splice-water">
                    {row.discardCount}
                  </td>
                  {row.racePoints.map((pts, ri) => (
                    <td
                      key={standingsRaces[ri]?.id ?? ri}
                      className="px-3 py-2 tabular-nums text-splice-ocean dark:text-splice-water"
                    >
                      {pts !== null ? formatPts(pts) : "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
