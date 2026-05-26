function utcParts(ms: number) {
  const d = new Date(ms);
  return {
    y: d.getUTCFullYear(),
    mo: d.getUTCMonth(),
    dom: d.getUTCDate(),
    hh: d.getUTCHours(),
    mm: d.getUTCMinutes(),
    ss: d.getUTCSeconds(),
    mss: d.getUTCMilliseconds(),
  };
}

function utcAt(y: number, mo0: number, dom: number, hh: number, mm: number, ss: number, mss: number) {
  return Date.UTC(y, mo0, dom, hh, mm, ss, mss);
}

/** Inclusive season [lo, hi] in ms from yyyy-mm-dd boundaries (UTC). */
function seasonBounds(startYmd: string, endYmd: string): { lo: number; hi: number } | null {
  const [sy, sm, sd] = startYmd.split("-").map((x) => parseInt(x, 10));
  const [ey, em, ed] = endYmd.split("-").map((x) => parseInt(x, 10));
  if ([sy, sm, sd, ey, em, ed].some((n) => !Number.isFinite(n))) return null;
  const lo = Date.UTC(sy, sm - 1, sd, 0, 0, 0, 0);
  const hi = Date.UTC(ey, em - 1, ed, 23, 59, 59, 999);
  if (lo > hi) return null;
  return { lo, hi };
}

function addUtcMonths(
  y: number,
  mo0: number,
  dom: number,
  months: number,
): { y: number; mo0: number; dom: number } {
  const d = new Date(Date.UTC(y, mo0 + months, 1));
  const yy = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const lastDom = new Date(Date.UTC(yy, m + 1, 0)).getUTCDate();
  return { y: yy, mo0: m, dom: Math.min(dom, lastDom) };
}

/**
 * Each period uses the anchor wall-clock (UTC). Periods advance by day / 7 days / calendar month.
 */
export function generateRaceScheduleUtc(opts: {
  startsOnYmd: string | null | undefined;
  endsOnYmd: string | null | undefined;
  scheduleFirstStartAtMs: number;
  periodicity: "daily" | "weekly" | "monthly";
  racesPerPeriod: number;
  minutesBetweenRaces: number | null | undefined;
}): Date[] {
  const sb = seasonBounds(String(opts.startsOnYmd ?? ""), String(opts.endsOnYmd ?? ""));
  if (!sb) return [];
  const anchorMs = opts.scheduleFirstStartAtMs;
  if (!Number.isFinite(anchorMs)) return [];

  const a = utcParts(anchorMs);
  const rp = Math.max(1, Math.min(20, Math.floor(Number(opts.racesPerPeriod)) || 1));
  const gapMs =
    rp > 1 && opts.minutesBetweenRaces && Number(opts.minutesBetweenRaces) >= 1
      ? Math.min(24 * 60, Math.floor(Number(opts.minutesBetweenRaces))) * 60000
      : 0;

  const seen = new Set<number>();
  const out: Date[] = [];

  for (let p = 0; p < 500; p++) {
    let y = a.y;
    let mo0 = a.mo;
    let dom = a.dom;

    if (opts.periodicity === "daily") {
      const ms = Date.UTC(a.y, a.mo, a.dom + p, a.hh, a.mm, a.ss, a.mss);
      const d = new Date(ms);
      y = d.getUTCFullYear();
      mo0 = d.getUTCMonth();
      dom = d.getUTCDate();
    } else if (opts.periodicity === "weekly") {
      const ms = Date.UTC(a.y, a.mo, a.dom + p * 7, a.hh, a.mm, a.ss, a.mss);
      const d = new Date(ms);
      y = d.getUTCFullYear();
      mo0 = d.getUTCMonth();
      dom = d.getUTCDate();
    } else {
      const n = addUtcMonths(a.y, a.mo, a.dom, p);
      y = n.y;
      mo0 = n.mo0;
      dom = n.dom;
    }

    const baseRaceMs = utcAt(y, mo0, dom, a.hh, a.mm, a.ss, a.mss);

    if (baseRaceMs > sb.hi + gapMs * (rp + 2)) break;

    for (let i = 0; i < rp; i++) {
      const rm = baseRaceMs + i * gapMs;
      if (rm < sb.lo || rm > sb.hi) continue;
      const key = Math.floor(rm / 1000);
      if (!seen.has(key)) {
        seen.add(key);
        out.push(new Date(rm));
      }
    }
  }

  out.sort((x, y2) => x.getTime() - y2.getTime());
  return out.slice(0, 400);
}
