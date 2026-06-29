import { clubWallYmdFromUtcMs } from "@/lib/club-zoned";
import { clubTodayYmd } from "@/lib/club-time";

/** Reject Unix epoch / corrupt instants (finite 0 is the common failure mode). */
const MIN_RACE_INSTANT_MS = Date.UTC(2000, 0, 1);
const MAX_RACE_INSTANT_MS = Date.UTC(2100, 0, 1);

export function isPlausibleRaceInstantMs(ms: number): boolean {
  return Number.isFinite(ms) && ms >= MIN_RACE_INSTANT_MS && ms <= MAX_RACE_INSTANT_MS;
}

export function isPlausibleRaceInstantIso(iso: string | null | undefined): boolean {
  if (iso == null || String(iso).trim() === "") return false;
  const ms = new Date(iso).getTime();
  return isPlausibleRaceInstantMs(ms);
}

/** Club race-day YYYY-MM-DD for HH:MM parsing — never use a corrupted 1970 schedule. */
export function resolveRaceDayYmd(
  scheduledAtIso: string,
  displayTimeZone: string,
  fleetStartSignalIsos: (string | null | undefined)[] = [],
): string {
  const baseMs = new Date(scheduledAtIso).getTime();
  if (isPlausibleRaceInstantMs(baseMs)) {
    return clubWallYmdFromUtcMs(baseMs, displayTimeZone);
  }
  for (const iso of fleetStartSignalIsos) {
    if (!isPlausibleRaceInstantIso(iso)) continue;
    const ms = new Date(iso!).getTime();
    return clubWallYmdFromUtcMs(ms, displayTimeZone);
  }
  return clubTodayYmd(displayTimeZone);
}

/** HH:MM on the RO panel — prefer fleet target / postponed-today over a stale schedule. */
export function resolveRaceDayYmdForHm(
  scheduledAtIso: string,
  displayTimeZone: string,
  fleet: {
    startSignalAtIso?: string | null;
    startPostponedAtIso?: string | null;
  },
  targetMs?: number | null,
): string {
  if (targetMs != null && isPlausibleRaceInstantMs(targetMs)) {
    return clubWallYmdFromUtcMs(targetMs, displayTimeZone);
  }
  if (fleet.startPostponedAtIso && isPlausibleRaceInstantIso(fleet.startPostponedAtIso)) {
    return clubTodayYmd(displayTimeZone);
  }
  if (fleet.startSignalAtIso && isPlausibleRaceInstantIso(fleet.startSignalAtIso)) {
    return clubWallYmdFromUtcMs(new Date(fleet.startSignalAtIso).getTime(), displayTimeZone);
  }
  return resolveRaceDayYmd(scheduledAtIso, displayTimeZone, [fleet.startSignalAtIso]);
}

export function plausibleRaceInstantError(label = "Start time"): string {
  return `${label} must be a valid date on the club race day (not 1970 or empty).`;
}
