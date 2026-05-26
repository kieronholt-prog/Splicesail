"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { PublicRaceResultsTable } from "@/components/public-race-results-table";
import type { PublicClubResultsPayload } from "@/lib/public-club-results";
import { filterPublicRaceResultSections } from "@/lib/race-results-display";
import { FinishPositionDisplay } from "@/components/finish-position-display";
import { RaceResultsHelmCrewCell } from "@/components/race-results-helm-crew-cell";

function formatPts(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2);
}

export function PublicClubResultsView({
  slug,
  payload,
}: {
  slug: string;
  payload: PublicClubResultsPayload;
}) {
  const router = useRouter();
  const [fleetId, setFleetId] = useState(payload.fleets[0]?.id ?? "");

  useEffect(() => {
    setFleetId((current) =>
      payload.fleets.some((f) => f.id === current) ? current : (payload.fleets[0]?.id ?? ""),
    );
  }, [payload.selectedSeriesId, payload.fleets]);

  const seriesRows = useMemo(
    () => (fleetId ? payload.seriesTableByFleetId[fleetId] ?? [] : []),
    [fleetId, payload.seriesTableByFleetId],
  );

  const raceFilterFleetId = fleetId || null;

  function onSeriesChange(nextSeriesId: string) {
    const params = new URLSearchParams();
    params.set("series", nextSeriesId);
    router.push(`/results/${encodeURIComponent(slug)}?${params.toString()}`);
  }

  const hasRaceResults = payload.raceSections.some((race) =>
    filterPublicRaceResultSections(race.fleetSections, raceFilterFleetId).some((s) => s.rows.length),
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <label className="flex flex-col gap-1 text-sm font-medium text-splice-navy-light dark:text-splice-sky">
          Series
          <select
            value={payload.selectedSeriesId}
            onChange={(e) => onSeriesChange(e.target.value)}
            className="min-w-[14rem] rounded-lg border border-splice-water bg-white px-3 py-2 text-sm font-normal text-splice-navy dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-foam"
          >
            {payload.seriesOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-splice-navy-light dark:text-splice-sky">
          Fleet
          <select
            value={fleetId}
            onChange={(e) => setFleetId(e.target.value)}
            className="min-w-[12rem] rounded-lg border border-splice-water bg-white px-3 py-2 text-sm font-normal text-splice-navy dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-foam"
          >
            {payload.fleets.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <section>
        <h2 className="text-lg font-semibold text-splice-navy dark:text-splice-surface">
          {payload.selectedSeriesName} — series standings
        </h2>
        {!seriesRows.length ? (
          <p className="mt-3 text-sm text-splice-ocean dark:text-splice-water">
            No boats with results in this fleet yet.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-xl border border-splice-sky bg-white dark:border-splice-navy-light dark:bg-splice-navy">
            <table className="w-full min-w-max text-left text-sm">
              <thead className="border-b border-splice-sky bg-splice-surface dark:border-splice-navy-light dark:bg-splice-navy">
                <tr>
                  <th className="w-10 px-2 py-1.5 text-center font-medium text-splice-ocean dark:text-splice-water">
                    Pos
                  </th>
                  <th className="whitespace-nowrap px-2 py-1.5 font-medium text-splice-ocean dark:text-splice-water">
                    Sail
                  </th>
                  <th className="max-w-[7.5rem] px-2 py-1.5 font-medium text-splice-ocean dark:text-splice-water">
                    Boat
                  </th>
                  <th className="max-w-[6.5rem] px-2 py-1.5 font-medium text-splice-ocean dark:text-splice-water">
                    Helm / crew
                  </th>
                  {payload.standingsRaces.map((r, i) => (
                    <th
                      key={r.id}
                      className="w-10 px-1 py-1.5 text-center font-medium text-splice-ocean dark:text-splice-water"
                      title={r.name}
                    >
                      R{i + 1}
                    </th>
                  ))}
                  <th className="w-12 px-2 py-1.5 text-right font-medium text-splice-ocean dark:text-splice-water">
                    Net
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-splice-sky dark:divide-splice-navy-light">
                {seriesRows.map((row) => (
                  <tr key={row.boatId}>
                    <td className="w-10 px-2 py-1.5 text-center font-medium tabular-nums text-splice-navy dark:text-splice-foam">
                      <FinishPositionDisplay position={row.rank > 0 ? row.rank : "—"} />
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 tabular-nums text-splice-navy-light dark:text-splice-sky">
                      {row.sailNumber}
                    </td>
                    <td
                      className="max-w-[7.5rem] truncate px-2 py-1.5 text-splice-ocean dark:text-splice-water"
                      title={row.boatType}
                    >
                      {row.boatType}
                    </td>
                    <RaceResultsHelmCrewCell helmLine={row.helm} crewLine={row.crew} compact />
                    {row.racePoints.map((pts, ri) => (
                      <td
                        key={payload.standingsRaces[ri]?.id ?? ri}
                        className="w-10 px-1 py-1.5 text-center tabular-nums text-splice-ocean dark:text-splice-water"
                      >
                        {pts ?? "—"}
                      </td>
                    ))}
                    <td className="w-12 px-2 py-1.5 text-right font-medium tabular-nums text-splice-navy dark:text-splice-foam">
                      {row.netScore > 0 ? formatPts(row.netScore) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="border-t border-splice-sky pt-6 dark:border-splice-navy-light">
        <h2 className="text-lg font-semibold text-splice-navy dark:text-splice-surface">Race results</h2>
        <div className="mt-4 flex flex-col gap-6">
          {payload.raceSections.map((race) => {
            const visibleSections = filterPublicRaceResultSections(
              race.fleetSections,
              raceFilterFleetId,
            );
            if (!visibleSections.some((s) => s.rows.length)) return null;
            return <PublicRaceResultsTable key={race.raceId} results={race} filterFleetId={raceFilterFleetId} />;
          })}
        </div>
        {!hasRaceResults ? (
          <p className="mt-3 text-sm text-splice-ocean dark:text-splice-water">No race results for this fleet.</p>
        ) : null}
      </section>
    </div>
  );
}
