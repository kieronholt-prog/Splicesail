/** UTC calendar-day strings (yyyy-mm-dd) for races scheduled in a group. */

export function utcYmdFromScheduledAtIso(scheduledIso: string): string {
  return new Date(scheduledIso).toISOString().slice(0, 10);
}

/** Sorted unique UTC days (ascending) that have ≥1 scheduled race in the group. */
export function sortedUniqueRaceDaysFromScheduled(scheduledIsos: string[]): string[] {
  const set = new Set<string>();
  for (const iso of scheduledIsos) {
    if (!iso) continue;
    const ymd = utcYmdFromScheduledAtIso(iso);
    if (/^\d{4}-\d{2}-\d{2}$/.test(ymd)) set.add(ymd);
  }
  return [...set].sort();
}

/** Greatest race day strictly before `ymd`, or null if none. */
export function prevRaceDayWithRaces(sortedYmds: string[], ymd: string): string | null {
  let best: string | null = null;
  for (const d of sortedYmds) {
    if (d < ymd && (best == null || d > best)) best = d;
  }
  return best;
}

/** Least race day strictly after `ymd`, or null if none. */
export function nextRaceDayWithRaces(sortedYmds: string[], ymd: string): string | null {
  let best: string | null = null;
  for (const d of sortedYmds) {
    if (d > ymd && (best == null || d < best)) best = d;
  }
  return best;
}
