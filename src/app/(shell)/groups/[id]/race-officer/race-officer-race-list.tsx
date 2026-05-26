"use client";

import Link from "next/link";
import { useLayoutEffect, useRef } from "react";

import { formatClubDdMmmYyyyFromIso, formatClubHmFromIso } from "@/lib/club-display-format";
import { clubWallYmdFromUtcMs } from "@/lib/club-zoned";

export type RaceOfficerRaceRow = {
  id: string;
  name: string;
  scheduled_at: string;
  results_final?: boolean | null;
  series: { id: string; name: string };
};

type Props = {
  groupId: string;
  clubTz: string;
  todayYmd: string;
  races: RaceOfficerRaceRow[];
};

export function RaceOfficerRaceList({ groupId, clubTz, todayYmd, races }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const firstTodayRef = useRef<HTMLTableRowElement>(null);

  const firstTodayIndex = races.findIndex((r) => {
    const ms = new Date(r.scheduled_at).getTime();
    if (!Number.isFinite(ms)) return false;
    return clubWallYmdFromUtcMs(ms, clubTz) === todayYmd;
  });

  useLayoutEffect(() => {
    const container = scrollRef.current;
    const row = firstTodayRef.current;
    if (!container || !row) return;
    const delta =
      row.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop;
    container.scrollTop = Math.max(0, delta);
  }, [races]);

  if (!races.length) {
    return (
      <p className="text-sm text-splice-ocean dark:text-splice-water">
        No races are scheduled for this club yet. Add races from a series schedule.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-splice-blue dark:text-splice-water">
        Showing all scheduled races for this club. The list scrolls so today stays at the top of the pane when possible;
        today&apos;s races are highlighted in green.
      </p>
      <div
        ref={scrollRef}
        className="max-h-[min(70vh,28rem)] overflow-auto rounded-lg border border-splice-sky dark:border-splice-ocean"
      >
        <table className="min-w-full border-collapse text-left text-sm">
          <thead className="sticky top-0 z-10 bg-splice-foam text-xs font-semibold uppercase tracking-wide text-splice-ocean shadow-sm dark:bg-splice-navy-light dark:text-splice-water">
            <tr>
              <th className="border-b border-splice-sky px-3 py-2.5 dark:border-splice-ocean">Race no.</th>
              <th className="border-b border-splice-sky px-3 py-2.5 dark:border-splice-ocean">Series</th>
              <th className="border-b border-splice-sky px-3 py-2.5 dark:border-splice-ocean">Date</th>
              <th className="border-b border-splice-sky px-3 py-2.5 dark:border-splice-ocean">Start</th>
              <th className="border-b border-splice-sky px-3 py-2.5 text-right dark:border-splice-ocean"> </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-splice-sky bg-white dark:divide-splice-navy-light dark:bg-splice-navy">
            {races.map((r, index) => {
              const ms = new Date(r.scheduled_at).getTime();
              const isToday = Number.isFinite(ms) && clubWallYmdFromUtcMs(ms, clubTz) === todayYmd;

              const rowTone = isToday
                ? "bg-emerald-50 dark:bg-emerald-950/45"
                : "bg-white dark:bg-splice-navy";

              return (
                <tr
                  key={r.id}
                  ref={index === firstTodayIndex ? firstTodayRef : undefined}
                  className={`${rowTone} ${isToday ? "outline outline-1 -outline-offset-1 outline-emerald-300/90 dark:outline-emerald-700/80" : ""}`}
                >
                  <td className="whitespace-nowrap px-3 py-2.5 font-medium text-splice-navy dark:text-splice-surface">
                    <span className="flex flex-col gap-0.5">
                      <span>{r.name}</span>
                      {r.results_final ? (
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-200/90">
                          Results final
                        </span>
                      ) : null}
                    </span>
                  </td>
                  <td className="max-w-[10rem] px-3 py-2.5 text-splice-ocean dark:text-splice-water">
                    <span className="line-clamp-2" title={r.series.name}>
                      {r.series.name}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-splice-ocean dark:text-splice-water">
                    {formatClubDdMmmYyyyFromIso(r.scheduled_at, clubTz)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-splice-ocean dark:text-splice-water">
                    {formatClubHmFromIso(r.scheduled_at, clubTz)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right">
                    <Link
                      href={`/groups/${groupId}/series/${r.series.id}/races/${r.id}/manage`}
                      className="inline-flex rounded-lg bg-splice-navy px-3 py-1.5 text-xs font-medium text-white dark:bg-splice-foam dark:text-splice-navy"
                    >
                      Manage
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
