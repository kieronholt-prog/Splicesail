"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { SeriesEntriesTableRow } from "@/lib/series-entries-table-data";

type SortKey = "seriesStart" | "sailNumber" | "boatType" | "fleet" | "standing";

function compareNullableMs(
  av: number | null,
  bv: number | null,
  desc: boolean,
): number {
  if (av == null && bv == null) return 0;
  if (av == null) return 1;
  if (bv == null) return -1;
  return desc ? bv - av : av - bv;
}

function compareNullableRank(av: number | null, bv: number | null, desc: boolean): number {
  if (av == null && bv == null) return 0;
  if (av == null) return 1;
  if (bv == null) return -1;
  return desc ? bv - av : av - bv;
}

function cmpText(a: string, b: string, desc: boolean): number {
  const c = a.localeCompare(b, undefined, { sensitivity: "base", numeric: true });
  return desc ? -c : c;
}

function SeriesEntriesSortHead({
  active,
  descending,
  children,
  metric,
  alignRight,
  onToggle,
}: {
  active: boolean;
  descending: boolean;
  children: ReactNode;
  metric: SortKey;
  alignRight?: boolean;
  onToggle: (metric: SortKey) => void;
}) {
  return (
    <th className={`px-3 py-2 font-medium text-splice-ocean dark:text-splice-water ${alignRight ? "text-right" : ""}`}>
      <button
        type="button"
        className={`inline-flex max-w-full items-center gap-1 ${alignRight ? "ml-auto" : ""} text-left underline-offset-2 hover:underline ${active ? "text-splice-navy dark:text-white" : ""} ${alignRight ? "justify-end text-right" : ""}`}
        onClick={() => onToggle(metric)}
        aria-pressed={active}
      >
        {children}
        {active ? <span aria-hidden className="font-normal text-splice-blue">{descending ? "↓" : "↑"}</span> : null}
      </button>
    </th>
  );
}

export function SeriesEntriesTable({ rows }: { rows: SeriesEntriesTableRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("seriesStart");
  const [sortDesc, setSortDesc] = useState(false);

  const sortedRows = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      switch (sortKey) {
        case "seriesStart":
          return compareNullableMs(a.seriesStartSort, b.seriesStartSort, sortDesc);
        case "sailNumber":
          return cmpText(a.sailNumber, b.sailNumber, sortDesc);
        case "boatType":
          return cmpText(a.boatTypeDisplay, b.boatTypeDisplay, sortDesc);
        case "fleet":
          return cmpText(a.fleetName, b.fleetName, sortDesc);
        case "standing":
          return compareNullableRank(a.standingRank, b.standingRank, sortDesc);
        default:
          return 0;
      }
    });
    return copy;
  }, [rows, sortKey, sortDesc]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortDesc((d) => !d);
    else {
      setSortKey(key);
      setSortDesc(false);
    }
  }

  return (
    <>
      {!rows.length ? (
        <p className="mt-2 text-sm text-splice-ocean dark:text-splice-water">
          No boat entries linked to a series at this club yet. Open this club and enter a series — each boat you attach
          shows as a row after you confirm.
        </p>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-lg border border-splice-sky dark:border-splice-navy-light">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="border-b border-splice-sky bg-splice-surface dark:border-splice-navy-light dark:bg-splice-navy">
              <tr>
                <SeriesEntriesSortHead
                  active={sortKey === "seriesStart"}
                  descending={sortDesc}
                  metric="seriesStart"
                  onToggle={toggleSort}
                >
                  Series / dates
                </SeriesEntriesSortHead>
                <SeriesEntriesSortHead
                  active={sortKey === "sailNumber"}
                  descending={sortDesc}
                  metric="sailNumber"
                  onToggle={toggleSort}
                >
                  Sail&nbsp;no.
                </SeriesEntriesSortHead>
                <SeriesEntriesSortHead
                  active={sortKey === "boatType"}
                  descending={sortDesc}
                  metric="boatType"
                  onToggle={toggleSort}
                >
                  Boat type
                </SeriesEntriesSortHead>
                <SeriesEntriesSortHead
                  active={sortKey === "fleet"}
                  descending={sortDesc}
                  metric="fleet"
                  onToggle={toggleSort}
                >
                  Fleet
                </SeriesEntriesSortHead>
                <SeriesEntriesSortHead
                  active={sortKey === "standing"}
                  descending={sortDesc}
                  metric="standing"
                  alignRight
                  onToggle={toggleSort}
                >
                  Series standing
                </SeriesEntriesSortHead>
              </tr>
            </thead>
            <tbody className="divide-y divide-splice-foam dark:divide-splice-navy-light">
              {sortedRows.map((s) => (
                <tr key={s.rowKey}>
                  <td className="align-top px-3 py-2">
                    <span className="font-medium text-splice-navy dark:text-splice-foam">{s.seriesName}</span>
                    {s.seriesDateRangeDisplay ? (
                      <p className="mt-0.5 text-xs tabular-nums text-splice-blue dark:text-splice-water">
                        {s.seriesDateRangeDisplay}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-splice-navy-light dark:text-splice-sky">{s.sailNumber}</td>
                  <td className="px-3 py-2 text-splice-navy-light dark:text-splice-sky">{s.boatTypeDisplay}</td>
                  <td className="px-3 py-2 text-splice-navy-light dark:text-splice-sky">{s.fleetName}</td>
                  <td className="px-3 py-2 text-right text-sm text-splice-ocean dark:text-splice-water">
                    {s.position ? (
                      <span className="tabular-nums font-medium">
                        {s.position.rank}
                        <span className="font-normal text-splice-blue"> / {s.position.of}</span>
                      </span>
                    ) : (
                      <span className="text-xs text-splice-blue">No position yet</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-splice-blue dark:text-splice-water">
        One row per boat on your series signup. Fleet reflects the anchor race — the next scheduled race when one is
        still ahead; otherwise the last race on the programme. Stored fleet on your race entry wins when valid; otherwise
        we match boat class or Portsmouth band to race fleet definitions.
      </p>
      <p className="mt-1 text-xs text-splice-blue dark:text-splice-water">
        Series standing is your sailor position in club series results (low-point rank) and is the same for every boat
        row in that series.
      </p>
    </>
  );
}
