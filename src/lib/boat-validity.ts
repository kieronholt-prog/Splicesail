/** Matches DB default `valid_to` for an active member hull (soft-retired sets `valid_to` to removal time). */
export const BOAT_ACTIVE_VALID_TO_ISO = "2099-12-31T23:59:59.000Z";

/** Instant after which the hull is no longer part of the sailor’s active fleet (series picks, My boats). */
export function isBoatActiveInFleet(validTo: string | null | undefined, at = new Date()): boolean {
  if (validTo == null || validTo === "") return true;
  return new Date(validTo).getTime() > at.getTime();
}

/** Supabase filter: hull is still in the sailor’s active fleet. */
export function fleetActiveBoatValidToGt(): string {
  return new Date().toISOString();
}
