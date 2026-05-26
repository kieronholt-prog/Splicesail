/** RFC 5545 iCalendar text for a series race schedule. */

export type SeriesIcalEvent = {
  uid: string;
  summary: string;
  description?: string;
  location?: string;
  /** UTC instant for race start */
  startUtc: Date;
  /** UTC instant for event end (defaults to start + duration when omitted at build time) */
  endUtc: Date;
  /** When true, emits STATUS:CANCELLED (removed race / series slot). */
  cancelled?: boolean;
  /** Optional monotonic revision for subscribed calendar clients. */
  sequence?: number;
  lastModifiedUtc?: Date;
};

export type BuildSeriesIcalendarOptions = {
  calendarName: string;
  prodId?: string;
  events: SeriesIcalEvent[];
  /** Hint for subscribed feeds (RFC 5545 REFRESH-INTERVAL). Default 1 hour. */
  refreshIntervalHours?: number;
};

function escapeIcalText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function formatIcalUtcInstant(d: Date): string {
  const iso = d.toISOString();
  return iso.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function foldIcalLine(line: string): string {
  const max = 75;
  if (line.length <= max) return line;
  const parts: string[] = [line.slice(0, max)];
  let i = max;
  while (i < line.length) {
    parts.push(` ${line.slice(i, i + max - 1)}`);
    i += max - 1;
  }
  return parts.join("\r\n");
}

export function buildSeriesIcalendar(opts: BuildSeriesIcalendarOptions): string {
  const now = formatIcalUtcInstant(new Date());
  const prodId = opts.prodId ?? "-//Splice//Series Calendar//EN";
  const calName = escapeIcalText(opts.calendarName);
  const refreshHours = opts.refreshIntervalHours ?? 1;

  const eventBlocks = opts.events.map((ev) => {
    const lastMod = ev.lastModifiedUtc ?? ev.startUtc;
    const lines = [
      "BEGIN:VEVENT",
      foldIcalLine(`UID:${escapeIcalText(ev.uid)}`),
      foldIcalLine(`DTSTAMP:${now}`),
      foldIcalLine(`LAST-MODIFIED:${formatIcalUtcInstant(lastMod)}`),
      foldIcalLine(`DTSTART:${formatIcalUtcInstant(ev.startUtc)}`),
      foldIcalLine(`DTEND:${formatIcalUtcInstant(ev.endUtc)}`),
      foldIcalLine(`SUMMARY:${escapeIcalText(ev.summary)}`),
    ];
    if (ev.sequence != null) {
      lines.push(foldIcalLine(`SEQUENCE:${ev.sequence}`));
    }
    if (ev.description) {
      lines.push(foldIcalLine(`DESCRIPTION:${escapeIcalText(ev.description)}`));
    }
    if (ev.location) {
      lines.push(foldIcalLine(`LOCATION:${escapeIcalText(ev.location)}`));
    }
    if (ev.cancelled) {
      lines.push("STATUS:CANCELLED");
    }
    lines.push("END:VEVENT");
    return lines.join("\r\n");
  });

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    foldIcalLine(`PRODID:${prodId}`),
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    foldIcalLine(`REFRESH-INTERVAL;VALUE=DURATION:PT${refreshHours}H`),
    foldIcalLine(`X-PUBLISHED-TTL:PT${refreshHours}H`),
    foldIcalLine(`X-WR-CALNAME:${calName}`),
    ...eventBlocks,
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}

/** Default dinghy race block length when no explicit end is stored. */
export const SERIES_ICAL_DEFAULT_DURATION_MS = 3 * 60 * 60 * 1000;
