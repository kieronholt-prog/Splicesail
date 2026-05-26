"use client";

import { formatClubHmsFromIso } from "@/lib/club-display-format";
import { useMemo } from "react";

type SlotStart = {
  startAtMs: number;
  timeLabel: string;
};

export function resolveNextPursuitIntervalStart(
  slotStarts: SlotStart[],
  nowMs: number,
): SlotStart | null {
  const sorted = [...slotStarts].sort((a, b) => a.startAtMs - b.startAtMs);
  for (const slot of sorted) {
    if (slot.startAtMs > nowMs) return slot;
  }
  return null;
}

type Props = {
  clubTz: string;
  slotStarts: SlotStart[];
  nowMs: number;
};

function formatCountdown(totalSeconds: number): string {
  const abs = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(abs / 3600);
  const m = Math.floor((abs % 3600) / 60);
  const s = abs % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function RoPursuitStartLineClock({ clubTz, slotStarts, nowMs }: Props) {
  const currentTime = formatClubHmsFromIso(new Date(nowMs).toISOString(), clubTz);

  const next = useMemo(
    () => resolveNextPursuitIntervalStart(slotStarts, nowMs),
    [slotStarts, nowMs],
  );

  const countdownSec = next ? (next.startAtMs - nowMs) / 1000 : null;

  return (
    <div
      className="rounded-xl border border-splice-sky bg-splice-surface px-4 py-3 dark:border-splice-navy-light dark:bg-splice-navy/80"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-6">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-splice-ocean dark:text-splice-water">
            Current time
          </p>
          <p className="mt-0.5 font-mono text-2xl font-semibold tabular-nums tracking-tight text-splice-navy dark:text-splice-surface">
            {currentTime}
          </p>
        </div>
        <div
          className={
            next
              ? "rounded-lg border-2 border-splice-blue bg-splice-foam px-3 py-2 dark:border-splice-water dark:bg-splice-navy-light/50"
              : "px-0.5"
          }
        >
          <p className="text-[10px] font-semibold uppercase tracking-wide text-splice-ocean dark:text-splice-water">
            Next interval
          </p>
          {next && countdownSec != null ? (
            <p className="mt-0.5 text-splice-navy dark:text-splice-surface">
              <span className="font-mono text-2xl font-semibold tabular-nums tracking-tight">
                {formatCountdown(countdownSec)}
              </span>
              <span className="ml-2 text-sm text-splice-ocean dark:text-splice-water">until {next.timeLabel}</span>
            </p>
          ) : (
            <p className="mt-1 text-sm text-splice-ocean dark:text-splice-water">All intervals started</p>
          )}
        </div>
      </div>
    </div>
  );
}
