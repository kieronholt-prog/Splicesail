import { fleetStartUtcMs } from "@/lib/tally-window";

export type FleetStartSignalRow = {
  id: string;
  start_signal_at?: string | null;
  start_offset_minutes?: number | null;
  sort_order?: number | null;
};

/** Effective UTC ms for a fleet start (RO-amended signal or schedule + offset). */
export function fleetStartSignalUtcMs(
  raceScheduledAtIso: string,
  fleet: Pick<FleetStartSignalRow, "start_signal_at" | "start_offset_minutes"> | null | undefined,
): number | null {
  const amended = fleet?.start_signal_at;
  if (amended) {
    const ms = new Date(amended).getTime();
    if (Number.isFinite(ms)) return ms;
  }
  if (!raceScheduledAtIso?.trim()) return null;
  return fleetStartUtcMs(raceScheduledAtIso, fleet?.start_offset_minutes ?? 0);
}

/** Map fleet id → effective start UTC ms for a race. */
export function fleetStartSignalUtcMsByFleetId(
  raceScheduledAtIso: string,
  fleets: FleetStartSignalRow[],
): Map<string, number | null> {
  const out = new Map<string, number | null>();
  for (const f of fleets) {
    out.set(f.id, fleetStartSignalUtcMs(raceScheduledAtIso, f));
  }
  return out;
}

/** First fleet by sort_order (series schedule anchor). */
export function primaryRaceFleet(fleets: FleetStartSignalRow[]): FleetStartSignalRow | null {
  if (!fleets.length) return null;
  return [...fleets].sort(
    (a, b) =>
      (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id.localeCompare(b.id),
  )[0];
}
