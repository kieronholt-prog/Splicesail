export function fleetStartUtcMs(scheduledAtIso: string, fleetOffsetMinutes: number | null | undefined): number {
  const base = new Date(scheduledAtIso).getTime();
  const offRaw = fleetOffsetMinutes;
  const off = offRaw != null && Number.isFinite(Number(offRaw)) ? Number(offRaw) : 0;
  return base + off * 60_000;
}

export function tallyBoundaryMs(
  fleetStartMs: number,
  openHoursBefore: number | null,
  closeHoursAfter: number | null,
): { openMs: number; closeMs: number } | null {
  if (openHoursBefore == null || closeHoursAfter == null) return null;
  return {
    openMs: fleetStartMs - openHoursBefore * 3600_000,
    closeMs: fleetStartMs + closeHoursAfter * 3600_000,
  };
}

/** Home “Next / current race” stays for this long after tally ashore retention window ends. */
export const HOME_FEATURED_RACE_GRACE_AFTER_TALLY_CLOSE_MS = 60 * 60 * 1000;

/**
 * Defines how long Today’s tally race cards stay featured on Home after each hull’s fleet start.
 * Hours are deprecated in the product UI; callers pass nulls for the legacy 48h-after-start retention.
 */
const LEGACY_HOME_TALLY_CLOSE_HOURS_AFTER_FLEET_START = 48;

export function tallyAshoreEffectiveCloseMs(
  fleetStartMs: number,
  openHoursBefore: number | null,
  closeHoursAfter: number | null,
): number {
  const b = tallyBoundaryMs(fleetStartMs, openHoursBefore, closeHoursAfter);
  if (b) return b.closeMs;
  return fleetStartMs + LEGACY_HOME_TALLY_CLOSE_HOURS_AFTER_FLEET_START * 3600_000;
}

export function homeFeaturedRaceVisibleUntilMs(
  fleetStartMs: number,
  openHoursBefore: number | null,
  closeHoursAfter: number | null,
): number {
  return (
    tallyAshoreEffectiveCloseMs(fleetStartMs, openHoursBefore, closeHoursAfter) +
    HOME_FEATURED_RACE_GRACE_AFTER_TALLY_CLOSE_MS
  );
}
