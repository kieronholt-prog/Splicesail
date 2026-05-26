/** Stable identity for an adhoc (race-only) RO-added hull across a series. */
export function seriesRoAddedBoatKey(sailNumber: string, classKey: string): string {
  const sail = sailNumber.trim().toLowerCase();
  const cls = classKey.trim();
  return `${cls}\x1f${sail}`;
}

/** Standings / aggregation boat id for adhoc rows (not a boats.id). */
export function seriesRoAddedBoatId(sailNumber: string, classKey: string): string {
  return `series-ro-added:${seriesRoAddedBoatKey(sailNumber, classKey)}`;
}

const SERIES_RO_ADDED_PREFIX = "series-ro-added:";

/** Decode synthetic standings boat id from {@link seriesRoAddedBoatId}. */
export function parseSeriesRoAddedBoatId(
  boatId: string,
): { sailNumber: string; classKey: string } | null {
  if (!boatId.startsWith(SERIES_RO_ADDED_PREFIX)) return null;
  const key = boatId.slice(SERIES_RO_ADDED_PREFIX.length);
  const sep = key.indexOf("\x1f");
  if (sep < 0) return null;
  return { classKey: key.slice(0, sep), sailNumber: key.slice(sep + 1) };
}

export function isRaceOnlyAdhocGuestRow(row: {
  boat_id?: string | null;
  adhoc_sail_number?: string | null;
  adhoc_rya_class_key?: string | null;
}): boolean {
  return (
    row.boat_id == null &&
    Boolean(row.adhoc_sail_number?.trim()) &&
    Boolean(row.adhoc_rya_class_key?.trim())
  );
}
