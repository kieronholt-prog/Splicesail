import { courseDirFromPoint, isUpwindHemisphere, signedAngleFromWind } from "./geo-heading";
import {
  relativeToWindFrom,
  tackSideFromRelative,
} from "./manoeuvre-wind-crossing";

const D = Math.PI / 180;
const RE = 6371000;
const DEFAULT_CELL_SIZE_M = 50;
const DEFAULT_TIME_BUCKET_SEC = 300;
const MIN_SPEED_KTS = 0.8;
const MIN_UPWIND_VMG_KTS = 0.25;
const DEFAULT_TACK_ANGLE_DEG = 84;
const HEADING_AGREEMENT_SIGMA_DEG = 14;
const WIND_AGREEMENT_SIGMA_DEG = 18;

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
  cogDeg: number;
  windFromDeg: number;
  speedKts: number;
  vmgKts: number;
  submissionId: string;
  tackSide: "P" | "S";
  weight: number;
};

export type AnalysisPoint = {
  lat?: number;
  lon?: number;
  time?: number;
  ss?: number;
  sog?: number;
  dir?: number;
  cog?: number;
};

export type AnalysisTack = {
  type?: string;
  turnIdx?: number;
  idx?: number;
  crossing?: string;
  excludeFromStatsAndVMG?: boolean;
  sideAft?: "P" | "S";
  sideBef?: "P" | "S";
};

export type AnalysisLeg = {
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
  upwindByTack?: {
    port?: { twaFromWind?: number | null };
    stbd?: { twaFromWind?: number | null };
    p2sTwaDiff?: number | null;
  };
  stats?: {
    tackStatsByLegType?: {
      upwind?: {
        port?: { twaFromWind?: number | null };
        stbd?: { twaFromWind?: number | null };
        p2sTwaDiff?: number | null;
      };
    };
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

/**
 * Signed TWA for tack side (+ port, − starboard) — matches `signedAngleFromWind` in geo-heading.
 * Wind FROM = boat heading − signed TWA (port: heading−TWA, starboard: heading+TWA).
 */
export function signedTwaForTackSide(acuteTwaDeg: number, side: "P" | "S"): number {
  return side === "P" ? acuteTwaDeg : -acuteTwaDeg;
}

/** Wind FROM (°T) = boat heading − signed TWA. */
export function windFromHeadingAndSignedTwa(headingDeg: number, signedTwaDeg: number): number {
  return (headingDeg - signedTwaDeg + 360) % 360;
}

/** Wind FROM from boat course, acute TWA, and tack side (port: COG−TWA, starboard: COG+TWA). */
export function windFromCogAndTackSide(cogDeg: number, twaDeg: number, side: "P" | "S"): number {
  return windFromHeadingAndSignedTwa(cogDeg, signedTwaForTackSide(twaDeg, side));
}

/** Port / starboard tack from course direction and known wind FROM. */
export function tackSideFromCourse(cogDeg: number, windFromDeg: number): "P" | "S" {
  return tackSideFromRelative(relativeToWindFrom(cogDeg, windFromDeg));
}

/** Tack side immediately after a manoeuvre completes (sailing on this side until next tack). */
export function tackSideAfterManoeuvre(
  manoeuvre: Pick<AnalysisTack, "sideAft" | "sideBef" | "crossing">,
  cogDeg: number,
  windFromDeg: number,
): "P" | "S" {
  if (manoeuvre.sideAft === "P" || manoeuvre.sideAft === "S") return manoeuvre.sideAft;
  if (manoeuvre.crossing === "P→S") return "S";
  if (manoeuvre.crossing === "S→P") return "P";
  const rel = relativeToWindFrom(cogDeg, windFromDeg);
  return tackSideFromRelative(rel);
}

export function buildLegTypeAtIndex(pts: AnalysisPoint[], legs: AnalysisLeg[]): (string | null)[] {
  const out = new Array<string | null>(pts.length).fill(null);
  for (const leg of legs) {
    if (leg.startIdx == null || leg.endIdx == null || !leg.type) continue;
    const a = Math.max(0, leg.startIdx);
    const b = Math.min(pts.length - 1, leg.endIdx);
    for (let i = a; i <= b; i++) out[i] = leg.type;
  }
  return out;
}

export function extractRacingTackManoeuvres(tacks: AnalysisTack[], pointCount: number) {
  return (tacks ?? [])
    .filter((t) => t.type === "tack" && !t.excludeFromStatsAndVMG)
    .map((t) => ({
      idx: Math.max(0, Math.min(pointCount - 1, t.turnIdx ?? t.idx ?? 0)),
      sideAft: t.sideAft,
      sideBef: t.sideBef,
      crossing: t.crossing,
    }))
    .sort((a, b) => a.idx - b.idx);
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

/** TWA for wind inference: half the average tack angle (symmetric fallback). */
export function twaFromTackAngle(tackAngleDeg: number): number {
  return Math.max(15, Math.min(75, tackAngleDeg / 2));
}

/**
 * Likely TWA (°) for wind inference on a tack side.
 * Prefers measured upwind port/stbd TWA from analysis; falls back to half tack angle.
 */
export function likelyTwaFromSnapshot(snapshot: AnalysisSnapshotLike, tackSide: "P" | "S"): number {
  const upwindStats =
    snapshot.upwindByTack ?? snapshot.stats?.tackStatsByLegType?.upwind ?? null;
  const sideBlock = tackSide === "P" ? upwindStats?.port : upwindStats?.stbd;
  const measured = sideBlock?.twaFromWind;
  if (measured != null && Number.isFinite(measured) && measured >= 15 && measured <= 80) {
    return measured;
  }
  return twaFromTackAngle(tackAngleFromSnapshot(snapshot));
}

/**
 * Tack sailed on a between-tack segment.
 * @param trustWind When true (map display / known analysis wind), course vs wind wins over mismatched labels.
 */
export function resolveSegmentTackSide(
  exitTack: ReturnType<typeof extractRacingTackManoeuvres>[0],
  entryTack: ReturnType<typeof extractRacingTackManoeuvres>[0],
  cogDeg: number,
  windFromDeg: number,
  trustWind = false,
): "P" | "S" {
  const fromCourse = tackSideFromCourse(cogDeg, windFromDeg);
  const fromExit = tackSideAfterManoeuvre(exitTack, cogDeg, windFromDeg);
  const entryBef = entryTack.sideBef === "P" || entryTack.sideBef === "S" ? entryTack.sideBef : null;

  if (trustWind) {
    if (exitTack.sideAft === fromCourse) return exitTack.sideAft;
    if (entryBef === fromCourse) return entryBef;
    if (fromExit === fromCourse) return fromExit;
    return fromCourse;
  }

  if (exitTack.sideAft === "P" || exitTack.sideAft === "S") {
    if (entryBef && entryBef === exitTack.sideAft) return exitTack.sideAft;
    return exitTack.sideAft;
  }
  if (entryBef) return entryBef;
  return fromExit;
}

/** True when point is upwind sailing suitable for between-tack wind / map colouring. */
export function isBetweenTackUpwindSample(
  cogDeg: number,
  speedKts: number,
  windFromDeg: number,
): boolean {
  if (!isUpwindHemisphere(cogDeg, windFromDeg)) return false;
  if (speedKts < MIN_SPEED_KTS) return false;
  const vmg = vmgToWindKts(speedKts, cogDeg, windFromDeg);
  return vmg != null && vmg >= MIN_UPWIND_VMG_KTS;
}

function smallestAngleBetween(a: number, b: number): number {
  let d = Math.abs(a - b) % 360;
  if (d > 180) d = 360 - d;
  return d;
}

function headingAgreementWeight(cogDeg: number, fleetMedianCog: number, sigma = HEADING_AGREEMENT_SIGMA_DEG): number {
  const d = smallestAngleBetween(cogDeg, fleetMedianCog);
  return Math.exp(-0.5 * (d / sigma) ** 2);
}

function windAgreementWeight(windDeg: number, fleetMeanWind: number, sigma = WIND_AGREEMENT_SIGMA_DEG): number {
  const d = smallestAngleBetween(windDeg, fleetMeanWind);
  return Math.exp(-0.5 * (d / sigma) ** 2);
}

/** Upwind GPS samples on steady legs between consecutive racing tacks. */
export function extractUpwindSamplesBetweenTacks(
  snapshot: AnalysisSnapshotLike,
  submissionId: string,
  refWindFromDeg: number,
): Omit<WindGridSample, "weight">[] {
  const points = snapshot.points ?? [];
  if (points.length < 3) return [];

  const tackManoeuvres = extractRacingTackManoeuvres(snapshot.tacks ?? [], points.length);
  if (tackManoeuvres.length < 2) return [];

  const out: Omit<WindGridSample, "weight">[] = [];

  for (let t = 0; t < tackManoeuvres.length - 1; t++) {
    const exitTack = tackManoeuvres[t]!;
    const entryTack = tackManoeuvres[t + 1]!;
    const from = exitTack.idx;
    const to = entryTack.idx;
    if (to - from < 4) continue;

    let segmentTackSide: "P" | "S" | null = null;
    let twaDeg: number | null = null;

    for (let i = from + 1; i < to; i++) {
      const p = points[i];
      if (!p || p.lat == null || p.lon == null || p.time == null) continue;

      const cog = courseDirFromPoint(p);
      const speedKts = ms2k(Number(p.ss ?? p.sog ?? 0));
      if (!isBetweenTackUpwindSample(cog, speedKts, refWindFromDeg)) continue;

      const vmg = vmgToWindKts(speedKts, cog, refWindFromDeg)!;

      if (!segmentTackSide) {
        segmentTackSide = resolveSegmentTackSide(exitTack, entryTack, cog, refWindFromDeg, false);
        twaDeg = likelyTwaFromSnapshot(snapshot, segmentTackSide);
      }

      const signedTwa = signedTwaForTackSide(twaDeg!, segmentTackSide);
      out.push({
        lat: p.lat,
        lon: p.lon,
        time: p.time,
        cogDeg: cog,
        windFromDeg: windFromHeadingAndSignedTwa(cog, signedTwa),
        speedKts,
        vmgKts: vmg,
        submissionId,
        tackSide: segmentTackSide,
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

/** Boost sample weights when fleet boats on the same tack share similar COG and inferred wind. */
function applyFleetProximityWeights(
  samples: WindGridSample[],
  cellSizeM: number,
  timeBucketSec: number,
  originLat: number,
  originLon: number,
): void {
  type Group = { cogs: number[]; winds: number[]; weights: number[]; indices: number[] };
  const groups = new Map<string, Group>();

  for (let idx = 0; idx < samples.length; idx++) {
    const s = samples[idx]!;
    const { east, north } = toLocalEN(s.lat, s.lon, originLat, originLon);
    const i = Math.floor(east / cellSizeM);
    const j = Math.floor(north / cellSizeM);
    const timeBucket = Math.floor(s.time / timeBucketSec) * timeBucketSec;
    const key = `${i},${j},${timeBucket},${s.tackSide}`;
    let g = groups.get(key);
    if (!g) {
      g = { cogs: [], winds: [], weights: [], indices: [] };
      groups.set(key, g);
    }
    g.cogs.push(s.cogDeg);
    g.winds.push(s.windFromDeg);
    g.weights.push(s.weight);
    g.indices.push(idx);
  }

  for (const g of groups.values()) {
    if (g.indices.length < 2) continue;
    const medianCog = circularMeanDeg(g.cogs, g.weights);
    const meanWind = circularMeanDeg(g.winds, g.weights);
    if (medianCog == null || meanWind == null) continue;
    const boatCount = new Set(g.indices.map((i) => samples[i]!.submissionId)).size;
    const fleetBoost = boatCount >= 2 ? 1 + 0.25 * (boatCount - 1) : 1;
    for (const idx of g.indices) {
      const s = samples[idx]!;
      const hW = headingAgreementWeight(s.cogDeg, medianCog);
      const wW = windAgreementWeight(s.windFromDeg, meanWind);
      s.weight *= Math.max(0.35, hW * wW) * fleetBoost;
    }
  }
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

  applyFleetProximityWeights(rawSamples, cellSizeM, timeBucketSec, origin.lat, origin.lon);

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

/** Sorted unique time-bucket starts (unix sec) present in the grid. */
export function fleetWindGridTimeBuckets(grid: FleetWindGrid): number[] {
  const seen = new Set<number>();
  for (const c of grid.cells) seen.add(c.timeBucket);
  return [...seen].sort((a, b) => a - b);
}

/** GeoJSON for Mapbox: cell fills + arrow points at cell centres. */
export function fleetWindGridToGeoJSON(
  grid: FleetWindGrid,
  opts?: { timeBucket?: number | null },
): GeoJSON.FeatureCollection {
  const { cellSizeM, origin, cells: allCells } = grid;
  const cells =
    opts?.timeBucket != null && Number.isFinite(opts.timeBucket)
      ? allCells.filter((c) => c.timeBucket === opts.timeBucket)
      : allCells;
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
