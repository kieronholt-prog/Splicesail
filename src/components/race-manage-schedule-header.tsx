"use client";

import { formatClubDdMmmYyyyFromIso, formatClubHmFromIso } from "@/lib/club-display-format";
import {
  RO_PRIMARY_START_SAVED_EVENT,
  type RoPrimaryStartSavedDetail,
} from "@/lib/ro-race-start-events";
import { useEffect, useState } from "react";

type Props = {
  raceId: string;
  initialScheduledAtIso: string;
  clubTz: string;
  clubName: string;
};

export function RaceManageScheduleHeader({ raceId, initialScheduledAtIso, clubTz, clubName }: Props) {
  const [savedPrimaryStart, setSavedPrimaryStart] = useState<{ raceId: string; iso: string } | null>(
    null,
  );
  const scheduledAtIso =
    savedPrimaryStart?.raceId === raceId ? savedPrimaryStart.iso : initialScheduledAtIso;

  useEffect(() => {
    const onSaved = (e: Event) => {
      const detail = (e as CustomEvent<RoPrimaryStartSavedDetail>).detail;
      if (detail?.scheduledAtIso) {
        setSavedPrimaryStart({ raceId, iso: detail.scheduledAtIso });
      }
    };
    window.addEventListener(RO_PRIMARY_START_SAVED_EVENT, onSaved);
    return () => window.removeEventListener(RO_PRIMARY_START_SAVED_EVENT, onSaved);
  }, [raceId]);

  return (
    <p className="mt-2 text-xs text-splice-blue dark:text-splice-water">
      {clubName}
      {" · "}Race day{" "}
      <strong className="tabular-nums text-splice-ocean dark:text-splice-water">
        {formatClubDdMmmYyyyFromIso(scheduledAtIso, clubTz)}
      </strong>
      {" · "}Start{" "}
      <strong className="tabular-nums text-splice-ocean dark:text-splice-water">
        {formatClubHmFromIso(scheduledAtIso, clubTz)}
      </strong>
    </p>
  );
}
