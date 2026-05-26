import { zonedDatetimeLocalToUtcIso } from "@/lib/club-time";
import { clubWallYmdFromUtcMs, utcMsToClubWallHm } from "@/lib/club-zoned";

/** Combine a race-day instant with a template time-of-day (both interpreted in club zone). */
export function raceDayAtTemplateWallTime(
  raceScheduledAtIso: string,
  templateAnchorIso: string,
  clubTz: string,
): string | null {
  const raceMs = new Date(raceScheduledAtIso).getTime();
  const templateMs = new Date(templateAnchorIso).getTime();
  if (!Number.isFinite(raceMs) || !Number.isFinite(templateMs)) return null;

  const ymd = clubWallYmdFromUtcMs(raceMs, clubTz);
  const hm = utcMsToClubWallHm(templateMs, clubTz);
  if (!ymd || !hm) return null;

  return zonedDatetimeLocalToUtcIso(`${ymd}T${hm}`, clubTz);
}
