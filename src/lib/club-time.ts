import {
  formatClubDdMmmYyyyHmZoneFromIso,
  formatClubDdMmmYyyyFromIso,
  formatClubDayHeadingFromYmd,
  formatClubDateTimeMediumShort,
} from "./club-display-format";
import {
  clubWallYmdFromUtcMs,
  utcIsoToZonedDatetimeLocalValue,
  zonedDatetimeLocalToUtcIso,
} from "./club-zoned";

export {
  clubWallYmdFromUtcMs,
  utcIsoToZonedDatetimeLocalValue,
  zonedDatetimeLocalToUtcIso,
};

/** Normalised IANA id; invalid or empty values fall back to Europe/London (primary Splice market). */
export const DEFAULT_CLUB_IANA_TIMEZONE = "Europe/London";

export function resolveClubIanaTimeZone(raw: string | null | undefined): string {
  const t = typeof raw === "string" ? raw.trim() : "";
  if (!t) return DEFAULT_CLUB_IANA_TIMEZONE;
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: t }).format(0);
    return t;
  } catch {
    return DEFAULT_CLUB_IANA_TIMEZONE;
  }
}

export function listIanaTimeZonesSorted(): string[] {
  try {
    const intl = Intl as typeof Intl & { supportedValuesOf?: (key: "timeZone") => string[] };
    if (typeof intl.supportedValuesOf === "function") {
      return [...intl.supportedValuesOf("timeZone")].sort((a, b) => a.localeCompare(b));
    }
  } catch {
    /* ignore */
  }
  return [DEFAULT_CLUB_IANA_TIMEZONE, "Europe/London", "America/New_York", "Australia/Sydney"];
}

/** Popular ids first, then the rest (for admin timezone dropdown). */
export function clubTimezoneSelectOptions(): string[] {
  const all = listIanaTimeZonesSorted();
  const preferred = ["Europe/London", DEFAULT_CLUB_IANA_TIMEZONE, "Europe/Paris", "America/New_York"];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const p of preferred) {
    if (!seen.has(p)) {
      seen.add(p);
      out.push(p);
    }
  }
  for (const z of all) {
    if (!seen.has(z)) {
      seen.add(z);
      out.push(z);
    }
  }
  return out;
}

export function clubSortedUniqueRaceDaysFromScheduled(scheduledIsos: string[], timeZone: string): string[] {
  const set = new Set<string>();
  for (const iso of scheduledIsos) {
    if (!iso) continue;
    const ms = new Date(iso).getTime();
    if (Number.isNaN(ms)) continue;
    const ymd = clubWallYmdFromUtcMs(ms, timeZone);
    if (/^\d{4}-\d{2}-\d{2}$/.test(ymd)) set.add(ymd);
  }
  return [...set].sort();
}

export function clubDayBoundsExclusiveEnd(
  ymd: string,
  timeZone: string,
): { startIso: string; endIsoExclusive: string } | null {
  const startIso = zonedDatetimeLocalToUtcIso(`${ymd}T00:00`, timeZone);
  if (!startIso) return null;
  const startMs = new Date(startIso).getTime();
  const cap = startMs + 40 * 60 * 60 * 1000;
  let t = startMs;
  while (t < cap) {
    t += 60_000;
    if (clubWallYmdFromUtcMs(t, timeZone) !== ymd) {
      return { startIso, endIsoExclusive: new Date(t).toISOString() };
    }
  }
  return null;
}

export function clubTodayYmd(timeZone: string): string {
  return clubWallYmdFromUtcMs(Date.now(), timeZone);
}

export { formatClubDateTimeMediumShort };

export function formatClubDateMedium(iso: string | null | undefined, timeZone: string): string {
  return formatClubDdMmmYyyyFromIso(iso, timeZone);
}

export function formatClubDateTimeWithShortZone(iso: string | null | undefined, timeZone: string): string {
  return formatClubDdMmmYyyyHmZoneFromIso(iso, timeZone);
}

export function formatClubDayHeaderFromYmd(ymd: string, timeZone: string): string {
  return formatClubDayHeadingFromYmd(ymd, timeZone);
}
