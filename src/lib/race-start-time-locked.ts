/** Races with recorded finishes must not have start times changed from series admin / regen. */

export const RACE_START_TIME_LOCKED_MESSAGE =
  "Start time cannot be changed here after finish times have been recorded. Use the race officer manage view for this race.";

/** True when two ISO instants represent the same schedule (timestamptz rounding). */
export function sameScheduledInstant(a: string, b: string): boolean {
  const aMs = new Date(a).getTime();
  const bMs = new Date(b).getTime();
  return Number.isFinite(aMs) && Number.isFinite(bMs) && aMs === bMs;
}
