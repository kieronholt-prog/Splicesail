"use client";

import {
  RoRacePresenceButtons,
  type RoPresenceEntryRow,
  type RoPursuitStartSlotGroup,
} from "@/components/ro-race-presence-buttons";
import type { RoFleetStartRow } from "@/components/ro-fleet-start-signals-panel";
import type { RoBadgeFleetOption } from "@/components/ro-badge-quick-filters";
import { formatClubHmFromIso } from "@/lib/club-display-format";
import { wallTimeMs } from "@/lib/wall-time";
import { useEffect, useMemo, useState } from "react";

export type PursuitStartSlotView = {
  slotId: string;
  slotIndex: number;
  startAt: string;
  entries: RoPresenceEntryRow[];
};

type Props = {
  groupId: string;
  seriesId: string;
  raceId: string;
  clubTz: string;
  slots: PursuitStartSlotView[];
  fleets: RoBadgeFleetOption[];
  raceFleets: RoFleetStartRow[];
  serverNowMs: number;
};

function slotStatus(startMs: number, nowMs: number, isLast: boolean, nextStartMs: number | null): string {
  if (nowMs >= startMs && (nextStartMs == null || nowMs < nextStartMs)) return "Due now";
  if (nowMs < startMs) return "Upcoming";
  return isLast ? "Started" : "Done";
}

export function RoPursuitStartRollingList({
  groupId,
  seriesId,
  raceId,
  clubTz,
  slots,
  fleets,
  raceFleets,
  serverNowMs,
}: Props) {
  const [nowMs, setNowMs] = useState(serverNowMs);

  useEffect(() => {
    setNowMs(wallTimeMs());
    const id = window.setInterval(() => setNowMs(wallTimeMs()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const { allEntries, pursuitSlots } = useMemo(() => {
    const groups: RoPursuitStartSlotGroup[] = slots.map((slot, i) => {
      const startMs = new Date(slot.startAt).getTime();
      const nextStartMs =
        i + 1 < slots.length ? new Date(slots[i + 1]!.startAt).getTime() : null;
      return {
        slotId: slot.slotId,
        timeLabel: formatClubHmFromIso(slot.startAt, clubTz),
        startAtMs: startMs,
        status: slotStatus(startMs, nowMs, i === slots.length - 1, nextStartMs),
        entryIds: slot.entries.map((e) => e.id),
      };
    });
    return {
      allEntries: slots.flatMap((s) => s.entries),
      pursuitSlots: groups,
    };
  }, [slots, nowMs, clubTz]);

  if (!pursuitSlots.length) {
    return (
      <p className="text-sm text-splice-ocean dark:text-splice-water">
        No pursuit start sheet yet — club admin must save pursuit settings first.
      </p>
    );
  }

  return (
    <RoRacePresenceButtons
      groupId={groupId}
      seriesId={seriesId}
      raceId={raceId}
      entries={allEntries}
      fleets={fleets}
      raceFleets={raceFleets}
      pursuitSlots={pursuitSlots}
      pursuitClubTz={clubTz}
      pursuitNowMs={nowMs}
    />
  );
}
