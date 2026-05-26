export const RACE_TYPES = ["handicap", "level_rated", "pursuit"] as const;

export type RaceType = (typeof RACE_TYPES)[number];

export const PURSUIT_START_INCREMENTS = [30, 60, 120] as const;

export type PursuitStartIncrementSeconds = (typeof PURSUIT_START_INCREMENTS)[number];

export function normalizeRaceType(raw: string | null | undefined): RaceType {
  const v = String(raw ?? "").trim().toLowerCase();
  if (v === "level_rated" || v === "pursuit") return v;
  return "handicap";
}

export function raceTypeUsesPositionalScoring(raceType: RaceType): boolean {
  return raceType === "level_rated" || raceType === "pursuit";
}

export function raceTypeLabel(raceType: RaceType): string {
  switch (raceType) {
    case "level_rated":
      return "Level rated";
    case "pursuit":
      return "Pursuit";
    default:
      return "Handicap";
  }
}

export function parsePursuitStartIncrementSeconds(raw: string | number | null | undefined): PursuitStartIncrementSeconds | null {
  const n = typeof raw === "number" ? raw : parseInt(String(raw ?? "").trim(), 10);
  if (n === 30 || n === 60 || n === 120) return n;
  return null;
}
