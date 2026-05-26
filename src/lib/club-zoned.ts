/**
 * Club wall-clock ↔ UTC helpers (no server-only — safe for client components).
 */

const SV_PARTS_FMT_MIN = (timeZone: string) =>
  new Intl.DateTimeFormat("sv-SE", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

const SV_PARTS_FMT_SEC = (timeZone: string) =>
  new Intl.DateTimeFormat("sv-SE", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

function partsRecord(ms: number, timeZone: string) {
  const fmt = SV_PARTS_FMT_MIN(timeZone);
  return Object.fromEntries(fmt.formatToParts(new Date(ms)).map((p) => [p.type, p.value])) as Record<
    string,
    string
  >;
}

/** Wall clock with seconds (club zone) for finish times and `<input type="datetime-local" step="1">`. */
function partsRecordWithSeconds(ms: number, timeZone: string) {
  const fmt = SV_PARTS_FMT_SEC(timeZone);
  return Object.fromEntries(fmt.formatToParts(new Date(ms)).map((p) => [p.type, p.value])) as Record<
    string,
    string
  >;
}

/** `YYYY-MM-DD` in the club wall calendar for an instant. */
export function clubWallYmdFromUtcMs(ms: number, timeZone: string): string {
  const p = partsRecord(ms, timeZone);
  return `${p.year}-${p.month}-${p.day}`;
}

export function utcIsoToZonedDatetimeLocalValue(iso: string, timeZone: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = partsRecordWithSeconds(d.getTime(), timeZone);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
}

export function zonedDatetimeLocalToUtcIso(localStr: string, timeZone: string): string | null {
  const raw = localStr.trim();
  const withSec =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/.exec(raw);
  const minOnly =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(raw);
  const m = withSec ?? minOnly;
  if (!m) return null;
  const y = +m[1];
  const mo = +m[2];
  const d = +m[3];
  const h = +m[4];
  const minute = +m[5];
  const sec = withSec ? +m[6] : 0;
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || minute > 59 || sec > 59 || sec < 0) return null;

  const target = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${String(sec).padStart(2, "0")}`;

  const center = Date.UTC(y, mo - 1, d, h, minute, sec, 0);
  const windowSec = 3 * 24 * 60 * 60;

  for (let off = -windowSec; off <= windowSec; off++) {
    const ms = center + off * 1000;
    const local = utcIsoToZonedDatetimeLocalValue(new Date(ms).toISOString(), timeZone);
    if (local === target) return new Date(ms).toISOString();
  }
  return null;
}

/** Parse `HH` or `H:MM` / `HH:MM` and combine with a club `YYYY-MM-DD` into epoch ms. */
export function clubWallHmOnYmdToUtcMs(hm: string, ymd: string, timeZone: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm.trim());
  if (!m) return null;
  let h = parseInt(m[1], 10);
  let min = parseInt(m[2], 10);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  h = Math.min(23, Math.max(0, h));
  min = Math.min(59, Math.max(0, min));
  const localStr = `${ymd}T${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
  const iso = zonedDatetimeLocalToUtcIso(localStr, timeZone);
  return iso ? new Date(iso).getTime() : null;
}

export function utcMsToClubWallHm(utcMs: number, timeZone: string): string {
  const p = partsRecord(utcMs, timeZone);
  return `${p.hour}:${p.minute}`;
}

/** `HH:MM:SS` (24h) club wall clock. */
export function utcMsToClubWallHms(utcMs: number, timeZone: string): string {
  const p = partsRecordWithSeconds(utcMs, timeZone);
  return `${p.hour}:${p.minute}:${p.second}`;
}
