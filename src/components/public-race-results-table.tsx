import { formatClubDdMmmYyyyFromIso } from "@/lib/club-display-format";
import {
  filterPublicRaceResultSections,
  type RaceResultsDisplay,
} from "@/lib/race-results-display";
import { InfoHint } from "@/components/ui/info-hint";
import { raceTypeLabel } from "@/lib/race-type";
import { FinishPositionDisplay } from "@/components/finish-position-display";
import { RaceResultsHelmCrewCell } from "@/components/race-results-helm-crew-cell";

function ResultsTableBody({
  rows,
  pursuitRace,
}: {
  rows: RaceResultsDisplay["fleetSections"][number]["rows"];
  pursuitRace: boolean;
}) {
  return (
    <tbody className="divide-y divide-splice-foam dark:divide-splice-navy-light">
      {rows.map((row) => (
        <tr key={row.entryId} className="bg-white dark:bg-splice-navy">
          <td className="w-10 px-2 py-1.5 text-center font-medium tabular-nums text-splice-navy dark:text-splice-foam">
            <FinishPositionDisplay position={row.position} />
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
          <RaceResultsHelmCrewCell helmLine={row.helmLine} crewLine={row.crewLine} compact />
          {!pursuitRace ? (
            <>
              <td className="whitespace-nowrap px-2 py-1.5 text-xs tabular-nums text-splice-ocean dark:text-splice-water">
                <span className="block">{row.finishDisplay}</span>
                {row.finishDisplay !== "—" ? (
                  <span className="mt-0.5 block text-[11px] leading-snug text-splice-blue dark:text-splice-water">
                    {row.elapsedDisplay}
                  </span>
                ) : null}
              </td>
              <td className="whitespace-nowrap px-2 py-1.5 text-xs tabular-nums text-splice-navy-light dark:text-splice-sky">
                {row.correctedDisplay}
              </td>
            </>
          ) : null}
        </tr>
      ))}
    </tbody>
  );
}

export function PublicRaceResultsTable({
  results,
  filterFleetId,
}: {
  results: RaceResultsDisplay;
  filterFleetId: string | null;
}) {
  const pursuitRace = results.raceType === "pursuit";
  const sections = filterPublicRaceResultSections(results.fleetSections, filterFleetId);

  if (!sections.length) {
    return (
      <p className="text-sm text-splice-ocean dark:text-splice-water">
        No results recorded for this fleet in this race.
      </p>
    );
  }

  return (
    <div>
      <header className="rounded-t-lg border border-b-0 border-splice-sky bg-splice-surface px-4 py-2.5 dark:border-splice-navy-light dark:bg-splice-navy/80">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <p className="text-base font-semibold text-splice-navy dark:text-splice-surface">{results.raceName}</p>
          <p className="text-xs tabular-nums text-splice-blue dark:text-splice-water">
            {formatClubDdMmmYyyyFromIso(results.scheduledAt, results.clubTz)}
          </p>
        </div>
        {pursuitRace ? (
          <div className="mt-1 flex items-center gap-1.5 text-xs text-splice-ocean dark:text-splice-water">
            <span>{raceTypeLabel("pursuit")} race</span>
            <InfoHint label="About pursuit race results">
              Ranking is by finish position recorded by the race officer.
            </InfoHint>
          </div>
        ) : null}
      </header>
      <div className="space-y-0 rounded-b-lg border border-splice-sky dark:border-splice-navy-light">
        {sections.map((section, index) => (
          <div
            key={section.fleetId ?? "unassigned"}
            className={index > 0 ? "border-t border-splice-sky dark:border-splice-navy-light" : ""}
          >
            {filterFleetId == null && sections.length > 1 ? (
              <h4 className="bg-splice-surface px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-splice-ocean dark:bg-splice-navy/80 dark:text-splice-water">
                {section.fleetName}
              </h4>
            ) : null}
            <div className="overflow-x-auto">
              <table
                className={`w-full text-left text-sm ${pursuitRace ? "min-w-[480px]" : "min-w-[720px]"}`}
              >
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
                    {!pursuitRace ? (
                      <>
                        <th className="whitespace-nowrap px-2 py-1.5 font-medium text-splice-ocean dark:text-splice-water">
                          Finish
                        </th>
                        <th className="whitespace-nowrap px-2 py-1.5 font-medium text-splice-ocean dark:text-splice-water">
                          Corr.
                        </th>
                      </>
                    ) : null}
                  </tr>
                </thead>
                <ResultsTableBody rows={section.rows} pursuitRace={pursuitRace} />
              </table>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
