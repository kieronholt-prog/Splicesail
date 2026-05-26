/** Tab chips between Start line and Finish line on RO race pages (50% larger than prior text-xs / px-3 / py-1.5). */
const RO_RACE_LINE_NAV_CHIP =
  "rounded-xl px-[1.125rem] py-[0.5625rem] text-lg font-medium";

export const RO_RACE_LINE_NAV_ACTIVE_CLASS = `${RO_RACE_LINE_NAV_CHIP} bg-splice-navy text-white dark:bg-splice-foam dark:text-splice-navy`;

export const RO_RACE_LINE_NAV_LINK_CLASS = `${RO_RACE_LINE_NAV_CHIP} border border-splice-water bg-white text-splice-navy shadow-sm dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-foam`;

export type RoRaceLineNavItem = {
  href: string;
  label: string;
  current?: boolean;
};

export function buildRoRaceLineNav({
  groupId,
  seriesId,
  raceId,
  current,
}: {
  groupId: string;
  seriesId: string;
  raceId: string;
  current?: "manage" | "finishes" | "track-analysis";
}): RoRaceLineNavItem[] {
  const base = `/groups/${groupId}/series/${seriesId}/races/${raceId}`;
  return [
    { href: `${base}/manage`, label: "Start line", current: current === "manage" },
    { href: `${base}/finishes`, label: "Finish line", current: current === "finishes" },
    {
      href: `${base}/track-analysis`,
      label: "Track analysis",
      current: current === "track-analysis",
    },
  ];
}

export function roRaceLineBasePath(groupId: string, seriesId: string, raceId: string) {
  return `/groups/${groupId}/series/${seriesId}/races/${raceId}`;
}
