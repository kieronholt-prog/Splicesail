import Link from "next/link";
import type {
  HomeBoatRaceResultsBoatGroup,
  HomeBoatRaceResultsSeriesGroup,
} from "@/lib/home-boat-race-results";

function boatPositionLabel(position: HomeBoatRaceResultsBoatGroup["seriesPosition"]): string {
  if (!position) return "—";
  return `${position.rank} / ${position.of}`;
}

export function HomeBoatRaceResultsTable({ groups }: { groups: HomeBoatRaceResultsSeriesGroup[] }) {
  if (!groups.length) return null;

  const rows = groups.flatMap((group) =>
    group.boatGroups.map((boat) => ({
      key: `${group.seriesId}-${boat.boatId}`,
      seriesLabel: `${group.seriesName} · ${group.clubName}`,
      boatLabel: boat.boatLabel,
      position: boat.seriesPosition,
      standingsHref: `/groups/${group.groupId}/series/${group.seriesId}/standings`,
    })),
  );

  return (
    <div className="mt-2 overflow-x-auto rounded-lg border border-splice-sky dark:border-splice-navy-light">
      <table className="w-full min-w-[420px] text-left text-sm">
        <thead className="border-b border-splice-sky bg-splice-surface dark:border-splice-navy-light dark:bg-splice-navy">
          <tr>
            <th className="px-3 py-2 font-medium text-splice-ocean dark:text-splice-water">Series</th>
            <th className="px-3 py-2 font-medium text-splice-ocean dark:text-splice-water">Boat</th>
            <th className="px-3 py-2 font-medium text-splice-ocean dark:text-splice-water w-36">
              Overall position
            </th>
            <th className="px-3 py-2 font-medium text-splice-ocean dark:text-splice-water w-32">
              <span className="sr-only">Standings</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-splice-foam dark:divide-splice-navy-light">
          {rows.map((row) => (
            <tr key={row.key} className="bg-white dark:bg-splice-navy">
              <td className="px-3 py-2 text-splice-navy dark:text-splice-foam">{row.seriesLabel}</td>
              <td className="px-3 py-2 text-splice-ocean dark:text-splice-water">{row.boatLabel}</td>
              <td className="px-3 py-2 font-medium tabular-nums text-splice-navy dark:text-splice-foam">
                {boatPositionLabel(row.position)}
              </td>
              <td className="px-3 py-2">
                <Link
                  href={row.standingsHref}
                  className="text-xs font-medium text-splice-blue dark:text-splice-water"
                >
                  Standings →
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
