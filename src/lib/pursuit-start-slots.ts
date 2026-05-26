export type PursuitClassInput = { classKey: string; py: number };

export type PursuitSlotClass = {
  classKey: string;
  py: number;
  rawOffsetSeconds: number;
};

export type PursuitComputedSlot = {
  slotIndex: number;
  startAtMs: number;
  classes: PursuitSlotClass[];
};

/**
 * Pursuit start sheet: each class starts late enough that, sailing for the remaining time
 * to `finishMs`, corrected-time arrival aligns with the slowest (highest PY) class.
 *
 * Slowest class starts at `firstStartMs` and races for the full window (finish − first).
 * Class with PY gets offset: duration × (1 − PY / PY_slow), then snapped to increment grid.
 * Classes sharing the same snapped start time are grouped into one slot.
 */
export function computePursuitStartSlots(
  firstStartMs: number,
  finishMs: number,
  incrementSeconds: number,
  classes: PursuitClassInput[],
): PursuitComputedSlot[] {
  if (classes.length === 0) return [];

  const durationSec = Math.max(0, (finishMs - firstStartMs) / 1000);
  if (durationSec <= 0 || incrementSeconds <= 0) {
    return [
      {
        slotIndex: 0,
        startAtMs: firstStartMs,
        classes: classes.map((c) => ({ classKey: c.classKey, py: c.py, rawOffsetSeconds: 0 })),
      },
    ];
  }

  const sorted = [...classes].sort((a, b) => b.py - a.py);
  const pySlow = sorted[0]!.py;
  /** Latest allowed start offset — fastest class keeps at least one increment to the line. */
  const maxOffsetSec = Math.max(0, durationSec - incrementSeconds);

  type Row = PursuitSlotClass & { startAtMs: number };
  const rows: Row[] = sorted.map((c) => {
    const rawOffset = durationSec * (1 - c.py / pySlow);
    const snapped = Math.round(rawOffset / incrementSeconds) * incrementSeconds;
    const capped = Math.min(Math.max(0, snapped), maxOffsetSec);
    return {
      classKey: c.classKey,
      py: c.py,
      rawOffsetSeconds: rawOffset,
      startAtMs: firstStartMs + capped * 1000,
    };
  });

  const byStart = new Map<number, PursuitSlotClass[]>();
  for (const row of rows) {
    const list = byStart.get(row.startAtMs) ?? [];
    list.push({
      classKey: row.classKey,
      py: row.py,
      rawOffsetSeconds: row.rawOffsetSeconds,
    });
    byStart.set(row.startAtMs, list);
  }

  const startTimes = [...byStart.keys()].sort((a, b) => a - b);
  return startTimes.map((startAtMs, slotIndex) => ({
    slotIndex,
    startAtMs,
    classes: byStart.get(startAtMs) ?? [],
  }));
}
