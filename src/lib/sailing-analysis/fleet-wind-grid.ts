import { courseDirFromPoint, signedAngleFromWind } from "./geo-heading";

const D = Math.PI / 180;
const RE = 6371000;
const DEFAULT_CELL_SIZE_M = 50;
const DEFAULT_TIME_BUCKET_SEC = 300;
const MIN_SPEED_KTS = 0.8;
const MIN_UPWIND_VMG_KTS = 0.25;
const DEFAULT_TACK_ANGLE_DEG = 84;

export type FleetWindGridCell = {
  i: number;
  j: number;
  timeBucket: number;
  windFromDeg: number;
  confidence: number;
  sampleCount: number;
  boatCount: number;
};

export type FleetWindGrid = {
  cellSizeM: number;
  timeBucketSec: number;
  referenceWindFromDeg: number;
  origin: { lat: number; lon: number };
  cells: FleetWindGridCell[];
  generatedAt: string;
  fleetMeanUpwindSpeedKts: number | null;
  fleetMeanTackAngleDeg: number | null;
};

export type WindGridSample = {
  lat: number;
  lon: number;
  time: number;
  windFromDeg: number;
  speedKts: number;
  vmgKts: number;
  submissionId: string;
  weight: number;
};

type AnalysisPoint = {
  lat?: number;
  lon?: number;
  time?: number;
  ss?: number;
  sog?: number;
  dir?: number;
  cog?: number;
};

type AnalysisTack = {
  type?: string;
  turnIdx?: number;
  idx?: number;
  excludeFromStatsAndVMG?: boolean;
};

type AnalysisLeg = {
  type?: string;
  startIdx?: number;
  endIdx?: number;
};

type AnalysisSnapshotLike = {
  points?: AnalysisPoint[];
  tacks?: AnalysisTack[];
  legs?: AnalysisLeg[];
  windDir?: number | null;
  baselines?: { tackAngle?: number | null };
  upwindByTack?: { p2sTwaDiff?: number | null };
  stats?: {
    tackStatsByLegType?: { upwind?: { p2sTwaDiff?: number | null } };
  };
};

function ms2k(s: number): number {
  return s * 1.94384;
}

function vmgToWindKts(sogKts: number, cogDeg: number, windFromDeg: number): number | null {
  if (!Number.isFinite(sogKts) || !Number.isFinite(cogDeg) || !Number.isFinite(windFromDeg)) return null;
  const signed = signedAngleFromWind(cogDeg, windFromDeg);
  const twa = Math.abs(signed);
  return sogKts * Math.cos(twa * D);
}

function isPortTack(cogDeg: number, windFromDeg: number): boolean {
  const rel = (cogDeg - windFromDeg + 360) % 360;
  return rel <= 180;
}

function impliedWindFromDeg(cogDeg: number, windFromRef: number, twaDeg: number): number {
  if (isPortTack(cogDeg, windFromRef)) {
    return (cogDeg - twaDeg + 360) % 360;
  }
  return (cogDeg + twaDeg + 360) % 360;
}

function buildLegTypeAtIndex(pts: AnalysisPoint[], legs: AnalysisLeg[]): (string | null)[] {
  const out = new Array<string | null>(pts.length).fill(null);
  for (const leg of legs) {
    if (leg.startIdx == null || leg.endIdx == null || !leg.type) continue;
    const a = Math.max(0, leg.startIdx);
    const b = Math.min(pts.length - 1, leg.endIdx);
    for (let i = a; i <= b; i++) out[i] = leg.type;
  }
  return out;
}

/** Average included tack angle (°) from analysis baselines, else port/stbd TWA spread. */
export function tackAngleFromSnapshot(snapshot: AnalysisSnapshotLike): number {
  const fromBaselines = snapshot.baselines?.tackAngle;
  if (fromBaselines != null && Number.isFinite(fromBaselines) && fromBaselines > 20 && fromBaselines < 160) {
    return Number(fromBaselines);
  }
  const p2s =
    snapshot.upwindByTack?.p2sTwaDiff ??
    snapshot.stats?.tackStatsByLegType?.upwind?.p2sTwaDiff;
  if (p2s != null && Number.isFinite(p2s) && p2s > 20 && p2s < 160) return Number(p2s);
  return DEFAULT_TACK_ANGLE_DEG;
}

/** TWA for wind inference: half the average tack angle (same on port and starboard). */
export function twaFromTackAngle(tackAngleDeg: number): number {
  return Math.max(15, Math.min(75, tackAngleDeg / 2));
}

/** Upwind GPS samples on steady legs between consecutive racing tacks. */
export function extractUpwindSamplesBetweenTacks(
  snapshot: AnalysisSnapshotLike,
  submissionId: string,
  refWindFromDeg: number,
): Omit<WindGridSample, "weight">[] {
  const points = snapshot.points ?? [];
  const legs = snapshot.legs ?? [];
  if (points.length < 3) return [];

  const twaDeg = twaFromTackAngle(tackAngleFromSnapshot(snapshot));
  const legTypeAt = buildLegTypeAtIndex(points, legs);

  const tacks = (snapshot.tacks ?? [])
    .filter((t) => t.type === "tack" && !t.excludeFromStatsAndVMG)
    .map((t) => Math.max(0, Math.min(points.length - 1, t.turnIdx ?? t.idx ?? 0)))
    .sort((a, b) => a - b);

  if (tacks.length < 2) return [];

  const out: Omit<WindGridSample, "weight">[] = [];

  for (let t = 0; t < tacks.length - 1; t++) {
    const from = tacks[t]!;
    const to = tacks[t + 1]!;
    if (to - from < 4) continue;

    for (let i = from + 1; i < to; i++) {
      const p = points[i];
      if (!p || p.lat == null || p.lon == null || p.time == null) continue;
      if (legTypeAt[i] !== "upwind") continue;

      const cog = courseDirFromPoint(p);
      const speedKts = ms2k(Number(p.ss ?? p.sog ?? 0));
      if (speedKts < MIN_SPEED_KTS) continue;

      const vmg = vmgToWindKts(speedKts, cog, refWindFromDeg);
      if (vmg == null || vmg < MIN_UPWIND_VMG_KTS) continue;

      out.push({
        lat: p.lat,
        lon: p.lon,
        time: p.time,
        windFromDeg: impliedWindFromDeg(cog, refWindFromDeg, twaDeg),
        speedKts,
        vmgKts: vmg,
        submissionId,
      });
    }
  }

  return out;
}

function toLocalEN(lat: number, lon: number, originLat: number, originLon: number) {
  const cosLat = Math.cos(originLat * D);
  const east = (lon - originLon) * D * RE * cosLat;
  const north = (lat - originLat) * D * RE;
  return { east, north };
}

function fromLocalEN(east: number, north: number, originLat: number, originLon: number) {
  const cosLat = Math.cos(originLat * D);
  return {
    lat: originLat + north / (D * RE),
    lon: originLon + east / (D * RE * cosLat),
  };
}

function circularMeanDeg(angles: number[], weights: number[]): number | null {
  let sx = 0;
  let sy = 0;
  let w = 0;
  for (let k = 0; k < angles.length; k++) {
    const a = angles[k]!;
    const wt = weights[k]!;
    if (!Number.isFinite(a) || !Number.isFinite(wt) || wt <= 0) continue;
    sx += Math.sin(a * D) * wt;
    sy += Math.cos(a * D) * wt;
    w += wt;
  }
  if (w <= 0) return null;
  return (Math.atan2(sx, sy) / D + 360) % 360;
}

function speedAlignmentWeight(speedKts: number, fleetMean: number, sigma: number): number {
  if (!Number.isFinite(fleetMean) || fleetMean < 0.5) return Math.max(0.2, speedKts);
  const z = (speedKts - fleetMean) / Math.max(0.8, sigma);
  return Math.max(0.15, speedKts) * Math.exp(-0.5 * z * z);
}

export function buildFleetWindGrid(
  boatSnapshots: { submissionId: string; snapshot: AnalysisSnapshotLike }[],
  refWindFromDeg: number,
  opts?: { cellSizeM?: number; timeBucketSec?: number },
): FleetWindGrid | null {
  const cellSizeM = opts?.cellSizeM ?? DEFAULT_CELL_SIZE_M;
  const timeBucketSec = opts?.timeBucketSec ?? DEFAULT_TIME_BUCKET_SEC;

  const rawSamples: WindGridSample[] = [];
  for (const { submissionId, snapshot } of boatSnapshots) {
    const windRef = refWindFromDeg ?? snapshot.windDir ?? 0;
    const base = extractUpwindSamplesBetweenTacks(snapshot, submissionId, windRef);
    for (const s of base) {
      rawSamples.push({ ...s, weight: 1 });
    }
  }

  if (rawSamples.length < 8) return null;

  const fleetMeanUpwindSpeedKts =
    rawSamples.reduce((a, s) => a + s.speedKts, 0) / rawSamples.length;
  const speedVar =
    rawSamples.reduce((a, s) => a + (s.speedKts - fleetMeanUpwindSpeedKts) ** 2, 0) /
    rawSamples.length;
  const speedSigma = Math.sqrt(speedVar) || 1.5;

  for (const s of rawSamples) {
    s.weight = speedAlignmentWeight(s.speedKts, fleetMeanUpwindSpeedKts, speedSigma) * s.vmgKts;
  }

  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;
  for (const s of rawSamples) {
    minLat = Math.min(minLat, s.lat);
    maxLat = Math.max(maxLat, s.lat);
    minLon = Math.min(minLon, s.lon);
    maxLon = Math.max(maxLon, s.lon);
  }
  const origin = { lat: (minLat + maxLat) / 2, lon: (minLon + maxLon) / 2 };

  type Bucket = {
    winds: number[];
    weights: number[];
    boats: Set<string>;
  };
  const buckets = new Map<string, Bucket>();

  for (const s of rawSamples) {
    const { east, north } = toLocalEN(s.lat, s.lon, origin.lat, origin.lon);
    const i = Math.floor(east / cellSizeM);
    const j = Math.floor(north / cellSizeM);
    const timeBucket = Math.floor(s.time / timeBucketSec) * timeBucketSec;
    const key = `${i},${j},${timeBucket}`;
    let b = buckets.get(key);
    if (!b) {
      b = { winds: [], weights: [], boats: new Set() };
      buckets.set(key, b);
    }
    b.winds.push(s.windFromDeg);
    b.weights.push(s.weight);
    b.boats.add(s.submissionId);
  }

  const cells: FleetWindGridCell[] = [];
  for (const [key, b] of buckets) {
    const windFromDeg = circularMeanDeg(b.winds, b.weights);
    if (windFromDeg == null) continue;
    const [si, sj, st] = key.split(",");
    const i = Number(si);
    const j = Number(sj);
    const timeBucket = Number(st);
    const wSum = b.weights.reduce((a, x) => a + x, 0);
    const confidence = Math.min(1, (wSum / 40) * (0.6 + 0.4 * b.boats.size));
    cells.push({
      i,
      j,
      timeBucket,
      windFromDeg: +windFromDeg.toFixed(1),
      confidence: +confidence.toFixed(3),
      sampleCount: b.winds.length,
      boatCount: b.boats.size,
    });
  }

  if (!cells.length) return null;

  const tackAngles = boatSnapshots.map((b) => tackAngleFromSnapshot(b.snapshot));
  const fleetMeanTackAngleDeg =
    tackAngles.length > 0
      ? +(tackAngles.reduce((a, x) => a + x, 0) / tackAngles.length).toFixed(1)
      : null;

  return {
    cellSizeM,
    timeBucketSec,
    referenceWindFromDeg: refWindFromDeg,
    origin,
    cells,
    generatedAt: new Date().toISOString(),
    fleetMeanUpwindSpeedKts: +fleetMeanUpwindSpeedKts.toFixed(2),
    fleetMeanTackAngleDeg,
  };
}

function cellPolygon(
  i: number,
  j: number,
  cellSizeM: number,
  originLat: number,
  originLon: number,
): [number, number][] {
  const e0 = i * cellSizeM;
  const n0 = j * cellSizeM;
  const e1 = e0 + cellSizeM;
  const n1 = n0 + cellSizeM;
  const c0 = fromLocalEN(e0, n0, originLat, originLon);
  const c1 = fromLocalEN(e1, n0, originLat, originLon);
  const c2 = fromLocalEN(e1, n1, originLat, originLon);
  const c3 = fromLocalEN(e0, n1, originLat, originLon);
  return [
    [c0.lon, c0.lat],
    [c1.lon, c1.lat],
    [c2.lon, c2.lat],
    [c3.lon, c3.lat],
    [c0.lon, c0.lat],
  ];
}

/** GeoJSON for Mapbox: cell fills + arrow points at cell centres. */
export function fleetWindGridToGeoJSON(grid: FleetWindGrid): GeoJSON.FeatureCollection {
  const { cellSizeM, origin, cells } = grid;
  const features: GeoJSON.Feature[] = [];

  for (const cell of cells) {
    const ring = cellPolygon(cell.i, cell.j, cellSizeM, origin.lat, origin.lon);
    const centre = fromLocalEN(
      (cell.i + 0.5) * cellSizeM,
      (cell.j + 0.5) * cellSizeM,
      origin.lat,
      origin.lon,
    );
    const windToDeg = (cell.windFromDeg + 180) % 360;

    features.push({
      type: "Feature",
      properties: {
        kind: "cell",
        windFromDeg: cell.windFromDeg,
        windToDeg,
        confidence: cell.confidence,
        sampleCount: cell.sampleCount,
        boatCount: cell.boatCount,
        timeBucket: cell.timeBucket,
      },
      geometry: { type: "Polygon", coordinates: [ring] },
    });

    features.push({
      type: "Feature",
      properties: {
        kind: "arrow",
        windFromDeg: cell.windFromDeg,
        windToDeg,
        confidence: cell.confidence,
        label: `${Math.round(cell.windFromDeg)}°`,
      },
      geometry: { type: "Point", coordinates: [centre.lon, centre.lat] },
    });
  }

  return { type: "FeatureCollection", features };
}

export function parseFleetWindGrid(raw: unknown): FleetWindGrid | null {
  if (!raw || typeof raw !== "object") return null;
  const g = raw as FleetWindGrid;
  if (!Array.isArray(g.cells) || !g.origin?.lat || !g.origin?.lon) return null;
  return g;
}
