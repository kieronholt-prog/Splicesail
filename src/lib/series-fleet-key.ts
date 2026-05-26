export type RaceFleetSeriesKeySource = {
  id: string;
  group_fleet_id?: string | null;
};

/** Stable fleet identity across races in a series (club fleet when linked). */
export function seriesFleetKeyFromRaceFleet(fleet: RaceFleetSeriesKeySource): string {
  const linked = fleet.group_fleet_id?.trim();
  if (linked) return linked;
  return fleet.id;
}
