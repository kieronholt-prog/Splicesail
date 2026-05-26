import { utcMsToClubWallHm, utcMsToClubWallHms, zonedDatetimeLocalToUtcIso } from "./club-zoned";

function ddMmmYyyyFromInstantMs(ms: number, timeZone: string): string {
  try {
    const fmt = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
    const rec = Object.fromEntries(
      fmt.formatToParts(new Date(ms)).map((p) => [p.type, p.value]),
    ) as Record<string, string>;
    const day = rec.day ?? "";
    const month = (rec.month ?? "").replace(/\.$/, "");
    const year = rec.year ?? "";
    if (!day || !month || !year) return "—";
    return `${day}/${month}/${year}`;
  } catch {
    return "—";
  }
}

/** Calendar date from a Postgres `date` / ISO day string (`YYYY-MM-DD`); not wall-clock shifted. */
export function formatPostgresDateDdMmmYyyy(raw: string | null | undefined): string {
  if (raw == null || String(raw).trim() === "") return "—";
  const day = String(raw).split("T")[0]!;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day.trim());
  if (!m) return "—";
  const ms = Date.UTC(+m[1], +m[2] - 1, +m[3], 12, 0, 0);
  return ddMmmYyyyFromInstantMs(ms, "UTC");
}

/** Race / sail day label: `DD/MMM/YYYY` in the club timezone. */
export function formatClubDdMmmYyyyFromIso(iso: string | null | undefined, timeZone: string): string {
  if (iso == null || String(iso).trim() === "") return "—";
  const ms = new Date(iso).getTime();
  if (!Number.isFinite(ms)) return "—";
  return ddMmmYyyyFromInstantMs(ms, timeZone);
}

/** First start / gun time etc.: `HH:MM` (24h) club wall clock, no date. */
export function formatClubHmFromIso(iso: string | null | undefined, timeZone: string): string {
  if (iso == null || String(iso).trim() === "") return "—";
  const ms = new Date(iso).getTime();
  if (!Number.isFinite(ms)) return "—";
  try {
    return utcMsToClubWallHm(ms, timeZone);
  } catch {
    return "—";
  }
}

/** Clock time only: `HH:MM:SS` (24h) club wall clock. */
export function formatClubHmsFromIso(iso: string | null | undefined, timeZone: string): string {
  if (iso == null || String(iso).trim() === "") return "—";
  const ms = new Date(iso).getTime();
  if (!Number.isFinite(ms)) return "—";
  try {
    return utcMsToClubWallHms(ms, timeZone);
  } catch {
    return "—";
  }
}

/** Compact event instant: `DD/MMM HH:MM` (24h) in club time zone. */
export function formatClubDdMmmHmFromIso(iso: string | null | undefined, timeZone: string): string {
  if (iso == null || String(iso).trim() === "") return "—";
  const ms = new Date(iso).getTime();
  if (!Number.isFinite(ms)) return "—";
  try {
    const fmt = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const rec = Object.fromEntries(fmt.formatToParts(new Date(ms)).map((p) => [p.type, p.value])) as Record<
      string,
      string
    >;
    const day = rec.day ?? "";
    const month = (rec.month ?? "").replace(/\.$/, "");
    const hour = rec.hour ?? "";
    const minute = rec.minute ?? "";
    if (!day || !month || !hour || !minute) return "—";
    return `${day}/${month} ${hour}:${minute}`;
  } catch {
    return "—";
  }
}

/** Event instant: `DD/MMM/YYYY HH:MM` (24h) in club time zone (no abbreviation). */
export function formatClubDdMmmYyyyHmFromIso(iso: string | null | undefined, timeZone: string): string {
  const date = formatClubDdMmmYyyyFromIso(iso, timeZone);
  const time = formatClubHmFromIso(iso, timeZone);
  if (date === "—" && time === "—") return "—";
  if (time === "—") return date;
  if (date === "—") return time;
  return `${date} ${time}`;
}

/** Finish / audit log style: date plus time with seconds. */
export function formatClubDdMmmYyyyHmsFromIso(iso: string | null | undefined, timeZone: string): string {
  const date = formatClubDdMmmYyyyFromIso(iso, timeZone);
  const time = formatClubHmsFromIso(iso, timeZone);
  if (date === "—" && time === "—") return "—";
  if (time === "—") return date;
  if (date === "—") return time;
  return `${date} ${time}`;
}

/** Finish / audit log style alias used across RO and results UI. */
export function formatClubDateTimeMediumShort(iso: string | null | undefined, timeZone: string): string {
  return formatClubDdMmmYyyyHmsFromIso(iso, timeZone);
}

/** Portsmouth elapsed / corrected (seconds → `H:MM:SS`, floor). */
export function formatRaceElapsedOrCorrectedHms(totalSeconds: number | null | undefined): string {
  if (totalSeconds == null || !Number.isFinite(totalSeconds)) return "—";
  const s = Math.floor(totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

/** Like {@link formatClubDdMmmYyyyHmFromIso} plus a short zone suffix (e.g. GMT / BST). */
export function formatClubDdMmmYyyyHmZoneFromIso(iso: string | null | undefined, timeZone: string): string {
  if (iso == null || String(iso).trim() === "") return "—";
  const ms = new Date(iso).getTime();
  if (!Number.isFinite(ms)) return "—";
  try {
    const fmt = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZoneName: "short",
    });
    const parts = fmt.formatToParts(new Date(ms));
    let day = "";
    let month = "";
    let year = "";
    let hour = "";
    let minute = "";
    let tz = "";
    for (const p of parts) {
      if (p.type === "day") day = p.value;
      else if (p.type === "month") month = p.value.replace(/\.$/, "");
      else if (p.type === "year") year = p.value;
      else if (p.type === "hour") hour = p.value;
      else if (p.type === "minute") minute = p.value;
      else if (p.type === "timeZoneName") tz = p.value;
    }
    if (!day || !month || !year || !hour || !minute) return formatClubDdMmmYyyyHmFromIso(iso, timeZone);
    const base = `${day}/${month}/${year} ${hour}:${minute}`;
    return tz ? `${base} ${tz}` : base;
  } catch {
    return formatClubDdMmmYyyyHmFromIso(iso, timeZone);
  }
}

/** Heading for a club-calendar day picker: short weekday plus `DD/MMM/YYYY`. */
export function formatClubDayHeadingFromYmd(ymd: string, timeZone: string): string {
  const noonIso = zonedDatetimeLocalToUtcIso(`${ymd.trim()}T12:00`, timeZone);
  if (!noonIso) return formatPostgresDateDdMmmYyyy(ymd);
  const ms = new Date(noonIso).getTime();
  if (!Number.isFinite(ms)) return formatPostgresDateDdMmmYyyy(ymd);
  try {
    const fmt = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
    const rec = Object.fromEntries(fmt.formatToParts(new Date(ms)).map((p) => [p.type, p.value])) as Record<
      string,
      string
    >;
    const wd = rec.weekday ?? "";
    const day = rec.day ?? "";
    const month = (rec.month ?? "").replace(/\.$/, "");
    const year = rec.year ?? "";
    if (!day || !month || !year) return formatPostgresDateDdMmmYyyy(ymd);
    const cal = `${day}/${month}/${year}`;
    return wd ? `${wd} ${cal}` : cal;
  } catch {
    return formatPostgresDateDdMmmYyyy(ymd);
  }
}

/** Clock line: date plus time (`DD/MMM/YYYY HH:MM`) for a live UTC instant in a zone. */
export function formatClubClockDdMmmYyyyHm(epochMs: number, timeZone: string): string {
  if (!Number.isFinite(epochMs)) return "—";
  try {
    return formatClubDdMmmYyyyHmFromIso(new Date(epochMs).toISOString(), timeZone);
  } catch {
    return "—";
  }
}
