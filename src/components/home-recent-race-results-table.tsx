import Link from "next/link";
import type { HomeRecentRaceResults } from "@/lib/home-recent-race-results";
import { formatClubDdMmmYyyyFromIso } from "@/lib/club-display-format";
import { InfoHint } from "@/components/ui/info-hint";
import { raceTypeLabel } from "@/lib/race-type";
import { FinishPositionDisplay } from "@/components/finish-position-display";
import { RaceResultsHelmCrewCell } from "@/components/race-results-helm-crew-cell";

function ResultsTableBody({
  rows,
  pursuitRace,
}: {
  rows: HomeRecentRaceResults["fleetSections"][number]["rows"];
  pursuitRace: boolean;
}) {
  return (
    <tbody className="divide-y divide-splice-foam dark:divide-splice-navy-light">
      {rows.map((row) => (
        <tr
          key={row.entryId}
          className={
            row.isHighlighted
              ? "bg-amber-50/90 dark:bg-amber-950/35"
              : "bg-white dark:bg-splice-navy"
          }
        >
          <td className="px-3 py-2 font-medium tabular-nums text-splice-navy dark:text-splice-foam">
            <FinishPositionDisplay position={row.position} />
          </td>
          <td className="px-3 py-2 tabular-nums text-splice-navy-light dark:text-splice-sky">{row.sailNumber}</td>
          <td className="px-3 py-2 text-splice-ocean dark:text-splice-water">{row.boatType}</td>
          <RaceResultsHelmCrewCell helmLine={row.helmLine} crewLine={row.crewLine} />
          {!pursuitRace ? (
            <>
              <td className="px-3 py-2 text-xs tabular-nums text-splice-ocean dark:text-splice-water whitespace-nowrap">
                <span className="block">{row.finishDisplay}</span>
                {row.finishDisplay !== "—" ? (
                  <span className="mt-0.5 block text-[11px] leading-snug text-splice-blue dark:text-splice-water">
                    {row.elapsedDisplay}
                  </span>
                ) : null}
              </td>
              <td className="px-3 py-2 text-xs tabular-nums text-splice-navy-light dark:text-splice-sky">
                {row.correctedDisplay}
              </td>
            </>
          ) : null}
        </tr>
      ))}
    </tbody>
  );
}

export function HomeRecentRaceResultsTable({ results }: { results: HomeRecentRaceResults }) {
  const pursuitRace = results.raceType === "pursuit";
  const publicResultsHref =
    results.clubSlug != null
      ? `/results/${encodeURIComponent(results.clubSlug)}?series=${encodeURIComponent(results.seriesId)}`
      : null;

  return (
    <div className="mt-2">
      <header className="rounded-t-lg border border-b-0 border-splice-sky bg-splice-surface px-4 py-3 dark:border-splice-navy-light dark:bg-splice-navy/80">
        <p className="text-base font-semibold text-splice-navy dark:text-splice-surface">{results.raceName}</p>
        <p className="mt-0.5 text-sm text-splice-ocean dark:text-splice-water">
          {results.seriesName}
          {results.clubName ? (
            <>
              {" "}
              <span className="text-splice-water">·</span> {results.clubName}
            </>
          ) : null}
        </p>
        <p className="mt-1 text-xs tabular-nums text-splice-blue dark:text-splice-water">
          {formatClubDdMmmYyyyFromIso(results.scheduledAt, results.clubTz)}
        </p>
        {pursuitRace ? (
          <div className="mt-1.5 flex items-center gap-1.5 text-xs text-splice-ocean dark:text-splice-water">
            <span>{raceTypeLabel("pursuit")} race</span>
            <InfoHint label="About pursuit race results">
              Ranking is by finish position recorded by the race officer. Rows highlighted in amber are your boat(s) on
              this race.
            </InfoHint>
          </div>
        ) : null}
      </header>
      <div className="space-y-0 rounded-b-lg border border-splice-sky dark:border-splice-navy-light">
        {results.fleetSections.map((section, index) => (
          <div
            key={section.fleetId ?? "unassigned"}
            className={
              index > 0 ? "border-t border-splice-sky dark:border-splice-navy-light" : ""
            }
          >
            <h4 className="bg-splice-surface px-4 py-2 text-xs font-semibold uppercase tracking-wide text-splice-ocean dark:bg-splice-navy/80 dark:text-splice-water">
              {section.fleetName}
            </h4>
            <div className="overflow-x-auto">
              <table className={`w-full text-left text-sm ${pursuitRace ? "min-w-[480px]" : "min-w-[720px]"}`}>
                <thead className="border-b border-splice-sky bg-splice-surface dark:border-splice-navy-light dark:bg-splice-navy">
                  <tr>
                    <th className="px-3 py-2 font-medium text-splice-ocean dark:text-splice-water w-14">
                      {pursuitRace ? "Finish position" : "Pos"}
                    </th>
                    <th className="px-3 py-2 font-medium text-splice-ocean dark:text-splice-water">Sail</th>
                    <th className="px-3 py-2 font-medium text-splice-ocean dark:text-splice-water">Boat type</th>
                    <th className="px-3 py-2 font-medium text-splice-ocean dark:text-splice-water min-w-[120px]">
                      Helm / crew
                    </th>
                    {!pursuitRace ? (
                      <>
                        <th className="px-3 py-2 font-medium text-splice-ocean dark:text-splice-water">Finish time</th>
                        <th className="px-3 py-2 font-medium text-splice-ocean dark:text-splice-water">Corrected time</th>
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
      {!pursuitRace ? (
        <p className="mt-3 text-xs text-splice-blue dark:text-splice-water">
          Ranking is per fleet using Portsmouth corrected time (elapsed from fleet start). Rows highlighted in amber are
          your boat(s) on this race.
        </p>
      ) : null}
      {publicResultsHref ? (
        <Link
          href={publicResultsHref}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-block text-xs font-medium text-splice-blue dark:text-splice-water"
        >
          Full Results Page - Public →
        </Link>
      ) : null}
    </div>
  );
}
