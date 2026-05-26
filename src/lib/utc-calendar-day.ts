/** Calendar-day helpers in UTC (aligned with stored `timestamptz` UTC instants). */

const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function utcTodayYmd(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** Returns the param if it is a valid UTC calendar day, else null. */
export function parseOptionalUtcYmdParam(raw: string | undefined): string | null {
  if (raw == null || raw === "") return null;
  const s = raw.trim();
  const m = YMD_RE.exec(s);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== mo - 1 ||
    dt.getUTCDate() !== d
  ) {
    return null;
  }
  return s;
}

export function addUtcCalendarDays(ymd: string, deltaDays: number): string {
  const parsed = parseOptionalUtcYmdParam(ymd);
  if (!parsed) return utcTodayYmd();
  const m = YMD_RE.exec(parsed);
  if (!m) return utcTodayYmd();
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d + deltaDays));
  return dt.toISOString().slice(0, 10);
}

export function utcDayBoundsExclusiveEnd(ymd: string): {
  startIso: string;
  endIsoExclusive: string;
} {
  const ok = parseOptionalUtcYmdParam(ymd) ?? utcTodayYmd();
  const startIso = `${ok}T00:00:00.000Z`;
  const next = addUtcCalendarDays(ok, 1);
  const endIsoExclusive = `${next}T00:00:00.000Z`;
  return { startIso, endIsoExclusive };
}
