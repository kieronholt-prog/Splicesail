"use client";

import { MarineSignalFlagImg } from "@/components/marine-signal-flag-img";
import type { RoFleetStartRow } from "@/components/ro-fleet-start-signals-panel";
import {
  marineFlagKeyFromClassFlag,
  marineFlagKeyFromIcsAndName,
  pennantCharForDisplay,
} from "@/lib/marine-signal-flags";

type Props = {
  fleet: RoFleetStartRow | undefined;
  /** Default: h-6 w-6 (start line). Finishes use h-5 w-5. */
  sizeClass?: string;
};

export function RoFleetFlagBadge({ fleet, sizeClass }: Props) {
  if (!fleet) return null;
  const slot = sizeClass ?? "pointer-events-none block h-6 w-6 shrink-0";
  const clubKey = marineFlagKeyFromClassFlag(fleet.clubClassFlag);
  if (clubKey) {
    return (
      <span className={slot} title={fleet.name} aria-hidden>
        <MarineSignalFlagImg
          flagKey={clubKey}
          alt=""
          className={`${sizeClass ?? "h-6 w-6"} rounded-sm object-contain opacity-95 ring-1 ring-inset ring-black/10 dark:ring-white/15`}
        />
      </span>
    );
  }
  if (fleet.flagMode === "image_url" && fleet.flagImageUrl) {
    return (
      <span className={slot} title={fleet.name} aria-hidden>
        {/* eslint-disable-next-line @next/next/no-img-element -- club-hosted pennants */}
        <img
          src={fleet.flagImageUrl}
          alt=""
          className={`${sizeClass ?? "h-6 w-6"} rounded-sm object-cover ring-1 ring-inset ring-black/10 dark:ring-white/15`}
        />
      </span>
    );
  }
  const svgKey = marineFlagKeyFromIcsAndName(fleet.icsSignal, fleet.name);
  if (svgKey) {
    return (
      <span className={slot} title={fleet.name} aria-hidden>
        <MarineSignalFlagImg
          flagKey={svgKey}
          alt=""
          className={`${sizeClass ?? "h-6 w-6"} rounded-sm object-contain opacity-95 ring-1 ring-inset ring-black/10 dark:ring-white/15`}
        />
      </span>
    );
  }
  const ch = pennantCharForDisplay(fleet.icsSignal, fleet.name);
  return (
    <span
      className={`${slot} flex items-center justify-center rounded-sm border border-splice-ocean bg-amber-200 text-[10px] font-bold text-splice-navy shadow-sm dark:border-splice-water dark:bg-amber-400/90`}
      title={fleet.name}
      aria-hidden
    >
      {ch}
    </span>
  );
}
