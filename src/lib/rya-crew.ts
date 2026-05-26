export type BoatHandedness = "single" | "double" | "triple_plus";

/** Maps RYA "No of crew" to hull handedness buckets used in Wave B boats. */
export function handednessFromCrewCount(crewCount: number | null): BoatHandedness {
  const n = crewCount == null ? 1 : Math.max(1, Math.trunc(Number(crewCount)));
  if (n <= 1) return "single";
  if (n === 2) return "double";
  return "triple_plus";
}
