/**
 * Two-boat analysis compare (ported from Sailstats compare sections 1–5).
 */

export type CompareTackSide = {
  avgSpeed: number | null;
  speedStd: number | null;
  vmgToWind: number | null;
  avgCourse: number | null;
  courseStd: number | null;
  twaFromWind: number | null;
  twaStd: number | null;
  sampleCount: number | null;
};

export type CompareLegTypeSection = {
  port: CompareTackSide | null;
  stbd: CompareTackSide | null;
  p2sTwaDiff: number | null;
  portSamplePct: number | null;
  stbdSamplePct: number | null;
};

export type CompareLegRow = {
  legNo: number | string;
  route: string;
  legType: string;
  left: {
    vmc: number | null;
    chordKts: number | null;
    efficiency: number | null;
    distanceNm: number | null;
    durationSec: number | null;
    startLineDistanceM: number | null;
  };
  right: {
    vmc: number | null;
    chordKts: number | null;
    efficiency: number | null;
    distanceNm: number | null;
    durationSec: number | null;
    startLineDistanceM: number | null;
  };
  deltaSec: number | null;
  deltaLabel: string;
};

export type CompareAnalysisInput = {
  label: string;
  subtitle?: string;
  stats: Record<string, unknown>;
  legSummary: Record<string, unknown>[];
  windDirection?: number | null;
};

export type CompareLegTypePair = {
  left: CompareLegTypeSection;
  right: CompareLegTypeSection;
};

export type CompareAnalysesResult = {
  left: { label: string; subtitle: string };
  right: { label: string; subtitle: string };
  overall: { metric: string; left: string; right: string }[];
  upwind: CompareLegTypePair;
  reach: CompareLegTypePair;
  downwind: CompareLegTypePair;
  legs: CompareLegRow[];
};

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function fmt(v: number | null, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toFixed(digits);
}

function fmtDuration(sec: number | null): string {
  if (sec == null || !Number.isFinite(sec)) return "—";
  if (sec < 0) return "—";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

function m2nm(m: number | null): string {
  if (m == null || !Number.isFinite(m)) return "—";
  return (m / 1852).toFixed(2);
}

function tackSide(raw: unknown): CompareTackSide | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const vmg =
    num(o.avgVmgToWind) ??
    num(o.avgVMG);
  return {
    avgSpeed: num(o.avgSpeed),
    speedStd: num(o.speedStd),
    vmgToWind: vmg,
    avgCourse: num(o.avgCourse),
    courseStd: num(o.courseStd),
    twaFromWind: num(o.twaFromWind),
    twaStd: num(o.twaStd),
    sampleCount: num(o.n),
  };
}

function legTypeSection(stats: Record<string, unknown>, key: string): CompareLegTypeSection {
  const byType = stats.tackStatsByLegType as Record<string, unknown> | undefined;
  const block = byType?.[key] as Record<string, unknown> | undefined;
  if (!block) {
    return { port: null, stbd: null, p2sTwaDiff: null, portSamplePct: null, stbdSamplePct: null };
  }
  return {
    port: tackSide(block.port),
    stbd: tackSide(block.stbd),
    p2sTwaDiff: num(block.p2sTwaDiff),
    portSamplePct: num(block.portSamplePct),
    stbdSamplePct: num(block.stbdSamplePct),
  };
}

function legVmc(l: Record<string, unknown> | null | undefined): number | null {
  if (!l) return null;
  return num(l.avgVmc) ?? num(l.avgVmgToWind) ?? num(l.avgVMG);
}

function legChordKts(l: Record<string, unknown> | null | undefined): number | null {
  if (!l) return null;
  return num(l.chordProgressKts);
}

function legDistanceM(l: Record<string, unknown> | null | undefined): number | null {
  if (!l) return null;
  return num(l.distanceM) ?? num(l.distance);
}

function legCells(l: Record<string, unknown> | null | undefined) {
  return {
    vmc: legVmc(l),
    chordKts: legChordKts(l),
    efficiency: l ? num(l.efficiency) : null,
    distanceNm: legDistanceM(l) != null ? Number(m2nm(legDistanceM(l))) : null,
    durationSec: l ? num(l.duration) : null,
    startLineDistanceM: l ? num(l.startLineDistanceM) : null,
  };
}

function buildLegRows(
  leftLegs: Record<string, unknown>[],
  rightLegs: Record<string, unknown>[],
  rightLabel: string,
): CompareLegRow[] {
  const n = Math.max(leftLegs.length, rightLegs.length);
  const rows: CompareLegRow[] = [];
  for (let i = 0; i < n; i++) {
    const l0 = leftLegs[i];
    const l1 = rightLegs[i];
    const t0 = l0 ? num(l0.duration) : null;
    const t1 = l1 ? num(l1.duration) : null;
    let deltaSec: number | null = null;
    let deltaLabel = "—";
    if (t0 != null && t1 != null) {
      deltaSec = t1 - t0;
      if (Math.abs(deltaSec) < 0.5) deltaLabel = "0s";
      else if (deltaSec > 0) deltaLabel = `+${deltaSec.toFixed(0)}s (${rightLabel} slower)`;
      else deltaLabel = `${deltaSec.toFixed(0)}s (${rightLabel} faster)`;
    }
    const route =
      (l0 && `${l0.from} → ${l0.to}`) ||
      (l1 && `${l1.from} → ${l1.to}`) ||
      "—";
    rows.push({
      legNo: (l0?.legNo as number | string) ?? (l1?.legNo as number | string) ?? i + 1,
      route,
      legType: String((l0?.type as string) ?? (l1?.type as string) ?? "—"),
      left: legCells(l0),
      right: legCells(l1),
      deltaSec,
      deltaLabel,
    });
  }
  return rows;
}

export function compareAnalyses(
  left: CompareAnalysisInput,
  right: CompareAnalysisInput,
): CompareAnalysesResult {
  const s0 = left.stats;
  const s1 = right.stats;

  const wind0 =
    left.windDirection != null
      ? Math.round(left.windDirection)
      : num(s0.windDir) != null
        ? Math.round(num(s0.windDir)!)
        : null;
  const wind1 =
    right.windDirection != null
      ? Math.round(right.windDirection)
      : num(s1.windDir) != null
        ? Math.round(num(s1.windDir)!)
        : null;

  return {
    left: { label: left.label, subtitle: left.subtitle ?? "" },
    right: { label: right.label, subtitle: right.subtitle ?? "" },
    overall: [
      {
        metric: "Elapsed time",
        left: fmtDuration(num(s0.duration)),
        right: fmtDuration(num(s1.duration)),
      },
      {
        metric: "Total distance (nm)",
        left: m2nm(num(s0.totalDist)),
        right: m2nm(num(s1.totalDist)),
      },
      {
        metric: "Tacks (racing)",
        left: s0.tackCount != null ? String(s0.tackCount) : "—",
        right: s1.tackCount != null ? String(s1.tackCount) : "—",
      },
      {
        metric: "Gybes (racing)",
        left: s0.gybeCount != null ? String(s0.gybeCount) : "—",
        right: s1.gybeCount != null ? String(s1.gybeCount) : "—",
      },
      {
        metric: "Derived wind FROM (°)",
        left: wind0 != null ? String(wind0) : "—",
        right: wind1 != null ? String(wind1) : "—",
      },
    ],
    upwind: { left: legTypeSection(s0, "upwind"), right: legTypeSection(s1, "upwind") },
    reach: { left: legTypeSection(s0, "reach"), right: legTypeSection(s1, "reach") },
    downwind: { left: legTypeSection(s0, "downwind"), right: legTypeSection(s1, "downwind") },
    legs: buildLegRows(left.legSummary, right.legSummary, right.label),
  };
}

export function formatTackSpeed(side: CompareTackSide | null): string {
  if (side?.avgSpeed == null) return "—";
  const base = fmt(side.avgSpeed, 2);
  if (side.speedStd != null) return `${base} (σ ${fmt(side.speedStd, 2)})`;
  return base;
}

export function formatTwa(side: CompareTackSide | null): string {
  if (side?.twaFromWind == null) return "—";
  const base = fmt(side.twaFromWind, 1);
  if (side.twaStd != null) return `${base} (σ ${fmt(side.twaStd, 1)})`;
  return base;
}
