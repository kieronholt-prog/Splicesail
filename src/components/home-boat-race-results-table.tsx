import Link from "next/link";
import { FinishPositionDisplay } from "@/components/finish-position-display";
import { formatClubDdMmmYyyyFromIso } from "@/lib/club-display-format";
import type {
  HomeBoatRaceResultsBoatGroup,
  HomeBoatRaceResultsSeriesGroup,
} from "@/lib/home-boat-race-results";

function boatPositionLabel(position: HomeBoatRaceResultsBoatGroup["seriesPosition"]): string {
  if (!position) return "No overall position yet";
  return `Overall: ${position.rank} / ${position.of}`;
}

export function HomeBoatRaceResultsTable({ groups }: { groups: HomeBoatRaceResultsSeriesGroup[] }) {
  if (!groups.length) return null;

  return (
    <div className="mt-2 space-y-8">
      {groups.map((group) => {
        const multipleBoats = group.boatGroups.length > 1;

        return (
          <div
            key={group.seriesId}
            className="overflow-hidden rounded-lg border border-splice-sky dark:border-splice-navy-light"
          >
            <header className="border-b border-splice-sky bg-splice-surface px-4 py-3 dark:border-splice-navy-light dark:bg-splice-navy/80">
              <p className="text-sm font-semibold text-splice-navy dark:text-splice-surface">
                {group.seriesName}
                <span className="font-normal text-splice-water"> · </span>
                {group.clubName}
              </p>
              {!multipleBoats && group.boatGroups[0] ? (
                <p className="mt-0.5 text-xs tabular-nums text-splice-blue dark:text-splice-water">
                  {boatPositionLabel(group.boatGroups[0].seriesPosition)}
                </p>
              ) : null}
              <Link
                href={`/groups/${group.groupId}/series/${group.seriesId}/standings`}
                className="mt-1 inline-block text-xs font-medium text-splice-blue dark:text-splice-water"
              >
                Series standings →
              </Link>
            </header>

            {group.boatGroups.map((boatGroup, boatIndex) => (
              <div
                key={boatGroup.boatId}
                className={
                  boatIndex > 0 || multipleBoats
                    ? "border-t border-splice-sky dark:border-splice-navy-light"
                    : ""
                }
              >
                {multipleBoats ? (
                  <div className="bg-splice-surface px-4 py-2 dark:bg-splice-navy/80">
                    <p className="text-xs font-semibold uppercase tracking-wide text-splice-ocean dark:text-splice-water">
                      {boatGroup.boatLabel}
                    </p>
                    <p className="mt-0.5 text-xs tabular-nums text-splice-blue dark:text-splice-water">
                      {boatPositionLabel(boatGroup.seriesPosition)}
                    </p>
                  </div>
                ) : null}
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[480px] text-left text-sm">
                    <thead className="border-b border-splice-sky bg-splice-surface dark:border-splice-navy-light dark:bg-splice-navy">
                      <tr>
                        <th className="px-3 py-2 font-medium text-splice-ocean dark:text-splice-water">Race</th>
                        <th className="px-3 py-2 font-medium text-splice-ocean dark:text-splice-water">Sail no.</th>
                        <th className="px-3 py-2 font-medium text-splice-ocean dark:text-splice-water">Boat type</th>
                        <th className="px-3 py-2 font-medium text-splice-ocean dark:text-splice-water w-28">
                          Finish position
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-splice-foam dark:divide-splice-navy-light">
                      {boatGroup.rows.map((row) => (
                        <tr key={row.entryId} className="bg-white dark:bg-splice-navy">
                          <td className="px-3 py-2 text-splice-navy dark:text-splice-foam">
                            <span className="font-medium">{row.raceName}</span>
                            <span className="mt-0.5 block text-xs tabular-nums text-splice-blue dark:text-splice-water">
                              {formatClubDdMmmYyyyFromIso(row.scheduledAt, group.clubTz)}
                            </span>
                          </td>
                          <td className="px-3 py-2 tabular-nums text-splice-navy-light dark:text-splice-sky">
                            {row.sailNumber}
                          </td>
                          <td className="px-3 py-2 text-splice-ocean dark:text-splice-water">{row.boatType}</td>
                          <td className="px-3 py-2 font-medium tabular-nums text-splice-navy dark:text-splice-foam">
                            <FinishPositionDisplay position={row.finishPosition} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
