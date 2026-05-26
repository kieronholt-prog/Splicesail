import type { PursuitTallySlotDisplay } from "@/components/home-next-race-tally";
import { formatClubHmFromIso } from "@/lib/club-display-format";
import type { PursuitSlotView } from "@/lib/pursuit-slots-server";

export function buildPursuitTallySlotDisplays(options: {
  slots: PursuitSlotView[];
  clubTz: string;
  viewerClassKey: string | null;
  viewerTalliedAfloat: boolean;
  /** race_entry rows: classKey → { sailDisplay, talliedAfloat }[] */
  entriesByClassKey: Map<string, { sailDisplay: string; talliedAfloat: boolean }[]>;
}): PursuitTallySlotDisplay[] {
  const { slots, clubTz, viewerClassKey, viewerTalliedAfloat, entriesByClassKey } = options;

  return slots.map((slot) => {
    const classKeys = slot.classes.map((c) => c.classKey);
    const isViewerSlot = viewerClassKey != null && classKeys.includes(viewerClassKey);

    const sailCells: string[] = [];
    for (const ck of classKeys) {
      const entries = entriesByClassKey.get(ck) ?? [];
      for (const e of entries) {
        sailCells.push(e.talliedAfloat ? e.sailDisplay : "—");
      }
    }

    return {
      startDisplay: formatClubHmFromIso(slot.startAt, clubTz),
      classLabels: slot.classes.map((c) => c.displayName).join(", "),
      isViewerSlot,
      viewerTalliedAfloat: isViewerSlot && viewerTalliedAfloat,
      sailCells,
    };
  });
}
