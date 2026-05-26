import { utcIsoToZonedDatetimeLocalValue } from "@/lib/club-zoned";

/** Club-local `datetime-local` value (`YYYY-MM-DDTHH:mm:ss`) on the race start calendar day. */
export function raceStartDayPrefix(raceScheduledAtIso: string, clubTz: string): string {
  const raceLocal = utcIsoToZonedDatetimeLocalValue(raceScheduledAtIso, clubTz);
  return raceLocal.length >= 10 ? raceLocal.slice(0, 10) : "";
}

/**
 * Latest saved RO finish (club-local), or race scheduled clock on the race start day.
 * Used to seed manual RO finish entry for the next boat.
 */
export function latestRoFinishDatetimeLocal(
  raceScheduledAtIso: string,
  finishIsoList: (string | null | undefined)[],
  clubTz: string,
): string {
  const raceLocal = utcIsoToZonedDatetimeLocalValue(raceScheduledAtIso, clubTz);
  if (!raceLocal) return "";

  const raceDay = raceLocal.slice(0, 10);
  let bestMs = NaN;
  for (const iso of finishIsoList) {
    if (!iso) continue;
    const ms = new Date(iso).getTime();
    if (Number.isFinite(ms) && (!Number.isFinite(bestMs) || ms > bestMs)) {
      bestMs = ms;
    }
  }

  const timePart = Number.isFinite(bestMs)
    ? utcIsoToZonedDatetimeLocalValue(new Date(bestMs).toISOString(), clubTz).slice(11)
    : raceLocal.slice(11);

  return `${raceDay}T${timePart}`;
}

/** Default RO finish input: always race start day; time from existing row, last entry, or schedule. */
export function roFinishDatetimeLocalDefault(
  raceScheduledAtIso: string,
  lastEnteredLocal: string,
  existingRoFinishIso: string | null | undefined,
  clubTz: string,
): string {
  const raceLocal = utcIsoToZonedDatetimeLocalValue(raceScheduledAtIso, clubTz);
  if (!raceLocal) return "";

  const raceDay = raceLocal.slice(0, 10);

  if (existingRoFinishIso) {
    const ex = utcIsoToZonedDatetimeLocalValue(existingRoFinishIso, clubTz);
    if (ex) return `${raceDay}T${ex.slice(11)}`;
  }

  const last = lastEnteredLocal.trim();
  const timePart = last.length >= 16 ? last.slice(11) : raceLocal.slice(11);
  return `${raceDay}T${timePart}`;
}

/** Official finish default: race start day + time from saved official/RO. */
export function officialFinishDatetimeLocalDefault(
  raceScheduledAtIso: string,
  officialIso: string | null | undefined,
  roIso: string | null | undefined,
  clubTz: string,
): string {
  const src = officialIso ?? roIso;
  if (!src) return roFinishDatetimeLocalDefault(raceScheduledAtIso, "", null, clubTz);
  return roFinishDatetimeLocalDefault(raceScheduledAtIso, "", src, clubTz);
}
