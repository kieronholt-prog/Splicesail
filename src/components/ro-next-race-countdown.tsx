"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  formatClubDdMmmYyyyFromIso,
  formatClubHmFromIso,
} from "@/lib/club-display-format";
import type { RaceOfficerNextRace } from "@/lib/race-officer-next-race";
import { wallTimeMs } from "@/lib/wall-time";

function formatCountdownParts(totalSeconds: number) {
  const abs = Math.max(0, Math.floor(totalSeconds));
  const d = Math.floor(abs / 86400);
  const h = Math.floor((abs % 86400) / 3600);
  const m = Math.floor((abs % 3600) / 60);
  const s = abs % 60;
  return {
    d: String(d),
    h: String(h).padStart(2, "0"),
    m: String(m).padStart(2, "0"),
    s: String(s).padStart(2, "0"),
  };
}

const COUNTDOWN_UNITS = [
  { key: "d" as const, label: "days" },
  { key: "h" as const, label: "hours" },
  { key: "m" as const, label: "mins" },
  { key: "s" as const, label: "secs" },
];

type Props = {
  race: RaceOfficerNextRace;
  serverNowMs: number;
};

export function RoNextRaceCountdown({ race, serverNowMs }: Props) {
  const [nowMs, setNowMs] = useState(serverNowMs);

  useEffect(() => {
    setNowMs(wallTimeMs());
    const id = window.setInterval(() => setNowMs(wallTimeMs()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const manageHref = `/groups/${race.groupId}/series/${race.seriesId}/races/${race.raceId}/manage`;
  const deltaSec = (race.scheduledAtMs - nowMs) / 1000;
  const upcoming = race.status === "upcoming" && deltaSec > 0;
  const parts = formatCountdownParts(deltaSec);

  return (
    <div className="flex flex-col items-center text-center">
      <p className="text-xs font-semibold uppercase tracking-wide text-splice-blue">Next race</p>
      <p className="mt-2 text-lg font-semibold text-splice-navy">{race.raceName}</p>
      <p className="mt-1 text-sm text-splice-ocean">
        {race.seriesName} · {race.clubName}
      </p>
      <p className="mt-1 text-xs tabular-nums text-splice-blue">
        {formatClubDdMmmYyyyFromIso(race.scheduledAt, race.clubTz)} · Start{" "}
        {formatClubHmFromIso(race.scheduledAt, race.clubTz)}
      </p>

      <div
        className="mt-8 w-full rounded-2xl border border-splice-sky bg-splice-foam px-4 py-10"
        aria-live="polite"
        aria-atomic="true"
      >
        {upcoming ? (
          <>
            <p className="text-xs font-medium uppercase tracking-wide text-splice-ocean">Starts in</p>
            <div
              className="mt-4 grid w-full max-w-lg grid-cols-4 gap-2 sm:gap-4"
              role="timer"
              aria-label={`${parts.d} days, ${parts.h} hours, ${parts.m} minutes, ${parts.s} seconds`}
            >
              {COUNTDOWN_UNITS.map(({ key, label }) => (
                <div key={key} className="flex min-w-0 flex-col items-center gap-1.5">
                  <span className="font-mono text-4xl font-bold tabular-nums leading-none tracking-tight text-splice-navy sm:text-5xl md:text-6xl">
                    {parts[key]}
                  </span>
                  <span className="text-[10px] font-medium uppercase tracking-wide text-splice-blue sm:text-[11px]">
                    {label}
                  </span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <p className="text-xs font-medium uppercase tracking-wide text-emerald-800">In progress</p>
            <p className="mt-3 text-4xl font-bold tracking-tight text-splice-navy sm:text-5xl">Underway</p>
            <p className="mt-2 text-sm text-splice-ocean">
              Scheduled start was {formatClubHmFromIso(race.scheduledAt, race.clubTz)}
            </p>
          </>
        )}
      </div>

      <Link
        href={manageHref}
        className="mt-8 inline-flex w-full max-w-sm items-center justify-center rounded-xl bg-splice-navy px-6 py-4 text-base font-semibold text-white shadow-sm transition hover:bg-splice-navy-light sm:w-auto sm:min-w-[14rem]"
      >
        Manage race
      </Link>
    </div>
  );
}
