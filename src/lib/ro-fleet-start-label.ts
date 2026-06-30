import { formatClubHmFromIso } from "@/lib/club-display-format";

/** Fleet start signal label for RO track-analysis UI (server-safe). */
export function fleetStartLabel(
  startSignalAt: string | null | undefined,
  clubTz: string,
): string | null {
  if (!startSignalAt) return null;
  return formatClubHmFromIso(startSignalAt, clubTz);
}
