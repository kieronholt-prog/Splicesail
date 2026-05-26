/**
 * Club fleet name whose hull-class list first matches the boat’s RYA class key (`sort_order`, then name).
 */
export function clubFleetNameForBoatClass(
  fleets: { id: string; name: string; sort_order: number }[],
  links: { fleet_id: string; class_key: string }[],
  boatClassKey: string | null | undefined,
): string | null {
  const k = boatClassKey?.trim();
  if (!k) return null;

  const sortedFleets = [...fleets].sort(
    (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name),
  );

  for (const f of sortedFleets) {
    const keys = links.filter((l) => l.fleet_id === f.id).map((l) => l.class_key.trim());
    if (keys.includes(k)) return f.name;
  }
  return null;
}
